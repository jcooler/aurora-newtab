import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createBillingHandlers, fixedBillingReturnUrls } from './billingHandlers.ts'
import { createStripeCatalog } from './stripeCatalog.ts'
import { createStripeGateway } from './stripeGateway.ts'
import { authenticateBearerRequest } from './requestAuth.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

function first(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : null
}

function scalar<T>(value: unknown): T {
  if (Array.isArray(value)) return value[0] as T
  return value as T
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export function createRuntimeBillingHandlers(environment: RuntimeEnvironment) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const gateway = createStripeGateway(required(environment, 'STRIPE_SECRET_KEY'))
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const rpc = async <T>(name: string, parameters: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, parameters)
    if (error) {
      const message = typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : ''
      if (message.includes('webhook_payload_hash_mismatch')) throw new Error('webhook_payload_hash_mismatch')
      throw new Error('billing_repository_unavailable')
    }
    return data as T
  }
  const repository = {
    async findAccountForAuthUser(authUserId: string) {
      const row = first(await rpc('tab_two_account_snapshot_for_auth', { target_auth_user_id: authUserId }))
      return row ? {
        accountId: String(row.account_id),
        email: String(row.email),
        displayName: row.display_name === null ? null : String(row.display_name),
      } : null
    },
    async findCustomerForAccount(accountId: string) {
      return scalar<string | null>(await rpc('tab_two_billing_customer_for_account', { target_account_id: accountId })) ?? null
    },
    async acquireCustomer(accountId: string, proposedCustomerId: string) {
      return scalar<string>(await rpc('tab_two_acquire_stripe_customer', {
        target_account_id: accountId,
        proposed_customer_id: proposedCustomerId,
      }))
    },
    async reserveCheckout(accountId: string, customerId: string, checkoutSessionId: string, plan: string, expiresAt: number, effectiveAt: number) {
      return scalar<boolean>(await rpc('tab_two_reserve_billing_checkout', {
        target_account_id: accountId,
        target_customer_id: customerId,
        target_checkout_session_id: checkoutSessionId,
        target_plan: plan,
        reservation_expires_at: iso(expiresAt),
        effective_at: iso(effectiveAt),
      }))
    },
    async claimWebhookEvent(input: {
      eventId: string; eventType: string; objectId: string; stripeCreatedAt: number;
      payloadSha256: string; receivedAt: number
    }) {
      return scalar<'claimed' | 'resume' | 'duplicate'>(await rpc('tab_two_claim_stripe_webhook_event', {
        target_event_id: input.eventId,
        target_event_type: input.eventType,
        target_object_id: input.objectId,
        target_stripe_created_at: input.stripeCreatedAt,
        target_payload_sha256_hex: input.payloadSha256,
        target_received_at: iso(input.receivedAt),
      }))
    },
    async completeWebhookEvent(eventId: string, outcomeCode: string, processedAt: number) {
      return scalar<boolean>(await rpc('tab_two_complete_stripe_webhook_event', {
        target_event_id: eventId,
        target_outcome_code: outcomeCode,
        target_processed_at: iso(processedAt),
      }))
    },
    async applyBillingSnapshot(input: {
      accountId: string; customerId: string; subscriptionId: string; checkoutSessionId: string;
      plan: string; state: string; currentPeriodStart: number | null; currentPeriodEnd: number | null;
      courtesyEnd: number | null; cancelAtPeriodEnd: boolean; authoritativeEventCreated: number;
      authoritativeEventPriority: number; authoritativeEventId: string;
      outcomeCode: string; effectiveAt: number
    }) {
      return scalar<boolean>(await rpc('tab_two_apply_stripe_billing_snapshot', {
        target_account_id: input.accountId,
        target_customer_id: input.customerId,
        target_subscription_id: input.subscriptionId,
        target_checkout_session_id: input.checkoutSessionId,
        target_plan: input.plan,
        target_state: input.state,
        target_current_period_start: iso(input.currentPeriodStart),
        target_current_period_end: iso(input.currentPeriodEnd),
        target_cancel_at_period_end: input.cancelAtPeriodEnd,
        target_authoritative_event_created: input.authoritativeEventCreated,
        target_authoritative_event_priority: input.authoritativeEventPriority,
        target_authoritative_event_id: input.authoritativeEventId,
        target_outcome_code: input.outcomeCode,
        effective_at: iso(input.effectiveAt),
        target_courtesy_end: iso(input.courtesyEnd),
      }))
    },
  }

  return createBillingHandlers({
    authenticate: (request) => authenticateBearerRequest(request, supabase.auth),
    repository,
    gateway,
    catalog: createStripeCatalog({
      TAB_TWO_STRIPE_MONTHLY_PRICE_ID: required(environment, 'TAB_TWO_STRIPE_MONTHLY_PRICE_ID'),
      TAB_TWO_STRIPE_ANNUAL_PRICE_ID: required(environment, 'TAB_TWO_STRIPE_ANNUAL_PRICE_ID'),
      TAB_TWO_STRIPE_INTRO_COUPON_ID: required(environment, 'TAB_TWO_STRIPE_INTRO_COUPON_ID'),
    }, gateway),
    async rateLimit(accountId, action, effectiveAt) {
      return scalar<boolean>(await rpc('tab_two_consume_billing_rate_limit', {
        target_account_id: accountId,
        target_action: action,
        effective_at: iso(effectiveAt),
      }))
    },
    returnUrls: fixedBillingReturnUrls(required(environment, 'TAB_TWO_BILLING_RETURN_ORIGIN')),
    now: Date.now,
    webhookSecret: required(environment, 'STRIPE_WEBHOOK_SECRET'),
  })
}
