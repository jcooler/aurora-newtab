import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderGateway, createPreviewProviderGateway, type ProviderGatewayDependencies } from './gateway'
import { createPreviewAccountClient } from '../account/previewAccountClient'

const now = Date.UTC(2026, 8, 3, 15, 0, 0)
const origin = 'https://ovlobmvxtryitupxwylg.supabase.co'
const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const accountId = '43000000-0000-4000-8000-000000000001'
const otherAccountId = '43000000-0000-4000-8000-000000000002'
const connectionId = '63000000-0000-4000-8000-000000000001'
const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function connection(id = connectionId) {
  return {
    id,
    provider: 'google_calendar',
    email: 'alex@example.test',
    displayName: 'Alex',
    status: 'active',
    grantedScopes: scopes,
    createdAt: now - 60_000,
    updatedAt: now,
  }
}

function dependencies(): ProviderGatewayDependencies {
  let activeAccountId = accountId
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/google-calendar-connections')) return json({ connections: [connection()] })
    if (url.endsWith('/google-calendar-session')) return json({
      connectionId,
      accessToken: 'provider-access-token',
      expiresAt: now + 3_600_000,
    })
    if (url.endsWith('/google-calendar-disconnect')) return json({
      disconnected: true,
      revocationConfirmed: true,
    })
    if (url.endsWith('/google-calendar-oauth-start')) {
      const requestBody = JSON.parse(String(init?.body))
      expect(requestBody).toEqual({
        clientNonce: nonce,
        finalRedirect: `https://${extensionId}.chromiumapp.org/google-calendar?nonce=${nonce}`,
      })
      return json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' })
    }
    return json({ error: 'unexpected' }, 500)
  })
  return {
    enabled: true,
    origin,
    allowedOrigins: [origin],
    fetch,
    now: () => now,
    randomBytes: () => new Uint8Array(32),
    getAccount: () => ({
      accountId: activeAccountId,
      capabilities: ['multi_account', 'google_calendar'],
      leaseExpiresAt: now + 24 * 60 * 60_000,
    }),
    getAccessToken: vi.fn(async () => 'tab-two-access-token'),
    invalidateAuthentication: vi.fn(async () => undefined),
    identity: {
      getRedirectURL: vi.fn(() => `https://${extensionId}.chromiumapp.org/google-calendar`),
      launchWebAuthFlow: vi.fn(async () => (
        `https://${extensionId}.chromiumapp.org/google-calendar?nonce=${nonce}&result=success`
      )),
    },
    requestGoogleOrigin: vi.fn(async () => true),
    removeGoogleOrigin: vi.fn(async () => true),
    setAccountId(value: string) { activeAccountId = value },
  } as ProviderGatewayDependencies & { setAccountId(value: string): void }
}

