import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMicrosoftProviderHandlers,
  type MicrosoftProviderFunctionDependencies,
} from '../_shared/providerMicrosoftAuth'
import {
  createProviderMicrosoftGateway,
  MICROSOFT_CALENDAR_SCOPES,
  ProviderMicrosoftError,
} from '../_shared/providerMicrosoft'
import {
  decodeProviderBase64Url,
  encodeProviderBase64Url,
  type ProviderSecretEnvelope,
} from '../_shared/providerCrypto'
import type {
  PrivateProviderConnection,
  ProviderOAuthTransaction,
} from '../_shared/providerTypes'

const now = Date.UTC(2026, 8, 3, 14, 0, 0)
const accountId = '43000000-0000-4000-8000-000000000001'
const otherAccountId = '43000000-0000-4000-8000-000000000002'
const connectionId = '62000000-0000-4000-8000-000000000001'
const transactionId = '72000000-0000-4000-8000-000000000001'
const correlationId = '82000000-0000-4000-8000-000000000001'
const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const clientId = 'microsoft-client-id'
const clientSecret = 'microsoft-client-secret'
const personalTenant = '9188040d-6c67-4c5b-b112-36a304b66dad'
const workTenant = '52000000-0000-4000-8000-000000000001'
const objectId = '62000000-0000-4000-8000-000000000099'
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const state = encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x04))
const verifier = encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x08))
const finalRedirect = `https://${extensionId}.chromiumapp.org/microsoft-calendar?nonce=${nonce}`

const envelope: ProviderSecretEnvelope = {
  keyVersion: 1,
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  fingerprint: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

function request(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://project.supabase.co/functions/v1/${path}`, {
    method,
    headers: {
      origin: `chrome-extension://${extensionId}`,
      authorization: 'Bearer valid-tab-two-session',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function responseJson(response: Response): Promise<any> {
  return response.json()
}

async function signedMicrosoftIdentity({
  tenantId = personalTenant,
  oid = objectId,
  overrides = {},
}: {
  tenantId?: string
  oid?: string
  overrides?: Record<string, unknown>
} = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  delete publicKey.alg
  const header = encodeProviderBase64Url(new TextEncoder().encode(JSON.stringify({
    alg: 'RS256', kid: 'microsoft-test-key', typ: 'JWT',
  })))
  const payload = encodeProviderBase64Url(new TextEncoder().encode(JSON.stringify({
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    aud: clientId,
    exp: Math.floor((now + 3_600_000) / 1_000),
    iat: Math.floor(now / 1_000),
    nbf: Math.floor((now - 1_000) / 1_000),
    nonce,
    tid: tenantId,
    oid,
    ...overrides,
  })))
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return {
    token: `${header}.${payload}.${encodeProviderBase64Url(new Uint8Array(signature))}`,
    jwks: { keys: [{ ...publicKey, kid: 'microsoft-test-key', use: 'sig' }] },
    tenantId,
    oid,
  }
}

async function transport({
  tenantId = personalTenant,
  tokenOverrides = {},
  profileOverrides = {},
  claimOverrides = {},
  discoveryOverrides = {},
}: {
  tenantId?: string
  tokenOverrides?: Record<string, unknown>
  profileOverrides?: Record<string, unknown>
  claimOverrides?: Record<string, unknown>
  discoveryOverrides?: Record<string, unknown>
} = {}) {
  const identity = await signedMicrosoftIdentity({ tenantId, overrides: claimOverrides })
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
  const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url === 'https://login.microsoftonline.com/common/oauth2/v2.0/token') {
      return json({
        access_token: 'microsoft-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'microsoft-refresh-token',
        scope: MICROSOFT_CALENDAR_SCOPES.join(' '),
        id_token: identity.token,
        ...tokenOverrides,
      })
    }
    if (url === `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`) {
      return json({ issuer, jwks_uri: jwksUri, ...discoveryOverrides })
    }
    if (url === jwksUri) return json(identity.jwks)
    if (url === 'https://graph.microsoft.com/v1.0/me?$select=id%2CdisplayName%2Cmail%2CuserPrincipalName') {
      return json({
        id: identity.oid,
        displayName: 'Alex Morgan',
        mail: 'alex@outlook.test',
        userPrincipalName: 'alex@outlook.test',
        ...profileOverrides,
      })
    }
    return json({ error: 'unexpected' }, 404)
  }) as typeof fetch
  return { identity, fetchMock }
}

