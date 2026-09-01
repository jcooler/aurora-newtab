import type { StripeGateway } from './stripeGateway.ts'
import type { StripePlan } from './stripeTypes.ts'

interface StripeCatalogEnvironment {
  TAB_TWO_STRIPE_MONTHLY_PRICE_ID?: string
  TAB_TWO_STRIPE_ANNUAL_PRICE_ID?: string
  TAB_TWO_STRIPE_INTRO_COUPON_ID?: string
}

interface CatalogEntry {
  readonly priceId: string
  readonly unitAmount: number
  readonly interval: 'month' | 'year'
  readonly couponId: string | null
}

export type StripeCatalog = Readonly<Record<StripePlan, CatalogEntry>>

const expected: Readonly<Record<'monthly' | 'annual', { unitAmount: number; interval: 'month' | 'year' }>> = Object.freeze({
  monthly: Object.freeze({ unitAmount: 199, interval: 'month' }),
  annual: Object.freeze({ unitAmount: 1_999, interval: 'year' }),
})

function configuredIds(environment: StripeCatalogEnvironment) {
  const ids = {
    monthly: environment.TAB_TWO_STRIPE_MONTHLY_PRICE_ID?.trim() ?? '',
    annual: environment.TAB_TWO_STRIPE_ANNUAL_PRICE_ID?.trim() ?? '',
    introCoupon: environment.TAB_TWO_STRIPE_INTRO_COUPON_ID?.trim() ?? '',
  }
  if (!/^price_[A-Za-z0-9_]+$/u.test(ids.monthly)
    || !/^price_[A-Za-z0-9_]+$/u.test(ids.annual)
    || !/^[A-Za-z0-9_]+$/u.test(ids.introCoupon)) {
    throw new Error('stripe_catalog_configuration_invalid')
  }
  if (ids.monthly === ids.annual) throw new Error('stripe_catalog_configuration_invalid')
  return ids
}

export function createStripeCatalog(environment: StripeCatalogEnvironment, gateway: StripeGateway) {
  let cached: Promise<StripeCatalog> | null = null
  return Object.freeze({
    load(): Promise<StripeCatalog> {
      if (cached) return cached
      cached = (async () => {
        const ids = configuredIds(environment)
        const plans = ['monthly', 'annual'] as const
        const [prices, coupon] = await Promise.all([
          Promise.all(plans.map((plan) => gateway.retrievePrice(ids[plan]))),
          gateway.retrieveCoupon(ids.introCoupon),
        ])
        const entries = {} as Record<StripePlan, CatalogEntry>
        plans.forEach((plan, index) => {
          const price = prices[index]
          const want = expected[plan]
          if (
            price.id !== ids[plan]
            || !price.active
            || price.livemode
            || price.currency !== 'usd'
            || price.unitAmount !== want.unitAmount
            || price.recurringInterval !== want.interval
            || price.taxBehavior !== 'exclusive'
            || !price.product.active
            || !price.product.taxCode
            || price.product.metadata.tab_two_managed_payments_eligible !== 'true'
          ) throw new Error('stripe_catalog_invalid')
          entries[plan] = Object.freeze({ priceId: price.id, ...want, couponId: null })
        })
        if (!coupon.valid || coupon.livemode || coupon.currency !== 'usd'
          || coupon.amountOff !== 1_000 || coupon.duration !== 'once') {
          throw new Error('stripe_catalog_invalid')
        }
        entries.intro_annual = Object.freeze({
          priceId: entries.annual.priceId,
          unitAmount: 999,
          interval: 'year',
          couponId: coupon.id,
        })
        return Object.freeze(entries)
      })()
      return cached
    },
  })
}
