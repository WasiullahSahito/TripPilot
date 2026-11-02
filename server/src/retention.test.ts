// @vitest-environment node
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'
import type { Store } from './models/store.ts'
import type { StoredDocument, User } from './models/types.ts'
import { encryptJson } from './services/crypto.ts'
import type { BlobStore } from './services/blobs.ts'
import { runRetention } from './services/retention.ts'

class MemBlobs implements BlobStore {
  files = new Set<string>()
  failFor = new Set<string>()
  async put(u: string, id: string) { this.files.add(`${u}/${id}`) }
  async get() { return null }
  async remove(u: string, id: string) {
    if (this.failFor.has(id)) throw new Error('storage down')
    this.files.delete(`${u}/${id}`)
  }
  async removeAll() {}
  async signedUrl() { return null }
}

const NOW = new Date('2027-06-01T12:00:00Z')
const iso = (d: string) => `${d}T00:00:00.000Z`

async function user(store: Store, retentionDays: number | null) {
  const u: User = { id: randomUUID(), email: `${randomUUID()}@example.com`, name: 'T', passwordHash: 'x', role: 'user', emailVerifiedAt: null, verifyToken: null, createdAt: iso('2026-01-01') }
  await store.saveUser(u)
  await store.saveProfile({ userId: u.id, nationality: '', residenceCountry: '', homeAirport: '', interests: [], onboardedAt: null, retentionDays })
  return u
}

async function doc(store: Store, blobs: MemBlobs, userId: string, ownerId: string, uploadedAt = iso('2027-05-31')) {
  const d: StoredDocument = { id: randomUUID(), userId, applicationId: ownerId, itemId: 'x', filename: 'f.pdf', mime: 'application/pdf', size: 10, uploadedAt }
  await store.saveDocument(d)
  await blobs.put(userId, d.id)
  return d
}

async function booking(store: Store, userId: string, endDate: string | null, startDate = '2027-01-01') {
  const id = randomUUID()
  await store.saveBooking({ id, userId, kind: 'hotel', status: 'requested', source: 'user-entered', title: 't', startDate, endDate, confirmationRef: null, details: {}, createdAt: iso('2027-01-01') })
  return id
}

describe('retention', () => {
  it('deletes files only after the chosen number of days past the booking end, to the day', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 30)
    // booking ended 2027-05-02: 30 days later is 2027-06-01 (today) -> still kept; one day older -> deleted
    const keep = await doc(store, blobs, u.id, await booking(store, u.id, '2027-05-02'))
    const drop = await doc(store, blobs, u.id, await booking(store, u.id, '2027-05-01'))
    const report = await runRetention(store, blobs, NOW)
    expect(report).toEqual({ users: 1, documentsDeleted: 1, failures: 0 })
    expect((await store.listDocuments(u.id)).map((d) => d.id)).toEqual([keep.id])
    expect(blobs.files.has(`${u.id}/${drop.id}`)).toBe(false)
    expect(blobs.files.has(`${u.id}/${keep.id}`)).toBe(true)
  })

  it('uses the booking start date when there is no end date, and the appointment date', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 30)
    const old = await doc(store, blobs, u.id, await booking(store, u.id, null, '2027-01-10'))
    const apptId = randomUUID()
    await store.saveAppointment({ id: apptId, userId: u.id, destinationId: '', center: 'c', type: 'visa', startsAt: '2027-02-01T10:00', preferredTimes: '', status: 'requested', officialRef: null, reminderDays: 0, notes: '', checklist: {}, createdAt: iso('2027-01-01') })
    const oldAppt = await doc(store, blobs, u.id, apptId)
    const fresh = await doc(store, blobs, u.id, await booking(store, u.id, '2027-12-31'))
    await runRetention(store, blobs, NOW)
    expect((await store.listDocuments(u.id)).map((d) => d.id)).toEqual([fresh.id])
    expect(blobs.files.has(`${u.id}/${old.id}`) || blobs.files.has(`${u.id}/${oldAppt.id}`)).toBe(false)
  })

  it('uses the departure date on a visa application, falling back to the last-saved date', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 60)
    const app = (departure: string | null, updatedAt: string) => {
      const id = randomUUID()
      return store.saveApplication({ id, userId: u.id, destinationId: 'france', categoryId: id.slice(0, 6), nationality: '', residence: '', status: 'draft', checklist: {}, dataEnc: encryptJson(departure ? { travel: { departureDate: departure } } : {}), createdAt: iso('2027-01-01'), updatedAt }).then(() => id)
    }
    const tripOver = await doc(store, blobs, u.id, await app('2027-03-01', iso('2027-05-30'))) // departed 92 days ago
    const tripSoon = await doc(store, blobs, u.id, await app('2027-09-01', iso('2027-01-01')))   // future trip, old save: kept
    const noDate = await doc(store, blobs, u.id, await app(null, iso('2027-05-20')))             // saved 12 days ago: kept
    const noDateOld = await doc(store, blobs, u.id, await app(null, iso('2027-01-20')))          // saved long ago: deleted
    await runRetention(store, blobs, NOW)
    const left = new Set((await store.listDocuments(u.id)).map((d) => d.id))
    expect(left.has(tripOver.id)).toBe(false)
    expect(left.has(noDateOld.id)).toBe(false)
    expect(left.has(tripSoon.id)).toBe(true)
    expect(left.has(noDate.id)).toBe(true)
  })

  it('falls back to the upload date for files whose owner no longer exists', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 30)
    const orphanOld = await doc(store, blobs, u.id, randomUUID(), iso('2027-03-01'))
    const orphanNew = await doc(store, blobs, u.id, randomUUID(), iso('2027-05-25'))
    await runRetention(store, blobs, NOW)
    expect((await store.listDocuments(u.id)).map((d) => d.id)).toEqual([orphanNew.id])
    expect(blobs.files.has(`${u.id}/${orphanOld.id}`)).toBe(false)
  })

  it('never touches users who did not opt in, or other users\' files', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const optedOut = await user(store, null)
    const optedIn = await user(store, 30)
    const a = await doc(store, blobs, optedOut.id, await booking(store, optedOut.id, '2020-01-01'))
    const b = await doc(store, blobs, optedIn.id, await booking(store, optedIn.id, '2020-01-01'))
    const report = await runRetention(store, blobs, NOW)
    expect(report.documentsDeleted).toBe(1)
    expect((await store.listDocuments(optedOut.id)).map((d) => d.id)).toEqual([a.id])
    expect(await store.listDocuments(optedIn.id)).toEqual([])
    expect(blobs.files.has(`${optedOut.id}/${a.id}`)).toBe(true)
    expect(blobs.files.has(`${optedIn.id}/${b.id}`)).toBe(false)
  })

  it('keeps the record when storage deletion fails, so the next run retries', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 30)
    const d = await doc(store, blobs, u.id, await booking(store, u.id, '2020-01-01'))
    blobs.failFor.add(d.id)
    expect(await runRetention(store, blobs, NOW)).toEqual({ users: 0, documentsDeleted: 0, failures: 1 })
    expect(await store.listDocuments(u.id)).toHaveLength(1)
    blobs.failFor.clear()
    expect((await runRetention(store, blobs, NOW)).documentsDeleted).toBe(1)
    expect(await store.listDocuments(u.id)).toHaveLength(0)
  })

  it('writes an audit entry with counts only', async () => {
    const store = new JsonStore(), blobs = new MemBlobs()
    const u = await user(store, 30)
    await doc(store, blobs, u.id, await booking(store, u.id, '2020-01-01'))
    await runRetention(store, blobs, NOW)
    const e = (await store.listAudit({ limit: 5, offset: 0, action: 'retention.deleted_files' }))[0]!
    expect(e).toMatchObject({ actorId: null, targetId: u.id, meta: { documents: 1, afterDays: 30 } })
  })
})

