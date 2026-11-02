import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { BookingRow } from './booking-row'
import { clearHandoff, loadHandoff, type Handoff } from './handoff'
import { bookingsApi, type BookingDto, type BookingStatus } from './bookings-api'

const schema = z
  .object({
    kind: z.enum(['flight', 'hotel', 'insurance']),
    status: z.enum(['requested', 'confirmed']),
    title: z.string().trim().min(1, 'Enter a title').max(150),
    startDate: z.string().min(1, 'Choose a start date'),
    endDate: z.string(),
    confirmationRef: z.string().trim().max(40),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'confirmed' && !v.confirmationRef) {
      ctx.addIssue({ code: 'custom', path: ['confirmationRef'], message: 'Enter the reference from your provider’s confirmation' })
    }
    if (v.status !== 'confirmed' && v.confirmationRef) {
      ctx.addIssue({ code: 'custom', path: ['confirmationRef'], message: 'Only confirmed bookings have a reference' })
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End must be on or after start' })
    }
  })
type FormValues = z.infer<typeof schema>

function ManualForm({ onAdded, prefill }: { onAdded(): void; prefill: Handoff | null }) {
  const [error, setError] = useState<string | null>(null)
  const {
    register, handleSubmit, reset, watch, formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'flight', status: 'requested', title: '', startDate: '', endDate: '', confirmationRef: '' },
  })
  const status = watch('status')

  useEffect(() => {
    // Prefill from a partner handoff. Status stays "requested": only a reference typed by the user can make it confirmed.
    if (prefill) reset({ kind: prefill.kind, status: 'requested', title: prefill.title, startDate: prefill.startDate, endDate: prefill.endDate ?? '', confirmationRef: '' })
  }, [prefill, reset])

  const submit = handleSubmit(async (v) => {
    setError(null)
    try {
      await bookingsApi.create({
        kind: v.kind, status: v.status, source: 'user-entered', title: v.title, startDate: v.startDate,
        endDate: v.endDate || null, confirmationRef: v.confirmationRef || null, details: {},
      })
      reset()
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  })

  return (
    <form onSubmit={submit} noValidate aria-label="Record a reservation" className="grid gap-4 sm:grid-cols-2">
      <Field label="Type" htmlFor="b-kind"><Select id="b-kind" {...register('kind')}><option value="flight">Flight</option><option value="hotel">Hotel</option><option value="insurance">Insurance policy</option></Select></Field>
      <Field label="Status" htmlFor="b-status">
        <Select id="b-status" {...register('status')}>
          <option value="requested">Requested — awaiting provider</option>
          <option value="confirmed">Confirmed — I have a confirmation reference</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Title" htmlFor="b-title" error={errors.title?.message}>
          <Input id="b-title" placeholder="e.g. Hotel Lumière, Paris" aria-invalid={!!errors.title} {...register('title')} />
        </Field>
      </div>
      <Field label="Start date" htmlFor="b-start" error={errors.startDate?.message}><Input id="b-start" type="date" aria-invalid={!!errors.startDate} {...register('startDate')} /></Field>
      <Field label="End date (optional)" htmlFor="b-end" error={errors.endDate?.message}><Input id="b-end" type="date" {...register('endDate')} /></Field>
      {status === 'confirmed' && (
        <div className="sm:col-span-2">
          <Field label="Confirmation reference (as shown by your provider)" htmlFor="b-ref" error={errors.confirmationRef?.message}>
            <Input id="b-ref" autoComplete="off" aria-invalid={!!errors.confirmationRef} {...register('confirmationRef')} />
          </Field>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Add to history'}</Button>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    </form>
  )
}

const SECTIONS: { status: Exclude<BookingStatus, 'sample'>; title: string; empty: string }[] = [
  { status: 'confirmed', title: 'Confirmed (reference entered by you)', empty: 'No confirmed reservations recorded.' },
  { status: 'requested', title: 'Requested — not yet confirmed', empty: 'Nothing awaiting confirmation.' },
]

export default function BookingsPage() {
  const [handoff, setHandoff] = useState<Handoff | null>(() => loadHandoff())
  const [prefill, setPrefill] = useState<Handoff | null>(null)
  const [bookings, setBookings] = useState<BookingDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setBookings(await bookingsApi.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bookings')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Booking history</h1>
        <p className="mt-1 text-sm text-ink-soft">Keep the flight, stay and insurance details you recorded with their provider.</p>
      </header>

      {handoff && (
        <section aria-label="Recently opened partner" className="rounded-xl border border-accent-600 bg-accent-50 p-4 text-sm">
          <p className="font-medium">You opened {handoff.partner} to book “{handoff.title}”.</p>
          <p className="mt-1 text-xs text-ink-soft">
            If you completed a booking there, record it below. Nothing is saved until you submit, and it only becomes “confirmed” when you enter the reference the partner gave you.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="accent" onClick={() => { setPrefill(handoff); document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth' }) }}>Record this booking</Button>
            <Button size="sm" variant="ghost" onClick={() => { clearHandoff(); setHandoff(null); setPrefill(null) }}>I didn’t book</Button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {bookings === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}

      {bookings && SECTIONS.map((s) => {
        const rows = bookings.filter((b) => b.status === s.status)
        return (
          <section key={s.status} aria-labelledby={`sec-${s.status}`}>
            <h2 id={`sec-${s.status}`} className="mb-3 font-semibold">{s.title}</h2>
            {rows.length === 0 ? <p className="text-sm text-ink-soft">{s.empty}</p> : (
              <ul className="space-y-3">{rows.map((b) => <BookingRow key={b.id} b={b} onChanged={() => void load()} />)}</ul>
            )}
          </section>
        )
      })}

      <Card className="p-6" id="record-form">
        <h2 className="font-semibold">Record a reservation you made elsewhere</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          TripPilot cannot issue tickets or confirmations. Add what you booked with your airline or hotel; “Confirmed” needs the reference they gave you.
        </p>
        <ManualForm onAdded={() => { clearHandoff(); setPrefill(null); setHandoff(null); void load() }} prefill={prefill} />
      </Card>
    </div>
  )
}
