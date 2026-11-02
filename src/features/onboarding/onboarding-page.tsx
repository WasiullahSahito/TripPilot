import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router'
import { z } from 'zod'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'

const INTERESTS = ['Culture', 'Food', 'Nature', 'Beaches', 'Cities', 'Adventure', 'Business', 'Family']

const schema = z.object({
  nationality: z.string().trim().min(2, 'Enter your nationality').max(60),
  residenceCountry: z.string().trim().min(2, 'Enter your country of residence').max(60),
  homeAirport: z.string().trim().max(60),
  interests: z.array(z.string()).max(12),
})
type Values = z.infer<typeof schema>

const STEPS = [
  { title: 'Where are you from?', fields: ['nationality', 'residenceCountry'] as const },
  { title: 'Where do you fly from?', fields: ['homeAirport'] as const },
  { title: 'What do you enjoy?', fields: ['interests'] as const },
]

export default function OnboardingPage() {
  const { profile, saveProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const {
    register, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { nationality: '', residenceCountry: '', homeAirport: '', interests: [] },
  })
  const interests = watch('interests')

  if (profile?.onboardedAt) return <Navigate to={ROUTES.app.dashboard} replace />

  const last = step === STEPS.length - 1
  const next = async () => {
    if (await trigger([...STEPS[step]!.fields])) setStep((s) => s + 1)
  }
  const submit = handleSubmit(async (v) => {
    // Never save from an earlier step (for example via the Enter key): only the last step saves.
    if (!last) return void next()
    setError(null)
    try {
      await saveProfile(v)
      navigate(ROUTES.app.dashboard, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile')
    }
  })

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Logo />
      <p className="mt-10 text-sm text-ink-soft" aria-live="polite">Step {step + 1} of {STEPS.length}</p>
      <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <Card className="mt-6 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{STEPS[step]!.title}</h1>
        <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
          {step === 0 && (
            <>
              <Field label="Nationality" htmlFor="nationality" error={errors.nationality?.message}>
                <Input id="nationality" autoFocus aria-invalid={!!errors.nationality} {...register('nationality')} />
              </Field>
              <Field label="Country of residence" htmlFor="residenceCountry" error={errors.residenceCountry?.message}>
                <Input id="residenceCountry" aria-invalid={!!errors.residenceCountry} {...register('residenceCountry')} />
              </Field>
            </>
          )}
          {step === 1 && (
            <Field label="Home airport or city (optional)" htmlFor="homeAirport">
              <Input id="homeAirport" autoFocus placeholder="e.g. DEL or New Delhi" {...register('homeAirport')} />
            </Field>
          )}
          {step === 2 && (
            <div role="group" aria-label="Interests" className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => {
                const on = interests.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setValue('interests', on ? interests.filter((x) => x !== i) : [...interests, i])}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm',
                      on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-surface hover:bg-muted',
                    )}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-2 flex justify-between">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {last ? (
              <Button key="finish" type="submit" variant="accent" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Finish'}</Button>
            ) : (
              // Distinct keys make React replace the element: reusing one button and flipping its type from
              // "button" to "submit" during the click would also submit the form.
              <Button key="continue" type="button" onClick={next}>Continue</Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
