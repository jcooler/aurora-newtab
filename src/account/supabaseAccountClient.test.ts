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
    },
    verifyLease: vi.fn(async (_envelope, accountId) => accountId === 'account-a' ? lease : null),
    refreshLock: {
      request: vi.fn(async (_name, callback) => callback()),
    },
    now: () => now,
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
      subscription: 'complimentary',
      lease,
      sync: expect.objectContaining({ enabled: false, phase: 'disabled' }),
      devices: [],
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

  it('keeps every PM-P3+ action inert and request-free', async () => {
    const client = createSupabaseAccountClient(value.deps)
    await client.getSnapshot()
    vi.mocked(value.deps.api.getAccountSnapshot).mockClear()
    vi.mocked(value.deps.api.getEntitlementLease).mockClear()

    await client.actions.enableSync()
    await client.actions.disableSync()
    await client.actions.syncNow()
    await client.actions.revokeDevice('device-a')
    await client.actions.openPlans()
    await client.actions.openBilling()
    await client.actions.deleteVault()
    await client.actions.deleteAccount()

    expect(value.deps.api.getAccountSnapshot).not.toHaveBeenCalled()
    expect(value.deps.api.getEntitlementLease).not.toHaveBeenCalled()
  })
})
