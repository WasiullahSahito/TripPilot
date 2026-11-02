import { daysUntil, toNewTrip, tripFormSchema } from './trip-schema'

const base = { destination: 'Japan', departOn: '2026-12-01', returnOn: '2026-12-10', purpose: 'Tourism', budget: '' }

describe('tripFormSchema', () => {
  it('accepts an empty budget and maps it to null', () => {
    const r = tripFormSchema.parse(base)
    expect(toNewTrip(r).budget).toBeNull()
  })
  it('converts a numeric budget', () => {
    expect(toNewTrip(tripFormSchema.parse({ ...base, budget: '1500' })).budget).toBe(1500)
  })
  it('rejects negative or non-numeric budgets', () => {
    expect(tripFormSchema.safeParse({ ...base, budget: '-5' }).success).toBe(false)
    expect(tripFormSchema.safeParse({ ...base, budget: 'abc' }).success).toBe(false)
  })
  it('rejects return before departure', () => {
    expect(tripFormSchema.safeParse({ ...base, returnOn: '2026-11-30' }).success).toBe(false)
  })
})

describe('daysUntil', () => {
  const now = new Date(2026, 11, 1, 15, 0)
  it('is 0 for today, positive for future, negative for past', () => {
    expect(daysUntil('2026-12-01', now)).toBe(0)
    expect(daysUntil('2026-12-11', now)).toBe(10)
    expect(daysUntil('2026-11-30', now)).toBe(-1)
  })
})
