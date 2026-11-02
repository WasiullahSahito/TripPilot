import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckoutPanel } from './checkout-panel'
import { formatMinor, type OfferDto } from './commerce-api'

const detailText = (o: OfferDto) =>
  Object.entries(o.details)
    .filter(([, v]) => v !== '' && v !== 'unknown')
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`)
    .join(' · ')

export function OfferList({ offers }: { offers: OfferDto[] }) {
  const [chosen, setChosen] = useState<OfferDto | null>(null)
  if (chosen) return <CheckoutPanel offer={chosen} onCancel={() => setChosen(null)} />
  if (offers.length === 0) return <Card className="p-5 text-sm text-ink-soft">No bookable offers were returned for this search.</Card>
  return (
    <ul className="space-y-3">
      {offers.map((o) => (
        <li key={o.id}>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{o.title}</p>
              {o.subtitle && <p className="text-sm text-ink-soft">{o.subtitle}</p>}
              <p className="mt-1 text-xs text-ink-soft">{detailText(o)}</p>
              <Badge tone="accent" className="mt-2">Bookable here · provider price</Badge>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold">{formatMinor(o.totalMinor, o.currency)}</p>
              <p className="text-xs text-ink-soft">total{o.feeMinor > 0 ? ', incl. service fee' : ''}</p>
              <Button variant="accent" size="sm" className="mt-2" onClick={() => setChosen(o)}>Book</Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
