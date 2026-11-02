import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { destinations, findDestination } from '@/features/visa/destinations'
import { checklistByType, type NewAppointment } from './appointments-api'

const schema = z
  .object({
    destinationId: z.string(),
    center: z.string().trim().min(2, 'Enter the visa centre or consulate').max(150),
    type: z.enum(['visa', 'biometrics', 'interview', 'other']),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a date and time'),
    preferredTimes: z.string().trim().max(120),
    status: z.enum(['requested', 'pending', 'confirmed']),
    officialRef: z.string().trim().max(60),
    reminderDays: z.coerce.number().int().min(0).max(30),
    notes: z.string().trim().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'confirmed' && !v.officialRef) {
      ctx.addIssue({ code: 'custom', path: ['officialRef'], message: 'Enter the reference from the official confirmation' })
    }
  })
type Values = z.input<typeof schema>

export function AppointmentForm({ onCreate }: { onCreate(a: NewAppointment): Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { destinationId: '', center: '', type: 'biometrics', startsAt: '', preferredTimes: '', status: 'requested', officialRef: '', reminderDays: 1, notes: '' },
  })
  const status = watch('status')
  const dest = findDestination(watch('destinationId'))

  const submit = handleSubmit(async (raw) => {
    const v = schema.parse(raw)
    setError(null)
    try {
      await onCreate({
        destinationId: v.destinationId, center: v.center, type: v.type, startsAt: v.startsAt, preferredTimes: v.preferredTimes,
        status: v.status, officialRef: v.status === 'confirmed' ? v.officialRef : null, reminderDays: v.reminderDays,
        notes: v.notes, checklist: Object.fromEntries(checklistByType[v.type].map((c) => [c.id, false])),
      })
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  })

  return (
    <form onSubmit={submit} noValidate aria-label="Add an appointment" className="grid gap-4 sm:grid-cols-2">
      <Field label="Destination" htmlFor="a-dest">
        <Select id="a-dest" {...register('destinationId')}>
          <option value="">Not specified</option>
          {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Visa centre / consulate" htmlFor="a-center" error={errors.center?.message}>
        <Input id="a-center" aria-invalid={!!errors.center} {...register('center')} />
      </Field>
      <Field label="Type" htmlFor="a-type">
        <Select id="a-type" {...register('type')}>
          <option value="visa">Visa application</option><option value="biometrics">Biometrics</option>
          <option value="interview">Interview</option><option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Date and time" htmlFor="a-when" error={errors.startsAt?.message}>
        <Input id="a-when" type="datetime-local" aria-invalid={!!errors.startsAt} {...register('startsAt')} />
      </Field>
      <Field label="Preferred times (optional)" htmlFor="a-pref" error={errors.preferredTimes?.message}>
        <Input id="a-pref" placeholder="e.g. weekday mornings" {...register('preferredTimes')} />
      </Field>
      <Field label="Reminder" htmlFor="a-rem">
        <Select id="a-rem" {...register('reminderDays')}>
          <option value={0}>None</option><option value={1}>1 day before</option><option value={3}>3 days before</option><option value={7}>1 week before</option>
        </Select>
      </Field>
      <Field label="Status" htmlFor="a-status">
        <Select id="a-status" {...register('status')}>
          <option value="requested">Requested — planning / not yet booked</option>
          <option value="pending">Pending — submitted, awaiting confirmation</option>
          <option value="confirmed">Confirmed — I have the official confirmation</option>
        </Select>
      </Field>
      {status === 'confirmed' && (
        <Field label="Confirmation reference" htmlFor="a-ref" error={errors.officialRef?.message}>
          <Input id="a-ref" autoComplete="off" aria-invalid={!!errors.officialRef} {...register('officialRef')} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label="Notes (optional)" htmlFor="a-notes" error={errors.notes?.message}>
          <Input id="a-notes" {...register('notes')} />
        </Field>
      </div>
      {dest && dest.officialLinks[0] && (
        <p className="text-sm sm:col-span-2">
          Book on the official site:{' '}
          <a className="inline-flex items-center gap-1 font-medium text-accent-700 underline" href={dest.officialLinks[0].url} target="_blank" rel="noopener noreferrer">
            {dest.officialLinks[0].label}<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </a>
          <span className="block text-xs text-ink-soft">TripPilot cannot book this for you. Record the appointment here after you book it.</span>
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save appointment'}</Button>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    </form>
  )
}
