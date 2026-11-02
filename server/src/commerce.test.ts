// @vitest-environment node
import { createHmac } from 'node:crypto'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { commerce, defaultGateway, feeFor, fromMinor, toMinor, toPublic, type CommerceProvider, type Offer, type PaymentGateway } from './integrations/commerce.ts'
import { mapFlightOffer, mapStayResult } from './integrations/duffel.ts'
import { safepayGateway, safepaySignature } from './integrations/safepay.ts'
import { stripeGateway, verifyStripeWebhook } from './integrations/stripe.ts'
import { JsonStore } from './models/store.ts'

const SECRET = 'whsec_test_secret'
const creds = { name: 'Test User', password: 'correct-horse-battery' }

const offer: Offer = {
  id: 'off_1', kind: 'flight', provider: 'fake', title: 'Fake Air: DEL → CDG', subtitle: '1 traveller', startDate: '2027-03-01', endDate: null,
  providerMinor: 50000, currency: 'USD', travellers: 1, expiresAt: null, details: { stops: 0 }, providerData: {},
}
const traveller = { title: 'mr', gender: 'm', givenName: 'Asha', familyName: 'Rao', bornOn: '1990-01-01' }
const contact = { email: 'asha@example.com', phone: '+33123456789' }

let store: JsonStore
let app: ReturnType<typeof createApp>
let fulfil: ReturnType<typeof vi.fn>
let refund: ReturnType<typeof vi.fn>
let currentOffer: Offer

function fakeProvider(): CommerceProvider {
  return {
    name: 'fake',
    search: async () => [currentOffer],
    quote: async () => currentOffer,
    fulfil: fulfil as unknown as CommerceProvider['fulfil'],
  }
}

beforeEach(() => {
  store = new JsonStore()
  currentOffer = { ...offer }
  fulfil = vi.fn(async () => ({ providerOrderId: 'ord_prov_1', reference: 'ABC123', tickets: ['0571234567890'] }))
  refund = vi.fn(async () => undefined)
  // The real Stripe/Safepay adapters (so webhook verification is the real code); only the outbound calls are faked.
  const stripe: PaymentGateway = {
    ...stripeGateway('sk_test_x', SECRET),
    createCheckout: async (i) => ({ sessionId: `cs_${i.orderId}`, url: `https://pay.test/${i.orderId}` }),
    refund: refund as unknown as PaymentGateway['refund'],
  }
  commerce.flights = fakeProvider()
  commerce.gateways = { stripe }
  env.serviceFeePercent = 10
  app = createApp(store)
})

afterEach(() => {
  delete commerce.flights
  delete commerce.hotels
  delete commerce.insurance
  commerce.gateways = {}
  env.serviceFeePercent = 0
})

async function signedIn(email = 'asha@example.com', verified = true) {
  const a = request.agent(app)
  await a.post('/api/auth/register').send({ ...creds, email }).expect(201)
  if (verified) {
    const u = (await store.findUserByEmail(email))!
    await store.saveUser({ ...u, emailVerifiedAt: new Date().toISOString(), verifyToken: null })
  }
  return a
}

const checkoutBody = (over: Record<string, unknown> = {}) => ({
  kind: 'flight', offerId: 'off_1', expectedTotalMinor: 55000, contact, travellers: [traveller], ...over,
})

