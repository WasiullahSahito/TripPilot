// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'
import { tinyPdf } from './test-fixtures.ts'

const creds = { name: 'Test User', email: 'book@example.com', password: 'correct-horse-battery' }
const sample = { kind: 'flight', status: 'sample', source: 'demo', title: 'Sample: DEL to CDG', startDate: '2026-12-01', endDate: '2026-12-10', details: { price: 640 } }
let app: ReturnType<typeof createApp>

beforeEach(() => {
  app = createApp(new JsonStore(), { uploadDir: mkdtempSync(join(tmpdir(), 'tp-')) })
})

async function signedIn(email = creds.email) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  return a
}

describe('booking integrity rules', () => {
  it('saves a demo itinerary as a sample with no reference', async () => {
    const a = await signedIn()
    const res = await a.post('/api/bookings').send(sample).expect(201)
    expect(res.body.booking.status).toBe('sample')
    expect(res.body.booking.confirmationRef).toBeNull()
  })

  it('refuses to save demo data as confirmed or with a reference', async () => {
    const a = await signedIn()
    await a.post('/api/bookings').send({ ...sample, status: 'confirmed', confirmationRef: 'ABC123' }).expect(400)
    await a.post('/api/bookings').send({ ...sample, confirmationRef: 'ABC123' }).expect(400)
  })

  it('requires a user-supplied reference to mark a booking confirmed', async () => {
    const a = await signedIn()
    const base = { ...sample, source: 'user-entered', status: 'confirmed' }
    await a.post('/api/bookings').send(base).expect(400)
    const ok = await a.post('/api/bookings').send({ ...base, confirmationRef: 'XK29LQ' }).expect(201)
    expect(ok.body.booking.source).toBe('user-entered')
  })

  it('does not let clients claim provider-issued bookings', async () => {
    const a = await signedIn()
    await a.post('/api/bookings').send({ ...sample, source: 'provider', status: 'confirmed', confirmationRef: 'X' }).expect(400)
  })

  it('rejects end before start', async () => {
    const a = await signedIn()
    await a.post('/api/bookings').send({ ...sample, endDate: '2026-11-01' }).expect(400)
  })
})

describe('booking access and documents', () => {
  it("isolates users and attaches documents", async () => {
    const a = await signedIn()
    const id = (await a.post('/api/bookings').send(sample)).body.booking.id as string
    const pdf = tinyPdf
    await a.post(`/api/bookings/${id}/documents?filename=ticket.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    const list = await a.get('/api/bookings').expect(200)
    expect(list.body.bookings[0].documents).toHaveLength(1)

    const b = await signedIn('other@example.com')
    expect((await b.get('/api/bookings')).body.bookings).toHaveLength(0)
    await b.delete(`/api/bookings/${id}`).expect(404)
    await b.post(`/api/bookings/${id}/documents?filename=x.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(404)

    await a.delete(`/api/bookings/${id}`).expect(204)
    expect((await a.get('/api/bookings')).body.bookings).toHaveLength(0)
  })

  it('answers 501 for live search when no provider is configured', async () => {
    const a = await signedIn()
    const r = await a.post('/api/flights/search').send({}).expect(501)
    expect(r.body.error).toMatch(/No live flights provider/)
  })
})
