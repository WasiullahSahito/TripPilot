import { createHmac, randomUUID } from 'node:crypto'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../config/env.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import type { Store } from '../models/store.ts'
import type { StoredDocument } from '../models/types.ts'
import { UploadTooLarge, type BlobStore } from '../services/blobs.ts'
import { guardUpload } from '../services/upload-guard.ts'
import { safeFilename, sniffMime } from './visa.ts'

/**
 * Large files (over the ~4 MB a serverless function can receive) are uploaded by the browser straight to storage:
 *   1. POST /init      server checks ownership and size, returns a single-use upload URL and a signed ticket
 *   2. browser PUTs the file to that URL (into a pending area, not under the user)
 *   3. POST /finalize  server downloads it, checks the real type, scans it, and only then files it permanently
 * Nothing becomes a document until step 3 passes; rejected files are deleted.
 */

const TICKET_AUDIENCE = 'trippilot-upload'
// A different key from login sessions, so an upload ticket can never be presented as a login cookie (or vice versa).
const ticketKey = () => createHmac('sha256', env.jwtSecret).update('upload-ticket').digest('hex')

interface Ticket {
  sub: string
  doc: string
  kind: 'visa' | 'booking' | 'appointment'
  ownerId: string
  itemId: string
  filename: string
}

const initSchema = z.object({
  kind: z.enum(['visa', 'booking', 'appointment']),
  ownerId: z.string().uuid(),
  itemId: z.string().max(60).default(''),
  filename: z.string().max(200),
  size: z.number().int().min(1),
})
const finalizeSchema = z.object({ ticket: z.string().min(20).max(4000) })

export function uploadRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  async function assertOwner(userId: string, kind: Ticket['kind'], ownerId: string) {
    const found =
      kind === 'visa' ? await store.getApplication(userId, ownerId)
      : kind === 'booking' ? await store.getBooking(userId, ownerId)
      : await store.getAppointment(userId, ownerId)
    if (!found) throw new HttpError(404, 'Not found')
  }

  r.post('/init', async (req, res) => {
    const userId = req.session!.sub
    const input = initSchema.parse(req.body)
    if (!blobs.direct) {
      // Local storage: no direct path. The client must use the normal (size-limited) endpoints.
      res.json({ direct: false, maxBytes: env.maxUploadBytes })
      return
    }
    if (input.size > env.maxLargeUploadBytes) throw new HttpError(413, `Files can be at most ${Math.floor(env.maxLargeUploadBytes / 1024 / 1024)} MB.`)
    await assertOwner(userId, input.kind, input.ownerId)
    if ((await store.listDocuments(userId)).length >= 100) throw new HttpError(409, 'Document limit reached')

    const doc = randomUUID()
    const uploadUrl = await blobs.direct.createUrl(userId, doc)
    const claims: Ticket = { sub: userId, doc, kind: input.kind, ownerId: input.ownerId, itemId: input.kind === 'visa' ? input.itemId : input.kind, filename: safeFilename(input.filename) }
    const ticket = jwt.sign(claims, ticketKey(), { algorithm: 'HS256', audience: TICKET_AUDIENCE, expiresIn: '15m' })
    res.json({ direct: true, documentId: doc, uploadUrl, ticket, maxBytes: env.maxLargeUploadBytes })
  })

  r.post('/finalize', async (req, res) => {
    const userId = req.session!.sub
    const { ticket } = finalizeSchema.parse(req.body)
    let claims: Ticket
    try {
      claims = jwt.verify(ticket, ticketKey(), { algorithms: ['HS256'], audience: TICKET_AUDIENCE }) as Ticket
    } catch {
      throw new HttpError(400, 'This upload expired. Please start it again.')
    }
    if (claims.sub !== userId) throw new HttpError(403, 'Forbidden')
    if (!blobs.direct) throw new HttpError(400, 'Direct uploads are not available')

    const existing = await store.getDocument(userId, claims.doc)
    if (existing) {
      res.json({ document: existing }) // finalize is safe to repeat
      return
    }
    await assertOwner(userId, claims.kind, claims.ownerId)

    let bytes: Buffer | null
    try {
      bytes = await blobs.direct.readPending(userId, claims.doc, env.maxLargeUploadBytes)
    } catch (e) {
      if (e instanceof UploadTooLarge) {
        await blobs.direct.discard(userId, claims.doc)
        throw new HttpError(413, `Files can be at most ${Math.floor(env.maxLargeUploadBytes / 1024 / 1024)} MB.`)
      }
      throw e
    }
    if (!bytes || bytes.length === 0) throw new HttpError(400, 'The file was not received. Please try uploading again.')

    try {
      const mime = sniffMime(bytes)
      if (!mime) throw new HttpError(415, 'Only PDF, PNG and JPEG files are accepted')
      await guardUpload(store, userId, bytes, mime)
      await blobs.direct.commit(userId, claims.doc)
      const doc: StoredDocument = {
        id: claims.doc, userId, applicationId: claims.ownerId, itemId: claims.itemId, filename: claims.filename,
        mime, size: bytes.length, uploadedAt: new Date().toISOString(),
      }
      await store.saveDocument(doc)
      res.status(201).json({ document: doc })
    } catch (e) {
      // Anything that is not stored must not linger in the pending area.
      if (!(await store.getDocument(userId, claims.doc))) await blobs.direct.discard(userId, claims.doc).catch(() => undefined)
      throw e
    }
  })

  return r
}
