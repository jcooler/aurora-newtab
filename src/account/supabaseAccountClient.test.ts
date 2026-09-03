import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readAccountServiceConfig } from './accountServiceConfig'
import { createSupabaseAccountClient } from './supabaseAccountClient'
import type { SupabaseAccountClientDependencies } from './supabaseAccountClient'
import type { StoredAccountSessionV1 } from './sessionStorage'
import type { VerifiedEntitlementLease } from './types'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)
const session: StoredAccountSessionV1 = {
  version: 1,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: now + 3_600_000,
  tokenType: 'bearer',
}
const lease: VerifiedEntitlementLease = {
  verification: 'verified',
  leaseVersion: 1,
  keyId: 'local-test-key',
  leaseId: 'lease-a',
  accountId: 'account-a',
  capabilities: ['encrypted_sync', 'strava'],
  grantSources: ['complimentary_owner'],
  issuedAt: now - 1_000,
  expiresAt: now + 86_400_000,
}

function dependencies(initialSession: StoredAccountSessionV1 | null = session) {
  let stored = initialSession
  const deps: SupabaseAccountClientDependencies = {
    sessionStore: {
      read: vi.fn(async () => stored),
      write: vi.fn(async (next) => { stored = next }),
      clear: vi.fn(async () => { stored = null }),
      subscribe: vi.fn(() => () => {}),
    },
    googleAuth: {
      begin: vi.fn(async () => ({ ok: true as const, session })),
      reauthenticate: vi.fn(async () => ({ ok: true as const, session })),
    },
    sessionAuth: {
      getUser: vi.fn(async () => ({ status: 'valid' as const, authUserId: 'auth-user-a' })),
      refresh: vi.fn(async () => ({ ok: true as const, session: { ...session, expiresAt: now + 7_200_000 } })),
      signOut: vi.fn(async () => {}),
    },
    api: {
      getAccountSnapshot: vi.fn(async () => ({
        ok: true as const,
        value: {
          accountId: 'account-a',
          email: 'alex@example.test',
          displayName: 'Alex Morgan',
          subscription: { state: 'complimentary' as const },
        },
      })),
      getEntitlementLease: vi.fn(async () => ({ ok: true as const, value: { signed: 'envelope' } })),
      createCheckoutSession: vi.fn(async () => ({
        ok: true as const,
        value: { url: 'https://checkout.stripe.com/c/pay/cs_test_a' },
      })),
      createPortalSession: vi.fn(async () => ({
        ok: true as const,
        value: { url: 'https://billing.stripe.com/p/session/bps_test_a' },
      })),
    },
    sync: {
      origin: 'http://127.0.0.1:54321',
      allowedOrigins: ['http://127.0.0.1:54321'],
      enabled: true,
      fetch: vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
      })) as typeof fetch,
    },
    verifyLease: vi.fn(async (_envelope, accountId) => accountId === 'account-a' ? lease : null),
    refreshLock: {
      request: vi.fn(async (_name, callback) => callback()),
    },
    now: () => now,
    openExternal: vi.fn(),
  }
  return { deps, stored: () => stored }
}

