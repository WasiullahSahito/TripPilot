import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { BookingRow } from '@/features/bookings/booking-row'
import { bookingsApi, type BookingDto } from '@/features/bookings/bookings-api'
import { PartnerRow } from '@/features/affiliate/partner-links'

const policySchema = z
  .object({
    insurer: z.string().trim().min(1, 'Enter the insurer').max(80),
    startDate: z.string().min(1, 'Choose a start date'),
    endDate: z.string().min(1, 'Choose an end date'),
    status: z.enum(['requested', 'confirmed']),
    policyNumber: z.string().trim().max(40),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'confirmed' && !v.policyNumber) ctx.addIssue({ code: 'custom', path: ['policyNumber'], message: 'Enter the policy number from your insurer' })
    if (v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End must be on or after start' })
  })
type PolicyForm = z.infer<typeof policySchema>

export default function InsurancePage() {
  const [policies, setPolicies] = useState<BookingDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPolicies((await bookingsApi.list()).filter((b) => b.kind === 'insurance' && b.status !== 'sample'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load policies')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const policyForm = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    defaultValues: { insurer: '', startDate: '', endDate: '', status: 'confirmed', policyNumber: '' },
  })
  const policyStatus = policyForm.watch('status')

  const addPolicy = policyForm.handleSubmit(async (v) => {
    setError(null)
    try {
      await bookingsApi.create({
        kind: 'insurance', status: v.status, source: 'user-entered', title: `Policy: ${v.insurer}`,
        startDate: v.startDate, endDate: v.endDate, confirmationRef: v.status === 'confirmed' ? v.policyNumber : null, details: { insurer: v.insurer },
      })
      policyForm.reset()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <p className="text-sm font-medium text-accent-700">Your trip protection</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Travel insurance</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">Check current options with an insurance partner, then keep your policy details and documents alongside your travel plans.</p>
      </header>

      <Card className="space-y-4 border-accent-200 bg-accent-50/40 p-5">
        <div>
          <h2 className="font-semibold">Check current cover options</h2>
          <p className="mt-1 text-sm text-ink-soft">Prices, eligibility and terms come from the insurer. TripPilot does not estimate premiums or determine whether a policy meets visa requirements.</p>
        </div>
        <PartnerRow title="Request an insurance quote" ids={['ekta']} params={{}} />
        <p className="text-xs text-ink-soft">Check the destination authority’s official insurance requirements before purchasing.</p>
      </Card>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <section aria-labelledby="policies" className="space-y-4">
        <div>
          <h2 id="policies" className="text-xl font-semibold">Your policies</h2>
          <p className="mt-1 text-sm text-ink-soft">Only policies you record appear here. Upload and keep the insurer’s real certificate with your application.</p>
        </div>
        {policies === null ? <p role="status" className="text-sm text-ink-soft">Loading your policies…</p>
          : policies.length === 0 ? <Card className="p-6 text-sm text-ink-soft">No insurance policies recorded yet.</Card>
          : <ul className="space-y-3">{policies.map((b) => <BookingRow key={b.id} b={b} onChanged={() => void load()} />)}</ul>}

        <Card className="p-5">
          <h3 className="font-medium">Record a policy</h3>
          <form onSubmit={addPolicy} noValidate aria-label="Record a policy" className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Insurer" htmlFor="p-insurer" error={policyForm.formState.errors.insurer?.message}>
              <Input id="p-insurer" {...policyForm.register('insurer')} />
            </Field>
            <Field label="Status" htmlFor="p-status">
              <Select id="p-status" {...policyForm.register('status')}>
                <option value="confirmed">Issued — I have a policy number</option>
                <option value="requested">Applied — awaiting documents</option>
              </Select>
            </Field>
            <Field label="Cover starts" htmlFor="p-start" error={policyForm.formState.errors.startDate?.message}>
              <Input id="p-start" type="date" {...policyForm.register('startDate')} />
            </Field>
            <Field label="Cover ends" htmlFor="p-end" error={policyForm.formState.errors.endDate?.message}>
              <Input id="p-end" type="date" {...policyForm.register('endDate')} />
            </Field>
            {policyStatus === 'confirmed' && (
              <div className="sm:col-span-2">
                <Field label="Policy number (from your insurer)" htmlFor="p-num" error={policyForm.formState.errors.policyNumber?.message}>
                  <Input id="p-num" autoComplete="off" {...policyForm.register('policyNumber')} />
                </Field>
              </div>
            )}
            <div className="sm:col-span-2"><Button type="submit" disabled={policyForm.formState.isSubmitting}>{policyForm.formState.isSubmitting ? 'Saving…' : 'Save policy'}</Button></div>
          </form>
        </Card>
      </section>
    </div>
  )
}
