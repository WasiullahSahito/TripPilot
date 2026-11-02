import { CheckCircle2, Circle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { PassportScanner } from '@/features/ocr/passport-scanner'
import { buildChecklist } from './checklist'
import { findDestination, isWorkVisaCategory } from './destinations'
import { formCompletion, passportValidityWarning, stepLabels, validateStep, type StepId } from './form-schema'
import { ReviewPanel } from './review-panel'
import { StepForm } from './step-form'
import { useWorkspace } from './use-workspace'
import { WorkspaceChecklist } from './workspace-checklist'

type Section = 'checklist' | StepId | 'review'

const saveLabel = { idle: '', saving: 'Saving…', saved: 'Progress saved', error: 'Save failed — will retry on next change' }

export default function VisaWorkspacePage() {
  const { destinationId = '', categoryId = '' } = useParams()
  const [search] = useSearchParams()
  const destination = findDestination(destinationId)
  const category = destination?.categories.find((c) => c.id === categoryId)

  if (!destination || !category) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">We don’t have that destination or visa category</h1>
        <Button asChild className="mt-6"><Link to={ROUTES.app.visa}>Choose a destination</Link></Button>
      </div>
    )
  }
  return (
    <Workspace
      key={`${destination.id}/${category.id}`}
      destinationId={destination.id}
      categoryId={category.id}
      nationality={search.get('nationality') ?? ''}
      residence={search.get('residence') ?? ''}
      from={search.get('from') ?? ''}
      to={search.get('to') ?? ''}
      purpose={search.get('purpose') ?? category.purposes[0] ?? ''}
    />
  )
}

