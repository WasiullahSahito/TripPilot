import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, ChevronDown, Luggage, Plane } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { flightProvider, type FlightLeg, type FlightOffer, type FlightSearchParams, type FlightSearchResult } from '@/services/flights'
import { PartnerRow } from '@/features/affiliate/partner-links'
import { airportLabel, airports, findAirport } from '@/services/travel/reference'
import { cheapestFare, filterFlights, formatDuration, sortFlights, timeOf, type FlightSort } from './filter'

const today = () => new Date().toISOString().slice(0, 10)

const schema = z
  .object({
    tripType: z.enum(['round', 'one']),
    origin: z.string().refine((v) => !!findAirport(v), 'Choose an airport from the list'),
    destination: z.string().refine((v) => !!findAirport(v), 'Choose an airport from the list'),
    departDate: z.string().min(1, 'Choose a date').refine((v) => v >= today(), 'Date is in the past'),
    returnDate: z.string(),
    adults: z.coerce.number().int().min(1, 'At least 1 adult').max(9),
    children: z.coerce.number().int().min(0).max(8),
    cabin: z.enum(['economy', 'premium', 'business', 'first']),
  })
  .superRefine((v, ctx) => {
    if (findAirport(v.origin) && findAirport(v.origin) === findAirport(v.destination)) {
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Origin and destination must differ' })
    }
    if (v.tripType === 'round' && (!v.returnDate || v.returnDate < v.departDate)) {
      ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'Choose a return on or after departure' })
    }
  })
type FormValues = z.input<typeof schema>

const yesNo = (v: boolean | null, yes: string, no: string) => (v === null ? 'Check partner' : v ? yes : no)

function LegRow({ leg, label }: { leg: FlightLeg; label: string }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="w-16 text-xs text-ink-soft">{label}</span>
      <span className="font-medium">{timeOf(leg.departAt)}</span>
      <span className="flex flex-1 items-center gap-2 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        {formatDuration(leg.durationMin)} · {leg.stops === 0 ? 'Direct' : `${leg.stops} stop${leg.stops > 1 ? 's' : ''} (${leg.via.join(', ')})`}
        <span className="h-px flex-1 bg-line" />
      </span>
      <span className="font-medium">{timeOf(leg.arriveAt)}</span>
      <span className="hidden text-xs text-ink-soft sm:inline">{leg.from} → {leg.to}</span>
    </div>
  )
}

