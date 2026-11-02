import { Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import {
  appointmentsApi, checklistByType, statusMeta, typeLabel, type AppointmentDto, type AppointmentStatus,
} from './appointments-api'
import { dateOf, dayLabel, timeOf } from './dates'

export function AppointmentDetail({ a, onChanged }: { a: AppointmentDto; onChanged(): void }) {
  const [status, setStatus] = useState<AppointmentStatus>(a.status)
  const [ref, setRef] = useState(a.officialRef ?? '')
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const meta = statusMeta[a.status]

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <Card className="space-y-4 p-5" aria-live="polite">
      <div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <h2 className="mt-2 font-semibold">{typeLabel[a.type]} — {a.center}</h2>
        <p className="text-sm text-ink-soft">{dayLabel(dateOf(a.startsAt))} at {timeOf(a.startsAt)}</p>
        <p className="mt-1 text-xs text-ink-soft">{meta.help}</p>
        {a.officialRef && <p className="mt-1 text-sm">Reference: <strong>{a.officialRef}</strong></p>}
        {a.preferredTimes && <p className="mt-1 text-xs text-ink-soft">Preferred: {a.preferredTimes}</p>}
        {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Preparation checklist</legend>
        <ul className="space-y-1.5">
          {checklistByType[a.type].map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!a.checklist[c.id]}
                  onChange={(e) => void run(() => appointmentsApi.update(a.id, { checklist: { ...a.checklist, [c.id]: e.target.checked } }))}
                />
                {c.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="space-y-3 border-t border-line pt-4">
        <Field label="Update status" htmlFor="d-status">
          <Select id="d-status" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            <option value="requested">Requested</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option>
          </Select>
        </Field>
        {status === 'confirmed' && (
          <Field label="Confirmation reference" htmlFor="d-ref">
            <Input id="d-ref" autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={status === a.status && (status !== 'confirmed' || ref === (a.officialRef ?? ''))}
          onClick={() => void run(() => appointmentsApi.update(a.id, { status, officialRef: status === 'confirmed' ? ref.trim() || null : null }))}
        >
          Save status
        </Button>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium">Documents</p>
        {a.documents.length > 0 && (
          <ul className="mb-2 space-y-1 text-xs">
            {a.documents.map((d) => <li key={d.id}><a className="text-accent-700 underline" href={appointmentsApi.documentUrl(d.id)}>{d.filename}</a></li>)}
          </ul>
        )}
        <input
          ref={file} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" aria-label="Attach appointment document"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void run(() => appointmentsApi.attach(a.id, f))
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => file.current?.click()}><Paperclip className="size-4" aria-hidden />Attach</Button>
          <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void run(() => appointmentsApi.remove(a.id))}>
            <Trash2 className="size-4" aria-hidden />Delete
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </Card>
  )
}
