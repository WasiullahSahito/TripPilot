import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { tripPurposes } from '@/config/site'
import { destinations, findDestination } from './destinations'
import { visaApi, type ApplicationDto } from './visa-api'

const schema = z.object({
  destinationId: z.string().min(1, 'Choose a destination'),
  categoryId: z.string().min(1, 'Choose a visa category'),
  purpose: z.enum(tripPurposes),
  nationality: z.string().trim().min(2, 'Enter your nationality').max(60),
  residence: z.string().trim().min(2, 'Enter your country of residence').max(60),
})
type Values = z.infer<typeof schema>

const statusLabel = { draft: 'Draft', ready: 'Prepared', submitted_on_portal: 'Submitted (self-reported)' } as const

export default function VisaStartPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preset = findDestination(params.get('destination'))
  const [apps, setApps] = useState<ApplicationDto[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      destinationId: preset?.id ?? '',
      categoryId: '',
      purpose: tripPurposes.find((purpose) => purpose === params.get('purpose')) ?? 'Tourism',
      nationality: params.get('nationality') ?? '',
      residence: '',
    },
  })
  const destinationId = watch('destinationId')
  const purpose = watch('purpose')
  const categoryId = watch('categoryId')
  const dest = findDestination(destinationId)
  const matchingCategory = dest?.categories.find((c) => c.purposes.includes(purpose))
  const visibleCategories = dest?.categories.filter((c) => c.purposes.includes(purpose))
  const categoryOptions = visibleCategories?.length ? visibleCategories : (dest?.categories ?? [])

  useEffect(() => {
    if (!dest) {
      setValue('categoryId', '')
      return
    }
    const currentMatchesPurpose = dest.categories.some((c) => c.id === categoryId && c.purposes.includes(purpose))
    if (currentMatchesPurpose) return
    const match = matchingCategory ?? dest.categories[0]
    setValue('categoryId', match?.id ?? '')
  }, [dest, purpose, categoryId, matchingCategory, setValue])

  useEffect(() => {
    visaApi
      .list()
      .then(setApps)
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : 'Could not load applications'))
  }, [])

  const onSubmit = handleSubmit((v) => {
    const q = new URLSearchParams({ nationality: v.nationality, residence: v.residence, purpose: v.purpose })
    for (const k of ['from', 'to']) {
      const val = params.get(k)
      if (val) q.set(k, val)
    }
    navigate(`/app/visa/${v.destinationId}/${v.categoryId}?${q}`)
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-accent-900 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-medium text-accent-200">A clearer way to get started</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Prepare your visa application</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75">Choose where you’re going and why. We’ll open an organised workspace with your official source links, document checklist and saved progress.</p>
      </header>

      <Card className="overflow-hidden border-accent-100 p-0 shadow-sm">
        <div className="border-b border-line bg-muted/50 px-5 py-4 sm:px-6">
          <h2 className="font-semibold">Start an application</h2>
          <p className="mt-1 text-xs text-ink-soft">Your progress is saved to your account as you work.</p>
        </div>
        <form onSubmit={onSubmit} noValidate className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="What are you travelling for?" htmlFor="v-purpose" error={errors.purpose?.message}>
            <Select id="v-purpose" aria-invalid={!!errors.purpose} {...register('purpose')}>
              {tripPurposes.map((item) => <option key={item} value={item}>{item === 'Employment' ? 'Work / employment' : item}</option>)}
            </Select>
          </Field>
          <Field label="Destination" htmlFor="v-dest" error={errors.destinationId?.message}>
            <Select id="v-dest" aria-invalid={!!errors.destinationId} {...register('destinationId')}>
              <option value="">Choose a country…</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Visa category" htmlFor="v-cat" error={errors.categoryId?.message}>
            <Select id="v-cat" disabled={!dest} aria-invalid={!!errors.categoryId} {...register('categoryId')}>
              {!dest && <option value="">Choose a destination first</option>}
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <div className="hidden sm:block" />
          <Field label="Nationality" htmlFor="v-nat" error={errors.nationality?.message}>
            <Input id="v-nat" aria-invalid={!!errors.nationality} {...register('nationality')} />
          </Field>
          <Field label="Country of residence" htmlFor="v-res" error={errors.residence?.message}>
            <Input id="v-res" aria-invalid={!!errors.residence} {...register('residence')} />
          </Field>
          {purpose === 'Employment' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
              Work visas are separate from visitor and business visas. Sponsorship and eligibility depend on the destination and your circumstances; verify them with the official authority.
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto">Continue to checklist <span aria-hidden>→</span></Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="saved">
        <h2 id="saved" className="mb-3 text-xl font-semibold">Continue an application</h2>
        {listError ? (
          <p role="alert" className="text-sm text-red-700">{listError}</p>
        ) : apps === null ? (
          <p role="status" className="text-sm text-ink-soft">Loading…</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-ink-soft">No saved applications yet.</p>
        ) : (
          <ul className="space-y-3">
            {apps.map((a) => {
              const d = findDestination(a.destinationId)
              const c = d?.categories.find((x) => x.id === a.categoryId)
              const qs = new URLSearchParams({ nationality: a.nationality, residence: a.residence })
              return (
                <li key={a.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{d?.name ?? a.destinationId} — {c?.label ?? a.categoryId}</p>
                      <p className="text-xs text-ink-soft">Updated {new Date(a.updatedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={a.status === 'draft' ? 'neutral' : 'accent'}>{statusLabel[a.status]}</Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/app/visa/${a.destinationId}/${a.categoryId}?${qs}`}>Resume</Link>
                      </Button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
