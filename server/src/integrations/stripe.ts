import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../middleware/security.ts'
import type { PaymentGateway } from './commerce.ts'

/**
 * Stripe over plain HTTPS (Checkout Sessions + Refunds + webhook signatures), so no SDK dependency is needed.
 * Card details never touch this server: the customer pays on Stripe's hosted page.
 *
 * NOTE: request/response shapes follow Stripe's public documentation and have been exercised here only against
 * mocked responses. Run a payment in Stripe TEST mode (key starting sk_test_) before going live.
 */

const API = 'https://api.stripe.com/v1'

async function call<T>(key: string, method: 'POST' | 'GET', path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(502, 'The payment provider did not respond')
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) {
    // Stripe error messages are safe to log (no card data), but are not shown to customers verbatim.
    console.error('Stripe error:', res.status, json?.error?.message ?? 'unknown')
    throw new HttpError(502, 'The payment provider rejected the request')
  }
  return json as T
}

export function stripeGateway(secretKey: string, webhookSecret?: string): PaymentGateway {
  return {
    name: 'stripe',
    mode: secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_') ? 'live' : 'test',

    async createCheckout(i) {
      const p = new URLSearchParams({
        mode: 'payment',
        client_reference_id: i.orderId,
        customer_email: i.customerEmail,
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': i.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(i.amountMinor),
        'line_items[0][price_data][product_data][name]': i.title.slice(0, 200),
        'metadata[orderId]': i.orderId,
        'payment_intent_data[metadata][orderId]': i.orderId,
      })
      const s = await call<{ id: string; url: string | null }>(secretKey, 'POST', '/checkout/sessions', p, `checkout-${i.orderId}`)
      if (!s.url) throw new HttpError(502, 'The payment provider did not return a payment page')
      return { sessionId: s.id, url: s.url }
    },

    async refund(paymentIntentId, idempotencyKey) {
      await call(secretKey, 'POST', '/refunds', new URLSearchParams({ payment_intent: paymentIntentId }), idempotencyKey)
    },

    verifyWebhook(rawBody, headers) {
      if (!webhookSecret) throw new HttpError(501, 'Payments are not configured')
      const event = verifyStripeWebhook(rawBody, headers['stripe-signature'], webhookSecret)
      const obj = event.data.object as { payment_status?: string; payment_intent?: string | null; amount_total?: number | null; currency?: string | null; metadata?: { orderId?: string } }
      const orderId = obj.metadata?.orderId
      if (!orderId) return null
      if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
        return {
          type: 'paid', orderId, paymentRef: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
          amountMinor: obj.amount_total ?? -1, currency: (obj.currency ?? '').toUpperCase(),
        }
      }
      if (event.type === 'checkout.session.expired') return { type: 'expired', orderId }
      return null
    },
  }
}

export interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/** Verifies the `Stripe-Signature` header (HMAC-SHA256 over `${timestamp}.${rawBody}`) and returns the parsed event. */
export function verifyStripeWebhook(rawBody: Buffer, header: string | undefined, secret: string, toleranceSec = 300, nowMs = Date.now()): StripeEvent {
  const parts = Object.fromEntries((header ?? '').split(',').map((kv) => kv.trim().split('=') as [string, string]))
  const t = Number(parts.t)
  const signatures = (header ?? '').split(',').map((kv) => kv.trim()).filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3))
  if (!Number.isFinite(t) || signatures.length === 0) throw new HttpError(400, 'Invalid signature')
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) throw new HttpError(400, 'Signature timestamp outside tolerance')
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest()
  const ok = signatures.some((sig) => {
    const got = Buffer.from(sig, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
  if (!ok) throw new HttpError(400, 'Invalid signature')
  try {
    return JSON.parse(rawBody.toString('utf8')) as StripeEvent
  } catch {
    throw new HttpError(400, 'Malformed event')
  }
}
