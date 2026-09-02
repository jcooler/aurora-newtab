import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStripeCatalog } from '../_shared/stripeCatalog'
import { retrieveStripeBillingSnapshot, stripeObjectId } from '../_shared/stripeNormalization'
import { createBillingHandlers, fixedBillingReturnUrls } from '../_shared/billingHandlers'
import type { BillingFunctionDependencies } from '../_shared/billingHandlers'
import { normalizeCheckoutRecovery, retrieveStripeCheckoutRecovery } from '../_shared/stripeCheckoutRecovery'
import type { StripeGateway, StripePrice } from '../_shared/stripeGateway'

const environment = {
  TAB_TWO_STRIPE_MONTHLY_PRICE_ID: 'price_test_monthly',
  TAB_TWO_STRIPE_ANNUAL_PRICE_ID: 'price_test_annual',
  TAB_TWO_STRIPE_INTRO_COUPON_ID: 'coupon_test_intro_once',
}

describe('fixedBillingReturnUrls', () => {
  it('pins every Stripe return to one branded HTTPS origin and path', () => {
    expect(fixedBillingReturnUrls('https://tab-two-billing-return.pages.dev')).toEqual({
      successUrl: 'https://tab-two-billing-return.pages.dev/success/',
      cancelUrl: 'https://tab-two-billing-return.pages.dev/cancel/',
      portalReturnUrl: 'https://tab-two-billing-return.pages.dev/billing/',
    })
  })

  it.each([
    'https://attacker.example',
    'https://tab-two-billing-return.pages.dev.attacker.example',
    'https://user@tab-two-billing-return.pages.dev',
    'https://tab-two-billing-return.pages.dev:444',
    'https://tab-two-billing-return.pages.dev/success/',
    'https://tab-two-billing-return.pages.dev?result=success',
  ])('rejects a non-exact hosted return origin: %s', (origin) => {
    expect(() => fixedBillingReturnUrls(origin)).toThrow('billing_return_origin_invalid')
  })

  it('allows only bare loopback HTTP for local function tests', () => {
    expect(fixedBillingReturnUrls('http://127.0.0.1:54321')).toEqual({
      successUrl: 'http://127.0.0.1:54321/success/',
      cancelUrl: 'http://127.0.0.1:54321/cancel/',
      portalReturnUrl: 'http://127.0.0.1:54321/billing/',
    })
  })
})

function validPrice(id: string): StripePrice {
  const annual = id !== environment.TAB_TWO_STRIPE_MONTHLY_PRICE_ID
  return {
    id,
    active: true,
    livemode: false,
    currency: 'usd',
    unitAmount: id === environment.TAB_TWO_STRIPE_MONTHLY_PRICE_ID ? 199 : 1_999,
    recurringInterval: annual ? 'year' : 'month',
    taxBehavior: 'exclusive',
    product: {
      active: true,
      taxCode: 'txcd_10103001',
      metadata: { tab_two_managed_payments_eligible: 'true' },
    },
  }
}

describe('Stripe Checkout recovery boundary', () => {
  const rawSession = Object.freeze({
    id: 'cs_test_recovery',
    object: 'checkout.session',
    url: 'https://checkout.stripe.com/c/pay/cs_test_recovery',
    livemode: false,
    status: 'open',
    payment_status: 'unpaid',
    mode: 'subscription',
    customer: { id: 'cus_recovery', object: 'customer' },
    client_reference_id: '42000000-0000-4000-8000-000000000001',
    metadata: {
      tab_two_account_id: '42000000-0000-4000-8000-000000000001',
      tab_two_plan: 'intro_annual',
    },
    expires_at: 1_788_294_660,
    line_items: { data: [{ quantity: 1, price: { id: 'price_test_annual', object: 'price' } }] },
    discounts: [{ coupon: { id: 'coupon_test_intro_once', object: 'coupon' } }],
  })

  it('normalizes only the primitive Checkout fields needed for exact recovery binding', () => {
    expect(normalizeCheckoutRecovery(rawSession)).toEqual({
      id: 'cs_test_recovery',
      url: 'https://checkout.stripe.com/c/pay/cs_test_recovery',
      livemode: false,
      status: 'open',
      paymentStatus: 'unpaid',
      mode: 'subscription',
      customerId: 'cus_recovery',
      clientReferenceId: '42000000-0000-4000-8000-000000000001',
      accountId: '42000000-0000-4000-8000-000000000001',
      plan: 'intro_annual',
      priceIds: ['price_test_annual'],
      couponIds: ['coupon_test_intro_once'],
      expiresAt: 1_788_294_660_000,
    })
  })

  it('retrieves one Session with the exact expansions before normalization', async () => {
    const client = { checkout: { sessions: { retrieve: vi.fn(async () => rawSession) } } }
    await expect(retrieveStripeCheckoutRecovery(client, 'cs_test_recovery')).resolves.toMatchObject({
      id: 'cs_test_recovery', customerId: 'cus_recovery', plan: 'intro_annual',
    })
    expect(client.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_recovery', {
      expand: ['line_items.data.price', 'discounts.coupon'],
    })
  })

  it.each([
    ['live object', { livemode: true }, { livemode: true }],
    ['completed object', { status: 'complete' }, { status: 'complete' }],
    ['paid object', { payment_status: 'paid' }, { paymentStatus: 'paid' }],
    ['wrong mode', { mode: 'payment' }, { mode: 'payment' }],
    ['missing URL', { url: null }, { url: null }],
    ['ambiguous prices', { line_items: { data: [
      { quantity: 1, price: { id: 'price_a' } }, { quantity: 1, price: { id: 'price_b' } },
    ] } }, { priceIds: ['price_a', 'price_b'] }],
    ['ambiguous coupons', { discounts: [{ coupon: 'coupon_a' }, { coupon: 'coupon_b' }] }, { couponIds: ['coupon_a', 'coupon_b'] }],
    ['missing metadata', { metadata: {} }, { accountId: null, plan: null }],
  ])('preserves the invalid %s signal so the handler can fail closed', (_name, override, expected) => {
    expect(normalizeCheckoutRecovery({ ...rawSession, ...override })).toMatchObject(expected)
  })
})

