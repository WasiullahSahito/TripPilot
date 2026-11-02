import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import type { Store } from '../models/store.ts'
import type { StoredDocument, VisaApplication } from '../models/types.ts'
import { env } from '../config/env.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import { decryptJson, encryptJson } from '../services/crypto.ts'
import { guardUpload } from '../services/upload-guard.ts'
import { sendBlob, type BlobStore } from '../services/blobs.ts'

const MAX_UPLOAD = env.maxUploadBytes
const MAX_DOCS_PER_USER = 100

const sectionSchema = z.record(z.string().max(60), z.string().max(3000))
const dataSchema = z
  .record(z.string().max(40), sectionSchema)
  .refine((d) => Object.keys(d).length <= 12, 'Too many sections')

const upsertSchema = z.object({
  destinationId: z.string().trim().min(1).max(40),
  categoryId: z.string().trim().min(1).max(40),
  nationality: z.string().trim().max(60).default(''),
  residence: z.string().trim().max(60).default(''),
  status: z.enum(['draft', 'ready', 'submitted_on_portal']).default('draft'),
  checklist: z.record(z.string().max(60), z.boolean()).default({}),
  data: dataSchema.default({}),
})

function view(app: VisaApplication) {
  const { dataEnc, ...rest } = app
  return { ...rest, data: decryptJson<Record<string, Record<string, string>>>(dataEnc) }
}

/** Identify by content, never by the client-declared type. */
export function sniffMime(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  return null
}

export function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[^\w. -]/g, '_').replace(/^\.+/, '').slice(0, 100)
  return cleaned || 'document'
}

export function visaRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  r.get('/applications', async (req, res) => {
    const apps = await store.listApplications(req.session!.sub)
    res.json({ applications: apps.map(view) })
  })

  r.get('/applications/:id', async (req, res) => {
    const app = await store.getApplication(req.session!.sub, String(req.params.id))
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({ application: view(app), documents: await store.listDocuments(req.session!.sub, app.id) })
  })

  // Upsert by destination + category so "resume later" always finds the same draft.
  r.put('/applications', async (req, res) => {
    const input = upsertSchema.parse(req.body)
    const userId = req.session!.sub
    const existing = (await store.listApplications(userId)).find(
      (a) => a.destinationId === input.destinationId && a.categoryId === input.categoryId,
    )
    const now = new Date().toISOString()
    const app: VisaApplication = {
      id: existing?.id ?? randomUUID(),
      userId,
      destinationId: input.destinationId,
      categoryId: input.categoryId,
      nationality: input.nationality,
      residence: input.residence,
      status: input.status,
      checklist: input.checklist,
      dataEnc: encryptJson(input.data),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await store.saveApplication(app)
    res.status(existing ? 200 : 201).json({ application: view(app) })
  })

  r.delete('/applications/:id', async (req, res) => {
    const userId = req.session!.sub
    const id = String(req.params.id)
    const docs = await store.listDocuments(userId, id)
    if (!(await store.deleteApplication(userId, id))) throw new HttpError(404, 'Application not found')
    await Promise.all(docs.map((d) => blobs.remove(userId, d.id)))
    res.status(204).end()
  })

  r.post(
    '/applications/:id/documents',
    express.raw({ type: () => true, limit: MAX_UPLOAD }),
    async (req, res) => {
      const userId = req.session!.sub
      const app = await store.getApplication(userId, String(req.params.id))
      if (!app) throw new HttpError(404, 'Application not found')
      const body = req.body as unknown
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Empty upload')
      const mime = sniffMime(body)
      if (!mime) throw new HttpError(415, 'Only PDF, PNG and JPEG files are accepted')
      if ((await store.listDocuments(userId)).length >= MAX_DOCS_PER_USER) throw new HttpError(409, 'Document limit reached')
      await guardUpload(store, userId, body, mime)
      const itemId = z.string().max(60).parse(req.query.itemId ?? '')
      const doc: StoredDocument = {
        id: randomUUID(), userId, applicationId: app.id, itemId,
        filename: safeFilename(String(req.query.filename ?? '')),
        mime, size: body.length, uploadedAt: new Date().toISOString(),
      }
      await blobs.put(userId, doc.id, body, mime)
      await store.saveDocument(doc)
      res.status(201).json({ document: doc })
    },
  )

  r.get('/documents/:id', async (req, res) => {
    const userId = req.session!.sub
    const doc = await store.getDocument(userId, String(req.params.id))
    if (!doc) throw new HttpError(404, 'Document not found')
    await sendBlob(res, blobs, userId, doc)
  })

  r.delete('/documents/:id', async (req, res) => {
    const userId = req.session!.sub
    const id = String(req.params.id)
    if (!(await store.deleteDocument(userId, id))) throw new HttpError(404, 'Document not found')
    await blobs.remove(userId, id)
    res.status(204).end()
  })

  return r
}
