import { CheckCircle2, ScanLine, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseMrz, type ParsedPassport } from './mrz'
import { recognize, validateImage } from './ocr'

export interface ScannedFields {
  applicant: Record<string, string>
  passport: Record<string, string>
}

export function toFormFields(p: ParsedPassport): ScannedFields {
  const applicant: Record<string, string> = {}
  const passport: Record<string, string> = {}
  if (p.givenNames) applicant.givenNames = p.givenNames
  if (p.surname) applicant.surname = p.surname
  if (p.dateOfBirth) applicant.dateOfBirth = p.dateOfBirth
  if (p.passportNumber) passport.number = p.passportNumber
  if (p.issuingCountry) passport.issuingCountry = p.issuingCountry
  if (p.expiryDate) passport.expiryDate = p.expiryDate
  return { applicant, passport }
}

const LABELS: [keyof ParsedPassport, string][] = [
  ['surname', 'Surname'], ['givenNames', 'Given names'], ['passportNumber', 'Passport number'], ['issuingCountry', 'Issuing country (code)'],
  ['dateOfBirth', 'Date of birth'], ['expiryDate', 'Expiry date'],
]

/**
 * Reads the passport's machine-readable zone in the browser. The photo never leaves the device and is
 * released as soon as the user applies the result or clears the panel. Nothing is applied without a click.
 */
export function PassportScanner({ onApply }: { onApply(fields: ScannedFields): void }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParsedPassport | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  const clear = () => {
    abort.current?.abort()
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setResult(null)
    setError(null)
    setBusy(false)
    setProgress(0)
  }
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const scan = async (file: File) => {
    clear()
    const problem = validateImage(file)
    if (problem) return setError(problem)
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    abort.current = new AbortController()
    try {
      const text = await recognize(file, { lang: 'eng', mrz: true, signal: abort.current.signal, onProgress: (p, s) => { setProgress(p); setStatus(s) } })
      const parsed = parseMrz(text)
      if (!parsed) setError('Could not find the two machine-readable lines at the bottom of the photo. Retake it flat, well lit, with the whole bottom edge visible.')
      else setResult(parsed)
    } catch {
      setError('Scanning failed. You can type the details in manually.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="scan-title" className="mb-6 rounded-xl border border-line bg-muted/40 p-4">
      <h3 id="scan-title" className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="size-4 text-accent-600" aria-hidden />Fill from a passport photo</h3>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-soft">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        The photo is read inside your browser. It is not uploaded or stored, and it is discarded when you apply the result or clear this panel.
      </p>

      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Passport photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void scan(f) }} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Choose photo'}</Button>
        {(preview || result || error) && <Button type="button" variant="ghost" size="sm" onClick={clear}><X className="size-4" aria-hidden />Clear</Button>}
      </div>

      {busy && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-ink-soft">{status || 'Loading text recognition (first use downloads about 10 MB)…'}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          {result.allChecksPass
            ? <p className="flex items-center gap-1.5 text-sm text-accent-700"><CheckCircle2 className="size-4" aria-hidden />All check digits verified.</p>
            : <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />Some check digits did not verify, so the scan may have misread characters. Compare every value with your passport before using it.</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            {preview && <img src={preview} alt="Your passport photo (shown only on this device)" className="max-h-40 rounded-lg border border-line object-contain" />}
            <dl className="grid flex-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {LABELS.map(([k, label]) => (
                <div key={k}><dt className="text-xs text-ink-soft">{label}</dt><dd className="font-medium">{(result[k] as string | null) || '—'}</dd></div>
              ))}
            </dl>
          </div>
          <p className="flex flex-wrap gap-2 text-xs">
            <Badge tone={result.checks.passportNumber ? 'accent' : 'warning'}>Number {result.checks.passportNumber ? 'verified' : 'unverified'}</Badge>
            <Badge tone={result.checks.dateOfBirth ? 'accent' : 'warning'}>Birth date {result.checks.dateOfBirth ? 'verified' : 'unverified'}</Badge>
            <Badge tone={result.checks.expiryDate ? 'accent' : 'warning'}>Expiry {result.checks.expiryDate ? 'verified' : 'unverified'}</Badge>
          </p>
          <Button type="button" variant="accent" size="sm" onClick={() => { onApply(toFormFields(result)); clear() }}>Use these values (I have checked them)</Button>
        </div>
      )}
    </section>
  )
}