function fakeGateway(): StripeGateway {
  return {
    retrievePrice: vi.fn(async (id) => validPrice(id)),
    retrieveCoupon: vi.fn(async (id) => ({
      id, valid: true, livemode: false, currency: 'usd', amountOff: 1_000, duration: 'once',
    })),
    createCustomer: vi.fn(),
    createCheckoutSession: vi.fn(),
    retrieveCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    verifyWebhook: vi.fn(),
    retrieveAuthoritativeObject: vi.fn(),
    retrieveBillingSnapshot: vi.fn(),
  }
}

describe('server-owned Stripe catalog', () => {
  let gateway: StripeGateway

  beforeEach(() => {
    gateway = fakeGateway()
  })

  it('maps the introductory plan to a one-use discount on the standard annual renewal price', async () => {
    const catalog = createStripeCatalog(environment, gateway)
    const [first, concurrent] = await Promise.all([catalog.load(), catalog.load()])
    const repeated = await catalog.load()

    expect(first).toEqual({
      monthly: { priceId: 'price_test_monthly', unitAmount: 199, interval: 'month', couponId: null },
      annual: { priceId: 'price_test_annual', unitAmount: 1_999, interval: 'year', couponId: null },
      intro_annual: { priceId: 'price_test_annual', unitAmount: 999, interval: 'year', couponId: 'coupon_test_intro_once' },
    })
    expect(concurrent).toBe(first)
    expect(repeated).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(gateway.retrievePrice).toHaveBeenCalledTimes(2)
    expect(gateway.retrieveCoupon).toHaveBeenCalledOnce()
  })

  it.each([
    ['live object', { livemode: true }],
    ['inactive price', { active: false }],
    ['wrong currency', { currency: 'eur' }],
    ['wrong amount', { unitAmount: 200 }],
    ['wrong interval', { recurringInterval: 'year' }],
    ['unspecified tax behavior', { taxBehavior: 'unspecified' }],
    ['inactive product', { product: { ...validPrice('price_test_monthly').product, active: false } }],
    ['missing eligible tax code', { product: { ...validPrice('price_test_monthly').product, taxCode: null } }],
    ['missing eligibility marker', { product: { ...validPrice('price_test_monthly').product, metadata: {} } }],
  ])('fails closed for a %s without reflecting the provider object', async (_name, override) => {
    gateway.retrievePrice = vi.fn(async (id) => ({ ...validPrice(id), ...(id === 'price_test_monthly' ? override : {}) }))
    const catalog = createStripeCatalog(environment, gateway)

    await expect(catalog.load()).rejects.toThrow('stripe_catalog_invalid')
  })

  it('rejects malformed or duplicate environment price ids before a provider request', async () => {
    const catalog = createStripeCatalog({
      ...environment,
      TAB_TWO_STRIPE_ANNUAL_PRICE_ID: 'price_test_monthly',
      TAB_TWO_STRIPE_INTRO_COUPON_ID: 'secret reflected value!',
    }, gateway)

    await expect(catalog.load()).rejects.toThrow('stripe_catalog_configuration_invalid')
    expect(gateway.retrievePrice).not.toHaveBeenCalled()
  })
})

function subscriptionObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_a',
    object: 'subscription',
    livemode: false,
    customer: 'cus_test_a',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { tab_two_account_id: account.accountId, tab_two_plan: 'monthly' },
    items: { data: [{ quantity: 1, price: { id: 'price_test_monthly' }, current_period_start: 1_788_285_600, current_period_end: 1_790_877_600 }] },
    ...overrides,
  }
}

function snapshotClient(overrides: Record<string, unknown> = {}) {
  return {
    checkout: { sessions: {
      retrieve: vi.fn(),
      list: vi.fn(async () => ({ data: [{ id: 'cs_test_a', livemode: false }] })),
    } },
    subscriptions: { retrieve: vi.fn(async () => subscriptionObject()) },
    invoices: { retrieve: vi.fn() },
    charges: { retrieve: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
    refunds: { retrieve: vi.fn() },
    disputes: { retrieve: vi.fn() },
    ...overrides,
  }
}

describe('real Stripe object normalization boundary', () => {
  it('accepts ordinary string expandable ids and binds the exact Checkout session and price', async () => {
    const client = snapshotClient()
    const snapshot = await retrieveStripeBillingSnapshot(client, {
      id: 'evt_test_subscription', type: 'customer.subscription.updated', created: 1_788_285_600,
      livemode: false, objectId: 'sub_test_a', objectKind: 'subscription',
    })

    expect(stripeObjectId('sub_test_a')).toBe('sub_test_a')
    expect(snapshot).toMatchObject({
      accountId: account.accountId,
      customerId: 'cus_test_a',
      subscriptionId: 'sub_test_a',
      checkoutSessionId: 'cs_test_a',
      priceId: 'price_test_monthly',
      plan: 'monthly',
      state: 'active',
    })
    expect(client.checkout.sessions.list).toHaveBeenCalledWith({ subscription: 'sub_test_a', limit: 2 })
  })

  it('recognizes a flexible-billing cancellation scheduled at the current period end', async () => {
    const currentPeriodEnd = 1_790_877_600
    const client = snapshotClient({
      subscriptions: {
        retrieve: vi.fn(async () => subscriptionObject({
          cancel_at: currentPeriodEnd,
          cancel_at_period_end: false,
        })),
      },
    })

    const snapshot = await retrieveStripeBillingSnapshot(client, {
      id: 'evt_test_canceling', type: 'customer.subscription.updated', created: 1_788_285_600,
      livemode: false, objectId: 'sub_test_a', objectKind: 'subscription',
    })

    expect(snapshot).toMatchObject({
      state: 'canceling',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: currentPeriodEnd * 1_000,
    })
  })

  it.each([
    ['refund', 'refund.created', { status: 'succeeded', charge: 'ch_test_a' }, 'expired'],
    ['dispute', 'charge.dispute.closed', { status: 'won', charge: 'ch_test_a' }, 'active'],
    ['dispute', 'charge.dispute.closed', { status: 'lost', charge: 'ch_test_a' }, 'expired'],
  ] as const)('traverses %s through charge and invoice and derives %s', async (kind, type, source, state) => {
    const client = snapshotClient()
    const sourceRecord = { id: `${kind}_test_a`, object: kind, livemode: false, ...source }
    if (kind === 'refund') client.refunds.retrieve.mockResolvedValue(sourceRecord)
    else client.disputes.retrieve.mockResolvedValue(sourceRecord)
    client.charges.retrieve.mockResolvedValue({ id: 'ch_test_a', livemode: false, invoice: 'in_test_a', refunded: kind === 'refund' })
    client.invoices.retrieve.mockResolvedValue({
      id: 'in_test_a', livemode: false,
      parent: { subscription_details: { subscription: 'sub_test_a' } },
    })

    const snapshot = await retrieveStripeBillingSnapshot(client, {
      id: 'evt_test_adjustment', type, created: 1_788_285_600, livemode: false,
      objectId: `${kind}_test_a`, objectKind: kind,
    })

    expect(snapshot.state).toBe(state)
    expect(client.charges.retrieve).toHaveBeenCalledWith('ch_test_a')
    expect(client.invoices.retrieve).toHaveBeenCalledWith('in_test_a')
  })

  it('follows a Refund PaymentIntent reference when no direct Charge is present', async () => {
    const client = snapshotClient()
    client.refunds.retrieve.mockResolvedValue({
      id: 'refund_test_pi', object: 'refund', livemode: false, status: 'succeeded', payment_intent: 'pi_test_a',
    })
    client.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_test_a', latest_charge: 'ch_test_a' })
    client.charges.retrieve.mockResolvedValue({ id: 'ch_test_a', livemode: false, invoice: 'in_test_a', refunded: true })
    client.invoices.retrieve.mockResolvedValue({ id: 'in_test_a', livemode: false, subscription: 'sub_test_a' })

    const snapshot = await retrieveStripeBillingSnapshot(client, {
      id: 'evt_test_refund_pi', type: 'refund.created', created: 1_788_285_600, livemode: false,
      objectId: 'refund_test_pi', objectKind: 'refund',
    })

    expect(snapshot.state).toBe('expired')
    expect(client.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test_a')
  })
})

const account = {
  accountId: '51000000-0000-4000-8000-000000000001',
  email: 'must-not-cross-billing@example.test',
  displayName: 'Billing Test',
}

function billingDependencies(): BillingFunctionDependencies {
  const gateway = fakeGateway()
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId: 'auth-user-a' })),
    repository: {
      findAccountForAuthUser: vi.fn(async () => account),
      findCustomerForAccount: vi.fn(async () => null),
      acquireCustomer: vi.fn(async (_accountId, customerId) => customerId),
      findActiveCheckout: vi.fn(async () => null),
      expireCheckout: vi.fn(async () => true),
      reserveCheckout: vi.fn(async () => true),
      claimWebhookEvent: vi.fn(async () => 'claimed' as const),
      completeWebhookEvent: vi.fn(async () => true),
      applyBillingSnapshot: vi.fn(async () => 'applied' as const),
    },
    gateway,
    catalog: createStripeCatalog(environment, gateway),
    rateLimit: vi.fn(async () => true),
    returnUrls: {
      successUrl: 'https://project.supabase.co/functions/v1/billing-return?result=success',
      cancelUrl: 'https://project.supabase.co/functions/v1/billing-return?result=cancel',
      portalReturnUrl: 'https://project.supabase.co/functions/v1/billing-return?result=portal',
    },
    now: () => Date.UTC(2026, 8, 1, 18, 0, 0),
    webhookSecret: 'whsec_test_local_fixture',
  }
}

