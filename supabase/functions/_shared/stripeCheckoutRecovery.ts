import type { StripeCheckoutRecovery, StripePlan } from './stripeTypes.ts'

export interface CheckoutRecoveryStripeClient {
  checkout: {
    sessions: {
      retrieve(
        checkoutSessionId: string,
        parameters: { expand: readonly string[] },
      ): Promise<unknown>
    }
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function id(value: unknown): string | null {
  if (typeof value === 'string') return value
  const expanded = object(value)
  return typeof expanded?.id === 'string' ? expanded.id : null
}

function allowed<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === 'string' && values.includes(value as T) ? value as T : null
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  return typeof metadata?.[key] === 'string' ? metadata[key] as string : null
}

export function normalizeCheckoutRecovery(value: unknown): StripeCheckoutRecovery {
  const session = object(value) ?? {}
  const metadata = object(session.metadata)
  const lineItems = object(session.line_items)
  const lineItemData = Array.isArray(lineItems?.data) ? lineItems.data : []
  const discounts = Array.isArray(session.discounts) ? session.discounts : []
  const expiresSeconds = Number.isSafeInteger(session.expires_at) && Number(session.expires_at) > 0
    ? Number(session.expires_at)
    : null
  const plan = allowed<StripePlan>(metadataString(metadata, 'tab_two_plan'), ['monthly', 'annual', 'intro_annual'])

  return Object.freeze({
    id: typeof session.id === 'string' ? session.id : '',
    url: typeof session.url === 'string' ? session.url : null,
    livemode: session.livemode !== false,
    status: allowed(session.status, ['open', 'complete', 'expired']),
    paymentStatus: allowed(session.payment_status, ['paid', 'unpaid', 'no_payment_required']),
    mode: allowed(session.mode, ['subscription', 'payment', 'setup']),
    customerId: id(session.customer),
    clientReferenceId: typeof session.client_reference_id === 'string' ? session.client_reference_id : null,
    accountId: metadataString(metadata, 'tab_two_account_id'),
    plan,
    priceIds: Object.freeze(lineItemData.flatMap((entry) => {
      const priceId = id(object(entry)?.price)
      return priceId ? [priceId] : []
    })),
    couponIds: Object.freeze(discounts.flatMap((entry) => {
      const couponId = id(object(entry)?.coupon)
      return couponId ? [couponId] : []
    })),
    expiresAt: expiresSeconds === null ? null : expiresSeconds * 1_000,
  })
}

export async function retrieveStripeCheckoutRecovery(
  client: CheckoutRecoveryStripeClient,
  checkoutSessionId: string,
): Promise<StripeCheckoutRecovery> {
  const session = await client.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ['line_items.data.price', 'discounts.coupon'],
  })
  return normalizeCheckoutRecovery(session)
}
