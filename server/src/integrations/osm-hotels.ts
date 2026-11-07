import { env } from '../config/env.ts'
import { HttpError } from '../middleware/security.ts'

/**
 * A directory of REAL accommodation from OpenStreetMap (via the Overpass API): names, types, addresses, star ratings
 * and websites where mappers recorded them. It contains NO prices, availability or reviews: those come only from
 * booking partners, so every listing links out to check prices instead of inventing any.
 *
 * Overpass etiquette: the public server is for light use. Requests are cached for hours, identify this app in the
 * User-Agent, and are made only on explicit user searches. Commercial or heavy use should point OVERPASS_URL at a
 * self-hosted or paid Overpass instance. Data (c) OpenStreetMap contributors, ODbL.
 */

export type StayKind = 'hotel' | 'hostel' | 'guesthouse' | 'motel' | 'apartment' | 'chalet'

export interface HotelListing {
  id: string // "node/123"
  name: string
  kind: StayKind
  stars: number | null
  lat: number
  lng: number
  distanceKm: number
  address: string
  website: string | null
  phone: string | null
  wifi: boolean | null
  wheelchair: 'yes' | 'limited' | 'no' | null
  osmUrl: string
}

const TOURISM_TO_KIND: Record<string, StayKind> = {
  hotel: 'hotel', hostel: 'hostel', guest_house: 'guesthouse', motel: 'motel', apartment: 'apartment', chalet: 'chalet',
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export function buildQuery(lat: number, lng: number, radiusM: number): string {
  const kinds = Object.keys(TOURISM_TO_KIND).join('|')
  return `[out:json][timeout:20];nwr["tourism"~"^(${kinds})$"]["name"](around:${Math.round(radiusM)},${lat},${lng});out center 300;`
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Only http(s) URLs are ever passed to the browser as links. */
export function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null
  // An explicit scheme must be http(s); a bare "example.com" gets https. Never rewrite other schemes into https URLs.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null
  const candidate = hasScheme ? raw : `https://${raw}`
  try {
    const u = new URL(candidate)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

function address(t: Record<string, string>): string {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
  return [street, t['addr:suburb'], t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ')
}

export function parseOverpass(json: unknown, center: { lat: number; lng: number }, limit = 300): HotelListing[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements
  if (!Array.isArray(elements)) throw new HttpError(502, 'Unexpected response from the hotel directory')
  const out: HotelListing[] = []
  for (const el of elements) {
    const t = el.tags ?? {}
    const kind = TOURISM_TO_KIND[t.tourism ?? '']
    const name = t.name?.trim()
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!kind || !name || typeof lat !== 'number' || typeof lng !== 'number') continue
    const stars = Number.parseFloat(t.stars ?? '')
    const wifi = t.internet_access === 'wlan' || t.internet_access === 'yes' ? true : t.internet_access === 'no' ? false : null
    out.push({
      id: `${el.type}/${el.id}`,
      name: name.slice(0, 120),
      kind,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? Math.round(stars * 2) / 2 : null,
      lat, lng,
      distanceKm: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
      address: address(t).slice(0, 200),
      website: safeUrl(t.website ?? t['contact:website']),
      phone: (t.phone ?? t['contact:phone'] ?? '').slice(0, 40) || null,
      wifi,
      wheelchair: t.wheelchair === 'yes' || t.wheelchair === 'limited' || t.wheelchair === 'no' ? t.wheelchair : null,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    })
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit)
}

const FALLBACK_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const USER_AGENT = 'TripPilot/0.1 (travel planning app; hotel directory)'

// In-memory cache (per server instance): popular cities are fetched once every few hours, not on every search.
const TTL_MS = 6 * 60 * 60 * 1000
const MAX_ENTRIES = 200
const cache = new Map<string, { at: number; listings: HotelListing[] }>()
export const clearDirectoryCache = () => cache.clear()

class OverpassFailure extends Error {
  status: number
  constructor(status: number) {
    super(`Overpass failed (${status})`)
    this.status = status
  }
}

/** All Overpass servers are asked at once and the first good answer wins, so one busy server never slows the search. */
async function fromOverpass(lat: number, lng: number, radiusM: number): Promise<HotelListing[]> {
  const body = new URLSearchParams({ data: buildQuery(lat, lng, radiusM) })
  const servers = [env.overpassUrl, ...FALLBACK_SERVERS.filter((u) => u !== env.overpassUrl)]
  let failure = 0
  const res = await Promise.any(
    servers.map(async (url) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body,
          signal: AbortSignal.timeout(9_000),
        })
        if (!r.ok) {
          failure ||= r.status
          console.warn(`[hotels] Overpass ${new URL(url).host} answered ${r.status}`)
          throw new Error(String(r.status))
        }
        return r
      } catch (e) {
        if (!failure) console.warn(`[hotels] Overpass ${new URL(url).host} did not respond`)
        throw e
      }
    }),
  ).catch(() => {
    throw new OverpassFailure(failure)
  })
  return parseOverpass(await res.json().catch(() => null), { lat, lng })
}

