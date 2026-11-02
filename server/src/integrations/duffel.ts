import { z } from 'zod'
import { HttpError } from '../middleware/security.ts'
import { flightQuery } from './travelpayouts.ts'
import { fromMinor, toMinor, type CommerceProvider, type Customer, type Offer } from './commerce.ts'

/**
 * Duffel (https://duffel.com): bookable flight offers + issued orders, and Duffel Stays for hotels.
 * Duffel charges the order to YOUR Duffel balance; the customer pays you through Stripe first (see fulfilment.ts).
 *
 * NOTE: shapes follow Duffel's public API reference (version v2) and have been checked only against fixtures,
 * not a live account. Test with a `duffel_test_...` token first. Duffel Stays is access-gated by Duffel and its
 * booking payment step is the least certain part: see the marked comment in `fulfil` for hotels.
 */

const API = 'https://api.duffel.com'

async function duffel<T>(token: string, method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Duffel-Version': 'v2',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new HttpError(502, 'The booking provider did not respond')
  }
  const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: { code?: string; message?: string }[] } | null
  if (!res.ok) {
    const code = json?.errors?.[0]?.code
    console.error('Duffel error:', res.status, code ?? 'unknown', json?.errors?.[0]?.message ?? '')
    if (code === 'offer_no_longer_available' || res.status === 404) throw new HttpError(409, 'This offer is no longer available. Please search again.')
    throw new HttpError(502, 'The booking provider rejected the request')
  }
  return json?.data as T
}

// ---- flights --------------------------------------------------------------------------------------------------

const segment = z.object({
  origin: z.object({ iata_code: z.string() }),
  destination: z.object({ iata_code: z.string() }),
  departing_at: z.string(),
  arriving_at: z.string(),
})
const duffelOffer = z.object({
  id: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
  expires_at: z.string().nullable().optional(),
  owner: z.object({ name: z.string() }),
  passengers: z.array(z.object({ id: z.string(), type: z.string().nullable().optional() })),
  slices: z.array(z.object({ duration: z.string().nullable().optional(), segments: z.array(segment).min(1) })).min(1),
  conditions: z
    .object({
      refund_before_departure: z.object({ allowed: z.boolean() }).nullable().optional(),
      change_before_departure: z.object({ allowed: z.boolean() }).nullable().optional(),
    })
    .nullable()
    .optional(),
})
type DuffelOffer = z.infer<typeof duffelOffer>

export function mapFlightOffer(raw: unknown): Offer {
  const parsed = duffelOffer.safeParse(raw)
  if (!parsed.success) throw new HttpError(502, 'Unexpected response from the booking provider')
  const o: DuffelOffer = parsed.data
  const first = o.slices[0]!
  const last = o.slices[o.slices.length - 1]!
  const out = first.segments[0]!
  const outEnd = first.segments[first.segments.length - 1]!
  const roundTrip = o.slices.length > 1
  return {
    id: o.id,
    kind: 'flight',
    provider: 'duffel',
    title: `${o.owner.name}: ${out.origin.iata_code} → ${outEnd.destination.iata_code}${roundTrip ? ' (return)' : ''}`,
    subtitle: `${o.passengers.length} traveller${o.passengers.length > 1 ? 's' : ''}`,
    startDate: out.departing_at.slice(0, 10),
    endDate: roundTrip ? last.segments[0]!.departing_at.slice(0, 10) : null,
    providerMinor: toMinor(o.total_amount, o.total_currency),
    currency: o.total_currency.toUpperCase(),
    travellers: o.passengers.length,
    expiresAt: o.expires_at ?? null,
    details: {
      airline: o.owner.name,
      departs: out.departing_at.slice(0, 16),
      arrives: outEnd.arriving_at.slice(0, 16),
      stops: first.segments.length - 1,
      duration: first.duration ?? '',
      ...(roundTrip ? { returnDeparts: last.segments[0]!.departing_at.slice(0, 16), returnStops: last.segments.length - 1 } : {}),
      refundable: o.conditions?.refund_before_departure?.allowed ?? 'unknown',
      changeable: o.conditions?.change_before_departure?.allowed ?? 'unknown',
    } as Offer['details'],
    providerData: {},
  }
}

