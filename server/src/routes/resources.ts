import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { Store } from '../models/store.ts'
import type { Trip } from '../models/types.ts'
import { authLimiter, HttpError, SESSION_COOKIE, requireAuth } from '../middleware/security.ts'
import { decryptJson } from '../services/crypto.ts'
import type { BlobStore } from '../services/blobs.ts'
import { audit } from '../services/audit.ts'
import { invalidateSessionCache } from '../middleware/session-guard.ts'
import { retentionSchema } from '../services/retention-schema.ts'
import { checkPassword, hashPassword, toPublicUser } from '../services/auth-service.ts'
import { accountNameSchema, passwordChangeSchema, passwordProblem, profileSchema, tripSchema, tripUpdateSchema } from '../validators/schemas.ts'

export function profileRoutes(store: Store) {
  const r = Router()
  r.use(requireAuth)

  r.put('/', async (req, res) => {
    const input = profileSchema.parse(req.body)
    const existing = await store.getProfile(req.session!.sub)
    const profile = { ...input, userId: req.session!.sub, onboardedAt: existing?.onboardedAt ?? new Date().toISOString(), retentionDays: existing?.retentionDays ?? null }
    await store.saveProfile(profile)
    res.json({ profile })
  })

  // Opt in (or out) of automatic deletion of uploaded files some days after the related trip.
  r.patch('/retention', async (req, res) => {
    const { days } = retentionSchema.parse(req.body)
    const existing = await store.getProfile(req.session!.sub)
    if (!existing) throw new HttpError(404, 'Profile not found')
    const profile = { ...existing, retentionDays: days }
    await store.saveProfile(profile)
    await audit(store, { actorId: req.session!.sub, action: 'profile.retention_changed', targetId: req.session!.sub, meta: { days: days ?? 0 } })
    res.json({ profile })
  })

  return r
}

export function tripRoutes(store: Store) {
  const r = Router()
  r.use(requireAuth)

  r.get('/', async (req, res) => {
    res.json({ trips: await store.listTrips(req.session!.sub) })
  })

  r.post('/', async (req, res) => {
    const input = tripSchema.parse(req.body)
    const trip: Trip = {
      id: randomUUID(), userId: req.session!.sub, ...input, status: 'planning', createdAt: new Date().toISOString(),
    }
    await store.saveTrip(trip)
    res.status(201).json({ trip })
  })

  r.patch('/:id', async (req, res) => {
    const trip = await store.getTrip(req.session!.sub, String(req.params.id))
    if (!trip) throw new HttpError(404, 'Trip not found')
    const patch = tripUpdateSchema.parse(req.body)
    const updated: Trip = { ...trip, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
    if (updated.returnOn < updated.departOn) throw new HttpError(400, 'Return date must be on or after departure')
    await store.saveTrip(updated)
    res.json({ trip: updated })
  })

  r.delete('/:id', async (req, res) => {
    const ok = await store.deleteTrip(req.session!.sub, String(req.params.id))
    if (!ok) throw new HttpError(404, 'Trip not found')
    res.status(204).end()
  })

  return r
}

export function accountRoutes(store: Store, blobs: BlobStore) {
  const r = Router()
  r.use(requireAuth)

  r.patch('/name', async (req, res) => {
    const input = accountNameSchema.parse(req.body)
    const user = await store.findUserById(req.session!.sub)
    if (!user) throw new HttpError(404, 'Account not found')
    const updated = { ...user, name: input.name }
    await store.saveUser(updated)
    res.json({ user: toPublicUser(updated) })
  })

  r.post('/password', authLimiter, async (req, res) => {
    const input = passwordChangeSchema.parse(req.body)
    const user = await store.findUserById(req.session!.sub)
    if (!user) throw new HttpError(404, 'Account not found')
    if (!(await checkPassword(user, input.currentPassword))) throw new HttpError(401, 'Current password is incorrect')
    const problem = passwordProblem(input.newPassword, user.email)
    if (problem) throw new HttpError(400, problem)
    await store.saveUser({ ...user, passwordHash: await hashPassword(input.newPassword) })
    await audit(store, { actorId: user.id, action: 'auth.password_changed', targetId: user.id })
    res.status(204).end()
  })

  r.get('/export', async (req, res) => {
    const id = req.session!.sub
    const user = await store.findUserById(id)
    if (!user) throw new HttpError(404, 'Account not found')
    const { passwordHash: _p, verifyToken: _v, ...safe } = user
    res.setHeader('Content-Disposition', 'attachment; filename="trippilot-export.json"')
    res.json({ exportedAt: new Date().toISOString(), user: safe, profile: await store.getProfile(id), trips: await store.listTrips(id),
      visaApplications: (await store.listApplications(id)).map(({ dataEnc, ...a }) => ({
        ...a, data: decryptJson<unknown>(dataEnc),
      })),
      bookings: await store.listBookings(id),
      appointments: await store.listAppointments(id),
      expenses: await store.listExpenses(id),
      documents: await store.listDocuments(id), // metadata only; files are downloadable separately
    })
  })

  r.delete('/', async (req, res) => {
    const id = req.session!.sub
    await audit(store, { actorId: id, action: 'account.deleted', targetId: id })
    await store.deleteUserData(id)
    await blobs.removeAll(id)
    invalidateSessionCache(id)
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.status(204).end()
  })

  return r
}
