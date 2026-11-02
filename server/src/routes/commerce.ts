import { randomUUID } from 'node:crypto'
import express, { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { env } from '../config/env.ts'
import { availableGateways, commerce, contactSchema, defaultGateway, feeFor, requireCommerce, requireGateway, toPublic, travellerSchema, type Customer, type GatewayName } from '../integrations/commerce.ts'
import { HttpError, requireAuth } from '../middleware/security.ts'
import type { Store } from '../models/store.ts'
import type { Order } from '../models/types.ts'
import { audit } from '../services/audit.ts'
import { encryptJson } from '../services/crypto.ts'
import { handleExpired, handlePaid, type OrderSnapshot } from '../services/fulfilment.ts'

const MAX_OPEN_ORDERS = 5

const checkoutInput = z.object({
  kind: z.enum(['flight', 'hotel', 'insurance']),
  offerId: z.string().min(1).max(300),
  /** The total the customer saw. If the live price differs, nothing is charged and they are told the new price. */
  expectedTotalMinor: z.number().int().positive(),
  /** Optional: which payment method to use. Defaults to Safepay for customers living in Pakistan, Stripe otherwise. */
  gateway: z.enum(['stripe', 'safepay']).optional(),
  contact: contactSchema,
  travellers: z.array(travellerSchema).min(1).max(9),
})

/** What the customer may see of an order: no encrypted blob, no payment identifiers. */
export function publicOrder(o: Order) {
  const { dataEnc: _d, paymentSessionId: _s, paymentRef: _p, userId: _u, ...rest } = o
  return rest
}

export function commerceRoutes(store: Store) {
  const r = Router()
  r.use(requireAuth)

  r.get('/capabilities', async (req, res) => {
    const gateways = availableGateways()
    const profile = await store.getProfile(req.session!.sub)
    res.json({
      flights: !!commerce.flights, hotels: !!commerce.hotels, insurance: !!commerce.insurance, insuranceQuotes: !!commerce.insuranceReferral,
      insuranceSandbox: !!env.atlasKeyId?.startsWith('ak_test_'),
      payments: gateways.length > 0, gateways, defaultGateway: gateways.length ? defaultGateway(profile?.residenceCountry) : null,
      modes: Object.fromEntries(gateways.map((g) => [g, commerce.gateways[g]!.mode])), serviceFeePercent: env.serviceFeePercent,
    })
  })

  const search = (kind: 'flight' | 'hotel' | 'insurance'): RequestHandler => async (req, res) => {
    if (availableGateways().length === 0) requireGateway('stripe') // Never show bookable offers that could not be paid for.
    const offers = await requireCommerce(kind).search(req.body)
    res.json({ offers: offers.map(toPublic) })
  }
  r.post('/flights/search', search('flight'))
  r.post('/hotels/search', search('hotel'))

  // Insurance is priced here but bought on the insurer's page (HelloSafe Atlas cannot bind or charge), so no payment gateway is needed.
  const insuranceTrip = z.object({
    destination: z.string().length(2).transform((s) => s.toUpperCase()),
    residence: z.string().length(2).transform((s) => s.toUpperCase()),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    travellers: z.array(z.object({ bornOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).min(1).max(9),
  }).refine((t) => t.endDate >= t.startDate, { message: 'Cover must end on or after it starts' })
  const referral = () => {
    if (!commerce.insuranceReferral) throw new HttpError(501, 'Insurance quotes are not available: no insurance provider is configured.')
    return commerce.insuranceReferral
  }
  r.post('/insurance/quotes', async (req, res) => {
    const out = await referral().quotes(insuranceTrip.parse(req.body))
    res.json({ provider: referral().name, ...out })
  })
  r.post('/insurance/link', async (req, res) => {
    const body = z.object({ trip: insuranceTrip, sessionId: z.string().min(1).max(200), offerId: z.number().int() }).parse(req.body)
    const provider = referral()
    // A sandbox link opens the provider's REAL checkout, where any payment is a real purchase.
    if (env.atlasKeyId?.startsWith('ak_test_')) throw new HttpError(403, 'Purchase links are disabled while the insurance provider is in sandbox mode. Switch to a live key.')
    const url = await provider.link(body.trip, body.sessionId, body.offerId)
    await audit(store, { actorId: req.session!.sub, action: 'insurance.referred', targetId: String(body.offerId), meta: { provider: provider.name } })
    res.json({ url })
  })

  r.post('/checkout', async (req, res) => {
    const userId = req.session!.sub
    const input = checkoutInput.parse(req.body)
    const provider = requireCommerce(input.kind)

    const user = await store.findUserById(userId)
    const profile = await store.getProfile(userId)
    const gatewayName: GatewayName = input.gateway ?? defaultGateway(profile?.residenceCountry)
    const payments = requireGateway(gatewayName)
    if (!user?.emailVerifiedAt) throw new HttpError(403, 'Verify your email address before booking')
    const open = (await store.listOrders(userId)).filter((o) => o.status === 'awaiting_payment').length
    if (open >= MAX_OPEN_ORDERS) throw new HttpError(429, 'You have several unfinished checkouts. Finish or wait for them to expire.')

    // The provider's current price decides everything; the browser's numbers are only compared against it.
    const offer = await provider.quote(input.offerId)
    if (input.travellers.length !== offer.travellers) throw new HttpError(400, `This offer needs ${offer.travellers} traveller${offer.travellers > 1 ? 's' : ''}`)
    const feeMinor = feeFor(offer.providerMinor)
    const amountMinor = offer.providerMinor + feeMinor
    if (amountMinor !== input.expectedTotalMinor) {
      throw new HttpError(409, `The price changed to ${(amountMinor / 100).toFixed(2)} ${offer.currency}. Review it and try again.`)
    }

    const now = new Date().toISOString()
    const customer: Customer = { contact: input.contact, travellers: input.travellers }
    const snapshot: OrderSnapshot = { offer, customer }
    const order: Order = {
      id: randomUUID(), userId, kind: input.kind, status: 'awaiting_payment', gateway: gatewayName, provider: offer.provider, offerId: offer.id, title: offer.title.slice(0, 150),
      startDate: offer.startDate, endDate: offer.endDate, amountMinor, feeMinor, currency: offer.currency,
      paymentSessionId: null, paymentRef: null, providerOrderId: null, reference: null, tickets: [], bookingId: null, note: null,
      dataEnc: encryptJson(snapshot), createdAt: now, updatedAt: now,
    }
    await store.saveOrder(order)
    try {
      const session = await payments.createCheckout({
        orderId: order.id, title: order.title, amountMinor, currency: order.currency, customerEmail: user.email,
        successUrl: `${env.clientOrigin}/app/orders/${order.id}?paid=1`, cancelUrl: `${env.clientOrigin}/app/orders/${order.id}?cancelled=1`,
      })
      order.paymentSessionId = session.sessionId
      await store.saveOrder(order)
      await audit(store, { actorId: userId, action: 'order.created', targetId: order.id, meta: { kind: order.kind, amountMinor } })
      res.status(201).json({ orderId: order.id, url: session.url })
    } catch (e) {
      await store.claimOrder(order.id, 'awaiting_payment', 'expired')
      throw e
    }
  })

  r.get('/orders', async (req, res) => {
    res.json({ orders: (await store.listOrders(req.session!.sub)).map(publicOrder) })
  })

  r.get('/orders/:id', async (req, res) => {
    const order = await store.getOrder(req.session!.sub, String(req.params.id))
    if (!order) throw new HttpError(404, 'Order not found')
    res.json({ order: publicOrder(order) })
  })

  return r
}

/**
 * Payment webhooks, one URL per gateway: /api/commerce/webhook/stripe and /api/commerce/webhook/safepay
 * (plain /api/commerce/webhook is kept as an alias for Stripe). Mounted in app.ts BEFORE express.json():
 * signature verification needs the exact raw bytes. No session cookie here; the gateway's signature is the authentication.
 */
export function paymentWebhook(store: Store): RequestHandler[] {
  return [
    express.raw({ type: () => true, limit: '1mb' }),
    async (req, res) => {
      const name = (req.params.gateway ?? 'stripe') as string
      if (name !== 'stripe' && name !== 'safepay') throw new HttpError(404, 'Unknown payment method')
      const gateway = requireGateway(name)
      const body = req.body as unknown
      if (!Buffer.isBuffer(body)) throw new HttpError(400, 'Invalid body')
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]))
      const event = gateway.verifyWebhook(body, headers)
      if (event?.type === 'paid') {
        await handlePaid(store, gateway, event.orderId, { paymentRef: event.paymentRef, amountMinor: event.amountMinor, currency: event.currency })
      } else if (event?.type === 'expired') {
        await handleExpired(store, event.orderId)
      }
      res.json({ received: true })
    },
  ]
}
