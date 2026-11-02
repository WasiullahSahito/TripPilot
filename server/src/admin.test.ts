// @vitest-environment node
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'

const password = 'correct-horse-battery'
afterEach(() => {
  env.adminEmail = undefined
})

async function setup() {
  env.adminEmail = 'boss@example.com'
  const store = new JsonStore()
  const app = createApp(store)
  const admin = request.agent(app)
  await admin.post('/api/auth/register').send({ name: 'Boss', email: 'boss@example.com', password }).expect(201)
  await admin.post('/api/auth/verify-email').send({ token: (await store.findUserByEmail('boss@example.com'))!.verifyToken }).expect(200)
  const user = request.agent(app)
  const reg = await user.post('/api/auth/register').send({ name: 'Asha Rao', email: 'asha@example.com', password }).expect(201)
  return { app, store, admin, user, userId: reg.body.user.id as string }
}

describe('admin user list', () => {
  it('is admin-only', async () => {
    const { user, app } = await setup()
    await user.get('/api/admin/users').expect(403)
    await request(app).get('/api/admin/users').expect(401)
    await user.get('/api/admin/audit').expect(403)
    await user.post('/api/admin/users/00000000-0000-4000-8000-000000000000/disable').expect(403)
  })

  it('lists accounts with only the fields an admin needs, searchable and paged', async () => {
    const { admin } = await setup()
    const all = (await admin.get('/api/admin/users').expect(200)).body
    expect(all.total).toBe(2)
    expect(all.users[0]).toEqual({ id: expect.any(String), name: expect.any(String), email: expect.any(String), role: expect.any(String), emailVerified: expect.any(Boolean), disabled: false, createdAt: expect.any(String) })
    expect(JSON.stringify(all)).not.toMatch(/passwordHash|verifyToken|dataEnc/)

    expect((await admin.get('/api/admin/users?query=asha')).body.users.map((u: { email: string }) => u.email)).toEqual(['asha@example.com'])
    expect((await admin.get('/api/admin/users?query=RAO')).body.total).toBe(1)
    expect((await admin.get('/api/admin/users?limit=1&offset=1')).body.users).toHaveLength(1)
    await admin.get('/api/admin/users?limit=1000').expect(400)
  })
})

describe('disabling users', () => {
  it('blocks login with a clear message, but only after the password is proven', async () => {
    const { admin, user, app, userId } = await setup()
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)
    await user.get('/api/auth/me').expect(401) // the existing session dies immediately

    const fresh = request(app)
    const blocked = await fresh.post('/api/auth/login').send({ email: 'asha@example.com', password }).expect(403)
    expect(blocked.body.error).toMatch(/disabled/)
    // wrong password: still the generic message, so a disabled account's existence is not revealed
    const wrong = await fresh.post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password-1' }).expect(401)
    expect(wrong.body.error).toBe('Incorrect email or password')
  })

  it('can be undone', async () => {
    const { admin, app, userId } = await setup()
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)
    await admin.post(`/api/admin/users/${userId}/enable`).expect(200)
    await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password }).expect(200)
  })

  it('refuses to disable yourself, another admin, or an unknown/invalid id', async () => {
    const { admin, store } = await setup()
    const me = (await store.findUserByEmail('boss@example.com'))!
    await admin.post(`/api/admin/users/${me.id}/disable`).expect(400)
    const other = (await store.findUserByEmail('asha@example.com'))!
    await store.saveUser({ ...other, role: 'admin' })
    await admin.post(`/api/admin/users/${other.id}/disable`).expect(403)
    await admin.post('/api/admin/users/00000000-0000-4000-8000-000000000000/disable').expect(404)
    await admin.post('/api/admin/users/not-a-uuid/disable').expect(404)
  })

  it('is idempotent and logs a change only once', async () => {
    const { admin, userId } = await setup()
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)
    const log = (await admin.get('/api/admin/audit?action=admin.user_disabled')).body.entries
    expect(log).toHaveLength(1)
  })
})

describe('a deleted account loses access immediately', () => {
  it('ends the session of a deleted user at once instead of at token expiry', async () => {
    const { user, store } = await setup()
    await user.delete('/api/account').expect(204)
    expect(await store.findUserByEmail('asha@example.com')).toBeUndefined()
    await user.get('/api/trips').expect(401)
  })
})

describe('audit log', () => {
  it('records sign-ins, failures, password changes, admin actions and deletions, newest first', async () => {
    const { admin, user, app, userId } = await setup()
    await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password-1' }).expect(401)
    await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password }).expect(200)
    await user.post('/api/account/password').send({ currentPassword: password, newPassword: 'another-strong-pass-9' }).expect(204)
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)

    const actions = (await admin.get('/api/admin/audit?limit=100')).body.entries.map((e: { action: string }) => e.action)
    for (const a of ['auth.register', 'auth.login', 'auth.login_failed', 'auth.password_changed', 'admin.user_disabled']) expect(actions).toContain(a)
    expect(actions[0]).toBe('admin.user_disabled')
  })

  it('resolves who did what when read, and marks deleted accounts', async () => {
    const { admin, user } = await setup()
    await user.delete('/api/account').expect(204)
    const entries = (await admin.get('/api/admin/audit?limit=100')).body.entries as { action: string; actor: string | null; target: string | null }[]
    const del = entries.find((e) => e.action === 'account.deleted')!
    expect(del.actor).toBe('(deleted account)')
    expect(entries.find((e) => e.action === 'auth.register' && e.actor === 'boss@example.com')).toBeTruthy()
  })

  it('never stores personal data: no emails, names, passwords in the stored entries', async () => {
    const { admin, store, userId } = await setup()
    await request(createApp(store)).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password-1' }).expect(401)
    await request(createApp(store)).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password-1' }).expect(401)
    await admin.post(`/api/admin/users/${userId}/disable`).expect(200)
    const raw = JSON.stringify(await store.listAudit({ limit: 100, offset: 0 }))
    expect(raw).not.toMatch(/@example\.com|Asha|Rao|Boss|wrong-password|correct-horse/)
    // a failed login for an address that has no account writes nothing at all
    expect((await store.listAudit({ limit: 100, offset: 0 })).filter((e) => e.action === 'auth.login_failed')).toHaveLength(1)
  })

  it('validates paging and filters', async () => {
    const { admin } = await setup()
    await admin.get('/api/admin/audit?limit=0').expect(400)
    await admin.get('/api/admin/audit?action=DROP%20TABLE').expect(400)
    expect((await admin.get('/api/admin/audit?action=auth.nothing')).body.entries).toEqual([])
  })

  it('records that an admin viewed the user list, without the search text', async () => {
    const { admin, store } = await setup()
    await admin.get('/api/admin/users?query=secret-name').expect(200)
    const entry = (await store.listAudit({ limit: 10, offset: 0, action: 'admin.list_users' }))[0]!
    expect(entry.meta).toEqual({ count: 0, searched: true })
  })
})