describe('Microsoft OAuth transport and identity verification', () => {
  it('builds the exact common authorization URL with PKCE, select-account, and bounded scopes', async () => {
    const gateway = createProviderMicrosoftGateway({ clientId, clientSecret, now: () => now }, vi.fn())
    const url = new URL(gateway.authorizationUrl({
      state,
      nonce,
      codeChallenge: 'challenge',
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
    }))

    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    expect(url.searchParams.get('client_id')).toBe(clientId)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('response_mode')).toBe('query')
    expect(url.searchParams.get('prompt')).toBe('select_account')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...MICROSOFT_CALENDAR_SCOPES])
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('nonce')).toBe(nonce)
    expect(url.toString()).not.toContain(clientSecret)
  })

  it.each([
    [personalTenant, 'personal'],
    [workTenant, 'work_or_school'],
  ] as const)('verifies signed %s identity, exact Graph scopes, discovery, and profile as %s', async (tenantId, accountKind) => {
    const value = await transport({ tenantId })
    const gateway = createProviderMicrosoftGateway({ clientId, clientSecret, now: () => now }, value.fetchMock)

    await expect(gateway.exchangeCode({
      code: 'one-time-code',
      verifier,
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
      expectedNonce: nonce,
    })).resolves.toEqual({
      accessToken: 'microsoft-access-token',
      expiresAt: now + 3_600_000,
      grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
      refreshToken: 'microsoft-refresh-token',
      identity: {
        tenantId,
        objectId,
        accountKind,
        email: 'alex@outlook.test',
        displayName: 'Alex Morgan',
      },
    })
    const calls = vi.mocked(value.fetchMock).mock.calls
    expect(calls.map(([url]) => String(url))).toEqual([
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
      `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      'https://graph.microsoft.com/v1.0/me?$select=id%2CdisplayName%2Cmail%2CuserPrincipalName',
    ])
    expect(calls.every(([, init]) => init?.redirect === 'error')).toBe(true)
    expect(String(calls[0]?.[1]?.body)).toContain('code_verifier=')
    expect(String(calls[0]?.[1]?.body)).toContain('client_secret=microsoft-client-secret')
    expect(calls[3]?.[1]?.headers).toMatchObject({ authorization: 'Bearer microsoft-access-token' })
  })

  it.each([
    ['issuer', { claimOverrides: { iss: 'https://evil.example/v2.0' } }],
    ['audience', { claimOverrides: { aud: 'other-client' } }],
    ['nonce', { claimOverrides: { nonce: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' } }],
    ['expiry', { claimOverrides: { exp: Math.floor(now / 1_000) } }],
    ['tenant discovery issuer', { discoveryOverrides: { issuer: 'https://evil.example/v2.0' } }],
    ['tenant discovery JWKS', { discoveryOverrides: { jwks_uri: 'https://evil.example/keys' } }],
    ['profile subject', { profileOverrides: { id: '62000000-0000-4000-8000-000000000098' } }],
  ])('rejects a mismatched %s without trusting provider text', async (_label, options) => {
    const value = await transport(options)
    const gateway = createProviderMicrosoftGateway({ clientId, clientSecret, now: () => now }, value.fetchMock)
    await expect(gateway.exchangeCode({
      code: 'one-time-code', verifier,
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
      expectedNonce: nonce,
    })).rejects.toMatchObject({ code: 'provider_identity_invalid' })
  })

  it('rejects a conflicting JWK algorithm while accepting the documented key shape without alg', async () => {
    const value = await transport()
    const key = value.identity.jwks.keys[0] as JsonWebKey
    key.alg = 'RS512'
    await expect(createProviderMicrosoftGateway(
      { clientId, clientSecret, now: () => now }, value.fetchMock,
    ).exchangeCode({
      code: 'one-time-code', verifier,
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
      expectedNonce: nonce,
    })).rejects.toMatchObject({ code: 'provider_identity_invalid' })
  })

  it.each([
    ['discovery', '/v2.0/.well-known/openid-configuration', 65_537],
    ['JWKS', '/discovery/v2.0/keys', 262_145],
    ['profile', 'https://graph.microsoft.com/v1.0/me?', 65_537],
  ] as const)('bounds the %s response before parsing', async (_label, marker, size) => {
    const value = await transport()
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes(marker)) {
        return new Response('x'.repeat(size), {
          headers: { 'content-type': 'application/json', 'content-length': String(size) },
        })
      }
      return value.fetchMock(input, init)
    }) as typeof fetch
    await expect(createProviderMicrosoftGateway(
      { clientId, clientSecret, now: () => now }, fetchMock,
    ).exchangeCode({
      code: 'one-time-code', verifier,
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
      expectedNonce: nonce,
    })).rejects.toMatchObject({ code: 'provider_identity_invalid' })
  })

  it('rejects broader scopes and maps invalid_grant while keeping provider bodies private', async () => {
    const broadened = await transport({
      tokenOverrides: { scope: `${MICROSOFT_CALENDAR_SCOPES.join(' ')} https://graph.microsoft.com/Calendars.Read` },
    })
    await expect(createProviderMicrosoftGateway(
      { clientId, clientSecret, now: () => now }, broadened.fetchMock,
    ).exchangeCode({
      code: 'one-time-code', verifier,
      redirectUri: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
      expectedNonce: nonce,
    })).rejects.toEqual(new ProviderMicrosoftError('provider_scope_mismatch'))

    const invalidFetch = vi.fn(async () => json({
      error: 'invalid_grant', error_description: 'secret provider body',
    }, 400)) as typeof fetch
    await expect(createProviderMicrosoftGateway(
      { clientId, clientSecret, now: () => now }, invalidFetch,
    ).refresh('microsoft-refresh-token')).rejects.toEqual(
      new ProviderMicrosoftError('provider_grant_invalid'),
    )
  })

  it('rejects oversized JSON before parsing and does not log token material', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async () => new Response('x'.repeat(65_537), {
      headers: { 'content-type': 'application/json', 'content-length': '65537' },
    })) as typeof fetch
    const gateway = createProviderMicrosoftGateway({ clientId, clientSecret, now: () => now }, fetchMock)

    await expect(gateway.refresh('microsoft-refresh-token')).rejects.toMatchObject({
      code: 'provider_response_invalid',
    })
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

