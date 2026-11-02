import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ROUTES } from '@/config/routes'
import { commerceApi, formatMinor, type OrderDto, type OrderStatus } from './commerce-api'

const STATUS: Record<OrderStatus, { label: string; tone: 'neutral' | 'warning' | 'accent' | 'danger'; help: string }> = {
  awaiting_payment: { label: 'Waiting for payment', tone: 'warning', help: 'Nothing is booked until the payment goes through.' },
  fulfilling: { label: 'Paid — booking with the provider', tone: 'warning', help: 'This usually takes a few seconds.' },
  fulfilled: { label: 'Booked', tone: 'accent', help: 'The provider confirmed this booking.' },
  refunded: { label: 'Refunded', tone: 'neutral', help: 'The booking could not be completed. Your payment was returned to your card.' },
  needs_attention: { label: 'Needs attention', tone: 'danger', help: 'Something went wrong after payment. Our team has been flagged to resolve it; keep this page for reference.' },
  expired: { label: 'Not completed', tone: 'neutral', help: 'The payment was not completed, so nothing was booked or charged.' },
}

const settled = (s: OrderStatus) => s !== 'awaiting_payment' && s !== 'fulfilling'

function OrderCard({ o }: { o: OrderDto }) {
  const st = STATUS[o.status]
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{o.title}</p>
          <p className="text-sm text-ink-soft">{o.startDate}{o.endDate ? ` → ${o.endDate}` : ''} · {formatMinor(o.amountMinor, o.currency)}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="text-sm text-ink-soft">{o.note ?? st.help}</p>
      {o.status === 'fulfilled' && (
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-soft">{o.kind === 'insurance' ? 'Policy number' : 'Booking reference'}</dt><dd className="font-mono text-base font-semibold">{o.reference}</dd></div>
          {o.kind === 'flight' && (
            <div>
              <dt className="text-xs text-ink-soft">E-ticket number(s)</dt>
              <dd className="font-mono">{o.tickets.length ? o.tickets.join(', ') : 'Not issued yet: the airline will email them to you.'}</dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  )
}

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    commerceApi.orders().then(setOrders).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load orders'))
  }, [])
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Your orders</h1>
        <p className="mt-2 text-sm text-ink-soft">Purchases made through TripPilot. Confirmed ones also appear in <Link className="underline" to={ROUTES.app.bookings}>Bookings</Link>.</p>
      </header>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {orders === null ? <p role="status" className="text-sm text-ink-soft">Loading…</p>
        : orders.length === 0 ? <Card className="p-6 text-sm text-ink-soft">No orders yet.</Card>
        : <ul className="space-y-3">{orders.map((o) => <li key={o.id}><Link to={`${ROUTES.app.orders}/${o.id}`} className="block"><OrderCard o={o} /></Link></li>)}</ul>}
    </div>
  )
}

/** Where Stripe sends the customer back to. Polls while the webhook is still being processed. */
export default function OrderPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [order, setOrder] = useState<OrderDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setOrder(await commerceApi.order(id!))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the order')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // After returning from payment the webhook may still be in flight: check again for up to two minutes.
  const waiting = params.get('paid') === '1' && !!order && !settled(order.status)
  useEffect(() => {
    if (!waiting) return
    const started = Date.now()
    const t = setInterval(() => {
      if (Date.now() - started > 120_000) clearInterval(t)
      else void load()
    }, 3000)
    return () => clearInterval(t)
  }, [waiting, load])

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Order</h1>
      {params.get('cancelled') === '1' && order?.status === 'awaiting_payment' && <p role="status" className="text-sm text-ink-soft">You left the payment page. Nothing has been charged or booked.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {order ? <OrderCard o={order} /> : !error && <p role="status" className="text-sm text-ink-soft">Loading…</p>}
      {waiting && <p role="status" className="text-sm text-ink-soft">Confirming with the provider… this page updates by itself.</p>}
      <div className="flex gap-3">
        <Button asChild variant="outline"><Link to={ROUTES.app.orders}>All orders</Link></Button>
        <Button asChild variant="outline"><Link to={ROUTES.app.bookings}>Bookings</Link></Button>
      </div>
    </div>
  )
}
