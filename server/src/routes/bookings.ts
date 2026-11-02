import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import type { Store } from '../models/store.ts'
import type { Booking, StoredDocument } from '../models/types.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import { safeFilename, sniffMime } from './visa.ts'
import { guardUpload } from '../services/upload-guard.ts'
import { sendBlob, type BlobStore } from '../services/blobs.ts'
import { env } from '../config/env.ts'
import type { Request } from 'express'

const MAX_UPLOAD = env.maxUploadBytes
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Integrity rules (the "never fabricate a confirmation" guarantee):
 *  - clients can only claim source "demo" or "user-entered"; "provider" is reserved for server-side provider integrations
 *  - demo / sample bookings can never carry a confirmation reference or be confirmed
 *  - "confirmed" always needs a user-supplied confirmation reference
 */
export const bookingInput = z
  .object({
    kind: z.enum(['flight', 'hotel', 'insurance']),
    status: z.enum(['sample', 'requested', 'confirmed']),
    source: z.enum(['demo', 'user-entered']),
    title: z.string().trim().min(1).max(150),
    startDate: isoDate,
    endDate: isoDate.nullable().default(null),
    confirmationRef: z.string().trim().max(40).nullable().default(null),
    details: z.record(z.string().max(40), z.union([z.string().max(300), z.number()])).default({}),
  })
  .superRefine((b, ctx) => {
    const ref = b.confirmationRef
    if (b.source === 'demo' && (b.status !== 'sample' || ref)) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'Demo data can only be saved as a sample' })
    }
    if (b.status === 'sample' && ref) {
      ctx.addIssue({ code: 'custom', path: ['confirmationRef'], message: 'A sample cannot have a confirmation reference' })
    }
    if (b.status === 'confirmed' && !ref) {
      ctx.addIssue({ code: 'custom', path: ['confirmationRef'], message: 'Enter the confirmation reference from your provider' })
    }
    if (b.endDate && b.endDate < b.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after start date' })
    }
  })

/** Validates and stores an upload for any owner (booking, appointment, ...). */
export async function saveUploadedDocument(
  store: Store, blobs: BlobStore, userId: string, ownerId: string, itemId: string, req: Request,
): Promise<StoredDocument> {
  const body = req.body as unknown
  if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Empty upload')
  const mime = sniffMime(body)
  if (!mime) throw new HttpError(415, 'Only PDF, PNG and JPEG files are accepted')
  if ((await store.listDocuments(userId)).length >= 100) throw new HttpError(409, 'Document limit reached')
  await guardUpload(store, userId, body, mime)
  const doc: StoredDocument = {
    id: randomUUID(), userId, applicationId: ownerId, itemId,
    filename: safeFilename(String(req.query.filename ?? '')), mime, size: body.length, uploadedAt: new Date().toISOString(),
  }
  await blobs.put(userId, doc.id, body, mime)
  await store.saveDocument(doc)
  return doc
}

export function bookingRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', async (req, res) => {
    const userId = req.session!.sub
    const bookings = await store.listBookings(userId)
    const docs = await store.listDocuments(userId)
    res.json({ bookings: bookings.map((b) => ({ ...b, documents: docs.filter((d) => d.applicationId === b.id) })) })
  })

  r.post('/', async (req, res) => {
    const input = bookingInput.parse(req.body)
    const booking: Booking = {
      id: randomUUID(), userId: req.session!.sub, ...input, createdAt: new Date().toISOString(),
    }
    await store.saveBooking(booking)
    res.status(201).json({ booking: { ...booking, documents: [] } })
  })

  r.delete('/:id', async (req, res) => {
    const userId = req.session!.sub
    const id = String(req.params.id)
    if (!(await store.deleteBooking(userId, id))) throw new HttpError(404, 'Booking not found')
    for (const d of await store.listDocuments(userId, id)) {
      await store.deleteDocument(userId, d.id)
      await blobs.remove(userId, d.id)
    }
    res.status(204).end()
  })

  // Documents reuse the visa document store; `applicationId` holds the owning booking id.
  r.post('/:id/documents', express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
    const userId = req.session!.sub
    const booking = await store.getBooking(userId, String(req.params.id))
    if (!booking) throw new HttpError(404, 'Booking not found')
    const doc = await saveUploadedDocument(store, blobs, userId, booking.id, 'booking', req)
    res.status(201).json({ document: doc })
  })

  r.get('/documents/:docId', async (req, res) => {
    const userId = req.session!.sub
    const doc = await store.getDocument(userId, String(req.params.docId))
    if (!doc) throw new HttpError(404, 'Document not found')
    await sendBlob(res, blobs, userId, doc)
  })

  return r
}
