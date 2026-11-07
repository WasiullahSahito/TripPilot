import { ArrowLeftRight, ExternalLink, Train } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { buttonVariants } from '@/components/ui/button'
import { AffiliateDisclosure, PartnerLink } from '@/features/affiliate/partner-links'
import { cn } from '@/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)

/** Google Maps transit directions between two typed places: a free deep link, no API key. */
export function googleTransitUrl(from: string, to: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`
}

export default function TrainsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState(today())
  const ready = from.trim().length > 1 && to.trim().length > 1
  const params = { origin: from.trim(), destination: to.trim(), depart: date, city: to.trim() }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Train className="size-6 text-accent" aria-hidden />Book trains</h1>
        <p className="mt-1 text-sm text-ink-soft">Type where you are going. Then compare timetables and prices and book on the train company’s own site.</p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="From" htmlFor="tr-from"><Input id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Paris" autoComplete="off" /></Field>
          <button type="button" aria-label="Swap" onClick={() => { setFrom(to); setTo(from) }} className="mx-auto grid size-10 place-items-center rounded-full border border-line text-ink-soft hover:bg-muted"><ArrowLeftRight className="size-4" aria-hidden /></button>
          <Field label="To" htmlFor="tr-to"><Input id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. Lyon" autoComplete="off" /></Field>
        </div>
        <Field label="Date" htmlFor="tr-date"><Input id="tr-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </Card>

      {ready ? (
        <Card className="space-y-5 p-5">
          <section aria-labelledby="tr-book">
            <h2 id="tr-book" className="text-sm font-semibold">Compare and book</h2>
            <p className="mt-1 text-xs text-ink-soft">These open in a new tab. Check the date and passengers on their site before you pay.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PartnerLink id="rome2rio" params={params} label="Rome2Rio (all options)" />
              <PartnerLink id="trainline" params={params} />
              <PartnerLink id="omio" params={params} />
            </div>
          </section>
          <section aria-labelledby="tr-gm">
            <h2 id="tr-gm" className="text-sm font-semibold">Directions and live times</h2>
            <p className="mt-1 text-xs text-ink-soft">Google Maps shows trains, buses and metro with times for your route.</p>
            <a href={googleTransitUrl(from.trim(), to.trim())} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'mt-3')}>
              Open in Google Maps<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
            </a>
          </section>
          <AffiliateDisclosure />
        </Card>
      ) : <p className="text-sm text-ink-soft">Enter both cities to see booking options.</p>}

      <p className="text-xs text-ink-soft">
        We cannot sell or issue train tickets inside this app. Tickets are bought from the train company or its booking partner.
        For a visa application, save the confirmation in Documents, or add it to Booking history.
      </p>
    </div>
  )
}
