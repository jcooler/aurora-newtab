import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccountHandlers } from '../_shared/accountHandlers'
import type {
  AccountFunctionDependencies,
  EffectiveEntitlement,
  ProviderNeutralAccount,
} from '../_shared/accountHandlers'
import { authenticateBearerRequest } from '../_shared/requestAuth'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)
const account: ProviderNeutralAccount = {
  accountId: 'account-a',
  email: 'alex@example.test',
  displayName: 'Alex Morgan',
}
const ownerEntitlement: EffectiveEntitlement = {
  capabilities: ['strava', 'encrypted_sync', 'metrics_history'],
  grantSources: ['complimentary_owner'],
  earliestExpiry: null,
}

function request(path: string, method: string, token = 'valid-token'): Request {
  return new Request(`http://127.0.0.1:54321/functions/v1/${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

async function body(response: Response): Promise<unknown> {
  return response.json()
}

function dependencies(): AccountFunctionDependencies {
  return {
    authenticate: vi.fn(async (_request: Request) => ({ ok: true as const, authUserId: 'auth-user-a' })),
    repository: {
      findAccountForAuthUser: vi.fn(async () => account),
      getEffectiveEntitlement: vi.fn(async () => ownerEntitlement),
    },
    now: () => now,
    randomUUID: () => 'lease-a',
    signLease: vi.fn(async (payload) => ({
      algorithm: 'Ed25519' as const,
      keyId: 'local-test-key',
      payload: btoa(JSON.stringify(payload)),
      signature: 'test-signature',
    })),
  }
}

describe('account Edge Function handlers', () => {
  let deps: AccountFunctionDependencies

  beforeEach(() => {
    deps = dependencies()
  })

  it.each([
    ['account snapshot', 'account-snapshot', 'GET'],
    ['entitlement lease', 'entitlement-lease', 'POST'],
  ])('returns a bounded 401 when %s authentication fails', async (_name, path, method) => {
    deps.authenticate = vi.fn(async () => ({ ok: false as const }))
    const response = await createAccountHandlers(deps)[path === 'account-snapshot'
      ? 'accountSnapshot'
      : 'entitlementLease'](request(path, method, 'secret-token-value'))

    const text = await response.text()

    expect(response.status).toBe(401)
    expect(JSON.parse(text)).toEqual({ error: 'authentication_required' })
    expect(text).not.toContain('secret-token-value')
  })

  it.each([
    ['accountSnapshot', 'account-snapshot', 'POST'],
    ['entitlementLease', 'entitlement-lease', 'GET'],
  ] as const)('returns 405 before authentication for %s with the wrong method', async (handler, path, method) => {
    const response = await createAccountHandlers(deps)[handler](request(path, method))

    expect(response.status).toBe(405)
    expect(await body(response)).toEqual({ error: 'method_not_allowed' })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it.each([
    ['accountSnapshot', 'account-snapshot', 'GET'],
    ['entitlementLease', 'entitlement-lease', 'POST'],
  ] as const)('returns 403 when %s has no Google-linked Tab Two account', async (handler, path, method) => {
    deps.repository.findAccountForAuthUser = vi.fn(async () => null)
    const response = await createAccountHandlers(deps)[handler](request(path, method))

    expect(response.status).toBe(403)
    expect(await body(response)).toEqual({ error: 'account_not_found' })
  })

  it('returns only the provider-neutral account snapshot and subscription summary', async () => {
    const response = await createAccountHandlers(deps).accountSnapshot(request('account-snapshot', 'GET'))

    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({
      accountId: 'account-a',
      email: 'alex@example.test',
      displayName: 'Alex Morgan',
      subscription: { state: 'complimentary' },
    })
  })

  it('returns a 30-day account-bound lease with sorted capability and source unions', async () => {
    deps.repository.getEffectiveEntitlement = vi.fn(async () => ({
      capabilities: ['strava', 'encrypted_sync', 'google_calendar'],
      grantSources: ['stripe', 'complimentary_owner'],
      earliestExpiry: null,
    }))
    const response = await createAccountHandlers(deps).entitlementLease(request('entitlement-lease', 'POST'))

    expect(response.status).toBe(200)
    expect(deps.signLease).toHaveBeenCalledWith({
      version: 1,
      leaseId: 'lease-a',
      accountId: 'account-a',
      capabilities: ['encrypted_sync', 'google_calendar', 'strava'],
      grantSources: ['complimentary_owner', 'stripe'],
      issuedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
    })
  })

  it('caps lease expiry at the earliest active grant expiry', async () => {
    deps.repository.getEffectiveEntitlement = vi.fn(async () => ({
      ...ownerEntitlement,
      earliestExpiry: now + 60_000,
    }))
    await createAccountHandlers(deps).entitlementLease(request('entitlement-lease', 'POST'))

    expect(deps.signLease).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: now + 60_000 }))
  })

  it('issues a complimentary owner lease without Stripe state', async () => {
    await createAccountHandlers(deps).entitlementLease(request('entitlement-lease', 'POST'))

    expect(deps.signLease).toHaveBeenCalledWith(expect.objectContaining({
      grantSources: ['complimentary_owner'],
    }))
  })

  it('does not issue a lease when no active grant exists', async () => {
    deps.repository.getEffectiveEntitlement = vi.fn(async () => ({
      capabilities: [],
      grantSources: [],
      earliestExpiry: null,
    }))
    const response = await createAccountHandlers(deps).entitlementLease(request('entitlement-lease', 'POST'))

    expect(response.status).toBe(403)
    expect(await body(response)).toEqual({ error: 'entitlement_unavailable' })
    expect(deps.signLease).not.toHaveBeenCalled()
  })

  it('returns one fixed 503 without reflecting repository errors', async () => {
    deps.repository.findAccountForAuthUser = vi.fn(async () => {
      throw new Error('database failed for secret-token-value and account payload')
    })
    const response = await createAccountHandlers(deps).accountSnapshot(
      request('account-snapshot', 'GET', 'secret-token-value'),
    )
    const text = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ error: 'service_unavailable' })
    expect(text).not.toContain('secret-token-value')
    expect(text).not.toContain('account payload')
  })

  it('marks Stripe-only snapshots active and grantless snapshots none', async () => {
    deps.repository.getEffectiveEntitlement = vi
      .fn()
      .mockResolvedValueOnce({ capabilities: ['strava'], grantSources: ['stripe'], earliestExpiry: null })
      .mockResolvedValueOnce({ capabilities: [], grantSources: [], earliestExpiry: null })
    const handlers = createAccountHandlers(deps)

    expect(await body(await handlers.accountSnapshot(request('account-snapshot', 'GET')))).toEqual(
      expect.objectContaining({ subscription: { state: 'active' } }),
    )
    expect(await body(await handlers.accountSnapshot(request('account-snapshot', 'GET')))).toEqual(
      expect.objectContaining({ subscription: { state: 'none' } }),
    )
  })
})

describe('authenticateBearerRequest', () => {
  it.each([
    ['', 'missing'],
    ['Basic token', 'wrong scheme'],
    ['Bearer token one', 'whitespace'],
    ['Bearer token,second', 'combined values'],
  ])('rejects a %s authorization header without calling Supabase Auth', async (authorization) => {
    const getUser = vi.fn()
    const result = await authenticateBearerRequest(
      new Request('http://local.test', { headers: authorization ? { authorization } : {} }),
      { getUser },
    )

    expect(result).toEqual({ ok: false })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('accepts only a validated Google auth user and returns only its id', async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: 'auth-user-a',
          email: 'must-not-cross-boundary@example.test',
          app_metadata: { provider: 'google', providers: ['google'] },
        },
      },
      error: null,
    }))
    const result = await authenticateBearerRequest(
      request('account-snapshot', 'GET', 'validated-token'),
      { getUser },
    )

    expect(getUser).toHaveBeenCalledWith('validated-token')
    expect(result).toEqual({ ok: true, authUserId: 'auth-user-a' })
  })

  it.each([
    ['auth error', { data: { user: null }, error: { message: 'invalid token' } }],
    ['email provider', {
      data: { user: { id: 'auth-user-a', app_metadata: { provider: 'email', providers: ['email'] } } },
      error: null,
    }],
    ['incomplete Google metadata', {
      data: { user: { id: 'auth-user-a', app_metadata: { provider: 'google', providers: [] } } },
      error: null,
    }],
  ])('rejects %s', async (_name, authResult) => {
    await expect(authenticateBearerRequest(
      request('account-snapshot', 'GET'),
      { getUser: vi.fn(async () => authResult) },
    )).resolves.toEqual({ ok: false })
  })
})