describe('retention setting and cron endpoint', () => {
  afterEach(() => { env.cronSecret = undefined })

  async function signedIn() {
    const store = new JsonStore()
    const app = createApp(store)
    const a = request.agent(app)
    await a.post('/api/auth/register').send({ name: 'T', email: 'ret@example.com', password: 'correct-horse-battery' }).expect(201)
    return { a, app, store }
  }

  it('lets a user choose an offered period or opt out, and rejects anything else', async () => {
    const { a } = await signedIn()
    expect((await a.patch('/api/profile/retention').send({ days: 90 }).expect(200)).body.profile.retentionDays).toBe(90)
    expect((await a.get('/api/auth/me')).body.profile.retentionDays).toBe(90)
    for (const bad of [{ days: 7 }, { days: -1 }, { days: '30' }, { days: 100000 }, {}]) await a.patch('/api/profile/retention').send(bad).expect(400)
    expect((await a.patch('/api/profile/retention').send({ days: null }).expect(200)).body.profile.retentionDays).toBeNull()
  })

  it('keeps the choice when the rest of the profile is saved', async () => {
    const { a } = await signedIn()
    await a.patch('/api/profile/retention').send({ days: 60 }).expect(200)
    await a.put('/api/profile').send({ nationality: 'India', residenceCountry: 'India', homeAirport: '', interests: [] }).expect(200)
    expect((await a.get('/api/auth/me')).body.profile.retentionDays).toBe(60)
  })

  it('requires authentication', async () => {
    const { app } = await signedIn()
    await request(app).patch('/api/profile/retention').send({ days: 30 }).expect(401)
  })

  it('does not exist without CRON_SECRET, rejects wrong secrets, and runs with the right one', async () => {
    const { app, a, store } = await signedIn()
    await request(app).get('/api/cron/retention').expect(404)
    env.cronSecret = 'a-long-random-cron-secret'
    await request(app).get('/api/cron/retention').expect(401)
    await request(app).get('/api/cron/retention').set('Authorization', 'Bearer wrong').expect(401)
    await request(app).get('/api/cron/retention').set('Authorization', 'a-long-random-cron-secret').expect(401)
    await a.get('/api/cron/retention').expect(401) // a logged-in user's cookie is not the secret
    const ok = await request(app).get('/api/cron/retention').set('Authorization', 'Bearer a-long-random-cron-secret').expect(200)
    expect(ok.body).toEqual({ users: 0, documentsDeleted: 0, failures: 0 })
    expect(store).toBeTruthy()
  })
})
