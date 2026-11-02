// @vitest-environment node
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { JsonStore } from './models/store.ts'

const creds = { name: 'Test User', email: 'budget@example.com', password: 'correct-horse-battery' }
const expense = { category: 'accommodation', description: 'Hotel deposit', amount: 120.5, currency: 'USD', spentOn: '2026-12-01', status: 'paid' }

async function signedIn(app: ReturnType<typeof createApp>, email = creds.email) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  return a
}

describe('expenses', () => {
  it('requires authentication', async () => {
    await request(createApp(new JsonStore())).get('/api/expenses').expect(401)
  })

  it('creates, lists (newest first), updates and deletes expenses', async () => {
    const a = await signedIn(createApp(new JsonStore()))
    const first = (await a.post('/api/expenses').send(expense).expect(201)).body.expense
    await a.post('/api/expenses').send({ ...expense, spentOn: '2026-12-05', description: 'Taxi', category: 'transport', amount: 20 }).expect(201)
    const list = (await a.get('/api/expenses').expect(200)).body.expenses
    expect(list.map((e: { description: string }) => e.description)).toEqual(['Taxi', 'Hotel deposit'])

    const patched = (await a.patch(`/api/expenses/${first.id}`).send({ status: 'estimated' }).expect(200)).body.expense
    expect(patched.status).toBe('estimated')
    // fields that were not sent must be left alone (no silent reset to defaults)
    expect(patched.description).toBe('Hotel deposit')
    expect(patched.amount).toBe(120.5)

    await a.delete(`/api/expenses/${first.id}`).expect(204)
    expect((await a.get('/api/expenses')).body.expenses).toHaveLength(1)
  })

  it('validates amounts, currencies, categories and dates', async () => {
    const a = await signedIn(createApp(new JsonStore()))
    for (const bad of [
      { amount: 0 }, { amount: -5 }, { amount: 10.123 }, { amount: 99_999_999 }, { amount: '12' },
      { currency: 'usd' }, { currency: 'US' }, { category: 'gambling' }, { spentOn: 'yesterday' },
    ]) {
      await a.post('/api/expenses').send({ ...expense, ...bad }).expect(400)
    }
    await a.post('/api/expenses').send({ ...expense, amount: 0.01 }).expect(201)
  })

  it('links expenses only to the caller\'s own trips, and keeps them when a trip is deleted', async () => {
    const app = createApp(new JsonStore())
    const a = await signedIn(app)
    const trip = (await a.post('/api/trips').send({ destination: 'France', departOn: '2026-12-01', returnOn: '2026-12-10', purpose: 'Tourism', budget: 2000 })).body.trip
    const linked = (await a.post('/api/expenses').send({ ...expense, tripId: trip.id }).expect(201)).body.expense
    expect((await a.get(`/api/expenses?tripId=${trip.id}`)).body.expenses).toHaveLength(1)

    const b = await signedIn(app, 'other@example.com')
    await b.post('/api/expenses').send({ ...expense, tripId: trip.id }).expect(400) // someone else's trip
    await b.post('/api/expenses').send({ ...expense, tripId: '00000000-0000-4000-8000-000000000000' }).expect(400)

    await a.delete(`/api/trips/${trip.id}`).expect(204)
    const after = (await a.get('/api/expenses')).body.expenses
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(linked.id)
    expect(after[0].tripId).toBeNull()
  })

  it('isolates users and is included in the account export and deletion', async () => {
    const app = createApp(new JsonStore())
    const a = await signedIn(app)
    const id = (await a.post('/api/expenses').send(expense)).body.expense.id as string
    const b = await signedIn(app, 'other@example.com')
    expect((await b.get('/api/expenses')).body.expenses).toHaveLength(0)
    await b.patch(`/api/expenses/${id}`).send({ status: 'paid' }).expect(404)
    await b.delete(`/api/expenses/${id}`).expect(404)

    expect((await a.get('/api/account/export')).body.expenses).toHaveLength(1)
    await a.delete('/api/account').expect(204)
  })
})
