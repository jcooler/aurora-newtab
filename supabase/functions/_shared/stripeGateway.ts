import Stripe from 'npm:stripe@22.6.0'
import { retrieveStripeBillingSnapshot, retrieveStripeObject, stripeObjectId } from './stripeNormalization.ts'
import type { SnapshotStripeClient } from './stripeNormalization.ts'
import { retrieveStripeCheckoutRecovery } from './stripeCheckoutRecovery.ts'
import type {
  StripeAuthoritativeObject, StripeAuthoritativeObjectKind, StripeCheckoutSessionInput,
  StripeBillingSnapshot, StripeCheckoutRecovery, StripeCouponSummary, StripeHostedSession, StripePriceSummary, VerifiedStripeEvent,
} from './stripeTypes.ts'

export type StripePrice = StripePriceSummary

export interface StripeGateway {
  retrievePrice(priceId: string): Promise<StripePriceSummary>
  retrieveCoupon(couponId: string): Promise<StripeCouponSummary>
  createCustomer(accountId: string): Promise<{ id: string; livemode: boolean }>
  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeHostedSession>
  retrieveCheckoutSession(checkoutSessionId: string): Promise<StripeCheckoutRecovery>
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<StripeHostedSession>
  verifyWebhook(rawBody: Uint8Array, signature: string, secret: string, toleranceSeconds: number): Promise<VerifiedStripeEvent>
  retrieveAuthoritativeObject(kind: StripeAuthoritativeObjectKind, id: string): Promise<StripeAuthoritativeObject>
  retrieveBillingSnapshot(event: VerifiedStripeEvent): Promise<StripeBillingSnapshot>
  cancelSandboxSubscription(subscriptionId: string): Promise<{
    id: string
    livemode: boolean
    status: 'canceled'
  }>
}

function eventKind(object: unknown): VerifiedStripeEvent['objectKind'] {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return 'unknown'
  switch ((object as { object?: unknown }).object) {
    case 'checkout.session': return 'checkout_session'
    case 'subscription': return 'subscription'
    case 'invoice': return 'invoice'
    case 'charge': return 'charge'
    case 'refund': return 'refund'
    case 'dispute': return 'dispute'
    default: return 'unknown'
  }
}

export function createStripeGateway(secretKey: string): StripeGateway {
  if (!/^sk_test_[A-Za-z0-9_]+$/u.test(secretKey)) throw new Error('stripe_sandbox_secret_required')
  const stripe = new Stripe(secretKey, {
    apiVersion: '2026-08-26.dahlia', maxNetworkRetries: 2, timeout: 10_000, telemetry: false,
  })
  const snapshotClient = stripe as unknown as SnapshotStripeClient

  return {
    async retrievePrice(priceId) {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
      const product = typeof price.product === 'string' || price.product.deleted ? null : price.product
      return {
        id: price.id, active: price.active, livemode: price.livemode, currency: price.currency,
        unitAmount: price.unit_amount,
        recurringInterval: price.recurring?.interval === 'month' || price.recurring?.interval === 'year'
          ? price.recurring.interval : null,
        taxBehavior: price.tax_behavior,
        product: {
          active: product?.active ?? false,
          taxCode: typeof product?.tax_code === 'string' ? product.tax_code : product?.tax_code?.id ?? null,
          metadata: product?.metadata ?? {},
        },
      }
    },
    async retrieveCoupon(couponId) {
      const coupon = await stripe.coupons.retrieve(couponId)
      return { id: coupon.id, valid: coupon.valid, livemode: coupon.livemode, currency: coupon.currency,
        amountOff: coupon.amount_off, duration: coupon.duration }
    },
    async createCustomer(accountId) {
      const customer = await stripe.customers.create({ metadata: { tab_two_account_id: accountId } })
      return { id: customer.id, livemode: customer.livemode }
    },
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: input.customerId, client_reference_id: input.accountId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        ...(input.couponId ? { discounts: [{ coupon: input.couponId }] } : {}),
        managed_payments: { enabled: true },
        metadata: { tab_two_account_id: input.accountId, tab_two_plan: input.plan },
        subscription_data: { metadata: { tab_two_account_id: input.accountId, tab_two_plan: input.plan } },
        success_url: input.successUrl, cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt / 1_000),
      })
      if (!session.url) throw new Error('stripe_checkout_url_unavailable')
      return { id: session.id, url: session.url, livemode: session.livemode }
    },
    async retrieveCheckoutSession(checkoutSessionId) {
      return retrieveStripeCheckoutRecovery(stripe, checkoutSessionId)
    },
    async createPortalSession(input) {
      const session = await stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl })
      return { id: session.id, url: session.url, livemode: session.livemode }
    },
    async verifyWebhook(rawBody, signature, secret, toleranceSeconds) {
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret, toleranceSeconds)
      return { id: event.id, type: event.type, created: event.created, livemode: event.livemode,
        objectId: stripeObjectId(event.data.object), objectKind: eventKind(event.data.object) }
    },
    async retrieveAuthoritativeObject(kind, id) {
      return { kind, value: await retrieveStripeObject(snapshotClient, kind, id) }
    },
    async retrieveBillingSnapshot(event) {
      return retrieveStripeBillingSnapshot(snapshotClient, event)
    },
    async cancelSandboxSubscription(subscriptionId) {
      if (!/^sub_[A-Za-z0-9_]+$/u.test(subscriptionId)) {
        throw new Error('stripe_subscription_invalid')
      }
      const subscription = await stripe.subscriptions.cancel(subscriptionId)
      if (subscription.id !== subscriptionId || subscription.livemode || subscription.status !== 'canceled') {
        throw new Error('stripe_sandbox_cancellation_invalid')
      }
      return { id: subscription.id, livemode: false, status: 'canceled' }
    },
  }
}

export type {
  StripeAuthoritativeObject, StripeAuthoritativeObjectKind, StripeCheckoutSessionInput,
  StripeBillingSnapshot, StripeCheckoutRecovery, StripeHostedSession, StripePriceSummary, VerifiedStripeEvent,
} from './stripeTypes.ts'
