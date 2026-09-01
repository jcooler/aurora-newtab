export type BillingPlan = 'monthly' | 'annual' | 'intro_annual'

export type BillingState =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceling'
  | 'expired'
  | 'complimentary'

export interface BillingSummary {
  readonly state: BillingState
  readonly plan: BillingPlan | null
  readonly currentPeriodEnd: number | null
  readonly courtesyEnd: number | null
  readonly cancelAtPeriodEnd: boolean
  readonly introductoryEligible: boolean
}

export type BillingActionOutcome =
  | { readonly status: 'opened' }
  | { readonly status: 'authentication_required' | 'not_configured' | 'unavailable' }

export type BillingRefreshOutcome =
  | { readonly status: 'refreshed' }
  | { readonly status: 'authentication_required' | 'unavailable' }

export const billingPlanCopy: Readonly<Record<BillingPlan, string>> = Object.freeze({
  monthly: '$1.99 monthly',
  annual: '$19.99 annually',
  intro_annual: '$9.99 for your first year, then renews at $19.99 annually',
})

export function createBillingSummary(summary: BillingSummary): BillingSummary {
  return Object.freeze({ ...summary })
}

export const localBillingSummary = createBillingSummary({
  state: 'none',
  plan: null,
  currentPeriodEnd: null,
  courtesyEnd: null,
  cancelAtPeriodEnd: false,
  introductoryEligible: true,
})

export function isTrustedBillingHandoff(
  value: string,
  expectedHost: 'checkout.stripe.com' | 'billing.stripe.com',
): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === expectedHost
      && url.port === ''
      && url.username === ''
      && url.password === ''
  } catch {
    return false
  }
}
