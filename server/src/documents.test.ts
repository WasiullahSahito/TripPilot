// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'
import { tinyPdf } from './test-fixtures.ts'

const creds = { name: 'Test User', email: 'docs@example.com', password: 'correct-horse-battery' }
const pdf = tinyPdf
let app: ReturnType<typeof createApp>

beforeEach(() => {
  app = createApp(new JsonStore(), { uploadDir: mkdtempSync(join(tmpdir(), 'tp-')) })
})

async function signedIn(email = creds.email) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  return a
}

describe('GET /api/documents', () => {
  it('lists documents from applications, bookings and appointments with their owner kind', async () => {
    const a = await signedIn()
    const appId = (await a.put('/api/visa/applications').send({ destinationId: 'france', categoryId: 'tourism' })).body.application.id
    const bookingId = (await a.post('/api/bookings').send({ kind: 'hotel', status: 'sample', source: 'demo', title: 'Sample stay', startDate: '2026-12-01' })).body.booking.id
    const apptId = (await a.post('/api/appointments').send({ center: 'Centre', type: 'visa', startsAt: '2026-12-02T10:00', status: 'requested' })).body.appointment.id

    await a.post(`/api/visa/applications/${appId}/documents?itemId=passport&filename=p.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    await a.post(`/api/bookings/${bookingId}/documents?filename=h.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    await a.post(`/api/appointments/${apptId}/documents?filename=a.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)

    const res = await a.get('/api/documents').expect(200)
    const kinds = res.body.documents.map((d: { owner: { kind: string } }) => d.owner.kind).sort()
    expect(kinds).toEqual(['appointment', 'hotel', 'visa'])
  })

  it('serves a file only to its owner', async () => {
    const a = await signedIn()
    const appId = (await a.put('/api/visa/applications').send({ destinationId: 'france', categoryId: 'tourism' })).body.application.id
    const doc = (await a.post(`/api/visa/applications/${appId}/documents?itemId=x&filename=p.pdf`).set('Content-Type', 'application/pdf').send(pdf)).body.document
    const ok = await a.get(`/api/documents/${doc.id}/file`).expect(200)
    expect(ok.headers['content-type']).toMatch(/application\/pdf/)
    const b = await signedIn('other@example.com')
    await b.get(`/api/documents/${doc.id}/file`).expect(404)
    expect((await b.get('/api/documents')).body.documents).toHaveLength(0)
  })

  it('requires auth', async () => {
    await request(app).get('/api/documents').expect(401)
  })
})
