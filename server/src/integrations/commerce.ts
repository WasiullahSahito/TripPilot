import { z } from 'zod'
import { env } from '../config/env.ts'
import { HttpError } from '../middleware/security.ts'
import type { OrderKind } from '../models/types.ts'

/**
 * Boundary for REAL purchases. A provider turns an offer into an order and returns the references it issued;
 * a payment gateway collects the customer's money. Credentials stay on the server.
 *
 * Integrity rules (same spirit as the Booking rules):
 *  - prices come from the provider, never from the client
 *  - booking references, policy numbers and ticket numbers are only ever values the provider returned
 *  - the customer is charged first, the provider is called second, and a provider failure triggers a refund
 */

export interface Offer {
  id: string
  kind: OrderKind
  provider: string
  title: string
  subtitle: string
  startDate: string
  endDate: string | null
  /** What the provider charges us, in minor units. */
  providerMinor: number
  currency: string
  /** How many traveller records the provider needs for this offer. */
  travellers: number
  expiresAt: string | null
  details: Record<string, string | number | boolean>
  /** Opaque ids the provider needs again at fulfilment (quote id, ...). Never sent to the browser. */
  providerData: Record<string, string>
}

/** Offer as shown to the customer: the price includes our fee. */
export type PublicOffer = Omit<Offer, 'providerMinor' | 'providerData'> & { totalMinor: number; feeMinor: number }

export const travellerSchema = z.object({
  title: z.enum(['mr', 'ms', 'mrs', 'miss', 'mx']),
  gender: z.enum(['m', 'f']),
  givenName: z.string().trim().min(1).max(60),
  familyName: z.string().trim().min(1).max(60),
  bornOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  passport: z
    .object({
      number: z.string().trim().min(4).max(20),
      issuingCountry: z.string().regex(/^[A-Z]{2}$/),
      expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
})
export type Traveller = z.infer<typeof travellerSchema>

export const contactSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // E.164, the format every provider accepts.
  phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +33123456789'),
})
export type Contact = z.infer<typeof contactSchema>

export interface Customer {
  contact: Contact
  travellers: Traveller[]
}

export interface Fulfilment {
  providerOrderId: string
  /** Booking reference / policy number. Must be the provider's own value. */
  reference: string
  /** E-ticket numbers etc. Can be empty if the provider issues them later. */
  tickets: string[]
}

export interface CommerceProvider<Q = unknown> {
  name: string
  search(query: Q): Promise<Offer[]>
  /** Re-prices the offer right now. Throws HttpError(409) if it is no longer available. */
  quote(offerId: string): Promise<Offer>
  /** Creates the real order. Called only after the customer's payment has been received. */
  fulfil(offer: Offer, customer: Customer): Promise<Fulfilment>
}

export interface CheckoutInput {
  orderId: string
  title: string
  amountMinor: number
  currency: string
  customerEmail: string
  successUrl: string
  cancelUrl: string
}

export type GatewayName = 'stripe' | 'safepay'

/** What a gateway's webhook tells us, already authenticated. `null` from verifyWebhook means "not an event we act on". */
export type GatewayEvent =
  | { type: 'paid'; orderId: string; paymentRef: string | null; amountMinor: number; currency: string }
  | { type: 'expired'; orderId: string }

export interface PaymentGateway {
  name: GatewayName
  mode: 'test' | 'live'
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string }>
  /** Throws if the gateway cannot refund by API; the order is then flagged for a person to refund by hand. */
  refund(paymentRef: string, idempotencyKey: string): Promise<void>
  /** Authenticates the request (signature) and translates it. Throws HttpError(400) when authentication fails. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): GatewayEvent | null
}

export interface InsuranceTrip {
  destination: string
  residence: string
  startDate: string
  endDate: string
  travellers: { bornOn: string }[]
}

export interface ReferralOffer {
  id: number
  name: string
  plan: string
  insurer: string
  amountMinor: number
  currency: string
  startingPrice: boolean
  included: string[]
  excluded: string[]
  termsUrl: string | null
  summaryUrl: string | null
}

/** Insurance that is priced here but sold and paid for on the insurer's own page (no TripPilot payment). */
export interface InsuranceReferral {
  name: string
  quotes(trip: InsuranceTrip): Promise<{ mode: 'sandbox' | 'live'; sessionId: string; offers: ReferralOffer[] }>
  link(trip: InsuranceTrip, sessionId: string, offerId: number): Promise<string>
}

export interface Commerce {
  flights?: CommerceProvider
  hotels?: CommerceProvider
  insurance?: CommerceProvider
  insuranceReferral?: InsuranceReferral
  gateways: Partial<Record<GatewayName, PaymentGateway>>
}

/** Registered at start-up from env (see app.ts); tests inject fakes. */
export const commerce: Commerce = { gateways: {} }

export function requireCommerce(kind: OrderKind): CommerceProvider {
  const p = commerce[kind === 'flight' ? 'flights' : kind === 'hotel' ? 'hotels' : 'insurance']
  if (!p) throw new HttpError(501, `Booking ${kind === 'insurance' ? 'insurance' : kind === 'flight' ? 'flights' : 'hotels'} is not available: no provider is configured.`)
  return p
}

export const availableGateways = (): GatewayName[] => (Object.keys(commerce.gateways) as GatewayName[]).filter((g) => !!commerce.gateways[g])

export function requireGateway(name: GatewayName): PaymentGateway {
  const g = commerce.gateways[name]
  if (!g) throw new HttpError(501, 'This payment method is not available.')
  return g
}

/** Customers living in Pakistan pay through Safepay, everyone else through Stripe; falls back to whatever is configured. */
export function defaultGateway(residenceCountry: string | undefined): GatewayName {
  const pk = /^(pakistan|pk)$/i.test((residenceCountry ?? '').trim())
  const want: GatewayName = pk ? 'safepay' : 'stripe'
  const have = availableGateways()
  if (have.includes(want)) return want
  const other = have[0]
  if (!other) throw new HttpError(501, 'Payments are not available: no payment provider is configured.')
  return other
}

// ---- money ---------------------------------------------------------------------------------------------------

const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])
const exponent = (currency: string) => (ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2)

/** "123.45" -> 12345 without floating-point arithmetic. */
export function toMinor(amount: string, currency: string): number {
  const cur = currency.toUpperCase()
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim())
  if (!m) throw new HttpError(502, 'The provider returned an invalid price')
  const e = exponent(cur)
  const frac = (m[2] ?? '').padEnd(e, '0').slice(0, e)
  const minor = Number(m[1]) * 10 ** e + (frac ? Number(frac) : 0)
  if (!Number.isSafeInteger(minor)) throw new HttpError(502, 'The provider returned an invalid price')
  return minor
}

/** 12345 -> "123.45" */
export function fromMinor(minor: number, currency: string): string {
  const e = exponent(currency.toUpperCase())
  if (e === 0) return String(minor)
  const s = String(minor).padStart(e + 1, '0')
  return `${s.slice(0, -e)}.${s.slice(-e)}`
}

/** Our fee on a provider price, rounded up to a whole minor unit. */
export const feeFor = (providerMinor: number, percent = env.serviceFeePercent) => Math.ceil((providerMinor * percent) / 100)

export function toPublic(o: Offer): PublicOffer {
  const { providerMinor, providerData: _omit, ...rest } = o
  const feeMinor = feeFor(providerMinor)
  return { ...rest, totalMinor: providerMinor + feeMinor, feeMinor }
}
