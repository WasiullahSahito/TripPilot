/**
 * Outbound partner links. Everything here is a plain link or a template the operator configures - there are
 * no hidden redirects and no data about the user is sent to partners beyond the search terms in the URL.
 *
 * To earn commission, set VITE_AFF_<PARTNER>_URL to the tracked link template from the partner's dashboard
 * (Travelpayouts, Agoda, Booking.com/Stay22, Viator, GetYourGuide, Airalo, AirHelp, Discover Cars, Ekta).
 * Placeholders: {origin} {destination} {depart} {return} {departYYMMDD} {returnYYMMDD} {adults}
 *               {city} {checkin} {checkout} {rooms}. Values are URL-encoded.
 * Without a template, a plain (untracked) public link is used.
 */

export type PartnerId =
  | 'skyscanner' | 'wayaway' | 'aviasales'
  | 'agoda' | 'booking' | 'stay22'
  | 'discovercars' | 'ekta'
  | 'viator' | 'getyourguide' | 'airalo' | 'airhelp'

export interface PartnerInfo {
  id: PartnerId
  name: string
  /** Plain public URL template used when no affiliate template is configured; null = needs an affiliate template. */
  fallback: string | null
}

export const partners: Record<PartnerId, PartnerInfo> = {
  skyscanner: { id: 'skyscanner', name: 'Skyscanner', fallback: 'https://www.skyscanner.net/transport/flights/{origin}/{destination}/{departYYMMDD}/{returnYYMMDD}/?adultsv2={adults}' },
  wayaway: { id: 'wayaway', name: 'WayAway', fallback: 'https://www.wayaway.io/' },
  aviasales: { id: 'aviasales', name: 'Aviasales', fallback: 'https://www.aviasales.com/' },
  agoda: { id: 'agoda', name: 'Agoda', fallback: 'https://www.agoda.com/' },
  booking: { id: 'booking', name: 'Booking.com', fallback: 'https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults={adults}&no_rooms={rooms}' },
  stay22: { id: 'stay22', name: 'Stay22', fallback: null },
  discovercars: { id: 'discovercars', name: 'Discover Cars', fallback: 'https://www.discovercars.com/' },
  ekta: { id: 'ekta', name: 'Ekta', fallback: 'https://ektatraveling.com/' },
  viator: { id: 'viator', name: 'Viator', fallback: 'https://www.viator.com/searchResults/all?text={city}' },
  getyourguide: { id: 'getyourguide', name: 'GetYourGuide', fallback: 'https://www.getyourguide.com/s/?q={city}' },
  airalo: { id: 'airalo', name: 'Airalo', fallback: 'https://www.airalo.com/' },
  airhelp: { id: 'airhelp', name: 'AirHelp', fallback: 'https://www.airhelp.com/en/' },
}

export interface LinkParams {
  origin?: string
  destination?: string
  depart?: string // YYYY-MM-DD
  return?: string
  adults?: number
  city?: string
  checkin?: string
  checkout?: string
  rooms?: number
}

export interface BuiltLink {
  url: string
  /** True when a configured affiliate template was used (such links must carry rel="sponsored"). */
  affiliate: boolean
}

const yymmdd = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10) : '')

export function fillTemplate(template: string, p: LinkParams): string {
  const values: Record<string, string> = {
    origin: (p.origin ?? '').toLowerCase(),
    destination: (p.destination ?? '').toLowerCase(),
    depart: p.depart ?? '',
    return: p.return ?? '',
    departYYMMDD: yymmdd(p.depart),
    returnYYMMDD: yymmdd(p.return),
    adults: String(p.adults ?? 1),
    city: p.city ?? '',
    checkin: p.checkin ?? '',
    checkout: p.checkout ?? '',
    rooms: String(p.rooms ?? 1),
  }
  return template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ''))
}

type EnvLike = Record<string, string | boolean | undefined>

export function buildLink(id: PartnerId, params: LinkParams, env: EnvLike = import.meta.env): BuiltLink | null {
  const configured = env[`VITE_AFF_${id.toUpperCase()}_URL`]
  const template = typeof configured === 'string' && configured.trim() ? configured.trim() : null
  const chosen = template ?? partners[id].fallback
  if (!chosen) return null
  let url = fillTemplate(chosen, params)
  // Only ever link out over https.
  if (!/^https:\/\//i.test(url)) return null
  // A one-way trip leaves an empty return segment in the Skyscanner path; drop it.
  url = url.replace(/\/\/\?/, '/?').replace(/([^:])\/\/+/g, '$1/')
  return { url, affiliate: template !== null }
}

export const AFFILIATE_DISCLOSURE =
  'Some links are affiliate links: we may earn a commission if you book through them, at no extra cost to you. Partners set their own prices and availability, and we do not guarantee any of them is the cheapest.'
