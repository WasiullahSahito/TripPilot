// @vitest-environment node
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'
import { UploadTooLarge, type BlobStore, type DirectUpload } from './services/blobs.ts'
import { tinyPdf } from './test-fixtures.ts'

/** In-memory stand-in for Supabase's pending/ + permanent areas. */
class FakeDirectBlobs implements BlobStore {
  pending = new Map<string, Buffer>()
  final = new Map<string, Buffer>()
  ages = new Map<string, number>()
  async put(u: string, id: string, b: Buffer) { this.final.set(`${u}/${id}`, b) }
  async get(u: string, id: string) { return this.final.get(`${u}/${id}`) ?? null }
  async remove(u: string, id: string) { this.final.delete(`${u}/${id}`) }
  async removeAll() {}
  async signedUrl() { return null }
  /** What the browser's PUT to the signed URL does. */
  clientPut(u: string, id: string, b: Buffer, ageMs = 0) { this.pending.set(`${u}/${id}`, b); this.ages.set(`${u}/${id}`, Date.now() - ageMs) }
  direct: DirectUpload = {
    createUrl: async (u, id) => `https://storage.test/pending/${u}/${id}?token=once`,
    readPending: async (u, id, max) => {
      const b = this.pending.get(`${u}/${id}`)
      if (!b) return null
      if (b.length > max) throw new UploadTooLarge()
      return b
    },
    commit: async (u, id) => { this.final.set(`${u}/${id}`, this.pending.get(`${u}/${id}`)!); this.pending.delete(`${u}/${id}`) },
    discard: async (u, id) => { this.pending.delete(`${u}/${id}`) },
    sweep: async (older) => {
      let n = 0
      for (const [k, at] of this.ages) if (this.pending.has(k) && Date.now() - at > older) { this.pending.delete(k); n++ }
      return n
    },
  }
}

const creds = { name: 'T', email: 'big@example.com', password: 'correct-horse-battery' }
const EICAR = Buffer.from('%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF\n')

async function setup(blobs: BlobStore = new FakeDirectBlobs()) {
  const store = new JsonStore()
  const app = createApp(store, { blobs })
  const a = request.agent(app)
  const reg = await a.post('/api/auth/register').send(creds).expect(201)
  const userId = reg.body.user.id as string
  const appId = (await a.put('/api/visa/applications').send({ destinationId: 'france', categoryId: 'x' })).body.application.id as string
  return { a, app, store, blobs: blobs as FakeDirectBlobs, userId, appId }
}

const init = (a: ReturnType<typeof request.agent>, appId: string, size = 10 * 1024 * 1024, extra = {}) =>
  a.post('/api/uploads/init').send({ kind: 'visa', ownerId: appId, itemId: 'passport', filename: '../scan.pdf', size, ...extra })