describe('readAccountServiceConfig', () => {
  const valid = {
    MODE: 'account-local',
    VITE_TAB_TWO_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test-key-value',
    VITE_TAB_TWO_TRUSTED_LEASE_KEYS: JSON.stringify({
      'local-test-key': 'MCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }),
  }

  it('accepts only complete account-local configuration', () => {
    expect(readAccountServiceConfig(valid)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_local-test-key-value',
      trustedLeaseKeys: {
        'local-test-key': 'MCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      encryptedSyncEnabled: true,
      googleCalendarEnabled: true,
      microsoftCalendarEnabled: true,
    })
  })

  it.each([
    ['production mode', { ...valid, MODE: 'production' }],
    ['preview mode', { ...valid, MODE: 'preview' }],
    ['host substitution', { ...valid, VITE_TAB_TWO_SUPABASE_URL: 'https://project.supabase.co' }],
    ['missing key', { ...valid, VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: '' }],
    ['secret key', { ...valid, VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' }],
    ['malformed trusted keys', { ...valid, VITE_TAB_TWO_TRUSTED_LEASE_KEYS: 'not-json' }],
    ['empty trusted keys', { ...valid, VITE_TAB_TWO_TRUSTED_LEASE_KEYS: '{}' }],
  ])('fails closed for %s', (_name, env) => {
    expect(readAccountServiceConfig(env)).toBeNull()
  })
})

describe('Supabase AccountClient', () => {
  let value: ReturnType<typeof dependencies>

  beforeEach(() => {
    value = dependencies()
  })

  it('performs no account request when the dedicated session is absent', async () => {
    value = dependencies(null)
    const client = createSupabaseAccountClient(value.deps)

    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({ mode: 'local' }))
    expect(value.deps.sessionAuth.getUser).not.toHaveBeenCalled()
    expect(value.deps.api.getAccountSnapshot).not.toHaveBeenCalled()
    expect(value.deps.api.getEntitlementLease).not.toHaveBeenCalled()
  })

  it('validates the user, fetches the account and lease, then publishes only an account-bound verified lease', async () => {
    const client = createSupabaseAccountClient(value.deps)
    const snapshot = await client.getSnapshot()

    expect(value.deps.sessionAuth.getUser).toHaveBeenCalledWith('access-token')
    expect(value.deps.api.getAccountSnapshot).toHaveBeenCalledWith('access-token')
    expect(value.deps.api.getEntitlementLease).toHaveBeenCalledWith('access-token')
    expect(value.deps.verifyLease).toHaveBeenCalledWith({ signed: 'envelope' }, 'account-a', now)
    expect(snapshot).toEqual(expect.objectContaining({
      mode: 'signed_in',
      accountId: 'account-a',
      email: 'alex@example.test',
      displayName: 'Alex Morgan',
      billing: {
        state: 'complimentary',
        plan: null,
        currentPeriodEnd: null,
        courtesyEnd: null,
        cancelAtPeriodEnd: false,
        introductoryEligible: false,
      },
      lease,
      sync: expect.objectContaining({ enabled: false, phase: 'disabled' }),
      devices: [],
    }))
  })

  it('keeps paid billing visible when a verified lease also includes complimentary owner access', async () => {
    value.deps.api.getAccountSnapshot = vi.fn(async () => ({
      ok: true as const,
      value: {
        accountId: 'account-a',
        email: 'alex@example.test',
        displayName: 'Alex Morgan',
        subscription: {
          state: 'active' as const,
          plan: 'annual' as const,
          currentPeriodEnd: now + 365 * 24 * 60 * 60 * 1_000,
          courtesyEnd: null,
          cancelAtPeriodEnd: false,
          introductoryEligible: false,
        },
      },
    }))
    const client = createSupabaseAccountClient(value.deps)

    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({
      billing: {
        state: 'active',
        plan: 'annual',
        currentPeriodEnd: now + 365 * 24 * 60 * 60 * 1_000,
        courtesyEnd: null,
        cancelAtPeriodEnd: false,
        introductoryEligible: false,
      },
      lease,
    }))
  })

  it('verifies a server-issued lease against the current time after the network response', async () => {
    let clock = now
    const serverIssuedAt = now + 5_000
    value.deps.now = () => clock
    value.deps.api.getEntitlementLease = vi.fn(async () => {
      clock = serverIssuedAt
      return { ok: true as const, value: { signed: 'fresh-server-envelope' } }
    })
    value.deps.verifyLease = vi.fn(async (_envelope, accountId, verificationAt) => (
      accountId === 'account-a' && verificationAt >= serverIssuedAt ? lease : null
    ))
    const client = createSupabaseAccountClient(value.deps)

    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({
      mode: 'signed_in',
      accountId: 'account-a',
    }))
    expect(value.deps.verifyLease).toHaveBeenCalledWith(
      { signed: 'fresh-server-envelope' },
      'account-a',
      serverIssuedAt,
    )
  })

  it('does not display complimentary authority without a matching verified owner lease', async () => {
    value.deps.api.getEntitlementLease = vi.fn(async () => ({
      ok: false as const,
      kind: 'not_entitled' as const,
    }))
    const client = createSupabaseAccountClient(value.deps)

    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({
      mode: 'signed_in',
      billing: expect.objectContaining({ state: 'none' }),
      lease: null,
    }))
  })

  it('stores only the validated auth session and never enables sync or uploads product data on sign-in', async () => {
    value = dependencies(null)
    const client = createSupabaseAccountClient(value.deps)
    const listener = vi.fn()
    client.subscribe(listener)

    await expect(client.actions.beginSignIn()).resolves.toEqual({ ok: true })
    expect(value.deps.googleAuth.begin).toHaveBeenCalledOnce()
    expect(value.deps.sessionStore.write).toHaveBeenCalledWith(session)
    expect(value.deps.api.getAccountSnapshot).toHaveBeenCalledTimes(1)
    expect(value.deps.api.getEntitlementLease).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'signed_in',
      sync: expect.objectContaining({ enabled: false }),
    }))
    expect(value.deps.sync?.fetch).not.toHaveBeenCalled()
  })

  it('exposes the authenticated gateway without calling it while sync remains off', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    expect(client.syncGateway).not.toBeNull()
    expect(value.deps.sync?.fetch).not.toHaveBeenCalled()
    await expect(client.actions.enableSync()).resolves.toEqual({ status: 'needs_attention' })
    expect(value.deps.sync?.fetch).not.toHaveBeenCalled()
  })

  it('lends the current Tab Two session to the provider gateway only after verified provider entitlement', async () => {
    const providerAccountId = '43000000-0000-4000-8000-000000000001'
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({ connections: [] }), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
    value.deps.api.getAccountSnapshot = vi.fn(async () => ({
      ok: true as const,
      value: {
        accountId: providerAccountId,
        email: 'alex@example.test',
        displayName: 'Alex Morgan',
        subscription: { state: 'complimentary' as const },
      },
    }))
    value.deps.verifyLease = vi.fn(async () => ({
      ...lease,
      accountId: providerAccountId,
      capabilities: ['multi_account', 'google_calendar'] as const,
    }))
    value.deps.provider = {
      enabled: true,
      origin: 'https://ovlobmvxtryitupxwylg.supabase.co',
      allowedOrigins: ['https://ovlobmvxtryitupxwylg.supabase.co'],
      fetch: providerFetch,
      randomBytes: () => new Uint8Array(32),
      identity: {
        getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-calendar',
        launchWebAuthFlow: vi.fn(),
      },
      requestGoogleOrigin: vi.fn(async () => true),
      removeGoogleOrigin: vi.fn(async () => true),
    }
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    expect(client.providerGateways.google_calendar).toBeDefined()
    await expect(client.providerGateways.google_calendar?.listConnections()).resolves.toEqual({
      ok: true,
      value: { accountId: providerAccountId, connections: [] },
    })
    expect(providerFetch).toHaveBeenCalledWith(
      'https://ovlobmvxtryitupxwylg.supabase.co/functions/v1/google-calendar-connections',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
      }),
    )
  })

  it('exposes independently entitled Google and Microsoft gateways', async () => {
    const providerAccountId = '43000000-0000-4000-8000-000000000001'
    const providerResponse = (provider: 'google_calendar' | 'microsoft_calendar') => ({
      connections: provider === 'google_calendar' ? [] : [{
        id: '63000000-0000-4000-8000-000000000001',
        provider,
        accountKind: 'work_or_school',
        email: 'alex@contoso.example',
        displayName: 'Alex',
        status: 'active',
        grantedScopes: [
          'openid',
          'offline_access',
          'https://graph.microsoft.com/User.Read',
          'https://graph.microsoft.com/Calendars.ReadBasic',
        ],
        createdAt: now - 1,
        updatedAt: now,
      }],
    })
    value.deps.api.getAccountSnapshot = vi.fn(async () => ({
      ok: true as const,
      value: {
        accountId: providerAccountId,
        email: 'alex@example.test',
        displayName: 'Alex Morgan',
        subscription: { state: 'complimentary' as const },
      },
    }))
    value.deps.verifyLease = vi.fn(async () => ({
      ...lease,
      accountId: providerAccountId,
      capabilities: ['multi_account', 'google_calendar', 'microsoft_calendar'] as const,
    }))
    value.deps.provider = {
      enabled: true,
      origin: 'https://ovlobmvxtryitupxwylg.supabase.co',
      allowedOrigins: ['https://ovlobmvxtryitupxwylg.supabase.co'],
      fetch: vi.fn(async () => new Response(JSON.stringify(providerResponse('google_calendar')), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
      randomBytes: () => new Uint8Array(32),
      identity: {
        getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-calendar',
        launchWebAuthFlow: vi.fn(),
      },
      requestGoogleOrigin: vi.fn(async () => true),
      removeGoogleOrigin: vi.fn(async () => true),
    }
    value.deps.microsoftProvider = {
      enabled: true,
      origin: 'https://ovlobmvxtryitupxwylg.supabase.co',
      allowedOrigins: ['https://ovlobmvxtryitupxwylg.supabase.co'],
      fetch: vi.fn(async () => new Response(JSON.stringify(providerResponse('microsoft_calendar')), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
      randomBytes: () => new Uint8Array(32),
      identity: {
        getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar',
        launchWebAuthFlow: vi.fn(),
      },
      requestMicrosoftOrigin: vi.fn(async () => true),
      removeMicrosoftOrigin: vi.fn(async () => true),
    }
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    expect(Object.keys(client.providerGateways).sort()).toEqual([
      'google_calendar',
      'microsoft_calendar',
    ])
    await expect(client.providerGateways.microsoft_calendar?.listConnections()).resolves.toMatchObject({
      ok: true,
      value: { connections: [{ accountKind: 'work_or_school' }] },
    })
  })

  it('makes zero Microsoft hosted requests while the provider gate is disabled', async () => {
    const microsoftFetch = vi.fn<typeof fetch>()
    value.deps.microsoftProvider = {
      enabled: false,
      origin: 'https://ovlobmvxtryitupxwylg.supabase.co',
      allowedOrigins: ['https://ovlobmvxtryitupxwylg.supabase.co'],
      fetch: microsoftFetch,
      randomBytes: () => new Uint8Array(32),
      identity: {
        getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar',
        launchWebAuthFlow: vi.fn(),
      },
      requestMicrosoftOrigin: vi.fn(async () => true),
      removeMicrosoftOrigin: vi.fn(async () => true),
    }
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    await expect(client.providerGateways.microsoft_calendar?.listConnections())
      .resolves.toEqual({ ok: false, code: 'not_configured' })
    expect(microsoftFetch).not.toHaveBeenCalled()
  })

  it('never lends the stored session to a gateway request for another account', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    const result = await client.syncGateway?.bootstrap({
      accountId: '42000000-0000-4000-8000-000000000002',
      deviceId: 'AAECAwQFBgcICQoLDA0ODw',
      friendlyName: 'Primary browser',
    })
    expect(result).toEqual({ ok: false, kind: 'authentication_required' })
    expect(value.deps.sync?.fetch).not.toHaveBeenCalled()
  })

  it('returns typed entitlement outcomes without network for every sync action when the lease is absent', async () => {
    value.deps.api.getEntitlementLease = vi.fn(async () => ({
      ok: false as const,
      kind: 'not_entitled' as const,
    }))
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    const outcomes = await Promise.all([
      client.actions.enableSync('Primary browser'),
      client.actions.disableSync(),
      client.actions.syncNow(),
      client.actions.renameDevice('device-a', 'Work browser'),
      client.actions.revokeDevice('device-a'),
      client.actions.restoreConflictBackup('backup-a'),
      client.actions.discardConflictBackup('backup-a'),
      client.actions.deleteVault(),
      client.actions.deleteAccount(),
    ])
    expect(outcomes).toEqual([
      { status: 'entitlement_required' },
      { status: 'needs_attention' },
      { status: 'entitlement_required' },
      { status: 'entitlement_required' },
      { status: 'entitlement_required' },
      { status: 'entitlement_required' },
      { status: 'entitlement_required' },
      { status: 'needs_attention' },
      { status: 'needs_attention' },
    ])
    expect(value.deps.sync?.fetch).not.toHaveBeenCalled()
  })

  it('uses fresh reauthentication when beginSignIn is called from signed-in state', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    await client.actions.beginSignIn()

    expect(value.deps.googleAuth.reauthenticate).toHaveBeenCalledOnce()
    expect(value.deps.googleAuth.begin).not.toHaveBeenCalled()
  })

  it('refreshes an expiring session inside one named Web Lock before validation', async () => {
    value = dependencies({ ...session, expiresAt: now + 30_000 })
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    expect(value.deps.refreshLock.request).toHaveBeenCalledWith(
      'tab-two:account-session-refresh:v1',
      expect.any(Function),
    )
    expect(value.deps.sessionAuth.refresh).toHaveBeenCalledWith('refresh-token')
    expect(value.deps.sessionStore.write).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: now + 7_200_000 }),
    )
    expect(value.deps.sessionAuth.getUser).toHaveBeenCalledWith('access-token')
  })

  it('keeps the last still-valid verified lease offline without granting anything new', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    value.deps.api.getAccountSnapshot = vi.fn(async () => ({ ok: false as const, kind: 'unavailable' as const }))

    const offline = await client.getSnapshot()
    expect(offline).toEqual(expect.objectContaining({
      mode: 'signed_in',
      lease,
      sync: expect.objectContaining({ enabled: false, phase: 'offline' }),
    }))
  })

  it.each([
    ['tampered lease', (deps: SupabaseAccountClientDependencies) => {
      deps.verifyLease = vi.fn(async () => null)
    }],
    ['revoked session', (deps: SupabaseAccountClientDependencies) => {
      deps.sessionAuth.getUser = vi.fn(async () => ({ status: 'invalid' as const }))
    }],
    ['wrong account response', (deps: SupabaseAccountClientDependencies) => {
      deps.api.getAccountSnapshot = vi.fn(async () => ({
        ok: true as const,
        value: {
          accountId: 'account-b',
          email: 'b@example.test',
          displayName: null,
          subscription: { state: 'none' as const },
        },
      }))
      deps.verifyLease = vi.fn(async () => null)
    }],
  ])('clears account authority for a %s', async (_name, mutate) => {
    mutate(value.deps)
    const client = createSupabaseAccountClient(value.deps)

    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({ mode: 'local' }))
    expect(value.deps.sessionStore.clear).toHaveBeenCalled()
  })

  it('signs out remotely and clears locally even when remote logout fails', async () => {
    value.deps.sessionAuth.signOut = vi.fn(async () => { throw new Error('remote failure with token') })
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    await client.actions.signOut()

    expect(value.deps.sessionAuth.signOut).toHaveBeenCalledOnce()
    expect(value.deps.sessionStore.clear).toHaveBeenCalled()
    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({ mode: 'local' }))
  })

  it('opens only server-selected hosted billing URLs in one normal tab', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    await expect(client.actions.openPlans('annual')).resolves.toEqual({ status: 'opened' })
    await expect(client.actions.openBilling()).resolves.toEqual({ status: 'opened' })
    expect(value.deps.api.createCheckoutSession).toHaveBeenCalledWith('access-token', 'annual')
    expect(value.deps.api.createPortalSession).toHaveBeenCalledWith('access-token')
    expect(value.deps.openExternal).toHaveBeenNthCalledWith(1, 'https://checkout.stripe.com/c/pay/cs_test_a')
    expect(value.deps.openExternal).toHaveBeenNthCalledWith(2, 'https://billing.stripe.com/p/session/bps_test_a')
  })

  it.each([
    ['Checkout lookalike', 'createCheckoutSession', 'https://checkout.stripe.com.attacker.example/c/pay/x'],
    ['Checkout user info', 'createCheckoutSession', 'https://user@checkout.stripe.com/c/pay/x'],
    ['Checkout port', 'createCheckoutSession', 'https://checkout.stripe.com:444/c/pay/x'],
    ['Portal custom domain', 'createPortalSession', 'https://example.test/portal'],
  ] as const)('rejects a %s without opening a tab', async (_name, method, url) => {
    value.deps.api[method] = vi.fn(async () => ({ ok: true as const, value: { url } }))
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()

    const result = method === 'createCheckoutSession'
      ? await client.actions.openPlans('monthly')
      : await client.actions.openBilling()

    expect(result).toEqual({ status: 'unavailable' })
    expect(value.deps.openExternal).not.toHaveBeenCalled()
  })

  it('requires authentication before billing and clears authority on a rejected billing session', async () => {
    value = dependencies(null)
    const local = createSupabaseAccountClient(value.deps)
    await expect(local.actions.openPlans('monthly')).resolves.toEqual({ status: 'authentication_required' })
    expect(value.deps.api.createCheckoutSession).not.toHaveBeenCalled()

    value = dependencies()
    value.deps.api.createPortalSession = vi.fn(async () => ({ ok: false as const, kind: 'unauthorized' as const }))
    const signed = createSupabaseAccountClient(value.deps)
    await signed.getSnapshot()
    await expect(signed.actions.openBilling()).resolves.toEqual({ status: 'authentication_required' })
    expect(value.deps.sessionStore.clear).toHaveBeenCalled()
  })

  it('refreshes the account snapshot and signed lease without trusting browser return state', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    vi.mocked(value.deps.api.getAccountSnapshot).mockClear()
    vi.mocked(value.deps.api.getEntitlementLease).mockClear()

    await expect(client.actions.refreshBilling()).resolves.toEqual({ status: 'refreshed' })
    expect(value.deps.api.getAccountSnapshot).toHaveBeenCalledOnce()
    expect(value.deps.api.getEntitlementLease).toHaveBeenCalledOnce()
  })

  it('reports an unavailable billing refresh when only the stale offline snapshot survives', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    value.deps.api.getAccountSnapshot = vi.fn(async () => ({ ok: false as const, kind: 'unavailable' as const }))

    await expect(client.actions.refreshBilling()).resolves.toEqual({ status: 'unavailable' })
    expect((await client.getSnapshot()).mode).toBe('signed_in')
  })
})