function OfferCard({
  offer, search,
}: {
  offer: FlightOffer; search: FlightSearchParams
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><Plane className="size-4 text-accent-600" aria-hidden />{offer.airline}</p>
          <LegRow leg={offer.outbound} label="Outbound" />
          {offer.inbound && <LegRow leg={offer.inbound} label="Return" />}
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-soft">from (total, {search.adults + search.children} pax)</p>
          <p className="text-xl font-semibold">${cheapestFare(offer)}</p>
          <Button variant="outline" size="sm" className="mt-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Compare fares<ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Fare options for {offer.airline}</caption>
            <thead className="text-xs text-ink-soft">
              <tr><th className="py-2">Fare</th><th>Cabin bag</th><th>Checked bag</th><th>Changes</th><th>Refund</th><th className="text-right">Price</th><th /></tr>
            </thead>
            <tbody>
              {offer.fares.map((f) => {
                return (
                  <tr key={f.id} className="border-t border-line">
                    <th scope="row" className="py-3 font-medium">{f.name}</th>
                    <td><Luggage className="mr-1 inline size-3.5" aria-hidden />{f.cabinBag}</td>
                    <td>{f.checkedBag}</td>
                    <td>{yesNo(f.changeable, 'Allowed', 'No')}</td>
                    <td>{yesNo(f.refundable, 'Yes', 'No')}</td>
                    <td className="text-right font-medium">${f.price}</td>
                    <td className="pl-3 text-right">
                      {offer.bookUrl ? (
                        <a href={offer.bookUrl} target="_blank" rel="sponsored noopener noreferrer" className="text-xs font-medium text-accent-700 underline">
                          Check fare<span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : <span className="text-xs text-ink-soft">Booking link unavailable</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function FlightsPage() {
  const [result, setResult] = useState<FlightSearchResult | null>(null)
  const [searched, setSearched] = useState<FlightSearchParams | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<FlightSort>('price')
  const [maxStops, setMaxStops] = useState<0 | 1 | 2>(2)
  const [airlines, setAirlines] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tripType: 'round', origin: '', destination: '', departDate: '', returnDate: '', adults: 1, children: 0, cabin: 'economy' },
  })
  const tripType = watch('tripType')

  const onSubmit = handleSubmit(async (raw) => {
    const v = schema.parse(raw)
    const params: FlightSearchParams = {
      origin: findAirport(v.origin)!.code, destination: findAirport(v.destination)!.code, departDate: v.departDate,
      returnDate: v.tripType === 'round' ? v.returnDate : null, adults: v.adults, children: v.children, cabin: v.cabin,
    }
    setLoading(true)
    setError(null)
    setSearched(params)
    setAirlines([])
    setMaxPrice(null)
    try {
      setResult(await flightProvider.search(params))
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  })

  const offers = result?.offers ?? []
  const shown = useMemo(() => sortFlights(filterFlights(offers, { maxStops, airlines, maxPrice }), sort), [offers, maxStops, airlines, maxPrice, sort])
  const allAirlines = [...new Set(offers.map((o) => o.airline))]
  const priceCeil = offers.length ? Math.max(...offers.map(cheapestFare)) : 0

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Flights</h1>
        <p className="mt-1 text-sm text-ink-soft">Search provider fare data. Confirm current price, availability and conditions with the airline or booking partner.</p>
      </header>

      <Card className="p-5">
        <form onSubmit={onSubmit} noValidate aria-label="Flight search" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset className="flex gap-4 text-sm sm:col-span-2 lg:col-span-4">
            <legend className="sr-only">Trip type</legend>
            <label className="flex items-center gap-2"><input type="radio" value="round" {...register('tripType')} />Round trip</label>
            <label className="flex items-center gap-2"><input type="radio" value="one" {...register('tripType')} />One way</label>
          </fieldset>
          <Field label="From" htmlFor="f-origin" error={errors.origin?.message}>
            <Input id="f-origin" list="airports" placeholder="City or code" aria-invalid={!!errors.origin} {...register('origin')} />
          </Field>
          <Field label="To" htmlFor="f-dest" error={errors.destination?.message}>
            <Input id="f-dest" list="airports" placeholder="City or code" aria-invalid={!!errors.destination} {...register('destination')} />
          </Field>
          <datalist id="airports">{airports.map((a) => <option key={a.code} value={airportLabel(a)} />)}</datalist>
          <Field label="Depart" htmlFor="f-depart" error={errors.departDate?.message}>
            <Input id="f-depart" type="date" min={today()} aria-invalid={!!errors.departDate} {...register('departDate')} />
          </Field>
          <Field label="Return" htmlFor="f-return" error={errors.returnDate?.message}>
            <Input id="f-return" type="date" disabled={tripType === 'one'} aria-invalid={!!errors.returnDate} {...register('returnDate')} />
          </Field>
          <Field label="Adults" htmlFor="f-adults" error={errors.adults?.message}>
            <Input id="f-adults" type="number" min={1} max={9} {...register('adults')} />
          </Field>
          <Field label="Children" htmlFor="f-children" error={errors.children?.message}>
            <Input id="f-children" type="number" min={0} max={8} {...register('children')} />
          </Field>
          <Field label="Cabin" htmlFor="f-cabin">
            <Select id="f-cabin" {...register('cabin')}>
              <option value="economy">Economy</option><option value="premium">Premium economy</option>
              <option value="business">Business</option><option value="first">First</option>
            </Select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="accent" className="w-full" disabled={loading}>{loading ? 'Searching…' : 'Search flights'}</Button></div>
        </form>
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {error && searched && (
        <PartnerRow
          title="Search airlines directly"
          ids={['skyscanner', 'wayaway', 'aviasales']}
          params={{ origin: searched.origin, destination: searched.destination, depart: searched.departDate, return: searched.returnDate ?? undefined, adults: searched.adults + searched.children }}
          handoff={{ kind: 'flight', title: `Flight ${searched.origin} to ${searched.destination}`, startDate: searched.departDate, endDate: searched.returnDate }}
        />
      )}
      {loading && <p role="status" className="text-sm text-ink-soft">Searching…</p>}

      {result && !loading && (
        <>
          <p role="note" className="rounded-xl border border-line bg-muted px-4 py-3 text-sm">
            <Badge tone="accent" className="mr-2">Provider data</Badge>
            {result.notice}
          </p>
          {searched && (
            <PartnerRow
              title="Compare real prices on partner sites"
              ids={['skyscanner', 'wayaway', 'aviasales']}
              params={{ origin: searched.origin, destination: searched.destination, depart: searched.departDate, return: searched.returnDate ?? undefined, adults: searched.adults + searched.children }}
                handoff={{ kind: 'flight', title: `Flight ${searched.origin} to ${searched.destination}`, startDate: searched.departDate, endDate: searched.returnDate }}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside aria-label="Filters" className="space-y-5 text-sm">
              <Field label="Sort by" htmlFor="f-sort">
                <Select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as FlightSort)}>
                  <option value="price">Price</option><option value="duration">Duration</option><option value="departure">Departure time</option>
                </Select>
              </Field>
              <Field label="Stops" htmlFor="f-stops">
                <Select id="f-stops" value={maxStops} onChange={(e) => setMaxStops(Number(e.target.value) as 0 | 1 | 2)}>
                  <option value={0}>Direct only</option><option value={1}>Up to 1 stop</option><option value={2}>Any</option>
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink-soft">Airlines</legend>
                {allAirlines.map((a) => (
                  <label key={a} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={airlines.includes(a)} onChange={(e) => setAirlines((s) => (e.target.checked ? [...s, a] : s.filter((x) => x !== a)))} />{a}
                  </label>
                ))}
              </fieldset>
              <Field label={`Max price: ${maxPrice === null ? 'any' : `$${maxPrice}`}`} htmlFor="f-price">
                <input id="f-price" type="range" min={0} max={priceCeil} value={maxPrice ?? priceCeil} onChange={(e) => setMaxPrice(Number(e.target.value) >= priceCeil ? null : Number(e.target.value))} />
              </Field>
            </aside>
            <section aria-label="Results" className="space-y-4">
              <p className="text-sm text-ink-soft" aria-live="polite">{shown.length} of {offers.length} options</p>
              {shown.length === 0 && <Card className="p-8 text-center text-sm text-ink-soft">No flights match these filters. Try relaxing them.</Card>}
              {searched && shown.map((o) => (
                <OfferCard key={o.id} offer={o} search={searched} />
              ))}
              <p className="flex items-center gap-1 text-xs text-ink-soft"><ArrowRight className="size-3" aria-hidden />Times are provider estimates and may not reflect local time zones. Verify details before booking.</p>
            </section>
          </div>
        </>
      )}
      {!result && !loading && !error && <Card className="p-10 text-center text-sm text-ink-soft">Enter a route and dates to see options.</Card>}
    </div>
  )
}
