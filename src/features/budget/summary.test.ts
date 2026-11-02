import { budgetStatus, formatMoney, summarise, type ExpenseDto } from './summary'

const e = (over: Partial<ExpenseDto>): ExpenseDto => ({
  id: crypto.randomUUID(), tripId: null, category: 'food', description: '', amount: 10, currency: 'USD', spentOn: '2026-12-01', status: 'paid', ...over,
})

describe('summarise', () => {
  it('returns nothing for no expenses', () => {
    expect(summarise([])).toEqual([])
  })

  it('totals paid and estimated separately, per category, largest first', () => {
    const [usd] = summarise([
      e({ category: 'flights', amount: 400 }),
      e({ category: 'food', amount: 25.5 }),
      e({ category: 'food', amount: 14.5, status: 'estimated' }),
    ])
    expect(usd).toMatchObject({ currency: 'USD', total: 440, paid: 425.5, estimated: 14.5 })
    expect(usd!.byCategory).toEqual([{ category: 'flights', amount: 400 }, { category: 'food', amount: 40 }])
  })

  it('never mixes currencies or converts between them', () => {
    const out = summarise([e({ amount: 100 }), e({ currency: 'EUR', amount: 300 }), e({ currency: 'EUR', amount: 50 })])
    expect(out.map((s) => [s.currency, s.total])).toEqual([['EUR', 350], ['USD', 100]])
  })

  it('avoids floating-point drift', () => {
    expect(summarise([e({ amount: 0.1 }), e({ amount: 0.2 })])[0]!.total).toBe(0.3)
    expect(summarise(Array.from({ length: 10 }, () => e({ amount: 0.1 })))[0]!.total).toBe(1)
  })
})

describe('budgetStatus', () => {
  const sums = summarise([e({ amount: 600 }), e({ amount: 100, status: 'estimated' }), e({ currency: 'EUR', amount: 999 })])

  it('compares only USD spending against the USD budget and reports other currencies', () => {
    const s = budgetStatus(1000, sums)
    expect(s).toMatchObject({ budget: 1000, spent: 700, paid: 600, remaining: 300, percent: 70, over: false, otherCurrencies: ['EUR'] })
  })

  it('flags an overspend', () => {
    const s = budgetStatus(500, sums)
    expect(s.over).toBe(true)
    expect(s.remaining).toBe(-200)
    expect(s.percent).toBe(140)
  })

  it('handles a trip with no budget or no USD spending', () => {
    expect(budgetStatus(null, sums)).toMatchObject({ budget: null, remaining: null, percent: null, over: false, spent: 700 })
    expect(budgetStatus(0, sums).budget).toBeNull()
    expect(budgetStatus(800, [])).toMatchObject({ spent: 0, remaining: 800, percent: 0 })
  })
})

describe('formatMoney', () => {
  it('formats with the right symbol and falls back for unknown codes', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatMoney(5, 'XXZ')).toMatch(/5\.00/)
  })
})
