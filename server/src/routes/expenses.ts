import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import type { Store } from '../models/store.ts'
import type { Expense } from '../models/types.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'

export const EXPENSE_CATEGORIES = ['flights', 'accommodation', 'insurance', 'visa', 'transport', 'food', 'activities', 'connectivity', 'other'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

const base = z.object({
  tripId: z.string().uuid().nullable().default(null),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(120).default(''),
  // Cents precision, positive, bounded: money is stored as the user typed it. No exchange rates are ever applied.
  amount: z.number().positive('Amount must be greater than zero').max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as USD'),
  spentOn: isoDate,
  status: z.enum(['estimated', 'paid']).default('estimated'),
})

const update = base.partial()

export function expenseRoutes(store: Store) {
  const r = Router()
  r.use(requireAuth)

  // A trip link must point at one of the caller's own trips; anything else is rejected, never trusted.
  const checkTrip = async (userId: string, tripId: string | null | undefined) => {
    if (tripId && !(await store.getTrip(userId, tripId))) throw new HttpError(400, 'That trip does not exist')
  }

  r.get('/', async (req, res) => {
    const tripId = typeof req.query.tripId === 'string' && req.query.tripId ? req.query.tripId : undefined
    res.json({ expenses: await store.listExpenses(req.session!.sub, tripId) })
  })

  r.post('/', async (req, res) => {
    const userId = req.session!.sub
    const input = base.parse(req.body)
    await checkTrip(userId, input.tripId)
    const expense: Expense = { id: randomUUID(), userId, ...input, createdAt: new Date().toISOString() }
    await store.saveExpense(expense)
    res.status(201).json({ expense })
  })

  r.patch('/:id', async (req, res) => {
    const userId = req.session!.sub
    const existing = await store.getExpense(userId, String(req.params.id))
    if (!existing) throw new HttpError(404, 'Expense not found')
    const patch = update.parse(req.body)
    // zod applies defaults even inside partial(); only fields actually sent may change.
    const sent = new Set(Object.keys((req.body ?? {}) as object))
    await checkTrip(userId, patch.tripId)
    const updated: Expense = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => sent.has(k) && v !== undefined)) }
    await store.saveExpense(updated)
    res.json({ expense: updated })
  })

  r.delete('/:id', async (req, res) => {
    if (!(await store.deleteExpense(req.session!.sub, String(req.params.id)))) throw new HttpError(404, 'Expense not found')
    res.status(204).end()
  })

  return r
}
