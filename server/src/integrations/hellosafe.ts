import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../middleware/security.ts'
import type { InsuranceReferral, InsuranceTrip, ReferralOffer } from './commerce.ts'

const BASE = 'https://atlas.hellosafe.com'

/** v2 request signing: HMAC-SHA256 over `${ts}.${METHOD}.${pathname}.${rawBody}` (HelloSafe Atlas docs). */
export function atlasSignature(secret: string, ts: string, method: string, path: string, rawBody: string): string {
  return 'v2=' + createHmac('sha256', secret).update(`${ts}.${method}.${path}.${rawBody}`).digest('hex')
}

const quoteResponse = z.object({
  mode: z.enum(['sandbox', 'live']),
  sessionId: z.string(),
  offers: z.array(z.object({
    id: z.number(),
    name: z.string(),
    plan: z.string().nullish(),
    insurer: z.object({ name: z.string() }),
    price: z.object({ amount: z.number(), amountInCents: z.number().optional(), currency: z.string(), isStartingPrice: z.boolean().optional() }),
    highlights: z.object({ included: z.array(z.string()).optional(), excluded: z.array(z.string()).optional() }).partial().optional(),
    documents: z.object({ cgvUrl: z.string().nullish(), ipidUrl: z.string().nullish() }).partial().optional(),
  }).passthrough()),
}).passthrough()

const linkResponse = z.object({ url: z.string().url() }).passthrough()

const ageOn = (bornOn: string, on: string) => {
  const b = new Date(bornOn), d = new Date(on)
  let age = d.getUTCFullYear() - b.getUTCFullYear()
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--
  return Math.min(Math.max(age, 0), 120)
}

function tripBody(t: InsuranceTrip) {
  return {
    intent: 'forTourism',
    startDate: t.startDate,
    endDate: t.endDate,
    countryResidence: t.residence,
    arrivalCountries: [t.destination],
    travellers: t.travellers.map((x) => ({ age: ageOn(x.bornOn, t.startDate) })),
  }
}

/**
 * HelloSafe Atlas. The API prices a trip and mints a tracked link; it does NOT bind a policy or take payment.
 * The traveller finishes and pays on HelloSafe's own page, so no TripPilot payment gateway is involved.
 */
export function hellosafeInsurance(keyId: string, secret: string, fetchFn: typeof fetch = fetch): InsuranceReferral {
  async function call(path: string, body: unknown): Promise<unknown> {
    const raw = JSON.stringify(body)
    const ts = Math.floor(Date.now() / 1000).toString()
    let res: Response
    try {
      res = await fetchFn(BASE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-atlas-key-id': keyId, 'x-atlas-timestamp': ts, 'x-atlas-signature': atlasSignature(secret, ts, 'POST', path, raw) },
        body: raw,
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new HttpError(502, 'The insurance provider could not be reached. Try again shortly.')
    }
    if (res.status === 429) throw new HttpError(429, 'Too many insurance searches. Try again in a minute.')
    if (res.status === 400) throw new HttpError(400, 'The insurance provider rejected these trip details. Check destination and dates.')
    if (!res.ok) throw new HttpError(502, 'The insurance provider returned an error. Try again shortly.')
    return res.json()
  }

  return {
    name: 'HelloSafe',
    async quotes(trip) {
      const parsed = quoteResponse.safeParse(await call('/api/v1/travel/quotes', { trip: tripBody(trip), language: 'en' }))
      if (!parsed.success) throw new HttpError(502, 'Unexpected answer from the insurance provider')
      const offers: ReferralOffer[] = parsed.data.offers.map((o) => ({
        id: o.id,
        name: o.name,
        plan: o.plan ?? '',
        insurer: o.insurer.name,
        amountMinor: o.price.amountInCents ?? Math.round(o.price.amount * 100),
        currency: o.price.currency,
        startingPrice: !!o.price.isStartingPrice,
        included: (o.highlights?.included ?? []).slice(0, 6),
        excluded: (o.highlights?.excluded ?? []).slice(0, 4),
        termsUrl: o.documents?.cgvUrl ?? null,
        summaryUrl: o.documents?.ipidUrl ?? null,
      }))
      return { mode: parsed.data.mode, sessionId: parsed.data.sessionId, offers }
    },
    async link(trip, sessionId, offerId) {
      const parsed = linkResponse.safeParse(await call('/api/v1/travel/links', { sessionId, trip: tripBody(trip), offerId, language: 'en' }))
      if (!parsed.success) throw new HttpError(502, 'Unexpected answer from the insurance provider')
      const url = new URL(parsed.data.url)
      // Only ever send customers to HelloSafe's own site.
      if (url.protocol !== 'https:' || !/(^|\.)hellosafe\.com$/.test(url.hostname)) throw new HttpError(502, 'The insurance provider returned an unexpected link')
      return url.toString()
    },
  }
}
