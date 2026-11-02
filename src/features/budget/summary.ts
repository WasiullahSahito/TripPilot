/**
 * Budget maths. Amounts are summed only within the same currency: no exchange rates are ever applied or guessed, so
 * a trip with USD and EUR costs shows two honest totals instead of one invented figure.
 */
export interface ExpenseDto {
  id: string
  tripId: string | null
  category: string
  description: string
  amount: number
  currency: string
  spentOn: string
  status: 'estimated' | 'paid'
}

export interface CurrencySummary {
  currency: string
  total: number
  paid: number
  estimated: number
  byCategory: { category: string; amount: number }[]
}

// Work in whole minor units to avoid floating-point drift (0.1 + 0.2).
const cents = (n: number) => Math.round(n * 100)
const fromCents = (c: number) => c / 100

export function summarise(expenses: ExpenseDto[]): CurrencySummary[] {
  const by = new Map<string, { paid: number; estimated: number; cats: Map<string, number> }>()
  for (const e of expenses) {
    const s = by.get(e.currency) ?? { paid: 0, estimated: 0, cats: new Map<string, number>() }
    const c = cents(e.amount)
    if (e.status === 'paid') s.paid += c
    else s.estimated += c
    s.cats.set(e.category, (s.cats.get(e.category) ?? 0) + c)
    by.set(e.currency, s)
  }
  return [...by.entries()]
    .map(([currency, s]) => ({
      currency,
      total: fromCents(s.paid + s.estimated),
      paid: fromCents(s.paid),
      estimated: fromCents(s.estimated),
      byCategory: [...s.cats.entries()].map(([category, c]) => ({ category, amount: fromCents(c) })).sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency))
}

export interface BudgetStatus {
  budget: number | null
  /** Everything recorded in the budget's currency (paid + planned). */
  spent: number
  paid: number
  remaining: number | null
  percent: number | null
  over: boolean
  /** Currencies recorded but not comparable with the budget. */
  otherCurrencies: string[]
}

/** The trip budget is entered in USD, so only USD expenses count against it. */
export const BUDGET_CURRENCY = 'USD'

export function budgetStatus(budget: number | null, summaries: CurrencySummary[]): BudgetStatus {
  const usd = summaries.find((s) => s.currency === BUDGET_CURRENCY)
  const spent = usd?.total ?? 0
  const hasBudget = budget !== null && budget > 0
  return {
    budget: hasBudget ? budget : null,
    spent,
    paid: usd?.paid ?? 0,
    remaining: hasBudget ? fromCents(cents(budget) - cents(spent)) : null,
    percent: hasBudget ? Math.round((spent / budget) * 100) : null,
    over: hasBudget ? cents(spent) > cents(budget) : false,
    otherCurrencies: summaries.filter((s) => s.currency !== BUDGET_CURRENCY).map((s) => s.currency),
  }
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
