import { LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Accordion, AccordionItem } from '@/components/ui/accordion'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { faqs } from '@/config/site'

interface Article { id: string; q: string; a: string }

const guides: Article[] = [
  { id: 'g1', q: 'How do I prepare a visa application?', a: 'Open Visa, choose your destination and category, then work through the checklist and the five form sections. Progress saves automatically and you can resume any time. When every section is complete, mark it as prepared and download the summary PDF, then submit on the official portal.' },
  { id: 'g2', q: 'Why does the checklist link to an official website?', a: 'Requirements change and differ by nationality. The official government or embassy site is always the authoritative source, and it is the only place where you can submit, pay and verify your identity.' },
  { id: 'g3', q: 'What is the difference between sample, requested and confirmed?', a: 'Sample plans are for planning only and are not bookings. Requested means you asked a provider but it is not secured. Confirmed means the provider confirmed it and you entered their reference. We never create confirmation numbers.' },
  { id: 'g4', q: 'Can I fill my passport details from a photo?', a: 'Yes. On the Passport step choose "Fill from a passport photo". The photo is read inside your browser and is never uploaded. Check every value before using it, especially if a check digit fails.' },
  { id: 'g5', q: 'How do I combine my documents into one PDF?', a: 'Open Documents, tick the items to include, reorder them, build a preview and download. Uploaded files are included unchanged; only a page number is added in the margin if you leave that option on.' },
  { id: 'g6', q: 'How do I export or delete my data?', a: 'Open Profile. "Export my data" downloads everything we hold. "Delete account" permanently removes your account, trips, applications, bookings, appointments and uploaded files.' },
  { id: 'g7', q: 'How does the browser assistant work?', a: 'It is an optional Chrome extension. You export your details from a prepared application, load them into the extension, preview exactly what will go into each field, and approve it. It never submits forms, solves CAPTCHAs, or touches password, payment or file fields.' },
]

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const all = useMemo<Article[]>(() => [...guides, ...faqs.map((f, i) => ({ id: `f${i}`, q: f.q, a: f.a }))], [])
  const q = query.trim().toLowerCase()
  const shown = q ? all.filter((x) => x.q.toLowerCase().includes(q) || x.a.toLowerCase().includes(q)) : all

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Help center</h1>
        <p className="mt-2 text-ink-soft">Guides and answers to common questions.</p>
        <div className="mt-6 max-w-md">
          <Field label="Search help" htmlFor="help-q"><Input id="help-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. passport, delete, appointment" /></Field>
        </div>
      </header>

      <section aria-label="Articles">
        {shown.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-soft" role="status">No articles match “{query}”.</p>
        ) : (
          <Accordion type="single" collapsible>
            {shown.map((a) => <AccordionItem key={a.id} value={a.id} question={a.q}>{a.a}</AccordionItem>)}
          </Accordion>
        )}
        <p className="mt-2 text-xs text-ink-soft" aria-live="polite">{shown.length} article{shown.length === 1 ? '' : 's'}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Mail className="size-5 text-accent-600" aria-hidden />
          <h2 className="mt-2 font-semibold">Contact support</h2>
          <p className="mt-1 text-sm text-ink-soft">Email <span className="font-medium text-ink">support@example.com</span> <span className="text-xs">(placeholder: replace with your real address)</span>.</p>
        </Card>
        <Card className="p-5">
          <ShieldCheck className="size-5 text-accent-600" aria-hidden />
          <h2 className="mt-2 font-semibold">Privacy and terms</h2>
          <p className="mt-1 text-sm text-ink-soft">Read how we handle your data in the <Link className="underline" to={ROUTES.privacy}>privacy policy</Link> and the <Link className="underline" to={ROUTES.terms}>terms of service</Link>.</p>
        </Card>
      </section>

      <p className="flex items-start gap-2 text-xs text-ink-soft"><LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />TripPilot is a preparation tool. We are not a government agency, embassy, airline or insurer, and cannot influence visa decisions.</p>
    </div>
  )
}
