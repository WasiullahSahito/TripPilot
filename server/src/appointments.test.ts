// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'
import { tinyPdf } from './test-fixtures.ts'

const creds = { name: 'Test User', email: 'appt@example.com', password: 'correct-horse-battery' }
const appt = { destinationId: 'france', center: 'Sample Visa Centre', type: 'biometrics', startsAt: '2026-12-02T10:30', status: 'requested' }
let app: ReturnType<typeof createApp>

beforeEach(() => {
  app = createApp(new JsonStore(), { uploadDir: mkdtempSync(join(tmpdir(), 'tp-')) })
})

async function signedIn(email = creds.email) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  return a
}

describe('appointments', () => {
  it('creates a requested appointment with defaults', async () => {
    const a = await signedIn()
    const res = await a.post('/api/appointments').send(appt).expect(201)
    expect(res.body.appointment.officialRef).toBeNull()
    expect(res.body.appointment.reminderDays).toBe(0)
  })

  it('cannot be confirmed without an official reference, and only confirmed ones may have one', async () => {
    const a = await signedIn()
    await a.post('/api/appointments').send({ ...appt, status: 'confirmed' }).expect(400)
    await a.post('/api/appointments').send({ ...appt, officialRef: 'REF-1' }).expect(400)
    await a.post('/api/appointments').send({ ...appt, status: 'confirmed', officialRef: 'REF-1' }).expect(201)
  })

  it('enforces the same rule on status updates', async () => {
    const a = await signedIn()
    const id = (await a.post('/api/appointments').send(appt)).body.appointment.id as string
    await a.patch(`/api/appointments/${id}`).send({ status: 'confirmed' }).expect(400)
    const ok = await a.patch(`/api/appointments/${id}`).send({ status: 'confirmed', officialRef: 'ABC-99' }).expect(200)
    expect(ok.body.appointment.status).toBe('confirmed')
    // reverting must drop the reference or be rejected
    await a.patch(`/api/appointments/${id}`).send({ status: 'pending' }).expect(400)
    await a.patch(`/api/appointments/${id}`).send({ status: 'pending', officialRef: null }).expect(200)
  })

  it('rejects malformed date-times', async () => {
    const a = await signedIn()
    await a.post('/api/appointments').send({ ...appt, startsAt: 'tomorrow' }).expect(400)
  })

  it('isolates users and supports document attachments', async () => {
    const a = await signedIn()
    const id = (await a.post('/api/appointments').send(appt)).body.appointment.id as string
    const pdf = tinyPdf
    await a.post(`/api/appointments/${id}/documents?filename=letter.pdf`).set('Content-Type', 'application/pdf').send(pdf).expect(201)
    expect((await a.get('/api/appointments')).body.appointments[0].documents).toHaveLength(1)

    const b = await signedIn('other@example.com')
    expect((await b.get('/api/appointments')).body.appointments).toHaveLength(0)
    await b.patch(`/api/appointments/${id}`).send({ status: 'pending' }).expect(404)
    await b.delete(`/api/appointments/${id}`).expect(404)
  })

  it('accepts insurance as a booking kind but keeps sample rules', async () => {
    const a = await signedIn()
    const policy = { kind: 'insurance', status: 'sample', source: 'demo', title: 'Sample quote', startDate: '2026-12-01', endDate: '2026-12-10' }
    await a.post('/api/bookings').send(policy).expect(201)
    await a.post('/api/bookings').send({ ...policy, status: 'confirmed', confirmationRef: 'POL-1' }).expect(400)
  })
})