const CABIN = { economy: 'economy', premium: 'premium_economy', business: 'business', first: 'first' } as const
const TITLES = { mr: 'mr', ms: 'ms', mrs: 'mrs', miss: 'miss', mx: 'mx' } as const

export function duffelFlights(token: string): CommerceProvider {
  return {
    name: 'duffel',

    async search(raw) {
      const q = flightQuery.parse(raw)
      const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.departDate }]
      if (q.returnDate) slices.push({ origin: q.destination, destination: q.origin, departure_date: q.returnDate })
      const passengers = [
        ...Array.from({ length: q.adults }, () => ({ type: 'adult' })),
        ...Array.from({ length: q.children }, () => ({ type: 'child' })),
      ]
      const r = await duffel<{ offers?: unknown[] }>(token, 'POST', '/air/offer_requests?return_offers=true&supplier_timeout=15000', {
        slices, passengers, cabin_class: CABIN[q.cabin],
      })
      const offers: Offer[] = []
      for (const o of r.offers ?? []) {
        try {
          offers.push(mapFlightOffer(o))
        } catch {
          // One malformed offer must not hide the others.
        }
      }
      return offers.sort((a, b) => a.providerMinor - b.providerMinor).slice(0, 40)
    },

    async quote(offerId) {
      return mapFlightOffer(await duffel(token, 'GET', `/air/offers/${encodeURIComponent(offerId)}`))
    },

    async fulfil(offer, customer) {
      // Duffel needs its own passenger ids; they are in the offer, in the order the passengers were requested.
      const fresh = duffelOffer.parse(await duffel(token, 'GET', `/air/offers/${encodeURIComponent(offer.id)}`))
      if (fresh.passengers.length !== customer.travellers.length) throw new HttpError(400, 'Traveller count does not match the offer')
      if (toMinor(fresh.total_amount, fresh.total_currency) !== offer.providerMinor) throw new HttpError(409, 'The fare changed before ticketing')
      const order = await duffel<{ id: string; booking_reference?: string; documents?: { type: string; unique_identifier?: string }[] }>(
        token, 'POST', '/air/orders',
        {
          type: 'instant',
          selected_offers: [offer.id],
          payments: [{ type: 'balance', currency: fresh.total_currency, amount: fromMinor(offer.providerMinor, fresh.total_currency) }],
          passengers: customer.travellers.map((t, i) => ({
            id: fresh.passengers[i]!.id,
            title: TITLES[t.title],
            gender: t.gender,
            given_name: t.givenName,
            family_name: t.familyName,
            born_on: t.bornOn,
            email: customer.contact.email,
            phone_number: customer.contact.phone,
            ...(t.passport
              ? { identity_documents: [{ type: 'passport', unique_identifier: t.passport.number, issuing_country_code: t.passport.issuingCountry, expires_on: t.passport.expiresOn }] }
              : {}),
          })),
        },
        60_000,
      )
      if (!order.id || !order.booking_reference) throw new HttpError(502, 'The booking provider did not return a booking reference')
      const tickets = (order.documents ?? []).filter((d) => d.type === 'electronic_ticket' && d.unique_identifier).map((d) => d.unique_identifier!)
      return { providerOrderId: order.id, reference: order.booking_reference, tickets }
    },
  }
}

// ---- hotels (Duffel Stays) ---------------------------------------------------------------------------------------

export const hotelQuery = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(6),
  rooms: z.number().int().min(1).max(3).default(1),
  radiusKm: z.number().int().min(1).max(25).default(5),
})

