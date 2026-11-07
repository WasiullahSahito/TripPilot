import { airports } from '@/services/travel/reference'
import type { LatLng } from './geo'
import { geocode } from './osm'

export interface Destination {
  /** Short name, e.g. "Lisbon" or "Lisbon, Portugal". */
  name: string
  center: LatLng
}

/** Nominatim place types that are too large to plan a day in (a whole country or region). */
const BROAD = new Set(['country', 'state', 'region', 'province', 'county', 'state_district'])

export interface ResolveResult {
  destination?: Destination
  /** Shown when a search resolved to a whole country/region, or found nothing. */
  message?: string
  /** Known cities in the searched country, offered as one-tap choices. */
  suggestions?: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Any city, place or country the person types. Cities we already know resolve instantly with no network call. */
export async function resolveDestination(query: string, signal?: AbortSignal): Promise<ResolveResult> {
  const q = norm(query)
  if (!q) return { message: 'Type a city or place.' }
  const city = airports.find((a) => norm(a.city) === q)
  if (city) return { destination: { name: `${city.city}, ${city.country}`, center: { lat: city.lat, lng: city.lng } } }
  const country = airports.filter((a) => norm(a.country) === q)
  if (country.length) {
    return { message: `${country[0]!.country} is a whole country. Choose a city to plan around:`, suggestions: country.map((a) => a.city) }
  }
  const hit = await geocode(query.trim(), signal)
  if (!hit) return { message: 'No results found. Check the spelling or try a larger nearby city.' }
  const short = hit.label.split(',').map((p) => p.trim()).filter(Boolean)
  if (hit.type && BROAD.has(hit.type)) {
    return { message: `"${query.trim()}" is a country or region. Type a city in it, for example its capital.` }
  }
  const name = short.length > 2 ? `${short[0]}, ${short[short.length - 1]}` : hit.label
  return { destination: { name, center: { lat: hit.lat, lng: hit.lng } } }
}
