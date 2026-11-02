import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ExpenseDto } from './summary'

export type NewExpense = Omit<ExpenseDto, 'id'>

export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'flights', label: 'Flights' }, { value: 'accommodation', label: 'Accommodation' }, { value: 'insurance', label: 'Insurance' },
  { value: 'visa', label: 'Visa and fees' }, { value: 'transport', label: 'Local transport' }, { value: 'food', label: 'Food' },
  { value: 'activities', label: 'Activities and tickets' }, { value: 'connectivity', label: 'SIM / data' }, { value: 'other', label: 'Other' },
]
export const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'INR', 'SAR', 'JPY', 'CAD', 'AUD', 'CHF', 'TRY', 'CNY'] as const

export const expensesApi = {
  list: () => api<{ expenses: ExpenseDto[] }>('/expenses').then((r) => r.expenses),
  create: (e: NewExpense) => api<{ expense: ExpenseDto }>('/expenses', { method: 'POST', body: e }).then((r) => r.expense),
  update: (id: string, patch: Partial<NewExpense>) => api<{ expense: ExpenseDto }>(`/expenses/${id}`, { method: 'PATCH', body: patch }).then((r) => r.expense),
  remove: (id: string) => api<void>(`/expenses/${id}`, { method: 'DELETE' }),
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<ExpenseDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setExpenses(await expensesApi.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your expenses')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { expenses, error, reload: load }
}
