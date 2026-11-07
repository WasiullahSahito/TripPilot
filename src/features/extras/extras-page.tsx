import { useState } from 'react'
import PlannerCard from '@/features/planner/planner-card'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { AffiliateDisclosure, PartnerLink } from '@/features/affiliate/partner-links'

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
        <h1 className="text-2xl font-semibold">Tourist plan</h1>
        <p className="mt-1 text-sm text-ink-soft">Build a day-by-day plan for your trip, then find tickets, data and cars.</p>
      </header>
      <PlannerCard />
      <Partners />
    </div>
  )
}
