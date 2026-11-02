import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../middleware/security.ts'
import { fromMinor, toMinor, type PaymentGateway } from './commerce.ts'

/**
 * Safepay (https://getsafepay.com), the gateway for customers in Pakistan: hosted checkout with cards,
 * Easypaisa and JazzCash.
 *
 * UNVERIFIED: written WITHOUT access to Safepay's official API reference (it could not be reached when this was
 * built). The endpoint paths, the checkout URL parameters, the webhook signature algorithm and the webhook payload
 * shape below follow Safepay's public SDKs as best recalled. Everything that can go wrong goes wrong SAFELY:
 *  - an unrecognised webhook is rejected (never treated as a payment), so the worst case is "paid but not fulfilled"
 *  - refunds are not attempted by API; a failed fulfilment flags the order for you to refund in the Safepay dashboard
 * Before taking real money, make a SANDBOX payment and compare each marked step with the official docs and with the
 * real webhook you receive (the server logs which fields were missing when it rejects one).
 *
 * Currency: Safepay settles in PKR. This code sends the order's own currency and applies NO exchange rate. If your
 * Safepay account only accepts PKR, an FX conversion step is needed before checkout (not built).
 */

const BASE = { sandbox: 'https://sandbox.api.getsafepay.com', production: 'https://api.getsafepay.com' } as const

// UNVERIFIED: tracker ("token") creation.
const trackerResponse = z.object({ data: z.object({ token: z.string().min(1) }) })

// UNVERIFIED payload shape: state PAID, amount in major units, order id echoed back from our metadata.
const notification = z.object({
  data: z.object({
    notification: z.object({
      state: z.string(),
      amount: z.union([z.number(), z.string()]),
      currency: z.string(),
      token: z.string().optional(),
      metadata: z.object({ order_id: z.string() }).partial().optional(),
    }),
  }),
})

export interface SafepayConfig {
  apiKey: string
  secretKey?: string
  webhookSecret?: string
  env: 'sandbox' | 'production'
}

/** UNVERIFIED: HMAC-SHA512 (hex) of the raw body with the webhook secret. */
export function safepaySignature(rawBody: Buffer, secret: string) {
  return createHmac('sha512', secret).update(rawBody).digest('hex')
}

export function safepayGateway(cfg: SafepayConfig): PaymentGateway {
  const base = BASE[cfg.env]
  return {
    name: 'safepay',
    mode: cfg.env === 'production' ? 'live' : 'test',

    async createCheckout(i) {
      let res: Response
      try {
        res = await fetch(`${base}/order/v1/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(cfg.secretKey ? { 'X-SFPY-MERCHANT-SECRET': cfg.secretKey } : {}) },
          body: JSON.stringify({
            client: cfg.apiKey, environment: cfg.env, amount: Number(fromMinor(i.amountMinor, i.currency)), currency: i.currency.toUpperCase(),
            intent: 'CYBERSOURCE', mode: 'payment', order_id: i.orderId, metadata: { order_id: i.orderId },
          }),
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        throw new HttpError(502, 'The payment provider did not respond')
      }
      const parsed = trackerResponse.safeParse(await res.json().catch(() => null))
      if (!res.ok || !parsed.success) {
        console.error('Safepay init failed:', res.status)
        throw new HttpError(502, 'The payment provider rejected the request')
      }
      const token = parsed.data.data.token
      // UNVERIFIED: hosted checkout URL and its parameter names.
      const url = new URL(`${base}/components`)
      url.search = new URLSearchParams({
        env: cfg.env, beacon: token, order_id: i.orderId, source: 'custom', redirect_url: i.successUrl, cancel_url: i.cancelUrl,
      }).toString()
      return { sessionId: token, url: url.toString() }
    },

    async refund() {
      // No refund call is wired up: refunding from the Safepay dashboard is the safe default until the API is verified.
      throw new HttpError(501, 'Safepay refunds are done in the Safepay dashboard')
    },

    verifyWebhook(rawBody, headers) {
      if (!cfg.webhookSecret) throw new HttpError(501, 'Payments are not configured')
      const got = Buffer.from(headers['x-sfpy-signature'] ?? '', 'hex')
      const want = Buffer.from(safepaySignature(rawBody, cfg.webhookSecret), 'hex')
      if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(400, 'Invalid signature')

      let json: unknown
      try {
        json = JSON.parse(rawBody.toString('utf8'))
      } catch {
        throw new HttpError(400, 'Malformed event')
      }
      const p = notification.safeParse(json)
      if (!p.success) {
        // Signed but not the shape we expect: say which fields so the adapter can be corrected. No values are logged.
        console.error('Safepay webhook not understood; problem fields:', p.error.issues.map((x) => x.path.join('.')).join(', '))
        return null
      }
      const n = p.data.data.notification
      const orderId = n.metadata?.order_id
      if (!orderId || n.state.toUpperCase() !== 'PAID') return null
      return { type: 'paid', orderId, paymentRef: n.token ?? null, amountMinor: toMinor(String(n.amount), n.currency.toUpperCase()), currency: n.currency.toUpperCase() }
    },
  }
}
