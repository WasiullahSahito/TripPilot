// @vitest-environment node
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'

const creds = { name: 'Test User', email: 'test@example.com', password: 'correct-horse-battery' }
let app: ReturnType<typeof createApp>

beforeEach(() => {
  app = createApp(new JsonStore())
})

async function signedIn(body = creds) {
  const agent = request.agent(app)
  await agent.post('/api/auth/register').send(body).expect(201)
  return agent
}

describe('auth', () => {
  it('registers, sets an httpOnly cookie and never returns the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(creds).expect(201)
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|verifyToken/)
  })

  it('rejects weak passwords and duplicate emails', async () => {
    await request(app).post('/api/auth/register').send({ ...creds, password: 'short' }).expect(400)
    await signedIn()
    await request(app).post('/api/auth/register').send(creds).expect(409)
  })

  it('logs in with right credentials only', async () => {
    await signedIn()
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password-1' }).expect(401)
    await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200)
  })

  it('protects /me', async () => {
    await request(app).get('/api/auth/me').expect(401)
    const agent = await signedIn()
    const res = await agent.get('/api/auth/me').expect(200)
    expect(res.body.user.email).toBe(creds.email)
  })
})

describe('trips', () => {
  const trip = { destination: 'France', departOn: '2026-12-01', returnOn: '2026-12-10', purpose: 'Tourism', budget: 2500 }

  it('requires auth', async () => {
    await request(app).get('/api/trips').expect(401)
  })

  it('creates, updates and deletes a trip', async () => {
    const agent = await signedIn()
    const created = await agent.post('/api/trips').send(trip).expect(201)
    const id = created.body.trip.id as string
    expect(created.body.trip.status).toBe('planning')
    const patched = await agent.patch(`/api/trips/${id}`).send({ status: 'ready' }).expect(200)
    expect(patched.body.trip.status).toBe('ready')
    await agent.delete(`/api/trips/${id}`).expect(204)
    expect((await agent.get('/api/trips')).body.trips).toHaveLength(0)
  })

  it('rejects a return date before departure', async () => {
    const agent = await signedIn()
    await agent.post('/api/trips').send({ ...trip, returnOn: '2026-11-01' }).expect(400)
  })

  it("does not expose another user's trips", async () => {
    const a = await signedIn()
    const id = (await a.post('/api/trips').send(trip)).body.trip.id as string
    const b = await signedIn({ ...creds, email: 'other@example.com' })
    await b.patch(`/api/trips/${id}`).send({ status: 'ready' }).expect(404)
    expect((await b.get('/api/trips')).body.trips).toHaveLength(0)
  })
})

describe('account & roles', () => {
  it('forbids non-admins from admin stats', async () => {
    const agent = await signedIn()
    await agent.get('/api/admin/stats').expect(403)
  })

  it('exports data without secrets and deletes the account', async () => {
    const agent = await signedIn()
    const exp = await agent.get('/api/account/export').expect(200)
    expect(JSON.stringify(exp.body)).not.toMatch(/passwordHash|verifyToken/)
    await agent.delete('/api/account').expect(204)
    await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(401)
  })

  it('updates the account name without exposing private account fields', async () => {
    await request(app).patch('/api/account/name').send({ name: 'Updated User' }).expect(401)
    const agent = await signedIn()
    const res = await agent.patch('/api/account/name').send({ name: 'Updated User' }).expect(200)
    expect(res.body.user).toMatchObject({ name: 'Updated User', email: creds.email })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|verifyToken/)
    expect((await agent.get('/api/auth/me')).body.user.name).toBe('Updated User')
  })

  it('requires the current password and validates a replacement password', async () => {
    await request(app).post('/api/account/password').send({
      currentPassword: creds.password, newPassword: 'new-strong-password-123',
    }).expect(401)
    const agent = await signedIn()
    await agent.post('/api/account/password').send({
      currentPassword: 'wrong-password-1', newPassword: 'new-strong-password-123',
    }).expect(401)
    await agent.post('/api/account/password').send({
      currentPassword: creds.password, newPassword: 'short',
    }).expect(400)
    await agent.post('/api/account/password').send({
      currentPassword: creds.password, newPassword: 'new-strong-password-123',
    }).expect(204)
    await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(401)
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'new-strong-password-123' }).expect(200)
  })
})
