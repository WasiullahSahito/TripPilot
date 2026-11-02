import { Router } from 'express'
import type { Store } from '../models/store.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import { sendBlob, SIGNED_URL_TTL_SECONDS, type BlobStore } from '../services/blobs.ts'

/**
 * Unified view over everything the user has uploaded, whatever it is attached to.
 * Used by the document center to assemble a package. Files stay private to their owner.
 */
export function documentRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', async (req, res) => {
    const userId = req.session!.sub
    const [docs, apps, bookings, appts] = await Promise.all([
      store.listDocuments(userId),
      store.listApplications(userId),
      store.listBookings(userId),
      store.listAppointments(userId),
    ])
    const owners = new Map<string, { kind: 'visa' | 'flight' | 'hotel' | 'insurance' | 'appointment'; label: string }>()
    for (const a of apps) owners.set(a.id, { kind: 'visa', label: `${a.destinationId} / ${a.categoryId}` })
    for (const b of bookings) owners.set(b.id, { kind: b.kind, label: b.title })
    for (const a of appts) owners.set(a.id, { kind: 'appointment', label: `${a.type} - ${a.center}` })

    res.json({
      documents: docs
        .map((d) => ({
          id: d.id, filename: d.filename, mime: d.mime, size: d.size, uploadedAt: d.uploadedAt, itemId: d.itemId,
          ownerId: d.applicationId, owner: owners.get(d.applicationId) ?? null,
        }))
        .filter((d) => d.owner !== null),
    })
  })

  // Programmatic clients (the package builder) get a short-lived direct link instead of following a redirect.
  r.get('/:id/url', async (req, res) => {
    const userId = req.session!.sub
    const doc = await store.getDocument(userId, String(req.params.id))
    if (!doc) throw new HttpError(404, 'Document not found')
    const url = await blobs.signedUrl(userId, doc.id, doc.filename)
    res.json({ url: url ?? `/api/documents/${doc.id}/file`, signed: !!url, expiresInSeconds: url ? SIGNED_URL_TTL_SECONDS : null })
  })

  r.get('/:id/file', async (req, res) => {
    const userId = req.session!.sub
    const doc = await store.getDocument(userId, String(req.params.id))
    if (!doc) throw new HttpError(404, 'Document not found')
    await sendBlob(res, blobs, userId, doc)
  })

  return r
}
