import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MICROSOFT_CALENDAR_SCOPES } from './connections'
import {
  createProviderGatewayCore,
  type ProviderGatewayConfig,
  type ProviderGatewayCoreDependencies,
} from './gatewayCore'

const now = Date.UTC(2026, 8, 3, 17, 0, 0)
const origin = 'https://ovlobmvxtryitupxwylg.supabase.co'
const accountId = '43000000-0000-4000-8000-000000000001'
const otherAccountId = '43000000-0000-4000-8000-000000000002'
const connectionId = '63000000-0000-4000-8000-000000000001'
const attempt = {
  clientNonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  baseRedirect: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar',
  finalRedirect: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar?nonce=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: connectionId,
    provider: 'microsoft_calendar',
    accountKind: 'work_or_school',
    email: 'alex@contoso.example',
    displayName: 'Alex Morgan',
    status: 'active',
    grantedScopes: MICROSOFT_CALENDAR_SCOPES,
    createdAt: now - 60_000,
    updatedAt: now,
    ...overrides,
  }
}

function config(): ProviderGatewayConfig {
  return {
    provider: 'microsoft_calendar',
    capability: 'microsoft_calendar',
    functionPrefix: 'microsoft-calendar',
    scopes: MICROSOFT_CALENDAR_SCOPES,
    createAttempt: vi.fn(() => attempt),
    launch: vi.fn(async () => ({ ok: true as const })),
  }
}

function dependencies() {
  let activeAccountId = accountId
  let listed = [connection()]
  const events: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    events.push(url.split('/').at(-1) ?? '')
    if (url.endsWith('/microsoft-calendar-oauth-start')) {
      return json({ authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test' })
    }
    if (url.endsWith('/microsoft-calendar-connections')) return json({ connections: listed })
    if (url.endsWith('/microsoft-calendar-session')) {
      return json({ connectionId, accessToken: 'short-lived-microsoft-token', expiresAt: now + 3_600_000 })
    }
    if (url.endsWith('/microsoft-calendar-disconnect')) {
      listed = []
      return json({ disconnected: true, revocationConfirmed: true })
    }
    return json({}, 404)
  }) as typeof globalThis.fetch
  const deps: ProviderGatewayCoreDependencies = {
    enabled: true,
    origin,
    allowedOrigins: [origin],
    fetch,
    now: () => now,
    randomBytes: () => new Uint8Array(32),
    getAccount: () => ({
      accountId: activeAccountId,
      capabilities: ['multi_account', 'microsoft_calendar'],
      leaseExpiresAt: now + 60_000,
    }),
    getAccessToken: vi.fn(async () => {
      events.push('access-token')
      return 'tab-two-access-token'
    }),
    invalidateAuthentication: vi.fn(),
    identity: { getRedirectURL: vi.fn(() => attempt.baseRedirect), launchWebAuthFlow: vi.fn() },
    originPermission: {
      request: vi.fn(() => {
        events.push('permission')
        return Promise.resolve(true)
      }),
      remove: vi.fn(async () => true),
    },
  }
  return {
    deps,
    events,
    setAccount: (value: string) => { activeAccountId = value },
    setConnections: (value: ReturnType<typeof connection>[]) => { listed = value },
  }
}

describe('provider gateway core', () => {
  let value: ReturnType<typeof dependencies>

  beforeEach(() => { value = dependencies() })

  it('fails before network for disabled, signed-out, expired, or partially entitled states', async () => {
    const providerConfig = config()
    value.deps.enabled = false
    await expect(createProviderGatewayCore(providerConfig, value.deps).listConnections())
      .resolves.toEqual({ ok: false, code: 'not_configured' })

    value.deps.enabled = true
    value.deps.getAccount = () => null
    await expect(createProviderGatewayCore(providerConfig, value.deps).listConnections())
      .resolves.toEqual({ ok: false, code: 'authentication_required' })

    value.deps.getAccount = () => ({ accountId, capabilities: ['microsoft_calendar'], leaseExpiresAt: now + 1 })
    await expect(createProviderGatewayCore(providerConfig, value.deps).listConnections())
      .resolves.toEqual({ ok: false, code: 'entitlement_required' })
    expect(value.deps.fetch).not.toHaveBeenCalled()
  })

  it('requests the provider origin in the initiating gesture and uses only exact function paths', async () => {
    const providerConfig = config()
    const gateway = createProviderGatewayCore(providerConfig, value.deps)
    const pending = gateway.connect()
    expect(value.events).toEqual(['permission'])

    await expect(pending).resolves.toMatchObject({ ok: true })
    expect(value.events).toEqual([
      'permission',
      'access-token',
      'microsoft-calendar-oauth-start',
      'access-token',
      'microsoft-calendar-connections',
    ])
    expect(providerConfig.launch).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test',
      attempt,
    )
  })

  it('accepts Personal and Work or school labels but rejects provider substitution and extra fields', async () => {
    const gateway = createProviderGatewayCore(config(), value.deps)
    await expect(gateway.listConnections()).resolves.toMatchObject({
      ok: true,
      value: { connections: [{ provider: 'microsoft_calendar', accountKind: 'work_or_school' }] },
    })

    value.setConnections([connection({ provider: 'google_calendar' })])
    await expect(gateway.listConnections()).resolves.toEqual({ ok: false, code: 'unavailable' })
    value.setConnections([connection({ refreshToken: 'secret' })])
    await expect(gateway.listConnections()).resolves.toEqual({ ok: false, code: 'unavailable' })
  })

  it('deduplicates short-lived sessions and clears them across account ownership changes', async () => {
    const gateway = createProviderGatewayCore(config(), value.deps)
    const [first, second] = await Promise.all([
      gateway.getSession(connectionId),
      gateway.getSession(connectionId),
    ])
    expect(first).toEqual(second)
    expect(value.deps.fetch).toHaveBeenCalledTimes(1)

    await gateway.getSession(connectionId)
    expect(value.deps.fetch).toHaveBeenCalledTimes(1)
    value.setAccount(otherAccountId)
    await gateway.getSession(connectionId)
    expect(value.deps.fetch).toHaveBeenCalledTimes(2)
  })

  it('removes only its own provider origin after its last connection is disconnected', async () => {
    const gateway = createProviderGatewayCore(config(), value.deps)

    await expect(gateway.disconnect(connectionId)).resolves.toEqual({
      ok: true,
      value: { revocationConfirmed: true, remainingConnections: 0 },
    })
    expect(value.deps.originPermission.remove).toHaveBeenCalledTimes(1)
  })
})
