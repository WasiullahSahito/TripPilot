import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { AffiliateDisclosure, PartnerLink } from '@/features/affiliate/partner-links'
import { mapCities } from '@/features/maps/poi'
import { generateItinerary, planToText, type Pace, type PlanDay } from '@/features/planner/planner'
import { useAuth } from '@/features/auth/auth-context'

const INTERESTS = ['Culture', 'Food', 'Nature', 'Beaches', 'Cities', 'Adventure', 'Family']

function Planner() {
  const { profile } = useAuth()
  const [city, setCity] = useState(mapCities[0]!)
  const [days, setDays] = useState(3)
  const [pace, setPace] = useState<Pace>('balanced')
  const [interests, setInterests] = useState<string[]>(profile?.interests.filter((i) => INTERESTS.includes(i)) ?? [])
  const [plan, setPlan] = useState<PlanDay[] | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Trip planner</h2>
      <p className="mt-1 text-sm text-ink-soft">
        A simple rule-based planner (not an AI model): it orders well-known landmarks by proximity and fills gaps with suggestions that match your interests.
        It does not check opening hours, tickets or travel times.
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => { e.preventDefault(); setPlan(generateItinerary({ city, days, pace, interests })); setCopied(false) }}
      >
        <Field label="Destination" htmlFor="pl-city"><Select id="pl-city" value={city} onChange={(e) => setCity(e.target.value)}>{mapCities.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Days (1–14)" htmlFor="pl-days"><Input id="pl-days" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} /></Field>
        <Field label="Pace" htmlFor="pl-pace">
          <Select id="pl-pace" value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
            <option value="relaxed">Relaxed (1 per day)</option><option value="balanced">Balanced (2 per day)</option><option value="packed">Packed (3 per day)</option>
          </Select>
        </Field>
        <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-3">
          <legend className="mb-1 text-xs font-medium text-ink-soft">Interests</legend>
          {INTERESTS.map((i) => (
            <label key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={interests.includes(i)} onChange={(e) => setInterests((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))} />{i}
            </label>
          ))}
        </fieldset>
        <div className="sm:col-span-3"><Button type="submit" variant="accent">Generate itinerary</Button></div>
      </form>

      {plan && (
        <div className="mt-6 space-y-4">
          <ol className="space-y-3">
            {plan.map((d) => (
              <li key={d.day} className="rounded-xl border border-line p-4">
                <h3 className="text-sm font-semibold">Day {d.day}</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {d.items.map((i) => (
                    <li key={i.slot}>
                      <span className="inline-block w-24 text-xs text-ink-soft">{i.slot}</span>{i.title}
                      {i.kind === 'suggestion' && <span className="ml-2 text-xs text-ink-soft">(suggestion)</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(planToText(city, plan)).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy as text'}</Button>
        </div>
      )}
    </Card>
  )
}

function Partners() {
  const [city, setCity] = useState('')
  const c = city.trim()
  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-semibold">Activities, eSIMs, cars and compensation</h2>
        <p className="mt-1 text-sm text-ink-soft">These open our partners’ own sites. We do not sell, book or process payments for any of them.</p>
      </div>
      <div className="max-w-xs"><Field label="City or destination (optional)" htmlFor="ex-city"><Input id="ex-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Paris" /></Field></div>

      <section aria-labelledby="ex-act"><h3 id="ex-act" className="text-sm font-semibold">Tours, tickets and museum entry</h3>
        <p className="mt-1 text-xs text-ink-soft">Compare experiences and skip-the-line tickets.</p>
        <div className="mt-2 flex flex-wrap gap-2"><PartnerLink id="viator" params={{ city: c }} /><PartnerLink id="getyourguide" params={{ city: c }} /></div></section>

      <section aria-labelledby="ex-esim"><h3 id="ex-esim" className="text-sm font-semibold">Travel eSIM</h3>
        <p className="mt-1 text-xs text-ink-soft">Mobile data without roaming fees. Check that your phone supports eSIM and is unlocked first.</p>
        <div className="mt-2"><PartnerLink id="airalo" params={{ city: c }} /></div></section>

      <section aria-labelledby="ex-car"><h3 id="ex-car" className="text-sm font-semibold">Car rental</h3>
        <p className="mt-1 text-xs text-ink-soft">Compare local and international rental companies.</p>
        <div className="mt-2"><PartnerLink id="discovercars" params={{ city: c }} /></div></section>

      <section aria-labelledby="ex-air"><h3 id="ex-air" className="text-sm font-semibold">Delayed or cancelled flight?</h3>
        <p className="mt-1 text-xs text-ink-soft">
          You may be owed compensation depending on the route, the airline and the rules that apply (for example EU/UK regulations). AirHelp files claims for you and
          typically keeps a share of any payout. We only link to them; we cannot assess or file a claim.
        </p>
        <div className="mt-2"><PartnerLink id="airhelp" params={{}} /></div></section>

      <AffiliateDisclosure />
    </Card>
  )
}

export default function ExtrasPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Trip extras</h1>
        <p className="mt-1 text-sm text-ink-soft">Plan your days and find tickets, data, cars and flight compensation.</p>
      </header>
      <Planner />
      <Partners />
    </div>
  )
}
