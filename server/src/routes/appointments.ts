import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import type { Store } from '../models/store.ts'
import type { Appointment } from '../models/types.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import { saveUploadedDocument } from './bookings.ts'
import type { BlobStore } from '../services/blobs.ts'
import { env } from '../config/env.ts'

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use YYYY-MM-DDTHH:mm')

const base = z.object({
  destinationId: z.string().trim().max(40).default(''),
  center: z.string().trim().min(1).max(150),
  type: z.enum(['visa', 'biometrics', 'interview', 'other']),
  startsAt: dateTime,
  preferredTimes: z.string().trim().max(120).default(''),
  status: z.enum(['requested', 'pending', 'confirmed']),
  /** Reference or confirmation the user copied from the official provider. Never generated here. */
  officialRef: z.string().trim().max(60).nullable().default(null),
  reminderDays: z.number().int().min(0).max(30).default(0),
  notes: z.string().trim().max(500).default(''),
  checklist: z.record(z.string().max(40), z.boolean()).default({}),
})

/** An appointment is only "confirmed" when the user supplies the provider's reference. */
const rule = (a: { status: string; officialRef: string | null }, ctx: z.RefinementCtx) => {
  if (a.status === 'confirmed' && !a.officialRef) {
    ctx.addIssue({ code: 'custom', path: ['officialRef'], message: 'Enter the reference from the official confirmation' })
  }
  if (a.status !== 'confirmed' && a.officialRef) {
    ctx.addIssue({ code: 'custom', path: ['officialRef'], message: 'Only confirmed appointments have a reference' })
  }
}

export const appointmentInput = base.superRefine(rule)

export function appointmentRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', async (req, res) => {
    const userId = req.session!.sub
    const docs = await store.listDocuments(userId)
    const items = await store.listAppointments(userId)
    res.json({ appointments: items.map((a) => ({ ...a, documents: docs.filter((d) => d.applicationId === a.id) })) })
  })

  r.post('/', async (req, res) => {
    const input = appointmentInput.parse(req.body)
    const a: Appointment = { id: randomUUID(), userId: req.session!.sub, ...input, createdAt: new Date().toISOString() }
    await store.saveAppointment(a)
    res.status(201).json({ appointment: { ...a, documents: [] } })
  })

  r.patch('/:id', async (req, res) => {
    const userId = req.session!.sub
    const existing = await store.getAppointment(userId, String(req.params.id))
    if (!existing) throw new HttpError(404, 'Appointment not found')
    const { id: _i, userId: _u, createdAt, ...current } = existing
    const merged = appointmentInput.parse({ ...current, ...(req.body as object) })
    const updated: Appointment = { ...merged, id: existing.id, userId, createdAt }
    await store.saveAppointment(updated)
    res.json({ appointment: updated })
  })

  r.delete('/:id', async (req, res) => {
    const userId = req.session!.sub
    const id = String(req.params.id)
    if (!(await store.deleteAppointment(userId, id))) throw new HttpError(404, 'Appointment not found')
    for (const d of await store.listDocuments(userId, id)) {
      await store.deleteDocument(userId, d.id)
      await blobs.remove(userId, d.id)
    }
    res.status(204).end()
  })

  r.post('/:id/documents', express.raw({ type: () => true, limit: env.maxUploadBytes }), async (req, res) => {
    const userId = req.session!.sub
    const a = await store.getAppointment(userId, String(req.params.id))
    if (!a) throw new HttpError(404, 'Appointment not found')
    res.status(201).json({ document: await saveUploadedDocument(store, blobs, userId, a.id, 'appointment', req) })
  })

  return r
}
