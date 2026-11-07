import type { LatLng } from './geo'
import type { Poi } from './poi'

/**
 * Real places anywhere in the world from OpenStreetMap via the free Overpass API (no key, no account).
 * Only called after an explicit user action; results are cached for the browser session so repeat visits cost nothing.
 */
// Public mirrors of the same free service; the next one is tried when one is busy or slow.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

export function buildQuery(c: LatLng, radiusM: number) {
  const a = `(around:${Math.round(radiusM)},${c.lat.toFixed(5)},${c.lng.toFixed(5)})`
  return `[out:json][timeout:25];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium)$"]["name"]${a};
  nwr["historic"~"^(monument|castle|fort|palace|ruins|memorial|archaeological_site|city_gate)$"]["name"]${a};
)->.s;
(
  nwr["leisure"~"^(park|garden)$"]["name"]${a};
)->.p;
(
  nwr["amenity"~"^(restaurant|marketplace)$"]["name"]${a};
)->.f;
.s out center 90;
.p out center 25;
.f out center 30;`
}

interface Element {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export function parsePlaces(json: unknown): Poi[] {
  const elements = (json as { elements?: Element[] })?.elements
  if (!Array.isArray(elements)) return []
  const seen = new Set<string>()
  const out: (Poi & { rank: number })[] = []
  for (const e of elements) {
    const t = e.tags ?? {}
    const title = (t['name:en'] ?? t.name ?? '').trim()
    const lat = e.lat ?? e.center?.lat
    const lng = e.lon ?? e.center?.lon
    if (!title || lat === undefined || lng === undefined) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const category = t.amenity ? 'food' : t.leisure ? 'park' : 'sight'
    const kindText = t.tourism ?? t.historic ?? t.leisure ?? t.amenity ?? 'place'
    out.push({
      id: `osm-${e.type}-${e.id}`,
      kind: 'attraction',
      category,
      title,
      detail: `${kindText.replace(/_/g, ' ')} (OpenStreetMap)`,
      lat,
      lng,
      rank: (t.wikipedia || t.wikidata ? 2 : 0) + (t.website || t['contact:website'] ? 1 : 0),
    })
  }
  return out.sort((a, b) => b.rank - a.rank).map(({ rank: _rank, ...p }) => p)
}

export async function fetchPlaces(center: LatLng, radiusM = 5000, signal?: AbortSignal): Promise<Poi[]> {
  const key = `overpass:${center.lat.toFixed(2)},${center.lng.toFixed(2)}:${radiusM}`
  try {
    const cached = sessionStorage.getItem(key)
    if (cached) return JSON.parse(cached) as Poi[]
  } catch {
    /* storage unavailable */
  }
  const body = `data=${encodeURIComponent(buildQuery(center, radiusM))}`
  let places: Poi[] | null = null
  let lastError = 'Places service is busy'
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
      })
      if (!res.ok) {
        lastError = `Places service is busy (${res.status})`
        continue
      }
      places = parsePlaces(await res.json())
      break
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = 'Places service did not respond'
    }
  }
  if (!places) {
    // Backup source: Wikipedia articles near the point (free, no key, very reliable), filtered down to visitable landmarks.
    try {
      places = await fetchWikipediaPlaces(center, signal)
    } catch {
      /* fall through to the error below */
    }
    if (!places?.length) throw new Error(lastError)
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(places))
  } catch {
    /* ignore */
  }
  return places
}

const WIKI_KEEP = /(palace|castle|fort|fortress|tower|museum|gallery|cathedral|church|basilica|monastery|mosque|temple|shrine|synagogue|square|plaza|piazza|park|garden|bridge|gate|arch|monument|memorial|market|bazaar|souk|citadel|ruins|theatre|theater|opera|aquarium|zoo|palacio|castelo|torre|museu|igreja|jardim|praça|ponte|mosquée|musée|tour|château|jardin|pont|place|teatro|parque|convent|mosteiro|monastery|avenida)/i
const WIKI_DROP = /(station|hospital|university|school|college|embassy|list of|ministry|bank|club|derailment|academy|stadium|company|district|parish|municipality|taifa|airport|prison|barracks|court|police)/i

export function parseWikipediaPlaces(json: unknown): Poi[] {
  const rows = (json as { query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number }[] } })?.query?.geosearch
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r) => r.title && WIKI_KEEP.test(r.title) && !WIKI_DROP.test(r.title))
    .map((r) => ({
      id: `wiki-${r.pageid}`,
      kind: 'attraction' as const,
      category: /park|garden|jardim|jardin/i.test(r.title) ? ('park' as const) : ('sight' as const),
      title: r.title.replace(/\s*\([^)]*\)$/, ''),
      detail: 'Landmark (Wikipedia)',
      lat: r.lat,
      lng: r.lon,
    }))
}

async function fetchWikipediaPlaces(center: LatLng, signal?: AbortSignal): Promise<Poi[]> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*' +
    `&gscoord=${center.lat}%7C${center.lng}&gsradius=8000&gslimit=300`
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error('Wikipedia unavailable')
  return parseWikipediaPlaces(await res.json())
}
