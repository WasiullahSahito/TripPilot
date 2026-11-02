import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ApiError } from '@/lib/api'
import type { NewTrip } from '@/types/api'
import { toNewTrip, tripFormSchema, type TripFormValues } from './trip-schema'

export function TripForm({ onCreate, defaults }: { onCreate(t: NewTrip): Promise<void>; defaults?: Partial<TripFormValues> }) {
  const [error, setError] = useState<string | null>(null)
  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: { purpose: 'Tourism', budget: '', ...defaults },
  })

  const submit = handleSubmit(async (v) => {
    setError(null)
    try {
      await onCreate(toNewTrip(v))
      reset({ destination: '', departOn: '', returnOn: '', purpose: 'Tourism', budget: '' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save trip')
    }
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Add a trip">
      <Field label="Destination" htmlFor="t-destination" error={errors.destination?.message}>
        <Input id="t-destination" aria-invalid={!!errors.destination} {...register('destination')} />
      </Field>
      <Field label="Purpose" htmlFor="t-purpose" error={errors.purpose?.message}>
        <Input id="t-purpose" aria-invalid={!!errors.purpose} {...register('purpose')} />
      </Field>
      <Field label="Departure" htmlFor="t-depart" error={errors.departOn?.message}>
        <Input id="t-depart" type="date" aria-invalid={!!errors.departOn} {...register('departOn')} />
      </Field>
      <Field label="Return" htmlFor="t-return" error={errors.returnOn?.message}>
        <Input id="t-return" type="date" aria-invalid={!!errors.returnOn} {...register('returnOn')} />
      </Field>
      <Field label="Budget (optional, USD)" htmlFor="t-budget" error={errors.budget?.message}>
        <Input id="t-budget" inputMode="decimal" aria-invalid={!!errors.budget} {...register('budget')} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="accent" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Add trip'}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    </form>
  )
}
