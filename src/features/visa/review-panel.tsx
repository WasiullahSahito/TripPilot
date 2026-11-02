import { AlertCircle, CheckCircle2, Download } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { checklistProgress, type ChecklistItem } from './checklist'
import { formCompletion, stepLabels, type StepId } from './form-schema'
import type { ApplicationStatus } from './visa-api'

export const statusText: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  ready: 'Prepared — not yet submitted',
  submitted_on_portal: 'Submitted on the official portal (self-reported)',
}

interface Props {
  completion: ReturnType<typeof formCompletion>
  items: ChecklistItem[]
  checked: Record<string, boolean>
  status: ApplicationStatus
  officialUrl?: string
  onStatus(s: ApplicationStatus): void
  onGoto(step: StepId): void
  onDownload(): Promise<void>
}

export function ReviewPanel({ completion, items, checked, status, officialUrl, onStatus, onGoto, onDownload }: Props) {
  const progress = checklistProgress(items, checked)
  const ready = completion.done === completion.total && progress.complete
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDownload()
    } catch {
      setError('Could not generate the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={status === 'draft' ? 'neutral' : 'accent'}>{statusText[status]}</Badge>
        <p className="text-sm text-ink-soft">
          {completion.done} of {completion.total} sections complete · {progress.done} of {progress.total} required documents ticked
        </p>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {completion.steps.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span className="flex items-center gap-2">
              {s.complete ? <CheckCircle2 className="size-4 text-accent-600" aria-label="Complete" /> : <AlertCircle className="size-4 text-amber-600" aria-label="Incomplete" />}
              {stepLabels[s.id]}
            </span>
            {!s.complete && <Button variant="ghost" size="sm" onClick={() => onGoto(s.id)}>Fix</Button>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button variant="accent" onClick={() => void download()} disabled={busy}>
          <Download className="size-4" aria-hidden />{busy ? 'Generating…' : 'Download summary PDF'}
        </Button>
        {status === 'draft' && (
          <Button variant="outline" disabled={!ready} onClick={() => onStatus('ready')}>Mark as prepared</Button>
        )}
        {status !== 'draft' && <Button variant="ghost" onClick={() => onStatus('draft')}>Back to draft</Button>}
        {status === 'ready' && (
          <Button variant="outline" onClick={() => onStatus('submitted_on_portal')}>I submitted on the official site</Button>
        )}
      </div>
      {!ready && status === 'draft' && <p className="text-xs text-ink-soft">Complete every section and tick all required documents to mark this as prepared.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <p className="rounded-xl bg-muted px-4 py-3 text-xs text-ink-soft">
        TripPilot does not submit applications. “Prepared” means your information is organised here.
        {officialUrl && <> Continue on the <a className="font-medium text-accent-700 underline" href={officialUrl} target="_blank" rel="noopener noreferrer">official portal</a> to submit, pay and verify your identity.</>}
      </p>
    </div>
  )
}
