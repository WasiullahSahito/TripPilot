import { ExternalLink, FileUp, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { reviews, reviewStatus } from './review'
import { Button } from '@/components/ui/button'
import type { ChecklistItem } from './checklist'
import type { DestinationConfig } from './destinations'
import type { DocumentDto } from './visa-api'
import { visaApi } from './visa-api'

interface Props {
  destination: DestinationConfig
  items: ChecklistItem[]
  checked: Record<string, boolean>
  documents: DocumentDto[]
  passportWarning: string | null
  onToggle(id: string, value: boolean): void
  onUpload(itemId: string, file: File): Promise<void>
  onRemove(docId: string): Promise<void>
}

function UploadButton({ item, onUpload }: { item: ChecklistItem; onUpload: Props['onUpload'] }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="sr-only"
        aria-label={`Upload file for ${item.label}`}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          setError(null)
          try {
            await onUpload(item.id, file)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed')
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <FileUp className="size-4" aria-hidden />{busy ? 'Uploading…' : 'Upload'}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

export function WorkspaceChecklist({ destination, items, checked, documents, passportWarning, onToggle, onUpload, onRemove }: Props) {
  const review = reviewStatus(reviews[destination.id], new Date().toISOString().slice(0, 10))
  return (
    <div className="space-y-6">
      <section aria-labelledby="official" className="rounded-xl border border-line bg-muted/50 p-4">
        <h3 id="official" className="text-sm font-semibold">Official sources — the authoritative place to apply</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {destination.officialLinks.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent-700 underline">
                {l.label}<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          Submission, CAPTCHA, consent, identity verification and payment happen only on the official site. This checklist is general guidance and may be out of date.
        </p>
        {destination.notes.map((n) => <p key={n} className="mt-1 text-xs text-ink-soft">• {n}</p>)}
        <p role="note" className={`mt-3 rounded-lg px-3 py-2 text-xs ${review.state === 'current' ? 'bg-accent-50 text-accent-700' : 'bg-amber-50 text-amber-900'}`}>
          <strong>{review.state === 'current' ? 'Reviewed. ' : review.state === 'stale' ? 'Review is out of date. ' : 'Not reviewed. '}</strong>{review.label}
        </p>
        {reviews[destination.id] && (
          <ul className="mt-1 text-xs text-ink-soft">
            {reviews[destination.id]!.sources.map((u) => <li key={u}><a className="underline" href={u} target="_blank" rel="noopener noreferrer">{u}<span className="sr-only"> (opens in a new tab)</span></a></li>)}
          </ul>
        )}
      </section>

      {passportWarning && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{passportWarning}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((item) => {
          const files = documents.filter((d) => d.itemId === item.id)
          return (
            <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <input
                  id={`chk-${item.id}`}
                  type="checkbox"
                  className="mt-1 size-4 accent-teal-700"
                  checked={!!checked[item.id]}
                  onChange={(e) => onToggle(item.id, e.target.checked)}
                />
                <div>
                  <label htmlFor={`chk-${item.id}`} className="text-sm font-medium">
                    {item.label} <Badge tone={item.required ? 'accent' : 'neutral'}>{item.required ? 'Required' : 'Optional'}</Badge>
                  </label>
                  <p className="mt-0.5 text-xs text-ink-soft">{item.description}</p>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center gap-2 text-xs">
                          <a href={visaApi.documentUrl(f.id)} className="text-accent-700 underline">{f.filename}</a>
                          <span className="text-ink-soft">{Math.ceil(f.size / 1024)} KB</span>
                          <button type="button" aria-label={`Remove ${f.filename}`} onClick={() => void onRemove(f.id)} className="text-red-700">
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <UploadButton item={item} onUpload={onUpload} />
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-ink-soft">Uploads: PDF, PNG or JPEG. Large photos are shrunk to fit if needed; very large files (over 4 MB, up to 25 MB) need cloud storage. Every file is checked for hidden scripts and malware, then stored privately and visible only to you.</p>
    </div>
  )
}
