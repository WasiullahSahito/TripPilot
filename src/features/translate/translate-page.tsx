import { Languages, ScanText, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/field'
import { looksLikeMrz } from '@/features/ocr/mrz'
import { OCR_LANGUAGES, recognize, validateImage } from '@/features/ocr/ocr'
import { api, ApiError } from '@/lib/api'

const TARGETS = [
  { code: 'en', label: 'English' }, { code: 'ar', label: 'Arabic' }, { code: 'fr', label: 'French' }, { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' }, { code: 'ru', label: 'Russian' }, { code: 'tr', label: 'Turkish' }, { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' }, { code: 'ja', label: 'Japanese' },
]
const OCR_TO_ISO: Record<string, string> = { eng: 'en', ara: 'ar', fra: 'fr', spa: 'es', deu: 'de', rus: 'ru', tur: 'tr', hin: 'hi', chi_sim: 'zh', jpn: 'ja' }

export default function TranslatePage() {
  const [text, setText] = useState('')
  const [ocrLang, setOcrLang] = useState('eng')
  const [source, setSource] = useState('auto')
  const [target, setTarget] = useState('en')
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [translating, setTranslating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const sensitive = looksLikeMrz(text)

  const read = async (f: File) => {
    setError(null)
    const problem = validateImage(f)
    if (problem) return setError(problem)
    setReading(true)
    setProgress(0)
    abort.current = new AbortController()
    try {
      const out = await recognize(f, { lang: ocrLang, signal: abort.current.signal, onProgress: (p) => setProgress(p) })
      setText(out.trim())
      setSource(OCR_TO_ISO[ocrLang] ?? 'auto')
      setResult(null)
      if (!out.trim()) setError('No text was found in that image.')
    } catch {
      setError('Reading the image failed. You can paste the text instead.')
    } finally {
      setReading(false)
    }
  }

  const translate = async () => {
    setError(null)
    setResult(null)
    setTranslating(true)
    try {
      const r = await api<{ translatedText: string }>('/translate', { method: 'POST', body: { text, source, target } })
      setResult(r.translatedText)
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 501 ? 'Translation is temporarily unavailable. Please try again later.' : e.message) : 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Document translation</h1>
        <p className="mt-1 text-sm text-ink-soft">Read text from a photo of a document in your browser, then translate it.</p>
      </header>

      <Card className="space-y-4 p-5">
        <p className="flex items-start gap-2 text-xs text-ink-soft">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Photos are read on your device and are never uploaded. Only the text you see below is sent to the translation server when you press Translate.
          Don’t translate passport numbers or other identifiers — passport data is blocked automatically.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Language in the photo" htmlFor="t-ocr">
            <Select id="t-ocr" value={ocrLang} onChange={(e) => setOcrLang(e.target.value)}>{OCR_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select>
          </Field>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Document photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f) }} />
          <Button variant="outline" disabled={reading} onClick={() => file.current?.click()}><ScanText className="size-4" aria-hidden />{reading ? `Reading… ${Math.round(progress * 100)}%` : 'Read text from photo'}</Button>
        </div>

        <label className="block text-xs font-medium text-ink-soft">
          Text to translate (you can edit it)
          <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null) }} maxLength={5000} rows={7}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </label>
        <p className="text-xs text-ink-soft">{text.length} / 5000 characters</p>
        {sensitive && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This looks like passport data, so it can’t be sent for translation. Remove it to continue.</p>}

        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" htmlFor="t-src"><Select id="t-src" value={source} onChange={(e) => setSource(e.target.value)}><option value="auto">Detect language</option>{TARGETS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select></Field>
          <Field label="To" htmlFor="t-tgt"><Select id="t-tgt" value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select></Field>
          <Button variant="accent" disabled={!text.trim() || sensitive || translating} onClick={() => void translate()}><Languages className="size-4" aria-hidden />{translating ? 'Translating…' : 'Translate'}</Button>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {result !== null && (
          <div aria-live="polite">
            <h2 className="text-sm font-semibold">Translation</h2>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-muted/40 p-4 text-sm">{result}</p>
            <p className="mt-2 text-xs text-ink-soft">Machine translation can be wrong. Use a certified translator for anything an embassy requires to be officially translated.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
