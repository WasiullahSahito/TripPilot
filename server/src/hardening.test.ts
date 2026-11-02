// @vitest-environment node
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'
import { passwordProblem } from './validators/schemas.ts'

const creds = { name: 'Test User', email: 'person@example.com', password: 'correct-horse-battery' }

afterEach(() => {
  env.adminEmail = undefined
})

describe('admin role', () => {
  it('is NOT granted at registration to whoever claims the admin email first', async () => {
    env.adminEmail = 'boss@example.com'
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    const res = await a.post('/api/auth/register').send({ ...creds, email: 'boss@example.com' }).expect(201)
    expect(res.body.user.role).toBe('user')
    await a.get('/api/admin/stats').expect(403)
  })

  it('is granted only after the address is verified, and takes effect without a new login', async () => {
    env.adminEmail = 'boss@example.com'
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    await a.post('/api/auth/register').send({ ...creds, email: 'boss@example.com' }).expect(201)
    const token = (await store.findUserByEmail('boss@example.com'))!.verifyToken!
    await a.post('/api/auth/verify-email').send({ token }).expect(200)
    const stats = await a.get('/api/admin/stats').expect(200)
    expect(stats.body.users).toBe(1)
    expect((await a.get('/api/auth/me')).body.user.role).toBe('admin')
  })

  it('verifying a different address never grants admin', async () => {
    env.adminEmail = 'boss@example.com'
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    await a.post('/api/auth/register').send(creds).expect(201)
    await a.post('/api/auth/verify-email').send({ token: (await store.findUserByEmail(creds.email))!.verifyToken }).expect(200)
    await a.get('/api/admin/stats').expect(403)
  })

  it('revokes access immediately when the role is removed in the store', async () => {
    env.adminEmail = 'boss@example.com'
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    await a.post('/api/auth/register').send({ ...creds, email: 'boss@example.com' }).expect(201)
    const u = (await store.findUserByEmail('boss@example.com'))!
    await a.post('/api/auth/verify-email').send({ token: u.verifyToken }).expect(200)
    await a.get('/api/admin/stats').expect(200)
    await store.saveUser({ ...(await store.findUserById(u.id))!, role: 'user' })
    await a.get('/api/admin/stats').expect(403)
  })

  it('exposes only aggregate numbers', async () => {
    env.adminEmail = 'boss@example.com'
    const store = new JsonStore()
    const a = request.agent(createApp(store))
    await a.post('/api/auth/register').send({ ...creds, email: 'boss@example.com' }).expect(201)
    await a.post('/api/auth/verify-email').send({ token: (await store.findUserByEmail('boss@example.com'))!.verifyToken }).expect(200)
    const body = JSON.stringify((await a.get('/api/admin/stats')).body)
    expect(body).not.toMatch(/@|password|hash/i)
  })
})

describe('password policy', () => {
  it('rejects common, repetitive and email-derived passwords', () => {
    expect(passwordProblem('password1234', 'a@b.co')).toMatch(/common/)
    expect(passwordProblem('aaaaaaaaaaaa', 'a@b.co')).toMatch(/varied/)
    expect(passwordProblem('xxjohnsmithxx', 'johnsmith@example.com')).toMatch(/email/)
    expect(passwordProblem('correct-horse-battery', 'a@b.co')).toBeNull()
  })

  it('is enforced on registration', async () => {
    const a = request(createApp(new JsonStore()))
    const res = await a.post('/api/auth/register').send({ ...creds, password: 'password1234' }).expect(400)
    expect(res.body.fields.password).toMatch(/common/)
  })
})