const checkoutAt = Date.UTC(2026, 8, 1, 18, 0, 0)

function activeCheckout(plan: 'monthly' | 'annual' | 'intro_annual' = 'monthly') {
  return {
    checkoutSessionId: 'cs_test_open',
    customerId: 'cus_test_a',
    plan,
    reservedUntil: checkoutAt + 31 * 60 * 1_000,
  }
}

function recoverableCheckout(plan: 'monthly' | 'annual' | 'intro_annual' = 'monthly') {
  const annual = plan !== 'monthly'
  return {
    id: 'cs_test_open',
    url: 'https://checkout.stripe.com/c/pay/cs_test_open',
    livemode: false,
    status: 'open' as const,
    paymentStatus: 'unpaid' as const,
    mode: 'subscription' as const,
    customerId: 'cus_test_a',
    clientReferenceId: account.accountId,
    accountId: account.accountId,
    plan,
    priceIds: [annual ? 'price_test_annual' : 'price_test_monthly'],
    couponIds: plan === 'intro_annual' ? ['coupon_test_intro_once'] : [],
    expiresAt: checkoutAt + 30 * 60 * 1_000,
  }
}

function post(path: string, body: unknown, token = 'valid-token'): Request {
  return new Request(`https://project.supabase.co/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: token ? `Bearer ${token}` : '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('authenticated billing handlers', () => {
  let dependencies: BillingFunctionDependencies

  beforeEach(() => {
    dependencies = billingDependencies()
  })

  it.each([
    ['checkout', 'billing-checkout-session'],
    ['portal', 'billing-portal-session'],
  ] as const)('rejects a wrong method before authentication for %s', async (handler, path) => {
    const response = await createBillingHandlers(dependencies)[handler](new Request(
      `https://project.supabase.co/functions/v1/${path}`,
      { method: 'GET' },
    ))

    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ error: 'method_not_allowed' })
    expect(dependencies.authenticate).not.toHaveBeenCalled()
  })

  it('accepts only one semantic plan and creates a server-owned sandbox Checkout', async () => {
    vi.mocked(dependencies.gateway.createCustomer).mockResolvedValue({ id: 'cus_test_a', livemode: false })
    vi.mocked(dependencies.gateway.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_a', url: 'https://checkout.stripe.com/c/pay/cs_test_a', livemode: false,
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'monthly' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_a', resumed: false })
    expect(dependencies.repository.acquireCustomer).toHaveBeenCalledWith(account.accountId, 'cus_test_a')
    expect(dependencies.gateway.createCustomer).toHaveBeenCalledWith(account.accountId)
    expect(dependencies.gateway.createCheckoutSession).toHaveBeenCalledWith({
      accountId: account.accountId,
      customerId: 'cus_test_a',
      priceId: 'price_test_monthly',
      couponId: null,
      plan: 'monthly',
      successUrl: dependencies.returnUrls.successUrl,
      cancelUrl: dependencies.returnUrls.cancelUrl,
      expiresAt: Date.UTC(2026, 8, 1, 18, 31, 0),
    })
    expect(JSON.stringify(vi.mocked(dependencies.gateway.createCheckoutSession).mock.calls)).not.toContain(account.email)
  })

  it.each([
    ['monthly', [], 'price_test_monthly'],
    ['annual', [], 'price_test_annual'],
    ['intro_annual', ['coupon_test_intro_once'], 'price_test_annual'],
  ] as const)('resumes the exact open %s Checkout without creating or reserving another session', async (plan, couponIds, priceId) => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    Object.assign(dependencies.repository, {
      findActiveCheckout: vi.fn(async () => activeCheckout(plan)),
      expireCheckout: vi.fn(async () => true),
    })
    vi.mocked(dependencies.gateway.retrieveCheckoutSession).mockResolvedValue({
      ...recoverableCheckout(plan), couponIds: [...couponIds], priceIds: [priceId],
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_open', resumed: true,
    })
    expect(dependencies.gateway.retrieveCheckoutSession).toHaveBeenCalledWith('cs_test_open')
    expect(dependencies.gateway.createCheckoutSession).not.toHaveBeenCalled()
    expect(dependencies.repository.reserveCheckout).not.toHaveBeenCalled()
    expect((dependencies.repository as typeof dependencies.repository & { expireCheckout: ReturnType<typeof vi.fn> }).expireCheckout)
      .not.toHaveBeenCalled()
  })

  it('rejects a different plan while another Checkout reservation is still open', async () => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    Object.assign(dependencies.repository, {
      findActiveCheckout: vi.fn(async () => activeCheckout('annual')),
      expireCheckout: vi.fn(async () => true),
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'monthly' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'checkout_already_open' })
    expect(dependencies.gateway.retrieveCheckoutSession).not.toHaveBeenCalled()
    expect(dependencies.gateway.createCheckoutSession).not.toHaveBeenCalled()
  })

  it.each([
    ['completed session', { status: 'complete' as const }],
    ['wrong customer', { customerId: 'cus_attacker' }],
    ['wrong price', { priceIds: ['price_attacker'] }],
    ['unexpected standard coupon', { couponIds: ['coupon_attacker'] }],
    ['expired provider session', { expiresAt: checkoutAt }],
  ])('expires an invalid %s binding before creating a replacement', async (_name, override) => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    const expireCheckout = vi.fn(async () => true)
    Object.assign(dependencies.repository, {
      findActiveCheckout: vi.fn(async () => activeCheckout('monthly')),
      expireCheckout,
    })
    vi.mocked(dependencies.gateway.retrieveCheckoutSession).mockResolvedValue({
      ...recoverableCheckout('monthly'), ...override,
    })
    vi.mocked(dependencies.gateway.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_replacement',
      url: 'https://checkout.stripe.com/c/pay/cs_test_replacement',
      livemode: false,
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'monthly' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_replacement', resumed: false,
    })
    expect(expireCheckout).toHaveBeenCalledWith(account.accountId, 'cs_test_open', checkoutAt)
    expect(dependencies.gateway.createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  it('fails closed when an invalid binding cannot be expired exactly', async () => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    Object.assign(dependencies.repository, {
      findActiveCheckout: vi.fn(async () => activeCheckout('intro_annual')),
      expireCheckout: vi.fn(async () => false),
    })
    vi.mocked(dependencies.gateway.retrieveCheckoutSession).mockResolvedValue({
      ...recoverableCheckout('intro_annual'), couponIds: [],
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'intro_annual' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'billing_checkout_unavailable' })
    expect(dependencies.gateway.createCheckoutSession).not.toHaveBeenCalled()
    expect(dependencies.repository.reserveCheckout).not.toHaveBeenCalled()
  })

  it('expires the exact reservation and replaces it when Stripe retrieval fails transiently', async () => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    const expireCheckout = vi.fn(async () => true)
    Object.assign(dependencies.repository, {
      findActiveCheckout: vi.fn(async () => activeCheckout('annual')),
      expireCheckout,
    })
    vi.mocked(dependencies.gateway.retrieveCheckoutSession).mockRejectedValue(new Error('provider unavailable'))
    vi.mocked(dependencies.gateway.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_replacement',
      url: 'https://checkout.stripe.com/c/pay/cs_test_replacement',
      livemode: false,
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'annual' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_replacement', resumed: false,
    })
    expect(expireCheckout).toHaveBeenCalledWith(account.accountId, 'cs_test_open', checkoutAt)
    expect(dependencies.repository.reserveCheckout).toHaveBeenCalledTimes(1)
  })

  it.each([
    { plan: 'price_test_monthly' },
    { plan: 'monthly', accountId: account.accountId },
    { plan: 'monthly', customerId: 'cus_attacker' },
    { plan: 'monthly', returnUrl: 'https://attacker.example' },
    { plan: 'monthly', email: 'victim@example.test' },
    { plan: 'monthly', extra: true },
  ])('rejects client authority fields before any provider mutation', async (body) => {
    const response = await createBillingHandlers(dependencies).checkout(post('billing-checkout-session', body))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_request' })
    expect(dependencies.gateway.createCustomer).not.toHaveBeenCalled()
    expect(dependencies.gateway.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('reserves an introductory session once and rejects an ineligible race', async () => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    dependencies.repository.reserveCheckout = vi.fn(async () => false)
    vi.mocked(dependencies.gateway.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_intro', url: 'https://checkout.stripe.com/c/pay/cs_test_intro', livemode: false,
    })

    const response = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'intro_annual' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'introductory_offer_unavailable' })
    expect(dependencies.repository.reserveCheckout).toHaveBeenCalledWith(
      account.accountId,
      'cus_test_a',
      'cs_test_intro',
      'intro_annual',
      Date.UTC(2026, 8, 1, 18, 31, 0),
      Date.UTC(2026, 8, 1, 18, 0, 0),
    )
    expect(dependencies.gateway.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      priceId: 'price_test_annual',
      couponId: 'coupon_test_intro_once',
      expiresAt: Date.UTC(2026, 8, 1, 18, 31, 0),
    }))
  })

  it('opens Portal only for the server-owned customer mapping', async () => {
    dependencies.repository.findCustomerForAccount = vi.fn(async () => 'cus_test_a')
    vi.mocked(dependencies.gateway.createPortalSession).mockResolvedValue({
      id: 'bps_test_a', url: 'https://billing.stripe.com/p/session/bps_test_a', livemode: false,
    })

    const response = await createBillingHandlers(dependencies).portal(
      post('billing-portal-session', {}),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://billing.stripe.com/p/session/bps_test_a' })
    expect(dependencies.gateway.createPortalSession).toHaveBeenCalledWith({
      customerId: 'cus_test_a',
      returnUrl: dependencies.returnUrls.portalReturnUrl,
    })
  })

  it('returns bounded authentication, mapping, rate, and provider failures without reflecting secrets', async () => {
    dependencies.authenticate = vi.fn(async () => ({ ok: false as const }))
    const unauthorized = await createBillingHandlers(dependencies).checkout(
      post('billing-checkout-session', { plan: 'monthly' }, 'secret-token-value'),
    )
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.text()).toBe('{"error":"authentication_required"}')

    dependencies = billingDependencies()
    dependencies.rateLimit = vi.fn(async () => false)
    const limited = await createBillingHandlers(dependencies).checkout(post('billing-checkout-session', { plan: 'monthly' }))
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })

    dependencies = billingDependencies()
    dependencies.repository.findCustomerForAccount = vi.fn(async () => null)
    const missing = await createBillingHandlers(dependencies).portal(post('billing-portal-session', {}))
    expect(missing.status).toBe(409)
    expect(await missing.json()).toEqual({ error: 'billing_not_configured' })

    dependencies = billingDependencies()
    dependencies.gateway.createCustomer = vi.fn(async () => { throw new Error('sk_test_secret and victim@example.test') })
    const failed = await createBillingHandlers(dependencies).checkout(post('billing-checkout-session', { plan: 'monthly' }))
    expect(failed.status).toBe(503)
    expect(await failed.text()).toBe('{"error":"billing_unavailable"}')
  })

  it('serves a static non-authoritative return page without invoking account, repository, or provider code', async () => {
    const response = await createBillingHandlers(dependencies).billingReturn(new Request(
      'https://project.supabase.co/functions/v1/billing-return?result=success&session_id=cs_test_attacker',
    ))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(text).toContain('Return to Tab Two')
    expect(text).not.toContain('cs_test_attacker')
    expect(text).not.toContain('payment succeeded')
    expect(dependencies.authenticate).not.toHaveBeenCalled()
    expect(dependencies.repository.findAccountForAuthUser).not.toHaveBeenCalled()
    expect(dependencies.gateway.createCheckoutSession).not.toHaveBeenCalled()
  })
})