describe('direct (large) uploads', () => {
  it('issues a signed link, then files the document only after the finalize checks pass', async () => {
    const { a, blobs, userId, appId } = await setup()
    const i = (await init(a, appId).expect(200)).body
    expect(i).toMatchObject({ direct: true, maxBytes: env.maxLargeUploadBytes })
    expect(i.uploadUrl).toContain(`/pending/${userId}/${i.documentId}`)

    // nothing is a document yet
    expect((await a.get(`/api/visa/applications/${appId}`)).body.documents).toHaveLength(0)

    blobs.clientPut(userId, i.documentId, tinyPdf)
    const fin = await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(201)
    expect(fin.body.document).toMatchObject({ id: i.documentId, filename: 'scan.pdf', mime: 'application/pdf', itemId: 'passport', applicationId: appId })
    expect(blobs.final.has(`${userId}/${i.documentId}`)).toBe(true)
    expect(blobs.pending.size).toBe(0)
    expect((await a.get(`/api/visa/applications/${appId}`)).body.documents).toHaveLength(1)
  })

  it('works for bookings and appointments, with their fixed item ids', async () => {
    const { a, blobs, userId } = await setup()
    const bookingId = (await a.post('/api/bookings').send({ kind: 'hotel', status: 'sample', source: 'demo', title: 'x', startDate: '2027-01-01' })).body.booking.id
    const i = (await a.post('/api/uploads/init').send({ kind: 'booking', ownerId: bookingId, itemId: 'ignored', filename: 'r.pdf', size: 6_000_000 }).expect(200)).body
    blobs.clientPut(userId, i.documentId, tinyPdf)
    const doc = (await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(201)).body.document
    expect(doc.itemId).toBe('booking')
    expect((await a.get('/api/bookings')).body.bookings[0].documents).toHaveLength(1)
  })

  it('refuses files that fail the checks and deletes them: wrong type, malware signature, active content', async () => {
    const { a, blobs, userId, appId, store } = await setup()
    for (const [bytes, status] of [[Buffer.from('<html>not a pdf</html>'), 415], [EICAR, 422], [Buffer.from('%PDF-1.4\n1 0 obj << /S /JavaScript /JS (x) >> endobj\n%%EOF\n'), 422]] as const) {
      const i = (await init(a, appId).expect(200)).body
      blobs.clientPut(userId, i.documentId, bytes)
      await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(status)
      expect(blobs.pending.size).toBe(0)
      expect(blobs.final.size).toBe(0)
    }
    expect(await store.listDocuments(userId)).toHaveLength(0)
  })

  it('rejects over-limit declarations up front and oversize files at finalize', async () => {
    const { a, blobs, userId, appId } = await setup()
    await init(a, appId, env.maxLargeUploadBytes + 1).expect(413)
    await init(a, appId, 0).expect(400)
    const i = (await init(a, appId).expect(200)).body
    blobs.clientPut(userId, i.documentId, Buffer.alloc(env.maxLargeUploadBytes + 1, 1)) // lied about the size
    await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(413)
    expect(blobs.pending.size).toBe(0)
  })

  it('reports a missing upload clearly', async () => {
    const { a, appId } = await setup()
    const i = (await init(a, appId).expect(200)).body
    const res = await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(400)
    expect(res.body.error).toMatch(/not received/)
  })

  it('only works on records the caller owns', async () => {
    const { a, app, appId } = await setup()
    const other = request.agent(app)
    await other.post('/api/auth/register').send({ ...creds, email: 'other@example.com' }).expect(201)
    await init(other, appId).expect(404)
    await a.post('/api/uploads/init').send({ kind: 'booking', ownerId: '00000000-0000-4000-8000-000000000000', filename: 'x.pdf', size: 5_000_000 }).expect(404)
  })

  it('binds a ticket to the user who started it, and rejects forged or expired tickets', async () => {
    const { a, app, appId, userId, blobs } = await setup()
    const i = (await init(a, appId).expect(200)).body
    blobs.clientPut(userId, i.documentId, tinyPdf)
    const other = request.agent(app)
    await other.post('/api/auth/register').send({ ...creds, email: 'other@example.com' }).expect(201)
    await other.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(403)
    await a.post('/api/uploads/finalize').send({ ticket: 'x'.repeat(40) }).expect(400)
    const forged = jwt.sign({ sub: userId, doc: i.documentId, kind: 'visa', ownerId: appId, itemId: 'x', filename: 'f.pdf' }, 'attacker-key', { audience: 'trippilot-upload' })
    await a.post('/api/uploads/finalize').send({ ticket: forged }).expect(400)
    const loginKeySigned = jwt.sign({ sub: userId, doc: i.documentId, kind: 'visa', ownerId: appId, itemId: 'x', filename: 'f.pdf' }, env.jwtSecret, { audience: 'trippilot-upload' })
    await a.post('/api/uploads/finalize').send({ ticket: loginKeySigned }).expect(400)
  })

  it('keeps tickets and login sessions apart in both directions', async () => {
    const { a, app, appId } = await setup()
    const i = (await init(a, appId).expect(200)).body
    // an upload ticket is not a login...
    await request(app).get('/api/trips').set('Cookie', `tp_session=${i.ticket}`).expect(401)
    // ...and a token signed with the login key but with no role is not a login either
    const roleless = jwt.sign({ sub: 'someone' }, env.jwtSecret, { expiresIn: '1h' })
    await request(app).get('/api/trips').set('Cookie', `tp_session=${roleless}`).expect(401)
  })

  it('finalize is repeatable and does not create duplicates', async () => {
    const { a, blobs, userId, appId, store } = await setup()
    const i = (await init(a, appId).expect(200)).body
    blobs.clientPut(userId, i.documentId, tinyPdf)
    await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(201)
    await a.post('/api/uploads/finalize').send({ ticket: i.ticket }).expect(200)
    expect(await store.listDocuments(userId)).toHaveLength(1)
  })

  it('says direct upload is unavailable with local storage', async () => {
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    await a.post('/api/auth/register').send(creds).expect(201)
    const res = await a.post('/api/uploads/init').send({ kind: 'visa', ownerId: '00000000-0000-4000-8000-000000000000', filename: 'x.pdf', size: 9_000_000 }).expect(200)
    expect(res.body).toEqual({ direct: false, maxBytes: env.maxUploadBytes })
  })

  it('requires authentication', async () => {
    const { app } = await setup()
    await request(app).post('/api/uploads/init').send({}).expect(401)
    await request(app).post('/api/uploads/finalize').send({}).expect(401)
  })

  it('the daily job clears abandoned pending uploads', async () => {
    const { a, blobs, userId, appId, store } = await setup()
    const { runRetention } = await import('./services/retention.ts')
    const stale = (await init(a, appId).expect(200)).body
    const fresh = (await init(a, appId).expect(200)).body
    blobs.clientPut(userId, stale.documentId, tinyPdf, 2 * 24 * 3600 * 1000)
    blobs.clientPut(userId, fresh.documentId, tinyPdf, 1000)
    const report = await runRetention(store, blobs)
    expect(report.pendingSwept).toBe(1)
    expect([...blobs.pending.keys()]).toEqual([`${userId}/${fresh.documentId}`])
  })
})
