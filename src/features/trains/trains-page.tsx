import { ArrowLeftRight, ExternalLink, Train } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { findPlace, fmtDuration, fmtTime, modeLabel, planJourneys, type Journey } from './transit'
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
  const [time, setTime] = useState('09:00')
  const [busy, setBusy] = useState(false)
  const [journeys, setJourneys] = useState<Journey[] | null>(null)
  const [names, setNames] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ready = from.trim().length > 1 && to.trim().length > 1

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    setJourneys(null)
    try {
      const [a, b] = await Promise.all([findPlace(from.trim()), findPlace(to.trim())])
      if (!a || !b) {
        setError(`Could not find ${!a ? `“${from.trim()}”` : `“${to.trim()}”`}. Check the spelling or try the station name.`)
        return
      }
      setNames({ from: a.name, to: b.name })
      const result = await planJourneys(a, b, new Date(`${date}T${time}`))
      setJourneys(result)
      if (!result.length) setError('No public transport routes were found. This free timetable service covers Europe best; use the links below for other regions.')
    } catch {
      setError('The timetable service is not responding right now. Try again, or use the links below.')
    } finally {
      setBusy(false)
    }
  }
  const params = { origin: from.trim(), destination: to.trim(), depart: date, city: to.trim() }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Train className="size-6 text-accent" aria-hidden />Book trains</h1>
        <p className="mt-1 text-sm text-ink-soft">Search free train and public transport timetables, then book on the train company’s own site when you are ready.</p>
      </header>

      <Card className="p-5">
        <form className="space-y-4" onSubmit={(e) => void search(e)}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="From" htmlFor="tr-from"><Input id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Paris" autoComplete="off" /></Field>
          <button type="button" aria-label="Swap" onClick={() => { setFrom(to); setTo(from) }} className="mx-auto grid size-10 place-items-center rounded-full border border-line text-ink-soft hover:bg-muted"><ArrowLeftRight className="size-4" aria-hidden /></button>
          <Field label="To" htmlFor="tr-to"><Input id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. Lyon" autoComplete="off" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="tr-date"><Input id="tr-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Leave after" htmlFor="tr-time"><Input id="tr-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Button type="submit" variant="accent" className="w-full sm:w-auto" disabled={!ready || busy}>{busy ? 'Searching…' : 'Search timetables'}</Button>
        </form>
      </Card>

      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>}
      {journeys && journeys.length > 0 && names && (
        <section aria-label="Results" className="space-y-3">
          <h2 className="text-sm font-semibold">{names.from} → {names.to}</h2>
          <ol className="space-y-3">
            {journeys.map((j) => (
              <li key={j.start + j.end} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-lg font-semibold">{fmtTime(j.start)} → {fmtTime(j.end)}</p>
                  <p className="text-sm text-ink-soft">{fmtDuration(j.minutes)} · {j.transfers === 0 ? 'direct' : `${j.transfers} change${j.transfers === 1 ? '' : 's'}`}</p>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {j.legs.filter((l) => l.mode !== 'WALK').map((l, i) => (
                    <li key={i} className="text-ink-soft">
                      <span className="font-medium text-ink">{modeLabel(l.mode)}{l.line ? ` ${l.line}` : ''}</span> {fmtTime(l.start)} {l.from} → {fmtTime(l.end)} {l.to}
                      {l.agency ? ` · ${l.agency}` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-soft">Times come from open timetable data (Transitous) and are shown in your device’s time zone. Check them with the train company before you travel.</p>
        </section>
      )}

      {ready ? (
        <Card className="space-y-5 p-5">
          <section aria-labelledby="tr-book">
            <h2 id="tr-book" className="text-sm font-semibold">Prices and tickets</h2>
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
      ) : null}

      <p className="text-xs text-ink-soft">
        We cannot sell or issue train tickets inside this app. Tickets are bought from the train company or its booking partner.
        For a visa application, save the confirmation in Documents, or add it to Booking history.
      </p>
    </div>
  )
}
