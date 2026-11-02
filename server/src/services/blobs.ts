import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredDocument } from '../models/types.ts'
import { HttpError } from '../middleware/security.ts'

/** Signed links are deliberately short-lived. */
export const SIGNED_URL_TTL_SECONDS = 300

/**
 * Private file storage boundary. Files are addressed by (userId, documentId) and are never public.
 * - DiskBlobStore: local development.
 * - SupabaseBlobStore: production, in a PRIVATE bucket, opened only through short-lived signed URLs.
 */
/** Client uploads straight to storage with a short-lived link; the server then checks the file before keeping it. */
export class UploadTooLarge extends Error {}

export interface DirectUpload {
  /** A single-use URL the browser can PUT the file to. The file lands in a pending area, not under the user. */
  createUrl(userId: string, id: string): Promise<string>
  /** The pending file, null if it was never uploaded. Throws UploadTooLarge before downloading anything over maxBytes. */
  readPending(userId: string, id: string, maxBytes: number): Promise<Buffer | null>
  /** Move an accepted file to its permanent place. */
  commit(userId: string, id: string): Promise<void>
  /** Delete a pending file (rejected, or abandoned). */
  discard(userId: string, id: string): Promise<void>
  /** Delete pending files older than the age (abandoned uploads). Returns how many. */
  sweep(olderThanMs: number): Promise<number>
}

export interface BlobStore {
  /** Present only when the store supports browser-to-storage uploads (Supabase). */
  direct?: DirectUpload
  put(userId: string, id: string, bytes: Buffer, contentType: string): Promise<void>
  get(userId: string, id: string): Promise<Buffer | null>
  remove(userId: string, id: string): Promise<void>
  removeAll(userId: string): Promise<void>
  /** A temporary direct link, or null when this store cannot sign (the API then streams the bytes itself). */
  signedUrl(userId: string, id: string, filename: string, ttlSeconds?: number): Promise<string | null>
}

export class DiskBlobStore implements BlobStore {
  private readonly root: string
  constructor(root: string) {
    this.root = root
  }
  async put(userId: string, id: string, bytes: Buffer) {
    await mkdir(join(this.root, userId), { recursive: true })
    await writeFile(join(this.root, userId, id), bytes)
  }
  async get(userId: string, id: string) {
    return readFile(join(this.root, userId, id)).catch(() => null)
  }
  async remove(userId: string, id: string) {
    await rm(join(this.root, userId, id), { force: true })
  }
  async removeAll(userId: string) {
    await rm(join(this.root, userId), { recursive: true, force: true })
  }
  async signedUrl() {
    return null
  }
}

export class SupabaseBlobStore implements BlobStore {
  private readonly client: SupabaseClient
  private readonly bucket: string
  constructor(client: SupabaseClient, bucket = 'documents') {
    this.client = client
    this.bucket = bucket
  }
  private path(userId: string, id: string) {
    return `${userId}/${id}`
  }

  readonly direct: DirectUpload = {
    createUrl: async (userId, id) => {
      const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(`pending/${userId}/${id}`)
      if (error || !data) throw new Error(`could not create upload link: ${error?.message ?? 'unknown'}`)
      return data.signedUrl
    },
    readPending: async (userId, id, maxBytes) => {
      const bucket = this.client.storage.from(this.bucket)
      const { data: list, error } = await bucket.list(`pending/${userId}`, { search: id, limit: 5 })
      if (error) throw new Error(`storage list failed: ${error.message}`)
      const meta = list?.find((o) => o.name === id)
      if (!meta) return null
      const size = Number((meta.metadata as { size?: number } | null)?.size ?? 0)
      if (size > maxBytes) throw new UploadTooLarge()
      const dl = await bucket.download(`pending/${userId}/${id}`)
      if (dl.error || !dl.data) return null
      const buf = Buffer.from(await dl.data.arrayBuffer())
      if (buf.length > maxBytes) throw new UploadTooLarge()
      return buf
    },
    commit: async (userId, id) => {
      const { error } = await this.client.storage.from(this.bucket).move(`pending/${userId}/${id}`, this.path(userId, id))
      if (error) throw new Error(`storage move failed: ${error.message}`)
    },
    discard: async (userId, id) => {
      await this.client.storage.from(this.bucket).remove([`pending/${userId}/${id}`])
    },
    sweep: async (olderThanMs) => {
      const bucket = this.client.storage.from(this.bucket)
      const cutoff = Date.now() - olderThanMs
      const { data: folders } = await bucket.list('pending', { limit: 1000 })
      let removed = 0
      for (const folder of folders ?? []) {
        const { data: files } = await bucket.list(`pending/${folder.name}`, { limit: 1000 })
        const old = (files ?? []).filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `pending/${folder.name}/${f.name}`)
        if (old.length) {
          await bucket.remove(old)
          removed += old.length
        }
      }
      return removed
    },
  }
  async put(userId: string, id: string, bytes: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(this.path(userId, id), bytes, { contentType, upsert: false })
    if (error) throw new Error(`storage upload failed: ${error.message}`)
  }
  async get(userId: string, id: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(this.path(userId, id))
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  }
  async remove(userId: string, id: string) {
    const { error } = await this.client.storage.from(this.bucket).remove([this.path(userId, id)])
    if (error) throw new Error(`storage delete failed: ${error.message}`)
  }
  async removeAll(userId: string) {
    const bucket = this.client.storage.from(this.bucket)
    for (;;) {
      const { data, error } = await bucket.list(userId, { limit: 100 })
      if (error) throw new Error(`storage list failed: ${error.message}`)
      if (!data || data.length === 0) return
      const { error: rmError } = await bucket.remove(data.map((o) => `${userId}/${o.name}`))
      if (rmError) throw new Error(`storage delete failed: ${rmError.message}`)
    }
  }
  async signedUrl(userId: string, id: string, filename: string, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(this.path(userId, id), ttlSeconds, { download: filename })
    if (error || !data) return null
    return data.signedUrl
  }
}

/** Delivers a stored document: redirect to a short-lived signed URL when possible, else stream it (still authenticated). */
export async function sendBlob(res: Response, blobs: BlobStore, userId: string, doc: StoredDocument) {
  const url = await blobs.signedUrl(userId, doc.id, doc.filename)
  if (url) {
    res.redirect(302, url)
    return
  }
  const buf = await blobs.get(userId, doc.id)
  if (!buf) throw new HttpError(404, 'Document not found')
  res.setHeader('Content-Type', doc.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`)
  res.send(buf)
}
