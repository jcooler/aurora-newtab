import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  billingPlanCopy,
  createBillingSummary,
  localBillingSummary,
  isTrustedBillingHandoff,
} from './billing'
import { createPreviewAccountClient } from './previewAccountClient'

describe('billing domain', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?accountState=signed-in' })
  })

  it('freezes a complete server-derived summary without exposing provider identifiers', () => {
    const summary = createBillingSummary({
      state: 'canceling',
      plan: 'annual',
      currentPeriodEnd: 1_809_216_000_000,
      courtesyEnd: null,
      cancelAtPeriodEnd: true,
      introductoryEligible: false,
    })

    expect(summary).toEqual({
      state: 'canceling',
      plan: 'annual',
      currentPeriodEnd: 1_809_216_000_000,
      courtesyEnd: null,
      cancelAtPeriodEnd: true,
      introductoryEligible: false,
    })
    expect(Object.isFrozen(summary)).toBe(true)
    expect(Object.keys(summary)).not.toContain('customerId')
    expect(Object.keys(summary)).not.toContain('subscriptionId')
  })

  it('keeps the Local summary inert and introductory-eligible', () => {
    expect(localBillingSummary).toEqual({
      state: 'none',
      plan: null,
      currentPeriodEnd: null,
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      introductoryEligible: true,
    })
    expect(Object.isFrozen(localBillingSummary)).toBe(true)
  })

  it('publishes the exact settled prices and first-year renewal disclosure', () => {
    expect(billingPlanCopy).toEqual({
      monthly: { amount: '$1.99', cadence: '/month' },
      annual: { amount: '$19.99', cadence: '/year' },
      intro_annual: {
        amount: '$9.99',
        cadence: 'first year',
        badge: '50% off first year',
        renewal: 'Renews at $19.99/year.',
      },
    })
    expect(Object.values(billingPlanCopy).every(Object.isFrozen)).toBe(true)
  })

  it('uses deterministic preview handoffs and typed outcomes', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const client = createPreviewAccountClient()

    await expect(client.actions.openPlans('monthly')).resolves.toEqual({ status: 'opened' })
    await expect(client.actions.openBilling()).resolves.toEqual({ status: 'opened' })
    expect(open).toHaveBeenNthCalledWith(
      1,
      'https://checkout.stripe.com/c/pay/tab-two-preview-monthly',
      '_blank',
      'noopener',
    )
    expect(open).toHaveBeenNthCalledWith(
      2,
      'https://billing.stripe.com/p/session/tab-two-preview',
      '_blank',
      'noopener',
    )
  })

  it.each([
    ['https://checkout.stripe.com/c/pay/cs_test_a', 'checkout.stripe.com', true],
    ['https://billing.stripe.com/p/session/bps_test_a', 'billing.stripe.com', true],
    ['http://checkout.stripe.com/c/pay/cs_test_a', 'checkout.stripe.com', false],
    ['https://checkout.stripe.com:444/c/pay/cs_test_a', 'checkout.stripe.com', false],
    ['https://user@checkout.stripe.com/c/pay/cs_test_a', 'checkout.stripe.com', false],
    ['https://checkout.stripe.com.attacker.example/c/pay/cs_test_a', 'checkout.stripe.com', false],
    ['https://custom.example/c/pay/cs_test_a', 'checkout.stripe.com', false],
    ['not a url', 'checkout.stripe.com', false],
  ] as const)('validates exact hosted handoff %s', (url, host, expected) => {
    expect(isTrustedBillingHandoff(url, host)).toBe(expected)
  })
})
