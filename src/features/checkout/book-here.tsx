import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { geocode } from '@/features/maps/osm'
import { airportLabel, airports, findAirport } from '@/services/travel/reference'
import { commerceApi, insuranceApi, type Capabilities, type InsuranceTripInput, type OfferDto, type OfferKind, type ReferralOfferDto } from './commerce-api'
import { InsuranceOffers } from './insurance-offers'
import { OfferList } from './offer-list'

const today = () => new Date().toISOString().slice(0, 10)

/** Renders nothing unless the server has both a payment provider and a booking provider for this kind. */
function useBookable(kind: OfferKind) {
  const [caps, setCaps] = useState<Capabilities | null>(null)
  useEffect(() => {
    let live = true
    commerceApi.capabilities().then((c) => live && setCaps(c)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  if (kind === 'insurance') return caps && caps.insuranceQuotes ? caps : null // sold on the insurer's page: no payment gateway needed
  const key = kind === 'flight' ? 'flights' : 'hotels'
  return caps && caps.payments && caps[key] ? caps : null
}

function Shell({ title, hint, caps, children }: { title: string; hint: string; caps: Capabilities; children: ReactNode }) {
  return (
    <Card className="space-y-4 border-accent-200 bg-accent-50/40 p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{hint} <Link className="underline" to={ROUTES.app.orders}>Your orders</Link></p>
        {caps.insuranceSandbox && title.startsWith('Compare') && <p role="note" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Insurance is in SANDBOX mode: these are sample prices from a fictional insurer, and purchase links are disabled.</p>}
        {Object.values(caps.modes).includes('test') &&<p role="note" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Payments are in TEST mode: no real money moves and no real bookings are made.</p>}
      </div>
      {children}
    </Card>
  )
}

/** Search form + results shared by the three kinds. */
function useSearch(kind: OfferKind) {
  const [offers, setOffers] = useState<OfferDto[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(build: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    setOffers(null)
    try {
      setOffers(await commerceApi.search(kind, await build()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }
  return { offers, busy, error, run }
}

function Results({ s }: { s: ReturnType<typeof useSearch> }) {
  return (
    <>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      {s.busy && <p role="status" className="text-sm text-ink-soft">Searching…</p>}
      {s.offers && <OfferList offers={s.offers} />}
    </>
  )
}

export function BookFlights() {
  const caps = useBookable('flight')
  const s = useSearch('flight')
  const [f, setF] = useState({ origin: '', destination: '', departDate: '', returnDate: '', adults: 1, children: 0, cabin: 'economy' })
  if (!caps) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void s.run(async () => {
      const o = findAirport(f.origin), d = findAirport(f.destination)
      if (!o || !d) throw new Error('Choose airports from the list')
      return { origin: o.code, destination: d.code, departDate: f.departDate, returnDate: f.returnDate || null, adults: Number(f.adults), children: Number(f.children), cabin: f.cabin }
    })
  }
  return (
    <Shell caps={caps} title="Book a flight here" hint="Live fares from an airline-ticketing provider. You pay once, here, and the ticket is issued for you.">
      <form onSubmit={submit} aria-label="Search bookable flights" className="grid gap-4 sm:grid-cols-3">
        <Field label="From" htmlFor="bf-from"><Input id="bf-from" list="book-airports" required value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} /></Field>
        <Field label="To" htmlFor="bf-to"><Input id="bf-to" list="book-airports" required value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} /></Field>
        <datalist id="book-airports">{airports.map((a) => <option key={a.code} value={airportLabel(a)} />)}</datalist>
        <Field label="Depart" htmlFor="bf-dep"><Input id="bf-dep" type="date" min={today()} required value={f.departDate} onChange={(e) => setF({ ...f, departDate: e.target.value })} /></Field>
        <Field label="Return (optional)" htmlFor="bf-ret"><Input id="bf-ret" type="date" min={f.departDate || today()} value={f.returnDate} onChange={(e) => setF({ ...f, returnDate: e.target.value })} /></Field>
        <Field label="Adults" htmlFor="bf-ad"><Input id="bf-ad" type="number" min={1} max={9} value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></Field>
        <Field label="Cabin" htmlFor="bf-cabin">
          <Select id="bf-cabin" value={f.cabin} onChange={(e) => setF({ ...f, cabin: e.target.value })}>
            <option value="economy">Economy</option><option value="premium">Premium economy</option><option value="business">Business</option><option value="first">First</option>
          </Select>
        </Field>
        <div className="sm:col-span-3"><Button type="submit" disabled={s.busy}>Search bookable flights</Button></div>
      </form>
      <Results s={s} />
    </Shell>
  )
}

export function BookStays() {
  const caps = useBookable('hotel')
  const s = useSearch('hotel')
  const [f, setF] = useState({ place: '', checkIn: '', checkOut: '', adults: 2 })
  if (!caps) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void s.run(async () => {
      const hit = await geocode(f.place)
      if (!hit) throw new Error('Could not find that place')
      return { lat: hit.lat, lon: hit.lng, checkIn: f.checkIn, checkOut: f.checkOut, adults: Number(f.adults) }
    })
  }
  return (
    <Shell caps={caps} title="Book a stay here" hint="Rooms with real prices and availability from a booking provider.">
      <form onSubmit={submit} aria-label="Search bookable stays" className="grid gap-4 sm:grid-cols-4">
        <Field label="Where" htmlFor="bs-place"><Input id="bs-place" required placeholder="City or area" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
        <Field label="Check-in" htmlFor="bs-in"><Input id="bs-in" type="date" min={today()} required value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} /></Field>
        <Field label="Check-out" htmlFor="bs-out"><Input id="bs-out" type="date" min={f.checkIn || today()} required value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} /></Field>
        <Field label="Guests" htmlFor="bs-g"><Input id="bs-g" type="number" min={1} max={6} value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-4"><Button type="submit" disabled={s.busy}>Search bookable stays</Button></div>
      </form>
      <Results s={s} />
    </Shell>
  )
}

export function BookInsurance() {
  const caps = useBookable('insurance')
  const [f, setF] = useState({ destination: '', residence: '', startDate: '', endDate: '', dobs: [''] })
  const [result, setResult] = useState<{ provider: string; sessionId: string; offers: ReferralOfferDto[]; trip: InsuranceTripInput } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!caps) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trip: InsuranceTripInput = {
      destination: f.destination.trim().toUpperCase(), residence: f.residence.trim().toUpperCase(), startDate: f.startDate, endDate: f.endDate,
      travellers: f.dobs.map((bornOn) => ({ bornOn })),
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await insuranceApi.quotes(trip)
      setResult({ provider: r.provider, sessionId: r.sessionId, offers: r.offers, trip })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell caps={caps} title="Compare travel insurance here" hint="Live quotes from insurers. You pick a plan here and complete the purchase on the insurer’s page. Check the destination authority’s insurance requirements before buying.">
      <form onSubmit={(e) => void submit(e)} aria-label="Insurance quotes" className="grid gap-4 sm:grid-cols-3">
        <Field label="Country you live in (2 letters)" htmlFor="bi-res"><Input id="bi-res" maxLength={2} required placeholder="PK" value={f.residence} onChange={(e) => setF({ ...f, residence: e.target.value })} /></Field>
        <Field label="Destination country (2 letters)" htmlFor="bi-dest"><Input id="bi-dest" maxLength={2} required placeholder="FR" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} /></Field>
        <Field label="Cover starts" htmlFor="bi-start"><Input id="bi-start" type="date" min={today()} required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Cover ends" htmlFor="bi-end"><Input id="bi-end" type="date" min={f.startDate || today()} required value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        {f.dobs.map((d, i) => (
          <Field key={i} label={`Traveller ${i + 1} date of birth`} htmlFor={`bi-dob${i}`}>
            <Input id={`bi-dob${i}`} type="date" required value={d} onChange={(e) => setF({ ...f, dobs: f.dobs.map((x, j) => (j === i ? e.target.value : x)) })} />
          </Field>
        ))}
        <div className="flex gap-3 sm:col-span-3">
          <Button type="submit" disabled={busy}>Get quotes</Button>
          <Button type="button" variant="outline" disabled={f.dobs.length >= 6} onClick={() => setF({ ...f, dobs: [...f.dobs, ''] })}>Add traveller</Button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {busy && <p role="status" className="text-sm text-ink-soft">Getting quotes…</p>}
      {result && <InsuranceOffers offers={result.offers} provider={result.provider} trip={result.trip} sessionId={result.sessionId} />}
    </Shell>
  )
}
