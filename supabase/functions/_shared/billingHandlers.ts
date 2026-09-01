import type { StripeCatalog } from './stripeCatalog.ts'
import type { StripeGateway } from './stripeGateway.ts'
import type { StripeBillingSnapshot, StripePlan } from './stripeTypes.ts'
import { jsonResponse } from './http.ts'

export const BILLING_RETURN_PATH = '/functions/v1/billing-return'

interface ProviderNeutralAccount {
  accountId: string
  email: string
  displayName: string | null
}

export interface BillingFunctionDependencies {
  authenticate(request: Request): Promise<{ ok: true; authUserId: string } | { ok: false }>
  repository: {
    findAccountForAuthUser(authUserId: string): Promise<ProviderNeutralAccount | null>
    findCustomerForAccount(accountId: string): Promise<string | null>
    acquireCustomer(accountId: string, proposedCustomerId: string): Promise<string>
    reserveCheckout(
      accountId: string,
      customerId: string,
      checkoutSessionId: string,
      plan: StripePlan,
      reservationExpiresAt: number,
      effectiveAt: number,
    ): Promise<boolean>
    claimWebhookEvent(input: {
      eventId: string
      eventType: string
      objectId: string
      stripeCreatedAt: number
      payloadSha256: string
      receivedAt: number
    }): Promise<'claimed' | 'resume' | 'duplicate'>
    completeWebhookEvent(eventId: string, outcomeCode: string, processedAt: number): Promise<boolean>
    applyBillingSnapshot(input: {
      accountId: string
      customerId: string
      subscriptionId: string
      checkoutSessionId: string
      plan: StripePlan
      state: 'active' | 'past_due' | 'canceling' | 'expired'
      currentPeriodStart: number | null
      currentPeriodEnd: number | null
      courtesyEnd: number | null
      cancelAtPeriodEnd: boolean
      authoritativeEventCreated: number
      authoritativeEventPriority: number
      authoritativeEventId: string
      outcomeCode: string
      effectiveAt: number
    }): Promise<'applied' | 'stale' | 'introductory_claim_rejected' | 'checkout_binding_rejected' | 'conflicting_subscription'>
  }
  gateway: StripeGateway
  catalog: { load(): Promise<StripeCatalog> }
  rateLimit(accountId: string, action: 'checkout' | 'portal', effectiveAt: number): Promise<boolean>
  returnUrls: {
    successUrl: string
    cancelUrl: string
    portalReturnUrl: string
  }
  now(): number
  webhookSecret: string
}

const plans = new Set<StripePlan>(['monthly', 'annual', 'intro_annual'])
const handledWebhookEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function validBillingSnapshot(snapshot: StripeBillingSnapshot): boolean {
  return uuid.test(snapshot.accountId)
    && /^cus_[A-Za-z0-9_]+$/u.test(snapshot.customerId)
    && /^sub_[A-Za-z0-9_]+$/u.test(snapshot.subscriptionId)
    && /^cs_test_[A-Za-z0-9_]+$/u.test(snapshot.checkoutSessionId ?? '')
    && /^price_[A-Za-z0-9_]+$/u.test(snapshot.priceId)
    && plans.has(snapshot.plan)
    && ['active', 'past_due', 'canceling', 'expired'].includes(snapshot.state)
    && (snapshot.currentPeriodStart === null || Number.isSafeInteger(snapshot.currentPeriodStart))
    && (snapshot.currentPeriodEnd === null || Number.isSafeInteger(snapshot.currentPeriodEnd))
}

function eventPriority(eventType: string, state: StripeBillingSnapshot['state']): number {
  if (state === 'expired' && (eventType.includes('refund') || eventType.includes('dispute'))) return 90
  if (state === 'expired') return 80
  if (eventType === 'invoice.paid' || eventType === 'checkout.session.async_payment_succeeded') return 70
  if (eventType === 'checkout.session.completed') return 60
  if (state === 'past_due') return 50
  if (state === 'canceling') return 40
  return 30
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function exactJsonObject(request: Request, allowedKeys: readonly string[]): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(contentLength) || contentLength > 1_024) return null
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (new TextEncoder().encode(text).byteLength > 1_024) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  const keys = Object.keys(object)
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key))
    ? object
    : null
}

function safeHostedUrl(value: string, expectedHost: 'checkout.stripe.com' | 'billing.stripe.com'): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === expectedHost
      && !url.username
      && !url.password
      && !url.port
  } catch {
    return false
  }
}

