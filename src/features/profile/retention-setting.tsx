import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'

const CHOICES = [
  { value: '', label: 'Keep my files until I delete them' },
  { value: '30', label: '30 days after the trip' },
  { value: '60', label: '60 days after the trip' },
  { value: '90', label: '90 days after the trip' },
  { value: '180', label: '180 days after the trip' },
  { value: '365', label: '1 year after the trip' },
]

/** Opt-in automatic deletion of uploaded files (passport scans, tickets, certificates). */
export function RetentionSetting() {
  const { profile, setRetention } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const current = profile?.retentionDays ? String(profile.retentionDays) : ''

  const change = async (value: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await setRetention(value === '' ? null : Number(value))
      setMessage({ kind: 'ok', text: value === '' ? 'Your files will be kept until you delete them.' : `Your uploaded files will be deleted ${value} days after the related trip, booking or appointment.` })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save this setting' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">Automatic file deletion</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Passport scans and other uploads are deleted for you some time after your trip. The clock starts on the departure date of your visa application,
        the end of a booking, or the date of an appointment. Deleted files cannot be recovered; your forms and records stay.
      </p>
      <div className="mt-4 max-w-sm">
        <Field label="Delete my uploaded files" htmlFor="retention">
          <Select id="retention" value={current} disabled={busy} onChange={(e) => void change(e.target.value)}>
            {CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
      </div>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-accent-700'}`}>{message.text}</p>}
    </Card>
  )
}
