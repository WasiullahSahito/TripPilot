import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { useTrips } from '@/features/dashboard/use-trips'
import { ApiError } from '@/lib/api'
import { CATEGORIES, categoryLabel, CURRENCIES, expensesApi, useExpenses } from './budget-api'
import { budgetStatus, formatMoney, summarise } from './summary'

const today = () => new Date().toISOString().slice(0, 10)

const schema = z.object({
  tripId: z.string(),
  category: z.string().min(1),
  description: z.string().trim().max(120, 'Keep it under 120 characters'),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Use a positive number with up to 2 decimals')
    .refine((v) => Number(v) > 0, 'Amount must be greater than zero')
    .refine((v) => Number(v) <= 10_000_000, 'That amount is too large'),
  currency: z.string().regex(/^[A-Z]{3}$/),
  spentOn: z.string().min(1, 'Choose a date'),
  status: z.enum(['estimated', 'paid']),
})
type Values = z.infer<typeof schema>

export default function BudgetPage() {
  const { trips } = useTrips()
  const { expenses, error, reload } = useExpenses()
  const [tripFilter, setTripFilter] = useState('all')
  const [currencyView, setCurrencyView] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { tripId: '', category: 'accommodation', description: '', amount: '', currency: 'USD', spentOn: today(), status: 'estimated' },
  })

  const visible = useMemo(
    () => (expenses ?? []).filter((e) => (tripFilter === 'all' ? true : tripFilter === 'none' ? e.tripId === null : e.tripId === tripFilter)),
    [expenses, tripFilter],
  )
  const summaries = useMemo(() => summarise(visible), [visible])
  const view = summaries.find((s) => s.currency === currencyView) ?? summaries[0]
  const trip = trips.find((t) => t.id === tripFilter)
  const status = trip ? budgetStatus(trip.budget, summaries) : null
  const tripName = (id: string | null) => trips.find((t) => t.id === id)?.destination

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    try {
      await expensesApi.create({
        tripId: v.tripId || null, category: v.category, description: v.description, amount: Number(v.amount),
        currency: v.currency, spentOn: v.spentOn, status: v.status,
      })
      reset({ ...v, description: '', amount: '' })
      await reload()
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.fields ? Object.values(e.fields).join('. ') : e.message) : 'Could not save the expense')
    }
  })

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await reload()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Trip budget</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Record what you plan to spend and what you have paid. Totals are kept per currency: nothing is converted, so there are no made-up exchange rates.
        </p>
      </header>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {expenses === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}

      <div className="max-w-xs">
        <Field label="Show" htmlFor="b-filter">
          <Select id="b-filter" value={tripFilter} onChange={(e) => { setTripFilter(e.target.value); setCurrencyView(null) }}>
            <option value="all">All expenses</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.destination} ({t.departOn})</option>)}
            <option value="none">Not linked to a trip</option>
          </Select>
        </Field>
      </div>

      {status && trip && (
        <Card className="p-5" aria-label="Trip budget status">
          {status.budget === null ? (
            <p className="text-sm text-ink-soft">No budget set for {trip.destination}. Add one when you create or edit the trip on the dashboard.</p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Budget for {trip.destination} (USD)</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(status.spent, 'USD')} <span className="text-base font-normal text-ink-soft">of {formatMoney(status.budget, 'USD')}</span></p>
              <div className="mt-3 h-2.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, status.percent ?? 0)} aria-label="Share of budget used">
                <div className={`h-full rounded-full ${status.over ? 'bg-red-600' : 'bg-accent-600'}`} style={{ width: `${Math.min(100, status.percent ?? 0)}%` }} />
              </div>
              <p className={`mt-2 text-sm ${status.over ? 'font-medium text-red-700' : 'text-ink-soft'}`}>
                {status.over ? `Over budget by ${formatMoney(Math.abs(status.remaining ?? 0), 'USD')}` : `${formatMoney(status.remaining ?? 0, 'USD')} left`} · {formatMoney(status.paid, 'USD')} already paid
              </p>
              {status.otherCurrencies.length > 0 && (
                <p className="mt-2 text-xs text-ink-soft">Costs in {status.otherCurrencies.join(', ')} are not included above because the budget is in USD and nothing is converted.</p>
              )}
            </>
          )}
        </Card>
      )}

      {expenses !== null && summaries.length === 0 && (
        <Card className="p-8 text-center text-sm text-ink-soft">No expenses recorded here yet. Add the first one below.</Card>
      )}

      {view && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Summary</h2>
            {summaries.length > 1 && (
              <div className="flex gap-1" role="group" aria-label="Currency">
                {summaries.map((s) => (
                  <Button key={s.currency} size="sm" variant={s.currency === view.currency ? 'primary' : 'outline'} aria-pressed={s.currency === view.currency} onClick={() => setCurrencyView(s.currency)}>{s.currency}</Button>
                ))}
              </div>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted px-4 py-3"><dt className="text-xs text-ink-soft">Total</dt><dd className="text-lg font-semibold">{formatMoney(view.total, view.currency)}</dd></div>
            <div className="rounded-xl bg-muted px-4 py-3"><dt className="text-xs text-ink-soft">Paid</dt><dd className="text-lg font-semibold">{formatMoney(view.paid, view.currency)}</dd></div>
            <div className="rounded-xl bg-muted px-4 py-3"><dt className="text-xs text-ink-soft">Still estimated</dt><dd className="text-lg font-semibold">{formatMoney(view.estimated, view.currency)}</dd></div>
          </dl>
          <ul className="space-y-2" aria-label={`Spending by category in ${view.currency}`}>
            {view.byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-sm"><span>{categoryLabel(c.category)}</span><span className="font-medium">{formatMoney(c.amount, view.currency)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-accent-600" style={{ width: `${view.total ? (c.amount / view.total) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-semibold">Add an expense</h2>
        <form onSubmit={onSubmit} noValidate aria-label="Add an expense" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" htmlFor="x-cat"><Select id="x-cat" {...register('category')}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Description (optional)" htmlFor="x-desc" error={errors.description?.message}><Input id="x-desc" {...register('description')} /></Field>
          <Field label="Date" htmlFor="x-date" error={errors.spentOn?.message}><Input id="x-date" type="date" {...register('spentOn')} /></Field>
          <Field label="Amount" htmlFor="x-amount" error={errors.amount?.message}><Input id="x-amount" inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Currency" htmlFor="x-cur"><Select id="x-cur" {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Status" htmlFor="x-status">
            <Select id="x-status" {...register('status')}><option value="estimated">Estimated (not paid yet)</option><option value="paid">Paid</option></Select>
          </Field>
          <Field label="Trip" htmlFor="x-trip">
            <Select id="x-trip" {...register('tripId')}><option value="">Not linked to a trip</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.destination} ({t.departOn})</option>)}</Select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="accent" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Add expense'}</Button></div>
        </form>
        {formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}
      </Card>

      {visible.length > 0 && (
        <section aria-labelledby="exp-list">
          <h2 id="exp-list" className="mb-3 font-semibold">Expenses ({visible.length})</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {visible.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{x.description || categoryLabel(x.category)}</p>
                  <p className="text-xs text-ink-soft">{x.spentOn} · {categoryLabel(x.category)}{tripName(x.tripId) ? ` · ${tripName(x.tripId)}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatMoney(x.amount, x.currency)}</span>
                  <Badge tone={x.status === 'paid' ? 'accent' : 'neutral'}>{x.status === 'paid' ? 'Paid' : 'Estimated'}</Badge>
                  <Button size="sm" variant="outline" onClick={() => void act(() => expensesApi.update(x.id, { status: x.status === 'paid' ? 'estimated' : 'paid' }))}>
                    Mark {x.status === 'paid' ? 'estimated' : 'paid'}<span className="sr-only"> for {x.description || categoryLabel(x.category)}</span>
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete expense ${x.description || categoryLabel(x.category)}`} onClick={() => void act(() => expensesApi.remove(x.id))}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