interface NominatimHit {
  osm_type?: string
  osm_id?: number
  name?: string
  lat?: string
  lon?: string
  category?: string
  type?: string
  address?: Record<string, string>
  extratags?: Record<string, string>
}

export function parseNominatim(json: unknown, center: { lat: number; lng: number }): HotelListing[] {
  if (!Array.isArray(json)) return []
  const out: HotelListing[] = []
  for (const h of json as NominatimHit[]) {
    const kind = h.category === 'tourism' ? TOURISM_TO_KIND[h.type ?? ''] : undefined
    const name = h.name?.trim()
    const lat = Number(h.lat)
    const lng = Number(h.lon)
    if (!kind || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !h.osm_type || !h.osm_id) continue
    const t = h.extratags ?? {}
    const a = h.address ?? {}
    const stars = Number.parseFloat(t.stars ?? '')
    const street = [a.house_number, a.road].filter(Boolean).join(' ')
    out.push({
      id: `${h.osm_type}/${h.osm_id}`,
      name: name.slice(0, 120),
      kind,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? Math.round(stars * 2) / 2 : null,
      lat, lng,
      distanceKm: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
      address: [street, a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village, a.postcode].filter(Boolean).join(', ').slice(0, 200),
      website: safeUrl(t.website ?? t['contact:website']),
      phone: (t.phone ?? t['contact:phone'] ?? '').slice(0, 40) || null,
      wifi: t.internet_access === 'wlan' || t.internet_access === 'yes' ? true : t.internet_access === 'no' ? false : null,
      wheelchair: t.wheelchair === 'yes' || t.wheelchair === 'limited' || t.wheelchair === 'no' ? t.wheelchair : null,
      osmUrl: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`,
    })
  }
  return out
}

/**
 * Second free source: Nominatim (OpenStreetMap's own search). Reliable even when Overpass is overloaded, but capped at 40 results per
 * query, so a few kinds of stay are searched one after another (its policy allows about one request per second).
 */
async function fromNominatim(lat: number, lng: number, radiusM: number): Promise<HotelListing[]> {
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(',')
  const found: HotelListing[] = []
  let ok = false
  for (const [i, q] of ['hotel', 'guest house', 'hostel'].entries()) {
    if (i > 0 && !env.isTest) await new Promise((r) => setTimeout(r, 1100))
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&addressdetails=1&extratags=1&accept-language=en&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
      if (!r.ok) continue
      ok = true
      found.push(...parseNominatim(await r.json().catch(() => null), { lat, lng }))
    } catch {
      /* try the next kind */
    }
  }
  if (!ok) throw new Error('Nominatim unavailable')
  return found
}

export async function fetchDirectory(lat: number, lng: number, radiusM: number): Promise<{ listings: HotelListing[]; cached: boolean }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${radiusM}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return { listings: hit.listings, cached: true }

  // Both free sources run at once and their results are merged (same OpenStreetMap ids are de-duplicated).
  const [overpass, nominatim] = await Promise.allSettled([fromOverpass(lat, lng, radiusM), fromNominatim(lat, lng, radiusM)])
  if (overpass.status === 'rejected' && nominatim.status === 'rejected') {
    const failure = overpass.reason instanceof OverpassFailure ? overpass.reason.status : 0
    if (failure === 0) throw new HttpError(502, 'The hotel directory did not respond. Try again in a minute.')
    if (failure === 429 || failure === 504) throw new HttpError(503, 'The hotel directory is busy. Try again in a minute.')
    throw new HttpError(502, 'The hotel directory returned an error.')
  }
  const merged = new Map<string, HotelListing>()
  for (const r of [overpass, nominatim]) if (r.status === 'fulfilled') for (const l of r.value) if (!merged.has(l.id)) merged.set(l.id, l)
  const listings = [...merged.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 300)
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), listings })
  return { listings, cached: false }
}