function signed(body: object, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body)
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  return { raw, header: `t=${t},v1=${sig}` }
}
const paidEvent = (orderId: string, over: Record<string, unknown> = {}) => ({
  id: 'evt_1', type: 'checkout.session.completed',
  data: { object: { id: 'cs_x', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 55000, currency: 'usd', metadata: { orderId }, ...over } },
})
const sendWebhook = (body: object, header?: string, raw?: string) => {
  const s = signed(body)
  return request(app).post('/api/commerce/webhook/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header ?? s.header).send(raw ?? s.raw)
}

describe('money helpers', () => {
  it('converts decimal strings to minor units exactly', () => {
    expect(toMinor('123.45', 'USD')).toBe(12345)
    expect(toMinor('0.1', 'USD')).toBe(10)
    expect(toMinor('1000', 'JPY')).toBe(1000)
    expect(toMinor('1.234', 'KWD')).toBe(1234)
    expect(() => toMinor('abc', 'USD')).toThrow()
    expect(fromMinor(12345, 'USD')).toBe('123.45')
    expect(fromMinor(5, 'USD')).toBe('0.05')
    expect(fromMinor(1000, 'JPY')).toBe('1000')
  })
  it('rounds our fee up and exposes it in the public offer', () => {
    expect(feeFor(1001, 10)).toBe(101)
    env.serviceFeePercent = 10
    const p = toPublic(offer)
    expect(p.totalMinor).toBe(55000)
    expect(p.feeMinor).toBe(5000)
    expect(p).not.toHaveProperty('providerMinor')
    expect(p).not.toHaveProperty('providerData')
  })
})

describe('stripe webhook signature', () => {
  const body = Buffer.from('{"id":"evt"}')
  const sign = (t: number, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex')}`
  it('accepts a valid signature', () => {
    const t = Math.floor(Date.now() / 1000)
    expect(verifyStripeWebhook(body, sign(t), SECRET).id).toBe('evt')
  })
  it('rejects wrong secret, stale timestamp, missing header and tampered body', () => {
    const t = Math.floor(Date.now() / 1000)
    expect(() => verifyStripeWebhook(body, sign(t, 'other'), SECRET)).toThrow()
    expect(() => verifyStripeWebhook(body, sign(t - 3600), SECRET)).toThrow()
    expect(() => verifyStripeWebhook(body, undefined, SECRET)).toThrow()
    expect(() => verifyStripeWebhook(Buffer.from('{"id":"evil"}'), sign(t), SECRET)).toThrow()
  })
})

describe('provider mapping', () => {
  it('maps a Duffel flight offer and keeps only provider-issued prices', () => {
    const o = mapFlightOffer({
      id: 'off_x', total_amount: '412.30', total_currency: 'EUR', expires_at: '2027-01-01T00:00:00Z', owner: { name: 'Air France' },
      passengers: [{ id: 'pas_1', type: 'adult' }],
      slices: [{ duration: 'PT8H', segments: [{ origin: { iata_code: 'DEL' }, destination: { iata_code: 'CDG' }, departing_at: '2027-03-01T02:00:00', arriving_at: '2027-03-01T10:00:00' }] }],
      conditions: { refund_before_departure: { allowed: false }, change_before_departure: null },
    })
    expect(o).toMatchObject({ id: 'off_x', providerMinor: 41230, currency: 'EUR', startDate: '2027-03-01', endDate: null, travellers: 1 })
    expect(o.details.refundable).toBe(false)
    expect(o.details.changeable).toBe('unknown')
  })
  it('skips hotel results that have no price', () => {
    expect(mapStayResult({ id: 'srr_1', check_in_date: '2027-03-01', check_out_date: '2027-03-03', accommodation: { name: 'H' } }, 2)).toBeNull()
  })
})

describe('checkout', () => {
  it('reports what is configured', async () => {
    const a = await signedIn()
    const r = await a.get('/api/commerce/capabilities').expect(200)
    expect(r.body).toMatchObject({ flights: true, hotels: false, insurance: false, payments: true, gateways: ['stripe'], defaultGateway: 'stripe', modes: { stripe: 'test' } })
  })

  it('requires sign-in and a verified email', async () => {
    await request(app).post('/api/commerce/checkout').send(checkoutBody()).expect(401)
    const a = await signedIn('unverified@example.com', false)
    await a.post('/api/commerce/checkout').send(checkoutBody()).expect(403)
  })

  it('answers 501 when no provider or payment gateway is configured', async () => {
    const a = await signedIn()
    await a.post('/api/commerce/checkout').send(checkoutBody({ kind: 'insurance' })).expect(501)
    commerce.gateways = {}
    await a.post('/api/commerce/checkout').send(checkoutBody()).expect(501)
    await a.post('/api/commerce/flights/search').send({}).expect(501)
  })

  it('prices server-side: rejects a stale or tampered total without creating a payment', async () => {
    const a = await signedIn()
    const r = await a.post('/api/commerce/checkout').send(checkoutBody({ expectedTotalMinor: 100 })).expect(409)
    expect(r.body.error).toMatch(/price changed/i)
    expect((await a.get('/api/commerce/orders')).body.orders).toHaveLength(0)
  })

  it('requires the right number of travellers', async () => {
    const a = await signedIn()
    await a.post('/api/commerce/checkout').send(checkoutBody({ travellers: [traveller, traveller] })).expect(400)
  })

  it('creates an awaiting order and returns the hosted payment page', async () => {
    const a = await signedIn()
    const r = await a.post('/api/commerce/checkout').send(checkoutBody()).expect(201)
    expect(r.body.url).toMatch(/^https:\/\/pay\.test\//)
    const o = (await a.get(`/api/commerce/orders/${r.body.orderId}`).expect(200)).body.order
    expect(o).toMatchObject({ status: 'awaiting_payment', amountMinor: 55000, feeMinor: 5000, reference: null, tickets: [] })
    expect(o).not.toHaveProperty('dataEnc')
    expect(fulfil).not.toHaveBeenCalled()
  })

  it('isolates orders between users', async () => {
    const a = await signedIn()
    const id = (await a.post('/api/commerce/checkout').send(checkoutBody())).body.orderId as string
    const b = await signedIn('other@example.com')
    await b.get(`/api/commerce/orders/${id}`).expect(404)
    expect((await b.get('/api/commerce/orders')).body.orders).toHaveLength(0)
  })
})

describe('payment webhook and fulfilment', () => {
  async function pending() {
    const a = await signedIn()
    const id = (await a.post('/api/commerce/checkout').send(checkoutBody())).body.orderId as string
    return { a, id }
  }

  it('rejects unsigned or wrongly signed webhooks', async () => {
    const { id } = await pending()
    await sendWebhook(paidEvent(id), 't=1,v1=00').expect(400)
    const bad = signed(paidEvent(id), 'whsec_wrong')
    await sendWebhook(paidEvent(id), bad.header).expect(400)
    expect(fulfil).not.toHaveBeenCalled()
  })

  it('fulfils a paid order once, with the provider’s own reference, and records a provider booking', async () => {
    const { a, id } = await pending()
    await sendWebhook(paidEvent(id)).expect(200)
    await sendWebhook(paidEvent(id)).expect(200) // Stripe retries
    expect(fulfil).toHaveBeenCalledTimes(1)
    const o = (await a.get(`/api/commerce/orders/${id}`)).body.order
    expect(o).toMatchObject({ status: 'fulfilled', reference: 'ABC123', providerOrderId: 'ord_prov_1', tickets: ['0571234567890'] })
    const bookings = (await a.get('/api/bookings')).body.bookings
    expect(bookings).toHaveLength(1)
    expect(bookings[0]).toMatchObject({ source: 'provider', status: 'confirmed', confirmationRef: 'ABC123', kind: 'flight' })
    expect(refund).not.toHaveBeenCalled()
  })

  it('passes the decrypted travellers to the provider only at fulfilment', async () => {
    const { id } = await pending()
    await sendWebhook(paidEvent(id)).expect(200)
    const [offerArg, customerArg] = fulfil.mock.calls[0]!
    expect(offerArg.id).toBe('off_1')
    expect(customerArg.travellers[0].familyName).toBe('Rao')
    expect(customerArg.contact.phone).toBe('+33123456789')
  })

  it('refunds the customer when the provider fails', async () => {
    fulfil.mockRejectedValueOnce(new Error('airline said no'))
    const { a, id } = await pending()
    await sendWebhook(paidEvent(id)).expect(200)
    expect(refund).toHaveBeenCalledWith('pi_1', `refund-${id}`)
    const o = (await a.get(`/api/commerce/orders/${id}`)).body.order
    expect(o.status).toBe('refunded')
    expect(o.reference).toBeNull()
    expect((await a.get('/api/bookings')).body.bookings).toHaveLength(0)
  })

  it('flags for a person when both the provider and the refund fail', async () => {
    fulfil.mockRejectedValueOnce(new Error('nope'))
    refund.mockRejectedValueOnce(new Error('stripe down'))
    const { a, id } = await pending()
    await sendWebhook(paidEvent(id)).expect(200)
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('needs_attention')
  })

  it('never fulfils when the paid amount differs from the order', async () => {
    const { a, id } = await pending()
    await sendWebhook(paidEvent(id, { amount_total: 100 })).expect(200)
    expect(fulfil).not.toHaveBeenCalled()
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('needs_attention')
  })

  it('ignores unpaid sessions and unknown orders', async () => {
    const { a, id } = await pending()
    await sendWebhook(paidEvent(id, { payment_status: 'unpaid' })).expect(200)
    await sendWebhook(paidEvent('00000000-0000-4000-8000-000000000000')).expect(200)
    expect(fulfil).not.toHaveBeenCalled()
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('awaiting_payment')
  })

  it('expires an unpaid order, and refunds a payment that arrives afterwards', async () => {
    const { a, id } = await pending()
    await sendWebhook({ id: 'evt_2', type: 'checkout.session.expired', data: { object: { metadata: { orderId: id } } } }).expect(200)
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('expired')
    await sendWebhook(paidEvent(id)).expect(200)
    expect(fulfil).not.toHaveBeenCalled()
    expect(refund).toHaveBeenCalledTimes(1)
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('refunded')
  })
})

describe('Pakistan customers pay with Safepay, everyone else with Stripe', () => {
  const SP_SECRET = 'sp_webhook_secret'
  beforeEach(() => {
    const safepay: PaymentGateway = {
      ...safepayGateway({ apiKey: 'sec_test_key', webhookSecret: SP_SECRET, env: 'sandbox' }),
      createCheckout: async (i) => ({ sessionId: `trk_${i.orderId}`, url: `https://safepay.test/${i.orderId}` }),
    }
    commerce.gateways = { ...commerce.gateways, safepay }
  })
  const setResidence = async (email: string, residenceCountry: string) => {
    const u = (await store.findUserByEmail(email))!
    await store.saveProfile({ userId: u.id, nationality: '', residenceCountry, homeAirport: '', interests: [], onboardedAt: null })
  }
  const spEvent = (orderId: string, over: Record<string, unknown> = {}) => ({
    data: { notification: { state: 'PAID', amount: 550, currency: 'USD', token: 'trk_1', metadata: { order_id: orderId }, ...over } },
  })
  const sendSafepay = (body: object, sig?: string) => {
    const raw = JSON.stringify(body)
    return request(app).post('/api/commerce/webhook/safepay').set('Content-Type', 'application/json')
      .set('X-SFPY-SIGNATURE', sig ?? safepaySignature(Buffer.from(raw), SP_SECRET)).send(raw)
  }

  it('picks the gateway from the country of residence, and falls back to what is configured', () => {
    expect(defaultGateway('Pakistan')).toBe('safepay')
    expect(defaultGateway(' pk ')).toBe('safepay')
    expect(defaultGateway('France')).toBe('stripe')
    expect(defaultGateway(undefined)).toBe('stripe')
    commerce.gateways = { stripe: commerce.gateways.stripe }
    expect(defaultGateway('Pakistan')).toBe('stripe')
    commerce.gateways = {}
    expect(() => defaultGateway('Pakistan')).toThrow()
  })

  it('routes checkout by residence and honours an explicit choice', async () => {
    const a = await signedIn('pk@example.com')
    await setResidence('pk@example.com', 'Pakistan')
    expect((await a.get('/api/commerce/capabilities')).body.defaultGateway).toBe('safepay')
    const pk = await a.post('/api/commerce/checkout').send(checkoutBody()).expect(201)
    expect(pk.body.url).toMatch(/^https:\/\/safepay\.test\//)
    expect((await a.get(`/api/commerce/orders/${pk.body.orderId}`)).body.order.gateway).toBe('safepay')
    const forced = await a.post('/api/commerce/checkout').send(checkoutBody({ gateway: 'stripe' })).expect(201)
    expect(forced.body.url).toMatch(/^https:\/\/pay\.test\//)

    const b = await signedIn('fr@example.com')
    await setResidence('fr@example.com', 'France')
    expect((await b.post('/api/commerce/checkout').send(checkoutBody())).body.url).toMatch(/^https:\/\/pay\.test\//)
  })

  it('refuses a payment method that is not configured', async () => {
    commerce.gateways = { stripe: commerce.gateways.stripe }
    const a = await signedIn()
    await a.post('/api/commerce/checkout').send(checkoutBody({ gateway: 'safepay' })).expect(501)
  })

  it('fulfils on a correctly signed Safepay payment, and ignores forged ones', async () => {
    const a = await signedIn('pk2@example.com')
    await setResidence('pk2@example.com', 'Pakistan')
    const id = (await a.post('/api/commerce/checkout').send(checkoutBody())).body.orderId as string
    await sendSafepay(spEvent(id), '00'.repeat(64)).expect(400)
    await sendSafepay(spEvent(id), 'zz').expect(400)
    expect(fulfil).not.toHaveBeenCalled()
    await sendSafepay(spEvent(id)).expect(200)
    await sendSafepay(spEvent(id)).expect(200)
    expect(fulfil).toHaveBeenCalledTimes(1)
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order).toMatchObject({ status: 'fulfilled', gateway: 'safepay', reference: 'ABC123' })
  })

  it('does not fulfil a wrong amount or an unpaid state, and does not act on an unrecognised payload', async () => {
    const a = await signedIn('pk3@example.com')
    await setResidence('pk3@example.com', 'Pakistan')
    const id = (await a.post('/api/commerce/checkout').send(checkoutBody())).body.orderId as string
    await sendSafepay(spEvent(id, { state: 'PENDING' })).expect(200)
    await sendSafepay({ something: 'else' }).expect(200)
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('awaiting_payment')
    await sendSafepay(spEvent(id, { amount: 1 })).expect(200)
    expect(fulfil).not.toHaveBeenCalled()
    expect((await a.get(`/api/commerce/orders/${id}`)).body.order.status).toBe('needs_attention')
  })

  it('flags for a person to refund in the dashboard when fulfilment fails (Safepay has no refund call wired up)', async () => {
    fulfil.mockRejectedValueOnce(new Error('airline said no'))
    const a = await signedIn('pk4@example.com')
    await setResidence('pk4@example.com', 'Pakistan')
    const id = (await a.post('/api/commerce/checkout').send(checkoutBody())).body.orderId as string
    await sendSafepay(spEvent(id)).expect(200)
    const o = (await a.get(`/api/commerce/orders/${id}`)).body.order
    expect(o.status).toBe('needs_attention')
    expect(o.note).toMatch(/refund/i)
  })
})
