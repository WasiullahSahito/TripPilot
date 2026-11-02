/**
 * Stay22 map embed: live prices from many booking sites, earning commission through YOUR Stay22 affiliate id.
 * Parameters per https://dev.stay22.com/docs/maps/parameters (aid, address or lat/lng, checkin, checkout).
 * Guest-count parameters are intentionally omitted: their names were not confirmed.
 */
export interface Stay22Params {
  address?: string
  lat?: number
  lng?: number
  checkin?: string // YYYY-MM-DD
  checkout?: string
}

const AID = /^[A-Za-z0-9_-]{3,64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function buildStay22Embed(aid: string | undefined, p: Stay22Params): string | null {
  if (!aid || !AID.test(aid.trim())) return null
  const hasCoords = typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  if (!hasCoords && !p.address?.trim()) return null
  const q = new URLSearchParams({ aid: aid.trim() })
  if (hasCoords) {
    q.set('lat', String(p.lat))
    q.set('lng', String(p.lng))
  } else q.set('address', p.address!.trim())
  if (p.checkin && DATE.test(p.checkin)) q.set('checkin', p.checkin)
  if (p.checkout && DATE.test(p.checkout)) q.set('checkout', p.checkout)
  return `https://www.stay22.com/embed/gm?${q}`
}