function transaction(overrides: Partial<ProviderOAuthTransaction> = {}): ProviderOAuthTransaction {
  return {
    id: transactionId,
    accountId,
    provider: 'microsoft_calendar',
    clientNonceHash: 'nonce-hash',
    pkce: envelope,
    finalRedirect,
    expiresAt: now + 10 * 60_000,
    correlationId,
    ...overrides,
  }
}

function connection(overrides: Partial<PrivateProviderConnection> = {}): PrivateProviderConnection {
  return {
    id: connectionId,
    accountId,
    provider: 'microsoft_calendar',
    accountKind: 'personal',
    providerSubject: `${personalTenant}:${objectId}`,
    email: 'alex@outlook.test',
    displayName: 'Alex Morgan',
    status: 'active',
    grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
    refreshToken: envelope,
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
    revokedAt: null,
    lastTokenRefreshAt: now - 60_000,
    ...overrides,
  }
}

function dependencies(): MicrosoftProviderFunctionDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId: 'auth-user-a' })),
    repository: {
      findAccountForAuthUser: vi.fn(async () => ({ accountId })),
      getEffectiveCapabilities: vi.fn(async () => ['multi_account', 'microsoft_calendar']),
      consumeRateLimit: vi.fn(async () => true),
      createOAuthTransaction: vi.fn(async () => undefined),
      consumeOAuthTransaction: vi.fn(async () => transaction()),
      findConnectionBySubject: vi.fn(async () => null),
      upsertConnection: vi.fn(async () => connection()),
      listConnections: vi.fn(async () => [{
        id: connectionId,
        provider: 'microsoft_calendar' as const,
        accountKind: 'personal' as const,
        email: 'alex@outlook.test',
        displayName: 'Alex Morgan',
        status: 'active' as const,
        grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
        createdAt: now - 60_000,
        updatedAt: now - 60_000,
      }]),
      getConnection: vi.fn(async () => connection()),
      rotateRefreshToken: vi.fn(async () => true),
      markReconnectRequired: vi.fn(async () => true),
      deleteConnection: vi.fn(async () => true),
    },
    crypto: {
      keyVersion: 1,
      encryptSecret: vi.fn(async () => envelope),
      decryptSecret: vi.fn(async (_value, context) => context.purpose === 'pkce_verifier'
        ? verifier
        : 'microsoft-refresh-token'),
    },
    microsoft: {
      authorizationUrl: vi.fn((input) => {
        const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
        url.searchParams.set('state', input.state)
        url.searchParams.set('nonce', input.nonce)
        url.searchParams.set('code_challenge', input.codeChallenge)
        return url.toString()
      }),
      exchangeCode: vi.fn(async () => ({
        accessToken: 'microsoft-access-token',
        expiresAt: now + 3_600_000,
        refreshToken: 'microsoft-refresh-token',
        grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
        identity: {
          tenantId: personalTenant,
          objectId,
          accountKind: 'personal' as const,
          email: 'alex@outlook.test',
          displayName: 'Alex Morgan',
        },
      })),
      refresh: vi.fn(async () => ({
        accessToken: 'next-microsoft-access-token',
        expiresAt: now + 3_600_000,
        refreshToken: null,
        grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
      })),
      profile: vi.fn(async () => ({
        tenantId: personalTenant,
        objectId,
        accountKind: 'personal' as const,
        email: 'alex@outlook.test',
        displayName: 'Alex Morgan',
      })),
    },
    now: () => now,
    randomUUID: vi.fn()
      .mockReturnValueOnce(transactionId)
      .mockReturnValueOnce(correlationId)
      .mockReturnValue(connectionId),
    randomBytes: vi.fn()
      .mockReturnValueOnce(decodeProviderBase64Url(state))
      .mockReturnValueOnce(decodeProviderBase64Url(verifier)),
    hash: vi.fn(async (value: string) => value === state ? 'state-hash' : value === nonce
      ? 'nonce-hash'
      : 'challenge-hash'),
    requestFingerprint: vi.fn(async () => 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'),
    oauthCallbackUrl: 'https://project.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
    allowedExtensionId: extensionId,
  }
}