function webhookRequest(body = '{"id":"evt_test_a"}', signature = 't=1788285600,v1=test-signature'): Request {
  return new Request('https://project.supabase.co/functions/v1/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body,
  })
}

const verifiedEvent = {
  id: 'evt_test_a',
  type: 'customer.subscription.updated',
  created: 1_788_285_600,
  livemode: false,
  objectId: 'sub_test_a',
  objectKind: 'subscription' as const,
}

const billingSnapshot = {
  accountId: account.accountId,
  customerId: 'cus_test_a',
  subscriptionId: 'sub_test_a',
  checkoutSessionId: 'cs_test_a',
  priceId: 'price_test_monthly',
  plan: 'monthly' as const,
  state: 'active' as const,
  currentPeriodStart: Date.UTC(2026, 8, 1, 18, 0, 0),
  currentPeriodEnd: Date.UTC(2026, 9, 1, 18, 0, 0),
  cancelAtPeriodEnd: false,
}

describe('signature-first Stripe webhook handler', () => {
  let dependencies: BillingFunctionDependencies

  beforeEach(() => {
    dependencies = billingDependencies()
    vi.mocked(dependencies.gateway.verifyWebhook).mockResolvedValue(verifiedEvent)
    vi.mocked(dependencies.gateway.retrieveBillingSnapshot).mockResolvedValue(billingSnapshot)
  })

  it('passes the exact raw bytes to signature verification before claiming or parsing an event', async () => {
    let verified = false
    dependencies.gateway.verifyWebhook = vi.fn(async (raw, signature, secret, tolerance) => {
      expect(new TextDecoder().decode(raw)).toBe('{"id":"evt_test_a","secret":"must-not-log"}')
      expect(signature).toBe('t=1788285600,v1=test-signature')
      expect(secret).toBe('whsec_test_local_fixture')
      expect(tolerance).toBe(300)
      verified = true
      return verifiedEvent
    })
    dependencies.repository.claimWebhookEvent = vi.fn(async () => {
      expect(verified).toBe(true)
      return 'claimed' as const
    })

    const response = await createBillingHandlers(dependencies).webhook(
      webhookRequest('{"id":"evt_test_a","secret":"must-not-log"}'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true })
    expect(dependencies.repository.claimWebhookEvent).toHaveBeenCalledWith({
      eventId: 'evt_test_a',
      eventType: 'customer.subscription.updated',
      objectId: 'sub_test_a',
      stripeCreatedAt: 1_788_285_600,
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      receivedAt: Date.UTC(2026, 8, 1, 18, 0, 0),
    })
  })

  it.each([
    ['missing signature', webhookRequest('{}', '')],
    ['oversized body', webhookRequest('x'.repeat(131_073))],
    ['wrong method', new Request('https://project.supabase.co/functions/v1/stripe-webhook')],
  ])('rejects %s before database work', async (_name, request) => {
    const response = await createBillingHandlers(dependencies).webhook(request)

    expect([400, 405, 413]).toContain(response.status)
    expect(dependencies.repository.claimWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejects invalid signatures and live-mode events before database work without reflecting details', async () => {
    dependencies.gateway.verifyWebhook = vi.fn(async () => { throw new Error('signature and whsec_secret') })
    const invalid = await createBillingHandlers(dependencies).webhook(webhookRequest())
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).toBe('{"error":"invalid_webhook"}')

    dependencies.gateway.verifyWebhook = vi.fn(async () => ({ ...verifiedEvent, livemode: true }))
    const live = await createBillingHandlers(dependencies).webhook(webhookRequest())
    expect(live.status).toBe(400)
    expect(await live.json()).toEqual({ error: 'invalid_webhook' })
    expect(dependencies.repository.claimWebhookEvent).not.toHaveBeenCalled()
  })

  it('acknowledges an exact duplicate without retrieving or replaying billing effects', async () => {
    dependencies.repository.claimWebhookEvent = vi.fn(async () => 'duplicate')
    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, duplicate: true })
    expect(dependencies.gateway.retrieveBillingSnapshot).not.toHaveBeenCalled()
    expect(dependencies.repository.applyBillingSnapshot).not.toHaveBeenCalled()
  })

  it('resumes a previously claimed but unprocessed event after a transient failure', async () => {
    dependencies.repository.claimWebhookEvent = vi.fn(async () => 'resume')
    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(200)
    expect(dependencies.gateway.retrieveBillingSnapshot).toHaveBeenCalledOnce()
    expect(dependencies.repository.applyBillingSnapshot).toHaveBeenCalledOnce()
    expect(dependencies.repository.completeWebhookEvent).toHaveBeenCalledWith(
      'evt_test_a', 'applied', Date.UTC(2026, 8, 1, 18, 0, 0),
    )
  })

  it('records unknown valid events as ignored without retrieving an object', async () => {
    dependencies.gateway.verifyWebhook = vi.fn(async () => ({ ...verifiedEvent, type: 'product.updated', objectKind: 'unknown' }))
    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(200)
    expect(dependencies.repository.completeWebhookEvent).toHaveBeenCalledWith('evt_test_a', 'ignored', Date.UTC(2026, 8, 1, 18, 0, 0))
    expect(dependencies.gateway.retrieveBillingSnapshot).not.toHaveBeenCalled()
  })

  it('acknowledges an asynchronously failed Checkout without inventing a subscription', async () => {
    dependencies.gateway.verifyWebhook = vi.fn(async () => ({
      ...verifiedEvent,
      type: 'checkout.session.async_payment_failed',
      objectKind: 'checkout_session',
      objectId: 'cs_test_failed',
    }))

    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(200)
    expect(dependencies.gateway.retrieveBillingSnapshot).not.toHaveBeenCalled()
    expect(dependencies.repository.completeWebhookEvent).toHaveBeenCalledWith(
      'evt_test_a', 'checkout_async_payment_failed', Date.UTC(2026, 8, 1, 18, 0, 0),
    )
  })

  it.each([
    ['customer.subscription.updated', 'active', false, null, 'active'],
    ['customer.subscription.updated', 'canceling', true, null, 'canceling'],
    ['invoice.payment_failed', 'past_due', false, Date.UTC(2026, 9, 8, 18, 0, 0), 'past_due'],
    ['invoice.paid', 'active', false, null, 'active'],
    ['customer.subscription.deleted', 'expired', false, null, 'expired'],
    ['charge.refunded', 'expired', false, null, 'expired'],
    ['charge.dispute.created', 'expired', false, null, 'expired'],
  ] as const)('normalizes %s into bounded %s authority', async (eventType, providerState, cancelAtPeriodEnd, courtesyEnd, expectedState) => {
    dependencies.gateway.verifyWebhook = vi.fn(async () => ({ ...verifiedEvent, type: eventType }))
    dependencies.gateway.retrieveBillingSnapshot = vi.fn(async () => ({
      ...billingSnapshot,
      state: providerState,
      cancelAtPeriodEnd,
      currentPeriodEnd: eventType === 'invoice.payment_failed' ? Date.UTC(2026, 9, 1, 18, 0, 0) : billingSnapshot.currentPeriodEnd,
    }))

    await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(dependencies.repository.applyBillingSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.accountId,
      customerId: 'cus_test_a',
      subscriptionId: 'sub_test_a',
      plan: 'monthly',
      state: expectedState,
      courtesyEnd,
      authoritativeEventCreated: 1_788_285_600,
      outcomeCode: eventType.replaceAll('.', '_'),
    }))
  })

  it('redeems an introductory Checkout once before applying access and rejects a mismatched claim', async () => {
    dependencies.gateway.verifyWebhook = vi.fn(async () => ({ ...verifiedEvent, type: 'checkout.session.completed', objectKind: 'checkout_session' }))
    dependencies.gateway.retrieveBillingSnapshot = vi.fn(async () => ({
      ...billingSnapshot, plan: 'intro_annual', priceId: 'price_test_annual', checkoutSessionId: 'cs_test_intro_a',
    }))
    dependencies.repository.applyBillingSnapshot = vi.fn(async () => 'introductory_claim_rejected')

    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(200)
    expect(dependencies.repository.applyBillingSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: 'cs_test_intro_a',
      plan: 'intro_annual',
    }))
    expect(dependencies.repository.completeWebhookEvent).toHaveBeenCalledWith(
      'evt_test_a', 'introductory_claim_rejected', Date.UTC(2026, 8, 1, 18, 0, 0),
    )
  })

  it('marks a reordered snapshot stale without changing current billing', async () => {
    dependencies.repository.applyBillingSnapshot = vi.fn(async () => 'stale')
    await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(dependencies.repository.completeWebhookEvent).toHaveBeenCalledWith(
      'evt_test_a', 'stale', Date.UTC(2026, 8, 1, 18, 0, 0),
    )
  })

  it('rejects metadata that does not match the server-reviewed price before applying access', async () => {
    dependencies.gateway.retrieveBillingSnapshot = vi.fn(async () => ({
      ...billingSnapshot,
      priceId: 'price_test_annual',
      plan: 'monthly',
    }))

    const response = await createBillingHandlers(dependencies).webhook(webhookRequest())

    expect(response.status).toBe(503)
    expect(dependencies.repository.applyBillingSnapshot).not.toHaveBeenCalled()
  })
})
