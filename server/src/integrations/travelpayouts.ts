import { z } from 'zod'
import type { FlightOffer, FlightSearchParams, FlightSearchResult } from '../../../src/services/flights/types.ts'
import { HttpError } from '../middleware/security.ts'
import type { LiveProvider } from './providers.ts'

/**
 * Cheapest-fare data from the Travelpayouts / Aviasales Data API (free; needs a free API token from
 * travelpayouts.com). These are CACHED fares found by other users' searches in the last ~48 hours, not live
 * availability, so they are labelled as such and every offer links to the partner for the real price.
 *
 * NOTE: the response shape below follows the public documentation and has not been verified against the
 * live service from this codebase. Check it with a real token before relying on it.
 */

const ticket = z.object({
  origin: z.string(),
  destination: z.string(),
  price: z.number(),
  airline: z.string(),
  departure_at: z.string(),
  return_at: z.string().optional(),
  transfers: z.number().optional(),
  return_transfers: z.number().optional(),
  duration_to: z.number().optional(),
  duration_back: z.number().optional(),
  duration: z.number().optional(),
  link: z.string().optional(),
})
const response = z.object({ success: z.boolean().optional(), data: z.array(ticket) })

export const flightQuery = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(8),
  cabin: z.enum(['economy', 'premium', 'business', 'first']),
})

function addMinutes(local: string, min: number) {
  const t = Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10), +local.slice(11, 13), +local.slice(14, 16) + min)
  return new Date(t).toISOString().slice(0, 16)
}

export function parseTickets(json: unknown, q: FlightSearchParams, marker?: string): FlightSearchResult {
  const parsed = response.safeParse(json)
  if (!parsed.success) throw new HttpError(502, 'Unexpected response from the fare provider')
  const pax = q.adults + q.children
  const offers: FlightOffer[] = parsed.data.data.map((t, i) => {
    const out = t.departure_at.slice(0, 16)
    const outMin = t.duration_to ?? t.duration ?? 0
    const link = t.link && t.link.startsWith('/search/') ? `https://www.aviasales.com${t.link}` : undefined
    const bookUrl = link && marker ? `${link}${link.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}` : link
    return {
      id: `tp-${i}`,
      airline: `Airline ${t.airline}`,
      outbound: { from: t.origin, to: t.destination, departAt: out, arriveAt: addMinutes(out, outMin), durationMin: outMin, stops: t.transfers ?? 0, via: [] },
      inbound: t.return_at
        ? {
            from: t.destination, to: t.origin, departAt: t.return_at.slice(0, 16),
            arriveAt: addMinutes(t.return_at.slice(0, 16), t.duration_back ?? 0), durationMin: t.duration_back ?? 0,
            stops: t.return_transfers ?? 0, via: [],
          }
        : null,
      fares: [{
        id: 'cached', name: 'Cached fare', price: Math.round(t.price * pax), cabinBag: 'See partner site', checkedBag: 'See partner site',
        changeable: null, refundable: null,
      }],
      currency: 'USD',
      bookUrl,
    }
  })
  return {
    mode: 'live',
    offers,
    notice:
      'Cached lowest fares from the Travelpayouts/Aviasales network (found in the last ~48 hours), shown for economy per traveller x passengers. ' +
      'Real price, baggage rules and availability are confirmed on the partner site. Arrival times are estimated.',
  }
}

export function travelpayoutsFlights(token: string, marker?: string): LiveProvider<unknown, FlightSearchResult> {
  return {
    name: 'travelpayouts',
    async search(raw) {
      const q = flightQuery.parse(raw)
      const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates')
      url.search = new URLSearchParams({
        origin: q.origin, destination: q.destination, departure_at: q.departDate, ...(q.returnDate ? { return_at: q.returnDate } : {}),
        one_way: q.returnDate ? 'false' : 'true', unique: 'false', sorting: 'price', direction: '1', cy: 'usd', limit: '30', token,
      }).toString()
      let res: Response
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
      } catch {
        throw new HttpError(502, 'The fare provider did not respond')
      }
      if (!res.ok) throw new HttpError(502, 'The fare provider returned an error')
      return parseTickets(await res.json().catch(() => null), q, marker)
    },
  }
}
