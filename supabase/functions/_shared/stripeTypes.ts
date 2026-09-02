export type StripePlan = 'monthly' | 'annual' | 'intro_annual'

export interface StripeProductSummary {
  active: boolean
  taxCode: string | null
  metadata: Readonly<Record<string, string>>
}

export interface StripePriceSummary {
  id: string
  active: boolean
  livemode: boolean
  currency: string
  unitAmount: number | null
  recurringInterval: 'month' | 'year' | null
  taxBehavior: 'exclusive' | 'inclusive' | 'unspecified' | null
  product: StripeProductSummary
}

export interface StripeCouponSummary {
  id: string
  valid: boolean
  livemode: boolean
  currency: string | null
  amountOff: number | null
  duration: 'forever' | 'once' | 'repeating' | null
}

export interface StripeCheckoutSessionInput {
  accountId: string
  customerId: string
  priceId: string
  couponId: string | null
  plan: StripePlan
  successUrl: string
  cancelUrl: string
  expiresAt: number
}

export interface StripeHostedSession {
  id: string
  url: string
  livemode: boolean
}

export interface StripeCheckoutRecovery {
  id: string
  url: string | null
  livemode: boolean
  status: 'open' | 'complete' | 'expired' | null
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required' | null
  mode: 'subscription' | 'payment' | 'setup' | null
  customerId: string | null
  clientReferenceId: string | null
  accountId: string | null
  plan: StripePlan | null
  priceIds: readonly string[]
  couponIds: readonly string[]
  expiresAt: number | null
}

export type StripeAuthoritativeObjectKind =
  | 'checkout_session'
  | 'subscription'
  | 'invoice'
  | 'charge'
  | 'refund'
  | 'dispute'

export interface VerifiedStripeEvent {
  id: string
  type: string
  created: number
  livemode: boolean
  objectId: string
  objectKind: StripeAuthoritativeObjectKind | 'unknown'
}

export interface StripeAuthoritativeObject {
  kind: StripeAuthoritativeObjectKind
  value: unknown
}

export interface StripeBillingSnapshot {
  accountId: string
  customerId: string
  subscriptionId: string
  checkoutSessionId: string | null
  priceId: string
  plan: StripePlan
  state: 'active' | 'past_due' | 'canceling' | 'expired'
  currentPeriodStart: number | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
}