const stayResult = z.object({
  id: z.string(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  cheapest_rate_total_amount: z.string().nullable().optional(),
  cheapest_rate_currency: z.string().nullable().optional(),
  accommodation: z.object({
    name: z.string(),
    rating: z.number().nullable().optional(),
    location: z.object({ address: z.object({ line_one: z.string().optional(), city_name: z.string().optional(), country_code: z.string().optional() }).optional() }).optional(),
  }),
})

export function mapStayResult(raw: unknown, adults: number): Offer | null {
  const p = stayResult.safeParse(raw)
  // A result without a price is not bookable: skip it rather than show an invented one.
  if (!p.success || !p.data.cheapest_rate_total_amount || !p.data.cheapest_rate_currency) return null
  const r = p.data
  const a = r.accommodation.location?.address
  return {
    id: r.id,
    kind: 'hotel',
    provider: 'duffel',
    title: r.accommodation.name,
    subtitle: [a?.line_one, a?.city_name, a?.country_code].filter(Boolean).join(', '),
    startDate: r.check_in_date,
    endDate: r.check_out_date,
    providerMinor: toMinor(r.cheapest_rate_total_amount!, r.cheapest_rate_currency!),
    currency: r.cheapest_rate_currency!.toUpperCase(),
    travellers: adults,
    expiresAt: null,
    details: { stars: r.accommodation.rating ?? 'unrated', checkIn: r.check_in_date, checkOut: r.check_out_date },
    providerData: {},
  }
}

export function duffelStays(token: string): CommerceProvider {
  // Cheapest rate for a search result, then a quote on it: the quote is the authoritative price.
  async function quoteFor(searchResultId: string) {
    const rates = await duffel<{ accommodation?: { name?: string; rooms?: { rates?: { id: string; total_amount: string; total_currency: string }[] }[] } }>(
      token, 'POST', `/stays/search_results/${encodeURIComponent(searchResultId)}/actions/fetch_all_rates`, undefined,
    )
    const all = (rates.accommodation?.rooms ?? []).flatMap((r) => r.rates ?? [])
    const cheapest = all.sort((a, b) => toMinor(a.total_amount, a.total_currency) - toMinor(b.total_amount, b.total_currency))[0]
    if (!cheapest) throw new HttpError(409, 'No rooms are available for these dates any more')
    const quote = await duffel<{ id: string; total_amount: string; total_currency: string; check_in_date: string; check_out_date: string; accommodation: { name: string } }>(
      token, 'POST', '/stays/quotes', { rate_id: cheapest.id },
    )
    return quote
  }

  return {
    name: 'duffel-stays',

    async search(raw) {
      const q = hotelQuery.parse(raw)
      if (q.checkOut <= q.checkIn) throw new HttpError(400, 'Check-out must be after check-in')
      const r = await duffel<{ results?: unknown[] }>(token, 'POST', '/stays/search', {
        rooms: q.rooms,
        location: { radius: q.radiusKm, geographic_coordinates: { latitude: q.lat, longitude: q.lon } },
        check_in_date: q.checkIn,
        check_out_date: q.checkOut,
        guests: Array.from({ length: q.adults }, () => ({ type: 'adult' })),
      })
      return (r.results ?? []).map((x) => mapStayResult(x, q.adults)).filter((o): o is Offer => !!o).sort((a, b) => a.providerMinor - b.providerMinor).slice(0, 40)
    },

    async quote(offerId) {
      const q = await quoteFor(offerId)
      return {
        id: offerId, kind: 'hotel', provider: 'duffel', title: q.accommodation.name, subtitle: '',
        startDate: q.check_in_date, endDate: q.check_out_date, providerMinor: toMinor(q.total_amount, q.total_currency),
        currency: q.total_currency.toUpperCase(), travellers: 1, expiresAt: null, details: {}, providerData: { quoteId: q.id },
      }
    },

    async fulfil(offer: Offer, customer: Customer) {
      const quoteId = offer.providerData.quoteId
      if (!quoteId) throw new HttpError(400, 'Missing quote')
      // UNVERIFIED: Duffel Stays settles from your Duffel balance for pay-now rates, but its booking request may also
      // require a `payment` object (card) depending on the rate's payment type. Confirm with Duffel's Stays docs
      // before going live, and extend this request if your account needs it.
      const b = await duffel<{ id: string; reference?: string }>(token, 'POST', '/stays/bookings', {
        quote_id: quoteId,
        email: customer.contact.email,
        phone_number: customer.contact.phone,
        guests: customer.travellers.map((t) => ({ given_name: t.givenName, family_name: t.familyName })),
      }, 60_000)
      if (!b.id || !b.reference) throw new HttpError(502, 'The booking provider did not return a booking reference')
      return { providerOrderId: b.id, reference: b.reference, tickets: [] }
    },
  }
}
