import type { LatLng } from './geo'

/**
 * Free, keyless map services built on OpenStreetMap data:
 *  - Nominatim (geocoding): https://operations.osmfoundation.org/policies/nominatim/  (max ~1 request/second, no bulk use)
 *  - OSRM public demo server (routing): best-effort, no SLA; self-host or use a hosted router for production traffic.
 * Both are only called in response to an explicit user action, never in loops or on page load.
 */

export interface GeocodeHit extends LatLng {
  label: string
  /** Nominatim's place type, e.g. "country", "city", "suburb". */
  type?: string
}

export interface RouteResult {
  distanceKm: number
  durationMin: number
  line: LatLng[]
}

export function parseNominatim(json: unknown): GeocodeHit | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const hit = json[0] as { lat?: string; lon?: string; display_name?: string; addresstype?: string }
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, label: hit.display_name ?? 'Result', type: hit.addresstype }
}

export function parseOsrm(json: unknown): RouteResult | null {
  const r = (json as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] })?.routes?.[0]
  if (!r) return null
  return {
    distanceKm: Math.round((r.distance / 1000) * 10) / 10,
    durationMin: Math.round(r.duration / 60),
    // GeoJSON is [lng, lat]
    line: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  }
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  return parseNominatim(await res.json())
}

export async function drivingRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson'
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  return parseOsrm(await res.json())
}