describe('extension provider gateway', () => {
  let deps: ProviderGatewayDependencies & { setAccountId(value: string): void }

  beforeEach(() => {
    deps = dependencies() as typeof deps
  })

  it('keeps disabled and local modes request-free', async () => {
    deps.enabled = false
    const gateway = createProviderGateway(deps)
    await expect(gateway.listConnections()).resolves.toEqual({ ok: false, code: 'not_configured' })
    await expect(gateway.getSession(connectionId)).resolves.toEqual({ ok: false, code: 'not_configured' })
    await expect(gateway.connect()).resolves.toEqual({ ok: false, code: 'not_configured' })
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.requestGoogleOrigin).not.toHaveBeenCalled()
  })

  it('requires a current signed-in account with both premium capabilities', async () => {
    deps.getAccount = () => null
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({
      ok: false, code: 'authentication_required',
    })
    deps.getAccount = () => ({ accountId, capabilities: ['google_calendar'], leaseExpiresAt: now + 60_000 })
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({
      ok: false, code: 'entitlement_required',
    })
    deps.getAccount = () => ({
      accountId, capabilities: ['multi_account', 'google_calendar'], leaseExpiresAt: now,
    })
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({
      ok: false, code: 'entitlement_required',
    })
    expect(deps.requestGoogleOrigin).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('requests the optional Google origin in the initiating gesture before any await or backend call', async () => {
    let releasePermission!: (value: boolean) => void
    deps.requestGoogleOrigin = vi.fn(() => new Promise<boolean>((resolve) => { releasePermission = resolve }))
    const gateway = createProviderGateway(deps)
    const result = gateway.connect()

    expect(deps.requestGoogleOrigin).toHaveBeenCalledTimes(1)
    expect(deps.getAccessToken).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
    releasePermission(false)
    await expect(result).resolves.toEqual({ ok: false, code: 'permission_denied' })
  })

  it('normalizes a rejected native permission request as a denial', async () => {
    deps.requestGoogleOrigin = vi.fn(async () => { throw new Error('gesture unavailable') })
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({
      ok: false, code: 'permission_denied',
    })
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('opens exact OAuth, validates its nonce, then returns normalized account connections', async () => {
    const gateway = createProviderGateway(deps)
    await expect(gateway.connect()).resolves.toEqual({
      ok: true,
      value: {
        accountId,
        connections: [{
          connectionId,
          provider: 'google_calendar',
          accountKind: null,
          displayEmail: 'alex@example.test',
          displayName: 'Alex',
          status: 'active',
          grantedScopes: scopes,
          createdAt: now - 60_000,
          updatedAt: now,
        }],
      },
    })
    expect(deps.identity.launchWebAuthFlow).toHaveBeenCalledWith({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      interactive: true,
    })
    expect(deps.fetch).toHaveBeenNthCalledWith(1,
      `${origin}/functions/v1/google-calendar-oauth-start`, expect.objectContaining({ method: 'POST' }))
    expect(deps.fetch).toHaveBeenNthCalledWith(2,
      `${origin}/functions/v1/google-calendar-connections`, expect.objectContaining({ method: 'GET' }))
  })

  it('distinguishes popup closure, provider denial, backend failure, and invalid server payloads', async () => {
    deps.identity.launchWebAuthFlow = vi.fn(async () => { throw new Error('window closed') })
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({ ok: false, code: 'popup_closed' })

    deps = dependencies() as typeof deps
    deps.identity.launchWebAuthFlow = vi.fn(async () => (
      `https://${extensionId}.chromiumapp.org/google-calendar?nonce=${nonce}&result=access_denied`
    ))
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({ ok: false, code: 'provider_denied' })

    deps = dependencies() as typeof deps
    deps.fetch = vi.fn(async () => json({ error: 'provider_service_unavailable' }, 503))
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({ ok: false, code: 'unavailable' })

    deps = dependencies() as typeof deps
    deps.fetch = vi.fn(async () => json({ authorizationUrl: 'https://evil.example/oauth' }))
    await expect(createProviderGateway(deps).connect()).resolves.toEqual({
      ok: false, code: 'invalid_authorization_url',
    })
  })

  it('normalizes list metadata and rejects secrets, unknown keys, and cross-account-shaped payloads', async () => {
    const gateway = createProviderGateway(deps)
    await expect(gateway.listConnections()).resolves.toMatchObject({ ok: true })

    deps.fetch = vi.fn(async () => json({ connections: [{ ...connection(), providerSubject: 'secret' }] }))
    await expect(createProviderGateway(deps).listConnections()).resolves.toEqual({
      ok: false, code: 'unavailable',
    })

    deps.fetch = vi.fn(async () => new Response(JSON.stringify({ connections: [] }), {
      headers: { 'content-type': 'text/plain' },
    }))
    await expect(createProviderGateway(deps).listConnections()).resolves.toEqual({
      ok: false, code: 'unavailable',
    })
  })

  it('keeps access tokens in memory, coalesces concurrent sessions, and refreshes near expiry', async () => {
    let resolveSession!: (response: Response) => void
    deps.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/google-calendar-session')) {
        return new Promise<Response>((resolve) => { resolveSession = resolve })
      }
      return Promise.resolve(json({ connections: [connection()] }))
    })
    const gateway = createProviderGateway(deps)
    const first = gateway.getSession(connectionId)
    const second = gateway.getSession(connectionId)
    await Promise.resolve()
    expect(deps.fetch).toHaveBeenCalledTimes(1)
    resolveSession(json({ connectionId, accessToken: 'provider-access-token', expiresAt: now + 3_600_000 }))
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toEqual(await first)
    await gateway.getSession(connectionId)
    expect(deps.fetch).toHaveBeenCalledTimes(1)

    deps.now = () => now + 3_570_001
    deps.fetch = vi.fn(async () => json({
      connectionId, accessToken: 'replacement-access-token', expiresAt: now + 7_200_000,
    }))
    await expect(gateway.getSession(connectionId)).resolves.toMatchObject({
      ok: true, value: { accessToken: 'replacement-access-token' },
    })
    expect(deps.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears memory on sign-out/account switch and never reuses a session across accounts', async () => {
    const gateway = createProviderGateway(deps)
    await gateway.getSession(connectionId)
    await gateway.getSession(connectionId)
    expect(deps.fetch).toHaveBeenCalledTimes(1)
    gateway.clearMemory()
    await gateway.getSession(connectionId)
    expect(deps.fetch).toHaveBeenCalledTimes(2)

    deps.setAccountId(otherAccountId)
    await gateway.getSession(connectionId)
    expect(deps.fetch).toHaveBeenCalledTimes(3)
  })

  it('does not release a session that finishes after account ownership changes', async () => {
    let resolveSession!: (response: Response) => void
    deps.fetch = vi.fn((input: RequestInfo | URL) => String(input).endsWith('/google-calendar-session')
      ? new Promise<Response>((resolve) => { resolveSession = resolve })
      : Promise.resolve(json({ connections: [] })))
    const gateway = createProviderGateway(deps)
    const stale = gateway.getSession(connectionId)
    await Promise.resolve()
    deps.setAccountId(otherAccountId)
    await gateway.listConnections()
    resolveSession(json({ connectionId, accessToken: 'must-not-escape', expiresAt: now + 3_600_000 }))
    await expect(stale).resolves.toEqual({ ok: false, code: 'authentication_required' })
  })

  it('maps authentication, entitlement, reconnect, and rate failures without returning backend bodies', async () => {
    for (const [status, expected] of [
      [401, 'authentication_required'],
      [403, 'entitlement_required'],
      [409, 'reconnect_required'],
      [429, 'rate_limited'],
      [503, 'unavailable'],
    ] as const) {
      deps = dependencies() as typeof deps
      deps.fetch = vi.fn(async () => json({ error: `secret-backend-body-${status}` }, status))
      const result = await createProviderGateway(deps).getSession(connectionId)
      expect(result).toEqual({ ok: false, code: expected })
      expect(JSON.stringify(result)).not.toContain('secret-backend-body')
      if (status === 401) expect(deps.invalidateAuthentication).toHaveBeenCalledTimes(1)
    }
  })

  it('disconnects exact ownership and removes the Google origin only after the last connection', async () => {
    deps.fetch = vi.fn()
      .mockResolvedValueOnce(json({ disconnected: true, revocationConfirmed: false }))
      .mockResolvedValueOnce(json({ connections: [connection('63000000-0000-4000-8000-000000000002')] }))
      .mockResolvedValueOnce(json({ disconnected: true, revocationConfirmed: true }))
      .mockResolvedValueOnce(json({ connections: [] }))
    const gateway = createProviderGateway(deps)

    await expect(gateway.disconnect(connectionId)).resolves.toEqual({
      ok: true, value: { revocationConfirmed: false, remainingConnections: 1 },
    })
    expect(deps.removeGoogleOrigin).not.toHaveBeenCalled()
    await expect(gateway.disconnect('63000000-0000-4000-8000-000000000002')).resolves.toEqual({
      ok: true, value: { revocationConfirmed: true, remainingConnections: 0 },
    })
    expect(deps.removeGoogleOrigin).toHaveBeenCalledTimes(1)
  })

  it('provides deterministic preview connections and sessions without network or Chrome APIs', async () => {
    const gateway = createPreviewProviderGateway('two-account', now)
    const listed = await gateway.listConnections()
    expect(listed.ok && listed.value.connections).toHaveLength(2)
    const firstId = listed.ok ? listed.value.connections[0]!.connectionId : ''
    await expect(gateway.getSession(firstId)).resolves.toMatchObject({
      ok: true,
      value: { provider: 'google_calendar', accessToken: 'preview-google-calendar-access-token' },
    })

    vi.stubGlobal('location', { search: '?accountState=active' })
    try {
      const previewClient = createPreviewAccountClient()
      const previewAccount = await previewClient.getSnapshot()
      const previewConnections = await previewClient.providerGateways.google_calendar?.listConnections()
      expect(previewConnections?.ok && previewConnections.value.accountId).toBe(previewAccount.accountId)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
