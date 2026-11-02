import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatMinor, insuranceApi, type InsuranceTripInput, type ReferralOfferDto } from './commerce-api'

/** Quotes priced by the insurer; the purchase itself happens on the insurer's own page. */
export function InsuranceOffers({ offers, provider, trip, sessionId }: { offers: ReferralOfferDto[]; provider: string; trip: InsuranceTripInput; sessionId: string }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function proceed(o: ReferralOfferDto) {
    setBusy(o.id)
    setError(null)
    try {
      window.open(await insuranceApi.link(trip, sessionId, o.id), '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the insurer')
    } finally {
      setBusy(null)
    }
  }

  if (offers.length === 0) return <Card className="p-5 text-sm text-ink-soft">No insurance plans were returned for this trip.</Card>
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ul className="space-y-3">
        {offers.map((o) => (
          <li key={o.id}>
            <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{o.insurer}: {o.name}</p>
                {o.plan && o.plan !== o.name && <p className="text-sm text-ink-soft">{o.plan}</p>}
                {o.included.length > 0 && <p className="mt-1 text-xs text-ink-soft">Includes: {o.included.join(' · ')}</p>}
                {o.excluded.length > 0 && <p className="mt-1 text-xs text-ink-soft">Not included: {o.excluded.join(' · ')}</p>}
                <p className="mt-2 flex flex-wrap gap-3 text-xs">
                  {o.summaryUrl && <a className="underline" href={o.summaryUrl} target="_blank" rel="noopener noreferrer">Product summary</a>}
                  {o.termsUrl && <a className="underline" href={o.termsUrl} target="_blank" rel="noopener noreferrer">Full terms</a>}
                </p>
                <Badge tone="accent" className="mt-2">Priced by {provider} · you pay on their page</Badge>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">{o.startingPrice ? 'from ' : ''}{formatMinor(o.amountMinor, o.currency)}</p>
                <Button variant="accent" size="sm" className="mt-2" disabled={busy !== null} onClick={() => void proceed(o)}>
                  {busy === o.id ? 'Opening…' : `Continue on ${provider}`}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft">The policy is sold and paid for by {provider} and the insurer, not by TripPilot. Read the terms before you buy.</p>
    </div>
  )
}
