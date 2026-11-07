import { List, Map as MapIcon, Navigation, Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { formatKm, haversineKm, type LatLng } from './geo'
import { resolveDestination } from './destination'
import { fetchPlaces } from './overpass'
import { drivingRoute, type RouteResult } from './osm'
import { cityCenter, KIND_LABEL, mapCities, poisForCity, type Poi } from './poi'

// Leaflet is only fetched when this page renders the map.
const MapView = lazy(() => import('./map-view'))

export default function MapsPage() {
  const [city, setCity] = useState(mapCities[0]!)
  const [center, setCenter] = useState<LatLng>(() => cityCenter(mapCities[0]!))
  const [view, setView] = useState<'map' | 'list'>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [placeName, setPlaceName] = useState<string | null>(null)
  const [found, setFound] = useState<Poi[]>([])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routing, setRouting] = useState(false)
  const [routeMsg, setRouteMsg] = useState<string | null>(null)

  const curated = useMemo(() => poisForCity(city), [city])
  // Real places loaded for a searched destination replace the small curated list.
  const pois = found.length ? found : curated
  const selected = pois.find((p) => p.id === selectedId) ?? null
  const from = pois.find((p) => p.id === fromId)
  const to = pois.find((p) => p.id === toId)
  const pair = from && to && from.id !== to.id ? { from, to } : null

  // Fetch a road route only when the user has chosen two different places.
  useEffect(() => {
    setRoute(null)
    setRouteMsg(null)
    if (!pair) return
    const ctl = new AbortController()
    setRouting(true)
    drivingRoute(pair.from, pair.to, ctl.signal)
      .then((r) => (r ? setRoute(r) : setRouteMsg('No driving route found.')))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setRouteMsg(e instanceof Error ? `${e.message}. Showing straight-line distance only.` : 'Routing unavailable.')
      })
      .finally(() => !ctl.signal.aborted && setRouting(false))
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.from.id, pair?.to.id])

  const reset = () => {
    setSelectedId(null)
    setFromId('')
    setToId('')
    setSearchMsg(null)
    setSuggestions([])
  }

  const changeCity = (c: string) => {
    setCity(c)
    setCenter(cityCenter(c))
    setPlaceName(null)
    setFound([])
    reset()
  }

  const search = async (e?: React.FormEvent, text = query) => {
    e?.preventDefault()
    const q = text.trim()
    if (!q) return
    reset()
    setSearching(true)
    try {
      const r = await resolveDestination(q)
      if (!r.destination) {
        setSearchMsg(r.message ?? 'No results found.')
        setSuggestions(r.suggestions ?? [])
        return
      }
      const d = r.destination
      setCenter(d.center)
      setPlaceName(d.name)
      setFound([])
      setSearchMsg(`Showing ${d.name}. Loading real places…`)
      try {
        const places = await fetchPlaces(d.center)
        setFound(places)
        setSearchMsg(places.length ? `Showing ${d.name}: ${places.length} real places found nearby.` : `Showing ${d.name}. No named places were found nearby.`)
      } catch {
        setSearchMsg(`Showing ${d.name}. Places could not be loaded right now (free map service busy).`)
      }
    } catch {
      setSearchMsg('Search is unavailable right now. Try again in a moment.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Destination map</h1>
        <p className="mt-1 text-sm text-ink-soft">Free, open maps: OpenStreetMap data with Nominatim search and OSRM directions. No account or API key.</p>
      </header>

      <Card className="grid gap-4 p-4 sm:grid-cols-[200px_1fr]">
        <Field label="Destination" htmlFor="m-city">
          <Select id="m-city" value={placeName ? '' : city} onChange={(e) => changeCity(e.target.value)}>
            {placeName && <option value="" disabled>{placeName}</option>}
            {mapCities.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <form onSubmit={(e) => void search(e)} className="flex items-end gap-2" role="search" aria-label="Search the map">
          <div className="flex-1">
            <Field label="Search any place or city" htmlFor="m-search">
              <Input id="m-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Any city or place, e.g. Lisbon" />
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={searching}><Search className="size-4" aria-hidden />{searching ? 'Searching…' : 'Search'}</Button>
        </form>
        {searchMsg && <p role="status" className="text-sm text-ink-soft sm:col-span-2">{searchMsg}</p>}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {suggestions.map((c) => <Button key={c} size="sm" variant="outline" onClick={() => { setQuery(c); void search(undefined, c) }}>{c}</Button>)}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <div className="flex gap-1" role="group" aria-label="View">
          <Button variant={view === 'map' ? 'primary' : 'outline'} size="sm" aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon className="size-4" aria-hidden />Map</Button>
          <Button variant={view === 'list' ? 'primary' : 'outline'} size="sm" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" aria-hidden />List</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {view === 'map' ? (
            <Suspense fallback={<div role="status" className="grid aspect-[4/3] place-items-center rounded-2xl border border-line bg-muted text-sm text-ink-soft">Loading map…</div>}>
              <MapView center={center} pois={pois} selectedId={selectedId} onSelect={setSelectedId} routeLine={route?.line ?? null} />
            </Suspense>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {pois.length === 0 && <li className="p-6 text-center text-sm text-ink-soft">No places are listed here yet. Search any city above to load real places.</li>}
              {pois.map((p) => (
                <li key={p.id}>
                  <button className={cn('flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted', p.id === selectedId && 'bg-muted')} onClick={() => setSelectedId(p.id)}>
                    <span><span className="block text-sm font-medium">{p.title}</span><span className="text-xs text-ink-soft">{p.detail}</span></span>
                    <Badge>{KIND_LABEL[p.kind]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-soft">
            Places come from OpenStreetMap; the first few cities also have curated landmarks at approximate positions.
            Map data © OpenStreetMap contributors.
          </p>
        </div>

        <aside className="space-y-4" aria-label="Details and directions">
          <Card className="p-4" aria-live="polite">
            {selected ? (
              <>
                <Badge tone="accent">{KIND_LABEL[selected.kind]}</Badge>
                <h2 className="mt-2 font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{selected.detail}</p>
                <p className="mt-2 text-xs text-ink-soft">{formatKm(haversineKm(center, selected))} from map centre</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setFromId(selected.id)}>Directions from here</Button>
                  <Button size="sm" variant="outline" onClick={() => setToId(selected.id)}>To here</Button>
                </div>
              </>
            ) : <p className="text-sm text-ink-soft">Select a marker or list item to see details.</p>}
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Navigation className="size-4" aria-hidden />Directions</h2>
            <div className="mt-3 space-y-3">
              <Field label="From" htmlFor="m-from">
                <Select id="m-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  <option value="">Choose…</option>{pois.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              </Field>
              <Field label="To" htmlFor="m-to">
                <Select id="m-to" value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">Choose…</option>{pois.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-3 text-sm" role="status">
              {!pair && <p className="text-xs text-ink-soft">Pick two different places.</p>}
              {pair && routing && <p className="text-ink-soft">Finding route…</p>}
              {pair && route && <p>Driving: <strong>{formatKm(route.distanceKm)}</strong>, about <strong>{route.durationMin} min</strong></p>}
              {pair && !route && !routing && <p>Straight-line distance: <strong>{formatKm(haversineKm(pair.from, pair.to))}</strong></p>}
            </div>
            {routeMsg && <p role="alert" className="mt-2 text-xs text-red-700">{routeMsg}</p>}
          </Card>
        </aside>
      </div>
    </div>
  )
}
