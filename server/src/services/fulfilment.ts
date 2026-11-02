import { randomUUID } from 'node:crypto'
import type { Customer, Fulfilment, Offer, PaymentGateway } from '../integrations/commerce.ts'
import { requireCommerce } from '../integrations/commerce.ts'
import type { Store } from '../models/store.ts'
import type { Booking, Order } from '../models/types.ts'
import { audit } from './audit.ts'
import { decryptJson } from './crypto.ts'

export interface OrderSnapshot {
  offer: Offer
  customer: Customer
}

export interface PaidEvent {
  paymentRef: string | null
  amountMinor: number
  currency: string
}

const save = (store: Store, o: Order, patch: Partial<Order>) => store.saveOrder(Object.assign(o, patch, { updatedAt: new Date().toISOString() }))

/** Money back to the customer. Returns the resulting order status. */
async function refundOrder(store: Store, payments: PaymentGateway, order: Order, note: string): Promise<void> {
  if (!order.paymentRef) {
    await save(store, order, { status: 'needs_attention', note: `${note} No payment reference to refund.` })
    await audit(store, { actorId: order.userId, action: 'order.needs_attention', targetId: order.id, meta: { reason: 'no-payment-intent' } })
    return
  }
  try {
    await payments.refund(order.paymentRef, `refund-${order.id}`)
    await save(store, order, { status: 'refunded', note })
    await audit(store, { actorId: order.userId, action: 'order.refunded', targetId: order.id, meta: { kind: order.kind } })
  } catch {
    await save(store, order, { status: 'needs_attention', note: `${note} The automatic refund failed: refund it manually in Stripe.` })
    await audit(store, { actorId: order.userId, action: 'order.needs_attention', targetId: order.id, meta: { reason: 'refund-failed' } })
  }
}

/**
 * Called when Stripe says a Checkout Session was paid. Safe to call repeatedly (Stripe retries webhooks):
 * only one caller wins the awaiting_payment -> fulfilling claim, everyone else returns immediately.
 */
export async function handlePaid(store: Store, payments: PaymentGateway, orderId: string, paid: PaidEvent): Promise<void> {
  const order = await store.getOrderById(orderId)
  if (!order) return

  // Paid after the session had already expired locally: nothing was reserved, so give the money back.
  if (order.status === 'expired') {
    await save(store, order, { paymentRef: paid.paymentRef })
    await refundOrder(store, payments, order, 'The payment arrived after the checkout expired.')
    return
  }

  // The paid amount must be exactly what we asked for. Anything else is flagged for a person, never auto-fulfilled.
  if (paid.amountMinor !== order.amountMinor || paid.currency.toUpperCase() !== order.currency) {
    if (await store.claimOrder(order.id, 'awaiting_payment', 'needs_attention')) {
      const o = (await store.getOrderById(order.id))!
      await save(store, o, { paymentRef: paid.paymentRef, note: 'The amount paid did not match the order.' })
      await audit(store, { actorId: order.userId, action: 'order.needs_attention', targetId: order.id, meta: { reason: 'amount-mismatch' } })
    }
    return
  }

  if (!(await store.claimOrder(order.id, 'awaiting_payment', 'fulfilling'))) return
  const claimed = (await store.getOrderById(order.id))!
  await save(store, claimed, { paymentRef: paid.paymentRef })

  let result: Fulfilment
  try {
    const snap = decryptJson<OrderSnapshot>(claimed.dataEnc)
    result = await requireCommerce(claimed.kind).fulfil(snap.offer, snap.customer)
    if (!result.reference || !result.providerOrderId) throw new Error('provider returned no reference')
  } catch (e) {
    // The provider did not create anything, so the customer gets their money back.
    console.error('Fulfilment failed for order', claimed.id, e instanceof Error ? e.message : 'unknown')
    await refundOrder(store, payments, claimed, 'The provider could not complete the booking, so your payment was refunded.')
    return
  }

  // From here the provider HAS booked: never refund automatically, and never lose the reference.
  try {
    const booking: Booking = {
      id: randomUUID(), userId: claimed.userId, kind: claimed.kind, status: 'confirmed', source: 'provider', title: claimed.title,
      startDate: claimed.startDate, endDate: claimed.endDate, confirmationRef: result.reference,
      details: { orderId: claimed.id, provider: claimed.provider, ...(result.tickets.length ? { tickets: result.tickets.join(', ').slice(0, 290) } : {}) },
      createdAt: new Date().toISOString(),
    }
    await store.saveBooking(booking)
    await save(store, claimed, {
      status: 'fulfilled', providerOrderId: result.providerOrderId, reference: result.reference, tickets: result.tickets, bookingId: booking.id, note: null,
    })
    await audit(store, { actorId: claimed.userId, action: 'order.fulfilled', targetId: claimed.id, meta: { kind: claimed.kind, provider: claimed.provider } })
  } catch (e) {
    console.error('Booked at provider but could not save order', claimed.id, 'provider order', result.providerOrderId, e instanceof Error ? e.message : 'unknown')
    await save(store, claimed, {
      status: 'needs_attention', providerOrderId: result.providerOrderId, reference: result.reference, tickets: result.tickets,
      note: 'Booked with the provider but saving the confirmation failed.',
    }).catch(() => undefined)
  }
}

/** Stripe session expired unpaid. */
export async function handleExpired(store: Store, orderId: string): Promise<void> {
  await store.claimOrder(orderId, 'awaiting_payment', 'expired')
}
