import type { StripeAuthoritativeObjectKind, StripeBillingSnapshot, VerifiedStripeEvent } from './stripeTypes.ts'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function stripeObjectId(value: unknown): string {
  if (typeof value === 'string') return value
  const valueRecord = record(value)
  return typeof valueRecord?.id === 'string' ? valueRecord.id : ''
}

export interface SnapshotStripeClient {
  checkout: { sessions: { retrieve(id: string): Promise<unknown>; list(input: { subscription: string; limit: number }): Promise<{ data: unknown[] }> } }
  subscriptions: { retrieve(id: string): Promise<unknown> }
  invoices: { retrieve(id: string): Promise<unknown> }
  charges: { retrieve(id: string): Promise<unknown> }
  paymentIntents: { retrieve(id: string): Promise<unknown> }
  refunds: { retrieve(id: string): Promise<unknown> }
  disputes: { retrieve(id: string): Promise<unknown> }
}

export async function retrieveStripeObject(client: SnapshotStripeClient, kind: StripeAuthoritativeObjectKind, id: string): Promise<Record<string, unknown>> {
  let value: unknown
  switch (kind) {
    case 'checkout_session': value = await client.checkout.sessions.retrieve(id); break
    case 'subscription': value = await client.subscriptions.retrieve(id); break
    case 'invoice': value = await client.invoices.retrieve(id); break
    case 'charge': value = await client.charges.retrieve(id); break
    case 'refund': value = await client.refunds.retrieve(id); break
    case 'dispute': value = await client.disputes.retrieve(id); break
  }
  const result = record(value)
  if (!result || result.livemode === true) throw new Error('stripe_sandbox_object_required')
  return result
}

function subscriptionFromInvoice(invoice: Record<string, unknown>): string {
  const direct = stripeObjectId(invoice.subscription)
  if (direct) return direct
  const fromDetails = stripeObjectId(record(invoice.subscription_details)?.subscription)
  if (fromDetails) return fromDetails
  return stripeObjectId(record(record(invoice.parent)?.subscription_details)?.subscription)
}

async function chargeForEvent(client: SnapshotStripeClient, kind: StripeAuthoritativeObjectKind, source: Record<string, unknown>) {
  if (kind === 'charge') return source
  if (kind !== 'refund' && kind !== 'dispute') return null
  let chargeId = stripeObjectId(source.charge)
  if (!chargeId) {
    const paymentIntentId = stripeObjectId(source.payment_intent)
    if (paymentIntentId) {
      const paymentIntent = await client.paymentIntents.retrieve(paymentIntentId)
      const paymentIntentRecord = record(paymentIntent)
      if (!paymentIntentRecord || paymentIntentRecord.livemode === true) throw new Error('stripe_sandbox_object_required')
      chargeId = stripeObjectId(paymentIntentRecord.latest_charge)
    }
  }
  if (!chargeId) throw new Error('stripe_charge_unavailable')
  return retrieveStripeObject(client, 'charge', chargeId)
}

function eventForcesRevocation(kind: StripeAuthoritativeObjectKind, source: Record<string, unknown>, charge: Record<string, unknown> | null): boolean {
  if (kind === 'refund') return source.status === 'succeeded' && charge?.refunded === true
  if (kind === 'charge') return source.refunded === true
  if (kind !== 'dispute') return false
  return !['won', 'warning_closed'].includes(String(source.status ?? ''))
}

export async function retrieveStripeBillingSnapshot(client: SnapshotStripeClient, event: VerifiedStripeEvent): Promise<StripeBillingSnapshot> {
  if (event.objectKind === 'unknown' || !event.objectId) throw new Error('stripe_object_unavailable')
  const source = await retrieveStripeObject(client, event.objectKind, event.objectId)
  const directSessionId = event.objectKind === 'checkout_session' ? stripeObjectId(source) : null
  const charge = await chargeForEvent(client, event.objectKind, source)
  const invoice = event.objectKind === 'invoice' ? source : charge
    ? await retrieveStripeObject(client, 'invoice', stripeObjectId(charge.invoice)) : null
  const subscriptionId = event.objectKind === 'subscription' ? stripeObjectId(source)
    : event.objectKind === 'checkout_session' ? stripeObjectId(source.subscription)
      : invoice ? subscriptionFromInvoice(invoice) : ''
  if (!subscriptionId) throw new Error('stripe_subscription_unavailable')

  const subscription = event.objectKind === 'subscription' ? source
    : await retrieveStripeObject(client, 'subscription', subscriptionId)
  let checkoutSessionId = directSessionId
  if (!checkoutSessionId) {
    const sessions = await client.checkout.sessions.list({ subscription: subscriptionId, limit: 2 })
    if (sessions.data.length !== 1) throw new Error('stripe_checkout_binding_unavailable')
    checkoutSessionId = stripeObjectId(sessions.data[0])
  }

  const metadata = record(subscription.metadata) as Record<string, string> | null
  const items = record(subscription.items)?.data
  if (!Array.isArray(items) || items.length !== 1) throw new Error('stripe_subscription_items_invalid')
  const item = record(items[0])
  const priceId = stripeObjectId(record(item?.price))
  if (!item || !priceId || item.quantity !== 1) throw new Error('stripe_subscription_items_invalid')
  const startSeconds = Number(subscription.current_period_start ?? item.current_period_start)
  const endSeconds = Number(subscription.current_period_end ?? item.current_period_end)
  const plan = metadata?.tab_two_plan
  if (plan !== 'monthly' && plan !== 'annual' && plan !== 'intro_annual') throw new Error('stripe_plan_metadata_invalid')

  const status = String(subscription.status ?? '')
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true
  const invoiceStatus = invoice ? String(invoice.status ?? '') : ''
  const revoked = eventForcesRevocation(event.objectKind, source, charge)
    || event.type === 'checkout.session.async_payment_failed' || event.type === 'customer.subscription.deleted'
  const failed = ['invoice.payment_failed', 'invoice.payment_action_required'].includes(event.type) && invoiceStatus !== 'paid'
  const active = ['active', 'trialing'].includes(status)

  return {
    accountId: metadata?.tab_two_account_id ?? '',
    customerId: stripeObjectId(subscription.customer),
    subscriptionId,
    checkoutSessionId,
    priceId,
    plan,
    state: revoked ? 'expired' : failed ? 'past_due' : cancelAtPeriodEnd && active ? 'canceling'
      : active ? 'active' : ['past_due', 'unpaid', 'incomplete'].includes(status) ? 'past_due' : 'expired',
    currentPeriodStart: Number.isSafeInteger(startSeconds) ? startSeconds * 1_000 : null,
    currentPeriodEnd: Number.isSafeInteger(endSeconds) ? endSeconds * 1_000 : null,
    cancelAtPeriodEnd,
  }
}