describe('Microsoft provider handlers', () => {
  let deps: MicrosoftProviderFunctionDependencies

  beforeEach(() => { deps = dependencies() })

  it('starts an exact Microsoft transaction and reaches permission-owned OAuth only after entitlement', async () => {
    const response = await createMicrosoftProviderHandlers(deps).oauthStart(request(
      'microsoft-calendar-oauth-start', 'POST', { clientNonce: nonce, finalRedirect },
    ))
    expect(response.status).toBe(200)
    expect(deps.repository.getEffectiveCapabilities).toHaveBeenCalledWith(accountId, now)
    expect(deps.repository.createOAuthTransaction).toHaveBeenCalledWith({
      id: transactionId,
      accountId,
      provider: 'microsoft_calendar',
      stateHash: 'state-hash',
      clientNonceHash: 'nonce-hash',
      pkce: envelope,
      finalRedirect,
      expiresAt: now + 10 * 60_000,
      correlationId,
      effectiveAt: now,
    })
    expect(deps.microsoft.authorizationUrl).toHaveBeenCalledWith({
      state,
      nonce,
      codeChallenge: 'challenge-hash',
      redirectUri: deps.oauthCallbackUrl,
    })
    expect(JSON.stringify((deps.repository.createOAuthTransaction as any).mock.calls)).not.toContain(verifier)
  })

  it('persists only tenant-qualified Microsoft metadata and redirects success', async () => {
    deps.randomUUID = vi.fn(() => connectionId)
    const response = await createMicrosoftProviderHandlers(deps).oauthCallback(request(
      `microsoft-calendar-oauth-callback?state=${state}&code=one-time-code`, 'GET', undefined,
      { authorization: '' },
    ))

    expect(response.headers.get('location')).toBe(`${finalRedirect}&result=success`)
    expect(deps.repository.upsertConnection).toHaveBeenCalledWith({
      id: connectionId,
      accountId,
      provider: 'microsoft_calendar',
      accountKind: 'personal',
      providerSubject: `${personalTenant}:${objectId}`,
      email: 'alex@outlook.test',
      displayName: 'Alex Morgan',
      grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
      refreshToken: envelope,
      effectiveAt: now,
    })
    const text = await response.text()
    expect(text).not.toContain('microsoft-access-token')
    expect(text).not.toContain('microsoft-refresh-token')
  })

  it('maps organization policy without exchanging a code or saving a connection', async () => {
    const response = await createMicrosoftProviderHandlers(deps).oauthCallback(request(
      `microsoft-calendar-oauth-callback?state=${state}&error=admin_consent_required&error_description=AADSTS65001`,
      'GET', undefined, { authorization: '' },
    ))
    expect(response.headers.get('location')).toBe(`${finalRedirect}&result=organization_approval_required`)
    expect(deps.microsoft.exchangeCode).not.toHaveBeenCalled()
    expect(deps.repository.upsertConnection).not.toHaveBeenCalled()
  })

  it('rejects a substituted client nonce binding before exchanging provider authority', async () => {
    deps.repository.consumeOAuthTransaction = vi.fn(async () => transaction({
      clientNonceHash: 'substituted-nonce-hash',
    }))
    const response = await createMicrosoftProviderHandlers(deps).oauthCallback(request(
      `microsoft-calendar-oauth-callback?state=${state}&code=one-time-code`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(response.status).toBe(400)
    expect(await responseJson(response)).toEqual({ error: 'provider_state_invalid' })
    expect(deps.microsoft.exchangeCode).not.toHaveBeenCalled()
  })

  it('retains refresh authority only for an exact-subject reconnect and refuses a cross-subject omission', async () => {
    deps.microsoft.exchangeCode = vi.fn(async () => ({
      ...(await dependencies().microsoft.exchangeCode({
        code: 'code', verifier, redirectUri: deps.oauthCallbackUrl, expectedNonce: nonce,
      })),
      refreshToken: null,
    }))
    deps.repository.findConnectionBySubject = vi.fn(async () => connection())
    const reconnect = await createMicrosoftProviderHandlers(deps).oauthCallback(request(
      `microsoft-calendar-oauth-callback?state=${state}&code=reconnect`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(reconnect.headers.get('location')).toBe(`${finalRedirect}&result=success`)
    expect(deps.repository.upsertConnection).toHaveBeenCalledWith(expect.objectContaining({
      id: connectionId,
      providerSubject: `${personalTenant}:${objectId}`,
      refreshToken: null,
    }))

    deps = dependencies()
    deps.microsoft.exchangeCode = vi.fn(async () => ({
      ...(await dependencies().microsoft.exchangeCode({
        code: 'code', verifier, redirectUri: deps.oauthCallbackUrl, expectedNonce: nonce,
      })),
      refreshToken: null,
      identity: {
        tenantId: workTenant,
        objectId,
        accountKind: 'work_or_school' as const,
        email: 'alex@contoso.test',
        displayName: 'Alex Morgan',
      },
    }))
    deps.repository.findConnectionBySubject = vi.fn(async () => null)
    const crossed = await createMicrosoftProviderHandlers(deps).oauthCallback(request(
      `microsoft-calendar-oauth-callback?state=${state}&code=crossed`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(crossed.headers.get('location')).toBe(`${finalRedirect}&result=refresh_token_required`)
    expect(deps.repository.upsertConnection).not.toHaveBeenCalled()
  })

  it('lists bounded account-kind metadata without tenant, subject, or secret fields', async () => {
    const response = await createMicrosoftProviderHandlers(deps).connections(request(
      'microsoft-calendar-connections', 'GET',
    ))
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ connections: [{
      id: connectionId,
      provider: 'microsoft_calendar',
      accountKind: 'personal',
      email: 'alex@outlook.test',
      displayName: 'Alex Morgan',
      status: 'active',
      grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
    }] })
    for (const forbidden of [personalTenant, objectId, 'providerSubject', 'refreshToken', 'ciphertext']) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('issues a short-lived session, rotates refresh authority, and marks invalid grants for reconnect', async () => {
    deps.microsoft.refresh = vi.fn(async () => ({
      accessToken: 'next-microsoft-access-token',
      expiresAt: now + 3_600_000,
      refreshToken: 'rotated-microsoft-refresh-token',
      grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
    }))
    const response = await createMicrosoftProviderHandlers(deps).session(request(
      'microsoft-calendar-session', 'POST', { connectionId },
    ))
    expect(await responseJson(response)).toEqual({
      connectionId,
      accessToken: 'next-microsoft-access-token',
      expiresAt: now + 3_600_000,
    })
    expect(deps.crypto.encryptSecret).toHaveBeenCalledWith('rotated-microsoft-refresh-token', {
      purpose: 'refresh_token', provider: 'microsoft_calendar', accountId, objectId: connectionId,
    })
    expect(deps.repository.rotateRefreshToken).toHaveBeenCalledWith(expect.objectContaining({ connectionId }))

    deps = dependencies()
    deps.microsoft.refresh = vi.fn(async () => { throw new ProviderMicrosoftError('provider_grant_invalid') })
    const invalid = await createMicrosoftProviderHandlers(deps).session(request(
      'microsoft-calendar-session', 'POST', { connectionId },
    ))
    expect(invalid.status).toBe(409)
    expect(await responseJson(invalid)).toEqual({ error: 'provider_reconnect_required' })
    expect(deps.repository.markReconnectRequired).toHaveBeenCalledWith(accountId, connectionId, now)
  })

  it('rejects cross-account connection traversal and expired entitlement before refresh', async () => {
    deps.repository.getConnection = vi.fn(async () => connection({ accountId: otherAccountId }))
    const stolen = await createMicrosoftProviderHandlers(deps).session(request(
      'microsoft-calendar-session', 'POST', { connectionId },
    ))
    expect(stolen.status).toBe(404)
    expect(deps.microsoft.refresh).not.toHaveBeenCalled()

    deps = dependencies()
    deps.repository.getEffectiveCapabilities = vi.fn(async () => ['microsoft_calendar'])
    const expired = await createMicrosoftProviderHandlers(deps).session(request(
      'microsoft-calendar-session', 'POST', { connectionId },
    ))
    expect(expired.status).toBe(403)
    expect(deps.microsoft.refresh).not.toHaveBeenCalled()
  })

  it('disconnects local authority truthfully without claiming provider revocation', async () => {
    const response = await createMicrosoftProviderHandlers(deps).disconnect(request(
      'microsoft-calendar-disconnect', 'POST', { connectionId, confirmation: 'disconnect' },
    ))
    expect(await responseJson(response)).toEqual({ disconnected: true, revocationConfirmed: false })
    expect(deps.repository.deleteConnection).toHaveBeenCalledWith(accountId, connectionId, now)
    expect(deps.crypto.decryptSecret).not.toHaveBeenCalled()
  })

  it('returns stable rate and service errors without reflecting secret-bearing failures', async () => {
    deps.repository.consumeRateLimit = vi.fn(async () => false)
    const limited = await createMicrosoftProviderHandlers(deps).session(request(
      'microsoft-calendar-session', 'POST', { connectionId },
    ))
    expect(limited.status).toBe(429)
    expect(await responseJson(limited)).toEqual({ error: 'provider_rate_limited' })

    deps = dependencies()
    deps.repository.listConnections = vi.fn(async () => { throw new Error('microsoft-refresh-token') })
    const failed = await createMicrosoftProviderHandlers(deps).connections(request(
      'microsoft-calendar-connections', 'GET',
    ))
    const text = await failed.text()
    expect(failed.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ error: 'provider_service_unavailable' })
    expect(text).not.toContain('microsoft-refresh-token')
  })
})
