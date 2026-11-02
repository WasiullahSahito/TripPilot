import { api } from '@/lib/api'

export type GatewayName = 'stripe' | 'safepay'

export const GATEWAY_LABEL: Record<GatewayName, string> = {
  stripe: 'International card (Stripe)',
  safepay: 'Pakistan: card, Easypaisa, JazzCash (Safepay)',
}

export type OfferKind = 'flight' | 'hotel' | 'insurance'

export interface OfferDto {
  id: string
  kind: OfferKind
  provider: string
  title: string
  subtitle: string
  startDate: string
  endDate: string | null
  currency: string
  /** How many traveller records the provider needs. */
  travellers: number
  expiresAt: string | null
  details: Record<string, string | number | boolean>
  /** What the customer pays, minor units, including our fee. */
  totalMinor: number
  feeMinor: number
}

export type OrderStatus = 'awaiting_payment' | 'fulfilling' | 'fulfilled' | 'refunded' | 'needs_attention' | 'expired'

export interface OrderDto {
  id: string
  kind: OfferKind
  status: OrderStatus
  gateway: GatewayName
  provider: string
  title: string
  startDate: string
  endDate: string | null
  amountMinor: number
  feeMinor: number
  currency: string
  reference: string | null
  tickets: string[]
  bookingId: string | null
  note: string | null
  createdAt: string
}

export interface Capabilities {
  flights: boolean
  hotels: boolean
  insurance: boolean
  /** Insurance is priced here and bought on the insurer's page; needs no payment gateway. */
  insuranceQuotes: boolean
  insuranceSandbox: boolean
  payments: boolean
  gateways: GatewayName[]
  /** Safepay for customers living in Pakistan, Stripe otherwise. */
  defaultGateway: GatewayName | null
  modes: Partial<Record<GatewayName, 'test' | 'live'>>
  serviceFeePercent: number
}

export interface TravellerInput {
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'mx'
  gender: 'm' | 'f'
  givenName: string
  familyName: string
  bornOn: string
  passport?: { number: string; issuingCountry: string; expiresOn: string }
}

export interface InsuranceTripInput {
  destination: string
  residence: string
  startDate: string
  endDate: string
  travellers: { bornOn: string }[]
}

export interface ReferralOfferDto {
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

export const insuranceApi = {
  quotes: (trip: InsuranceTripInput) =>
    api<{ provider: string; mode: 'sandbox' | 'live'; sessionId: string; offers: ReferralOfferDto[] }>('/commerce/insurance/quotes', { method: 'POST', body: trip }),
  link: (trip: InsuranceTripInput, sessionId: string, offerId: number) =>
    api<{ url: string }>('/commerce/insurance/link', { method: 'POST', body: { trip, sessionId, offerId } }).then((r) => r.url),
}

export const commerceApi = {
  capabilities: () => api<Capabilities>('/commerce/capabilities'),
  search: (kind: OfferKind, body: unknown) => {
    const path = kind === 'flight' ? '/commerce/flights/search' : kind === 'hotel' ? '/commerce/hotels/search' : '/commerce/insurance/quotes'
    return api<{ offers: OfferDto[] }>(path, { method: 'POST', body }).then((r) => r.offers)
  },
  checkout: (offer: OfferDto, contact: { email: string; phone: string }, travellers: TravellerInput[], gateway?: GatewayName) =>
    api<{ orderId: string; url: string }>('/commerce/checkout', {
      method: 'POST',
      body: { kind: offer.kind, offerId: offer.id, expectedTotalMinor: offer.totalMinor, contact, travellers, gateway },
    }),
  orders: () => api<{ orders: OrderDto[] }>('/commerce/orders').then((r) => r.orders),
  order: (id: string) => api<{ order: OrderDto }>(`/commerce/orders/${id}`).then((r) => r.order),
}

/** 12345 + "USD" -> "$123.45", using the currency's own number of decimals. */
export function formatMinor(minor: number, currency: string): string {
  const f = new Intl.NumberFormat(undefined, { style: 'currency', currency })
  return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2))
}