function Workspace(p: {
  destinationId: string; categoryId: string; nationality: string; residence: string; from: string; to: string; purpose: string
}) {
  const destination = findDestination(p.destinationId)!
  const category = destination.categories.find((c) => c.id === p.categoryId)!
  const workVisa = isWorkVisaCategory(category.id)
  const init = useMemo(
    () => ({
      destinationId: p.destinationId, categoryId: p.categoryId, nationality: p.nationality, residence: p.residence,
      seed: { travel: { purpose: p.purpose, arrivalDate: p.from, departureDate: p.to } },
    }),
    [p.destinationId, p.categoryId, p.nationality, p.residence, p.purpose, p.from, p.to],
  )
  const ws = useWorkspace(init)
  const [section, setSection] = useState<Section>('checklist')
  const [attempted, setAttempted] = useState<Set<StepId>>(new Set())

  const items = useMemo(
    () => buildChecklist(destination, category.id, ws.data.travel.purpose || p.purpose),
    [destination, category.id, ws.data.travel.purpose, p.purpose],
  )
  const completion = formCompletion(ws.data, workVisa)
  const warning = passportValidityWarning(ws.data, destination.passportValidityMonths)
  const order: Section[] = workVisa
    ? ['checklist', 'applicant', 'passport', 'employment', 'review']
    : ['checklist', 'applicant', 'passport', 'travel', 'accommodation', 'itinerary', 'review']
  const idx = order.indexOf(section)

  const goNext = () => {
    if (section !== 'checklist' && section !== 'review') setAttempted((s) => new Set(s).add(section))
    setSection(order[Math.min(idx + 1, order.length - 1)]!)
  }

  const downloadSummary = async () => {
    const { buildApplicationSummary } = await import('./summary-pdf')
    const uploads: Record<string, string[]> = {}
    for (const d of ws.documents) (uploads[d.itemId] ??= []).push(d.filename)
    const bytes = await buildApplicationSummary({
      destination, categoryLabel: category.label, nationality: ws.nationality, residence: ws.residence,
      data: ws.data, checklist: items, checked: ws.checked, uploads, workVisa,
    })
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `visa-summary-${destination.id}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (ws.loading) return <div role="status" className="p-16 text-center text-sm text-ink-soft">Loading your application…</div>
  if (ws.loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p role="alert" className="text-red-700">{ws.loadError}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    )
  }

  const stepDone = (id: StepId) => completion.steps.find((s) => s.id === id)!.complete
  const errors = section !== 'checklist' && section !== 'review' && attempted.has(section) ? validateStep(section, ws.data).errors : {}

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <Link to={ROUTES.app.visa} className="text-sm text-ink-soft underline">← All applications</Link>
        <h1 className="mt-2 text-2xl font-semibold">{destination.name} — {category.label}</h1>
        {workVisa && <p className="mt-2 max-w-3xl text-sm text-ink-soft">Organise your role and employer information here. Work eligibility, sponsorship and required documents vary; confirm the correct route with the official authority. A visitor or business visa does not authorize employment.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          <span>{completion.percent}% of form complete</span>
          <Badge tone={ws.status === 'draft' ? 'neutral' : 'accent'}>{ws.status === 'draft' ? 'Draft' : 'Prepared'}</Badge>
          <span aria-live="polite">{saveLabel[ws.saveState]}</span>
          <Button variant="outline" size="sm" onClick={() => void ws.save()}>Save now</Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Application sections" className="flex gap-1 overflow-x-auto lg:flex-col">
          {order.map((s) => {
            const label = s === 'checklist' ? 'Checklist & links' : s === 'review' ? 'Review & export' : stepLabels[s]
            const done = s !== 'checklist' && s !== 'review' && stepDone(s)
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                aria-current={section === s ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap ${section === s ? 'bg-navy-900 text-white' : 'hover:bg-muted'}`}
              >
                {done ? <CheckCircle2 className="size-4 text-accent-500" aria-label="Complete" /> : <Circle className="size-4 opacity-40" aria-hidden />}
                {label}
              </button>
            )
          })}
        </nav>

        <Card className="p-5 sm:p-6">
          {section === 'checklist' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2">
                <Field label="Nationality" htmlFor="ws-nationality">
                  <Input id="ws-nationality" value={ws.nationality} onChange={(e) => ws.setNationality(e.target.value)} />
                </Field>
                <Field label="Country of residence" htmlFor="ws-residence">
                  <Input id="ws-residence" value={ws.residence} onChange={(e) => ws.setResidence(e.target.value)} />
                </Field>
              </div>
              <WorkspaceChecklist
                destination={destination} items={items} checked={ws.checked} documents={ws.documents}
                passportWarning={warning} onToggle={ws.setChecked} onUpload={ws.upload} onRemove={ws.removeDocument}
              />
            </>
          )}
          {section !== 'checklist' && section !== 'review' && (
            <>
              <h2 className="mb-5 text-lg font-semibold">{stepLabels[section]}</h2>
              {section === 'passport' && (
                <PassportScanner
                  onApply={(f) => {
                    for (const [k, v] of Object.entries(f.applicant)) ws.setField('applicant', k, v)
                    for (const [k, v] of Object.entries(f.passport)) ws.setField('passport', k, v)
                  }}
                />
              )}
              <StepForm step={section} values={ws.data[section]} errors={errors} onChange={(f, v) => ws.setField(section, f, v)} />
              {section === 'passport' && warning && <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{warning}</p>}
            </>
          )}
          {section === 'review' && (
            <>
              <h2 className="mb-5 text-lg font-semibold">Review & export</h2>
              <ReviewPanel
                completion={completion} items={items} checked={ws.checked} status={ws.status}
                officialUrl={destination.officialLinks[0]?.url} onStatus={ws.setStatus}
                onGoto={(s) => { setAttempted((a) => new Set(a).add(s)); setSection(s) }} onDownload={downloadSummary}
              />
            </>
          )}
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" disabled={idx === 0} onClick={() => setSection(order[idx - 1]!)}>Back</Button>
            {idx < order.length - 1 && <Button onClick={goNext}>Continue</Button>}
          </div>
        </Card>
      </div>
    </div>
  )
}
