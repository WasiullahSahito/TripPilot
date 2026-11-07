/**
 * Free journey search from Transitous (https://transitous.org), an open, community-run public transport service built on
 * open timetable data. No key, no account, no cost. Coverage is best in Europe; many other countries are missing.
 * It shows timetables only: it cannot sell tickets.
 */
const BASE = 'https://api.transitous.org/api/v1'

export interface Place { name: string; lat: number; lon: number; country?: string }

export interface Leg {
  mode: string
  from: string
  to: string
  start: string
  end: string
  line?: string
  headsign?: string
  agency?: string
}

export interface Journey {
  start: string
  end: string
  minutes: number
  transfers: number
  tz?: string
  legs: Leg[]
}

export const MODE_LABEL: Record<string, string> = {
  WALK: 'Walk', RAIL: 'Train', HIGHSPEED_RAIL: 'High-speed train', LONG_DISTANCE: 'Intercity train', NIGHT_RAIL: 'Night train',
  REGIONAL_RAIL: 'Regional train', REGIONAL_FAST_RAIL: 'Regional train', SUBWAY: 'Metro', TRAM: 'Tram', BUS: 'Bus', COACH: 'Coach', FERRY: 'Ferry',
}
export const modeLabel = (m: string) => MODE_LABEL[m] ?? m.toLowerCase().replace(/_/g, ' ')

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))

export function parsePlaces(json: unknown): Place[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((r: { name?: string; lat?: unknown; lon?: unknown; country?: string }) => {
    const lat = num(r.lat)
    const lon = num(r.lon)
    return r.name && Number.isFinite(lat) && Number.isFinite(lon) ? [{ name: r.name, lat, lon, country: r.country }] : []
  })
}

interface RawLeg {
  mode?: string; startTime?: string; endTime?: string; routeShortName?: string; displayName?: string; headsign?: string; agencyName?: string
  from?: { name?: string }; to?: { name?: string }
}

export function parseJourneys(json: unknown): Journey[] {
  const its = (json as { itineraries?: { duration?: number; startTime?: string; endTime?: string; transfers?: number; legs?: RawLeg[] }[] })?.itineraries
  if (!Array.isArray(its)) return []
  return its.flatMap((it) => {
    if (!it.startTime || !it.endTime || !Array.isArray(it.legs)) return []
    const legs: Leg[] = it.legs.map((l) => ({
      mode: l.mode ?? 'TRANSIT',
      from: l.from?.name ?? '',
      to: l.to?.name ?? '',
      start: l.startTime ?? '',
      end: l.endTime ?? '',
      line: l.displayName || l.routeShortName,
      headsign: l.headsign,
      agency: l.agencyName,
    }))
    const minutes = it.duration && it.duration > 1000 ? Math.round(it.duration / 60) : Math.round(it.duration ?? (Date.parse(it.endTime) - Date.parse(it.startTime)) / 60000)
    return [{ start: it.startTime, end: it.endTime, minutes, transfers: it.transfers ?? Math.max(0, legs.filter((l) => l.mode !== 'WALK').length - 1), legs }]
  })
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Timetable service error (${res.status})`)
  return res.json()
}

/** Prefers stations (STOP) over generic places so "Lyon" resolves to a railway stop when one matches. */
export async function findPlace(text: string, signal?: AbortSignal): Promise<Place | null> {
  const hits = parsePlaces(await getJson(`${BASE}/geocode?text=${encodeURIComponent(text)}&language=en`, signal))
  return hits[0] ?? null
}

export async function planJourneys(from: Place, to: Place, when: Date, signal?: AbortSignal): Promise<Journey[]> {
  const q = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time: when.toISOString(),
    numItineraries: '6',
  })
  return parseJourneys(await getJson(`${BASE}/plan?${q}`, signal))
}

export function fmtTime(iso: string, tz?: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) })
}
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`)
