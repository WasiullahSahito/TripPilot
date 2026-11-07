import { BookStays } from '@/features/checkout/book-here'
import { zodResolver } from '@hookform/resolvers/zod'
import { Accessibility, Building2, ExternalLink, List, Map as MapIcon, MapPin, Star, Wifi } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { resolveDestination } from '@/features/maps/destination'
import { AffiliateDisclosure, PartnerLink } from '@/features/affiliate/partner-links'
import type { Poi } from '@/features/maps/poi'
import { searchDirectory, STAY_KIND_LABEL, type DirectoryResult, type HotelListing, type HotelSearchParams, type StayKind } from '@/services/hotels'
import { airports } from '@/services/travel/reference'
import { filterListings, sortListings, type ListingSort } from './filter'
import { buildStay22Embed } from './stay22'

// Leaflet is only fetched when the map view is opened.
const MapView = lazy(() => import('@/features/maps/map-view'))

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const cities = [...new Set(airports.map((a) => a.city))].sort((a, b) => a.localeCompare(b))
const KINDS = Object.keys(STAY_KIND_LABEL) as StayKind[]
const STAY22_AID = (import.meta.env.VITE_STAY22_AID as string | undefined)?.trim()

const schema = z
  .object({
    city: z.string().trim().min(2, 'Type a city, e.g. Dubai'),
    radiusKm: z.coerce.number().int().min(1).max(15),
    checkIn: z.string().min(1, 'Choose a date').refine((v) => v >= today(), 'Date is in the past'),
    checkOut: z.string().min(1, 'Choose a date'),
    guests: z.coerce.number().int().min(1).max(16),
    rooms: z.coerce.number().int().min(1).max(8),
  })
  .refine((v) => v.checkOut > v.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' })
  .refine((v) => v.guests >= v.rooms, { path: ['rooms'], message: 'Rooms cannot exceed guests' })
type FormValues = z.input<typeof schema>

function ListingCard({ hotel, search, selected, onSelect }: { hotel: HotelListing; search: HotelSearchParams; selected: boolean; onSelect(): void }) {
  const placeName = `${hotel.name}, ${search.city}`
  const handoff = { kind: 'hotel' as const, title: hotel.name, startDate: search.checkIn, endDate: search.checkOut }
  const linkParams = { city: placeName, checkin: search.checkIn, checkout: search.checkOut, adults: search.guests, rooms: search.rooms }
  return (
    <Card className={`p-4 ${selected ? 'ring-2 ring-accent-600' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{hotel.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <Badge>{STAY_KIND_LABEL[hotel.kind]}</Badge>
            {hotel.stars !== null && (
              <span className="inline-flex items-center"><Star className="mr-0.5 size-3.5 fill-amber-400 text-amber-400" aria-hidden />{hotel.stars}<span className="sr-only"> stars</span></span>
            )}
            <span className="inline-flex items-center"><MapPin className="mr-0.5 size-3.5" aria-hidden />{hotel.distanceKm} km from centre</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onSelect} aria-pressed={selected}>{selected ? 'Shown on map' : 'Show on map'}</Button>
      </div>
      {hotel.address && <p className="mt-2 text-sm text-ink-soft">{hotel.address}</p>}
      <ul className="mt-2 flex flex-wrap gap-2 text-xs text-ink-soft">
        {hotel.wifi && <li className="inline-flex items-center gap-1"><Wifi className="size-3.5" aria-hidden />Wi-Fi</li>}
        {hotel.wheelchair === 'yes' && <li className="inline-flex items-center gap-1"><Accessibility className="size-3.5" aria-hidden />Wheelchair accessible</li>}
        {hotel.phone && <li>{hotel.phone}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Check prices:</span>
        <PartnerLink id="booking" params={linkParams} handoff={handoff} />
        <PartnerLink id="agoda" params={linkParams} handoff={handoff} />
        {hotel.website && (
          <a href={hotel.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-accent-700 underline">
            Property website<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <a href={hotel.osmUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-soft underline">OpenStreetMap<span className="sr-only"> (opens in a new tab)</span></a>
      </div>
    </Card>
  )
}

export default function HotelsPage() {
  const [result, setResult] = useState<DirectoryResult | null>(null)
  const [searched, setSearched] = useState<(HotelSearchParams & { lat: number; lng: number; radiusKm: number }) | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [limit, setLimit] = useState(60)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<ListingSort>('distance')
  const [kinds, setKinds] = useState<StayKind[]>([])
  const [minStars, setMinStars] = useState(0)
  const [withWebsite, setWithWebsite] = useState(false)
  const [query, setQuery] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    // Set true on every mount: React StrictMode runs the cleanup once in development, which would otherwise leave it false.
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { city: '', checkIn: inDays(1), checkOut: inDays(4), guests: 2, rooms: 1, radiusKm: 5 },
  })

  const run = async (raw: FormValues) => {
    const v = schema.parse(raw)
    setLoading(true)
    setError(null)
    setSuggestions([])
    setSelectedId(null)
    setLimit(60)
    try {
      const r = await resolveDestination(v.city)
      if (!alive.current) return
      if (!r.destination) {
        setResult(null)
        setSearched(null)
        setError(r.message ?? 'Destination not found.')
        setSuggestions(r.suggestions ?? [])
        return
      }
      const { center, name } = r.destination
      const res = await searchDirectory(center.lat, center.lng, v.radiusKm * 1000)
      if (!alive.current) return
      setResult(res)
      setSearched({ ...v, city: name, lat: center.lat, lng: center.lng })
    } catch (e) {
      if (!alive.current) return
      setResult(null)
      setSearched(null)
      setError(e instanceof Error ? e.message : 'The hotel directory is unavailable')
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  const onSubmit = handleSubmit(run)

  const shown = useMemo(
    () => sortListings(filterListings(result?.listings ?? [], { kinds, minStars, withWebsite, query }), sort),
    [result, kinds, minStars, withWebsite, query, sort],
  )
  const pois: Poi[] = useMemo(
    () => shown.slice(0, 300).map((h) => ({ id: h.id, kind: 'hotel' as const, title: h.name, detail: `${STAY_KIND_LABEL[h.kind]}${h.stars ? `, ${h.stars} stars` : ''}`, lat: h.lat, lng: h.lng })),
    [shown],
  )
  const stay22 = searched ? buildStay22Embed(STAY22_AID, { lat: searched.lat, lng: searched.lng, checkin: searched.checkIn, checkout: searched.checkOut }) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Hotels</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Search any city to see real hotels, hostels and guest houses on the map, then check today’s prices on the booking sites.
        </p>
      </header>

      <BookStays />

      <Card className="p-5">
        <form onSubmit={onSubmit} noValidate aria-label="Hotel search" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Field label="Where are you going?" htmlFor="h-city" error={errors.city?.message}>
              <Input id="h-city" list="h-cities" placeholder="Any city, e.g. Dubai" autoComplete="off" aria-invalid={!!errors.city} {...register('city')} />
              <datalist id="h-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>
          <Field label="Check-in" htmlFor="h-in" error={errors.checkIn?.message}>
            <Input id="h-in" type="date" min={today()} aria-invalid={!!errors.checkIn} {...register('checkIn')} />
          </Field>
          <Field label="Check-out" htmlFor="h-out" error={errors.checkOut?.message}>
            <Input id="h-out" type="date" aria-invalid={!!errors.checkOut} {...register('checkOut')} />
          </Field>
          <Field label="Guests" htmlFor="h-guests" error={errors.guests?.message}>
            <Input id="h-guests" type="number" min={1} max={16} {...register('guests')} />
          </Field>
          <Field label="Rooms" htmlFor="h-rooms" error={errors.rooms?.message}>
            <Input id="h-rooms" type="number" min={1} max={8} {...register('rooms')} />
          </Field>
          <Field label="Search area" htmlFor="h-radius">
            <Select id="h-radius" {...register('radiusKm')}>
              <option value={3}>Within 3 km</option><option value={5}>Within 5 km</option><option value={10}>Within 10 km</option><option value={15}>Within 15 km</option>
            </Select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-5"><Button type="submit" variant="accent" className="w-full sm:w-auto" disabled={loading}>{loading ? 'Searching…' : 'Find hotels'}</Button></div>
        </form>
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((c) => <Button key={c} size="sm" variant="outline" onClick={() => { setValue('city', c); void run({ city: c, checkIn: inDays(1), checkOut: inDays(4), guests: 2, rooms: 1, radiusKm: 5 }) }}>{c}</Button>)}
        </div>
      )}
      {loading && <p role="status" className="text-sm text-ink-soft">Looking up places to stay…</p>}

      {result && searched && !loading && (
        <>
          <p role="note" className="rounded-xl border border-line bg-muted px-4 py-3 text-sm">
            <Badge tone="accent" className="mr-2">Real listings</Badge>
            {result.notice} Map data © {result.source}.
          </p>

          {STAY22_AID ? (
            stay22 && (
              <section aria-label="Live prices from booking sites" className="space-y-2">
                <h2 className="font-semibold">Live prices</h2>
                <iframe title="Live hotel prices from Stay22" src={stay22} className="h-[480px] w-full rounded-2xl border border-line" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                <AffiliateDisclosure />
              </section>
            )
          ) : (
            <p className="text-xs text-ink-soft">Prices change daily. Use the “Check prices” links on a hotel to see today’s rates with your dates.</p>
          )}

          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside aria-label="Filters" className="space-y-5 text-sm">
              <Field label="Search by name or street" htmlFor="h-q"><Input id="h-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
              <Field label="Sort by" htmlFor="h-sort">
                <Select id="h-sort" value={sort} onChange={(e) => setSort(e.target.value as ListingSort)}>
                  <option value="distance">Distance to centre</option><option value="name">Name</option><option value="stars">Stars</option>
                </Select>
              </Field>
              <Field label="Minimum stars" htmlFor="h-stars">
                <Select id="h-stars" value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
                  <option value={0}>Any</option><option value={3}>3+</option><option value={4}>4+</option><option value={5}>5</option>
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink-soft">Type</legend>
                {KINDS.map((k) => (
                  <label key={k} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))} />{STAY_KIND_LABEL[k]}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2"><input type="checkbox" checked={withWebsite} onChange={(e) => setWithWebsite(e.target.checked)} />Has a website</label>
              <p className="text-xs text-ink-soft">Star ratings come from OpenStreetMap contributors and are missing for many properties.</p>
            </aside>

            <section aria-label="Results" className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-soft" aria-live="polite">{shown.length} of {result.listings.length} places{result.cached ? ' (from a recent search)' : ''}</p>
                <div className="flex gap-1" role="group" aria-label="View">
                  <Button variant={view === 'list' ? 'primary' : 'outline'} size="sm" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" aria-hidden />List</Button>
                  <Button variant={view === 'map' ? 'primary' : 'outline'} size="sm" aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon className="size-4" aria-hidden />Map</Button>
                </div>
              </div>

              {view === 'map' && (
                <Suspense fallback={<div role="status" className="grid aspect-[4/3] place-items-center rounded-2xl border border-line bg-muted text-sm text-ink-soft">Loading map…</div>}>
                  <MapView center={{ lat: searched.lat, lng: searched.lng }} pois={pois} selectedId={selectedId} onSelect={setSelectedId} routeLine={null} />
                </Suspense>
              )}

              {result.listings.length === 0 && (
                <Card className="p-8 text-center text-sm text-ink-soft">
                  <Building2 className="mx-auto mb-2 size-6" aria-hidden />
                  No properties are mapped within {searched.radiusKm} km of {searched.city} in OpenStreetMap. Try a wider search area, or a booking partner’s search.
                </Card>
              )}
              {result.listings.length > 0 && shown.length === 0 && <Card className="p-8 text-center text-sm text-ink-soft">No places match these filters.</Card>}
              {shown.slice(0, limit).map((h) => (
                <ListingCard key={h.id} hotel={h} search={searched} selected={h.id === selectedId} onSelect={() => { setSelectedId(h.id); setView('map') }} />
              ))}
              {shown.length > limit && <Button variant="outline" onClick={() => setLimit((n) => n + 60)}>Show more ({shown.length - limit} left)</Button>}
              <AffiliateDisclosure />
            </section>
          </div>
        </>
      )}
      {!result && !loading && !error && <Card className="p-10 text-center text-sm text-ink-soft">Type a city and press “Find hotels”.</Card>}
    </div>
  )
}
