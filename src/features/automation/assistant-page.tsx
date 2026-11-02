import { Download, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { findDestination } from '@/features/visa/destinations'
import { visaApi, type ApplicationDto } from '@/features/visa/visa-api'
import { buildAssistantExport, downloadExport, EXPORT_VALID_MINUTES } from './assistant-export'

export default function AssistantPage() {
  const [apps, setApps] = useState<ApplicationDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    visaApi.list().then(setApps).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load applications'))
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Browser assistant</h1>
        <p className="mt-1 text-sm text-ink-soft">
          An optional Chrome extension that helps you copy details you approve into an official visa form. Everything on this site works without it.
        </p>
      </header>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-accent-600" aria-hidden />What it does, and does not do</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Runs only when you click it on a page, and shows a preview of every value before anything is typed.</li>
          <li>Never submits a form, solves a CAPTCHA, or touches password, payment, security-code or file-upload fields.</li>
          <li>Keeps your details in memory only, deletes them after {EXPORT_VALID_MINUTES} minutes, and makes no network requests.</li>
          <li>The official site stays in charge of submission, consent, identity checks and payment. Use it only on sites whose terms allow assisted form entry.</li>
        </ul>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Install (developer mode)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Run <code className="rounded bg-muted px-1">npm run build:extension</code> in the project folder.</li>
          <li>Open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on Developer mode, choose <strong>Load unpacked</strong> and pick <code className="rounded bg-muted px-1">extension/dist</code>.</li>
          <li>Export an application below, then open the extension on the official form and load the file.</li>
          <li>Try it first on the harmless sample form in <code className="rounded bg-muted px-1">extension/test-page/form.html</code>.</li>
        </ol>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Export an application</h2>
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          The file contains personal details including your passport number. It expires in {EXPORT_VALID_MINUTES} minutes; delete it after use and never share it.
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {apps === null && !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}
        {apps && apps.length === 0 && (
          <p className="text-sm text-ink-soft">No applications yet. <Link className="underline" to="/app/visa">Start one in the visa workspace.</Link></p>
        )}
        <ul className="space-y-2">
          {apps?.map((a) => {
            const d = findDestination(a.destinationId)
            const name = d?.name ?? a.destinationId
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                <span className="text-sm font-medium">{name} <span className="font-normal text-ink-soft">· {d?.categories.find((c) => c.id === a.categoryId)?.label ?? a.categoryId}</span></span>
                <Button size="sm" variant="outline" onClick={() => { downloadExport(buildAssistantExport(a, name)); setDone(name) }}>
                  <Download className="size-4" aria-hidden />Export for assistant
                </Button>
              </li>
            )
          })}
        </ul>
        {done && <p role="status" className="text-sm text-accent-700">Exported {done}. Load the file in the extension within {EXPORT_VALID_MINUTES} minutes.</p>}
      </Card>
    </div>
  )
}