async function authenticatedAccount(
  request: Request,
  dependencies: BillingFunctionDependencies,
): Promise<ProviderNeutralAccount | Response> {
  const authentication = await dependencies.authenticate(request)
  if (!authentication.ok) return jsonResponse({ error: 'authentication_required' }, 401)
  const account = await dependencies.repository.findAccountForAuthUser(authentication.authUserId)
  return account ?? jsonResponse({ error: 'account_not_found' }, 403)
}

const returnPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Return to Tab Two</title></head>
<body><main><h1>Return to Tab Two</h1><p>Open Account &amp; Sync and refresh billing to see the current server-verified status.</p>
<p>This page does not confirm or change subscription access.</p></main></body></html>`

export async function billingReturn(request: Request): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405)
  return new Response(returnPage, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  })
}

export function createBillingHandlers(dependencies: BillingFunctionDependencies) {
  return Object.freeze({
    async checkout(request: Request): Promise<Response> {
      if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
      const body = await exactJsonObject(request, ['plan'])
      if (!body || typeof body.plan !== 'string' || !plans.has(body.plan as StripePlan)) {
        return jsonResponse({ error: 'invalid_request' }, 400)
      }
      try {
        const account = await authenticatedAccount(request, dependencies)
        if (account instanceof Response) return account
        const at = dependencies.now()
        if (!await dependencies.rateLimit(account.accountId, 'checkout', at)) {
          return jsonResponse({ error: 'rate_limited' }, 429)
        }
        const plan = body.plan as StripePlan
        const catalog = await dependencies.catalog.load()
        let customerId = await dependencies.repository.findCustomerForAccount(account.accountId)
        if (!customerId) {
          const customer = await dependencies.gateway.createCustomer(account.accountId)
          if (customer.livemode || !/^cus_[A-Za-z0-9_]+$/u.test(customer.id)) {
            return jsonResponse({ error: 'billing_unavailable' }, 503)
          }
          customerId = await dependencies.repository.acquireCustomer(account.accountId, customer.id)
        }
        const expiresAt = at + 31 * 60 * 1_000
        const session = await dependencies.gateway.createCheckoutSession({
          accountId: account.accountId,
          customerId,
          priceId: catalog[plan].priceId,
          couponId: catalog[plan].couponId,
          plan,
          successUrl: dependencies.returnUrls.successUrl,
          cancelUrl: dependencies.returnUrls.cancelUrl,
          expiresAt,
        })
        if (session.livemode || !safeHostedUrl(session.url, 'checkout.stripe.com')) {
          return jsonResponse({ error: 'billing_unavailable' }, 503)
        }
        const reserved = await dependencies.repository.reserveCheckout(
          account.accountId, customerId, session.id, plan, expiresAt, at,
        )
        if (!reserved) return jsonResponse({
          error: plan === 'intro_annual' ? 'introductory_offer_unavailable' : 'billing_checkout_unavailable',
        }, 409)
        return jsonResponse({ url: session.url })
      } catch {
        return jsonResponse({ error: 'billing_unavailable' }, 503)
      }
    },

    async portal(request: Request): Promise<Response> {
      if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
      const body = await exactJsonObject(request, [])
      if (!body) return jsonResponse({ error: 'invalid_request' }, 400)
      try {
        const account = await authenticatedAccount(request, dependencies)
        if (account instanceof Response) return account
        const at = dependencies.now()
        if (!await dependencies.rateLimit(account.accountId, 'portal', at)) {
          return jsonResponse({ error: 'rate_limited' }, 429)
        }
        const customerId = await dependencies.repository.findCustomerForAccount(account.accountId)
        if (!customerId) return jsonResponse({ error: 'billing_not_configured' }, 409)
        const session = await dependencies.gateway.createPortalSession({
          customerId,
          returnUrl: dependencies.returnUrls.portalReturnUrl,
        })
        return session.livemode || !safeHostedUrl(session.url, 'billing.stripe.com')
          ? jsonResponse({ error: 'billing_unavailable' }, 503)
          : jsonResponse({ url: session.url })
      } catch {
        return jsonResponse({ error: 'billing_unavailable' }, 503)
      }
    },

    billingReturn,

    async webhook(request: Request): Promise<Response> {
      if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
      const signature = request.headers.get('stripe-signature') ?? ''
      if (!signature || signature.length > 4_096) return jsonResponse({ error: 'invalid_webhook' }, 400)
      const declaredLength = Number(request.headers.get('content-length') ?? '0')
      if (!Number.isFinite(declaredLength) || declaredLength > 131_072) {
        return jsonResponse({ error: 'webhook_too_large' }, 413)
      }
      let rawBody: Uint8Array
      try {
        rawBody = new Uint8Array(await request.arrayBuffer())
      } catch {
        return jsonResponse({ error: 'invalid_webhook' }, 400)
      }
      if (rawBody.byteLength === 0) return jsonResponse({ error: 'invalid_webhook' }, 400)
      if (rawBody.byteLength > 131_072) return jsonResponse({ error: 'webhook_too_large' }, 413)

      let event: Awaited<ReturnType<StripeGateway['verifyWebhook']>>
      try {
        event = await dependencies.gateway.verifyWebhook(rawBody, signature, dependencies.webhookSecret, 300)
      } catch {
        return jsonResponse({ error: 'invalid_webhook' }, 400)
      }
      if (
        event.livemode
        || !/^evt_[A-Za-z0-9_]+$/u.test(event.id)
        || !event.type
        || !event.objectId
        || !Number.isSafeInteger(event.created)
      ) return jsonResponse({ error: 'invalid_webhook' }, 400)

      const at = dependencies.now()
      try {
        const payloadSha256 = hex(await crypto.subtle.digest('SHA-256', rawBody))
        const claimed = await dependencies.repository.claimWebhookEvent({
          eventId: event.id,
          eventType: event.type,
          objectId: event.objectId,
          stripeCreatedAt: event.created,
          payloadSha256,
          receivedAt: at,
        })
        if (claimed === 'duplicate') return jsonResponse({ received: true, duplicate: true })
        if (!handledWebhookEvents.has(event.type)) {
          await dependencies.repository.completeWebhookEvent(event.id, 'ignored', at)
          return jsonResponse({ received: true })
        }
        if (event.type === 'checkout.session.async_payment_failed') {
          await dependencies.repository.completeWebhookEvent(event.id, 'checkout_async_payment_failed', at)
          return jsonResponse({ received: true })
        }

        const providerSnapshot = await dependencies.gateway.retrieveBillingSnapshot(event)
        if (!validBillingSnapshot(providerSnapshot)) throw new Error('invalid_authoritative_snapshot')
        const catalog = await dependencies.catalog.load()
        if (providerSnapshot.priceId !== catalog[providerSnapshot.plan].priceId) {
          throw new Error('stripe_catalog_snapshot_mismatch')
        }

        let state = providerSnapshot.state
        let currentPeriodStart = state === 'expired' ? null : providerSnapshot.currentPeriodStart
        let currentPeriodEnd = state === 'expired' ? null : providerSnapshot.currentPeriodEnd
        let courtesyEnd = state === 'past_due' && currentPeriodEnd !== null
          ? currentPeriodEnd + 7 * 24 * 60 * 60 * 1_000
          : null
        if (state === 'past_due' && (courtesyEnd === null || courtesyEnd <= at)) {
          state = 'expired'
          currentPeriodStart = null
          currentPeriodEnd = null
          courtesyEnd = null
        }
        const outcomeCode = event.type.replaceAll('.', '_')
        const applyOutcome = await dependencies.repository.applyBillingSnapshot({
          accountId: providerSnapshot.accountId,
          customerId: providerSnapshot.customerId,
          subscriptionId: providerSnapshot.subscriptionId,
          checkoutSessionId: providerSnapshot.checkoutSessionId!,
          plan: providerSnapshot.plan,
          state,
          currentPeriodStart,
          currentPeriodEnd,
          courtesyEnd,
          cancelAtPeriodEnd: state === 'canceling' && providerSnapshot.cancelAtPeriodEnd,
          authoritativeEventCreated: event.created,
          authoritativeEventPriority: eventPriority(event.type, state),
          authoritativeEventId: event.id,
          outcomeCode,
          effectiveAt: at,
        })
        await dependencies.repository.completeWebhookEvent(event.id, applyOutcome, at)
        return jsonResponse({ received: true })
      } catch (error) {
        if (error instanceof Error && error.message === 'webhook_payload_hash_mismatch') {
          return jsonResponse({ error: 'invalid_webhook' }, 400)
        }
        return jsonResponse({ error: 'webhook_unavailable' }, 503)
      }
    },
  })
}

export function fixedBillingReturnUrls(supabaseUrl: string) {
  const origin = new URL(supabaseUrl)
  if (origin.protocol !== 'https:' && origin.hostname !== '127.0.0.1') {
    throw new Error('billing_return_origin_invalid')
  }
  origin.pathname = BILLING_RETURN_PATH
  origin.search = ''
  origin.hash = ''
  return Object.freeze({
    successUrl: `${origin.toString()}?result=success`,
    cancelUrl: `${origin.toString()}?result=cancel`,
    portalReturnUrl: `${origin.toString()}?result=portal`,
  })
}
