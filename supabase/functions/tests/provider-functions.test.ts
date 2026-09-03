import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProviderHandlers,
  ProviderGoogleError,
  type ProviderFunctionDependencies,
  type ProviderOAuthTransaction,
  type PrivateProviderConnection,
} from '../_shared/providerAuth'
import {
  decodeProviderBase64Url,
  encodeProviderBase64Url,
  type ProviderSecretEnvelope,
} from '../_shared/providerCrypto'
import {
  createProviderGoogleGateway,
  GOOGLE_CALENDAR_SCOPES,
} from '../_shared/providerGoogle'
import { createProviderRepository } from '../_shared/providerRepository'

const now = Date.UTC(2026, 8, 3, 14, 0, 0)
const accountId = '43000000-0000-4000-8000-000000000001'
const otherAccountId = '43000000-0000-4000-8000-000000000002'
const connectionId = '63000000-0000-4000-8000-000000000001'
const transactionId = '73000000-0000-4000-8000-000000000001'
const correlationId = '83000000-0000-4000-8000-000000000001'
const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const state = encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x04))
const verifier = encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x08))
const finalRedirect = `https://${extensionId}.chromiumapp.org/google-calendar?nonce=${nonce}`
const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const

const envelope: ProviderSecretEnvelope = {
  keyVersion: 1,
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  fingerprint: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
}

function request(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
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

async function json(response: Response): Promise<any> {
  return response.json()
}

function transaction(overrides: Partial<ProviderOAuthTransaction> = {}): ProviderOAuthTransaction {
  return {
    id: transactionId,
    accountId,
    provider: 'google_calendar',
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
    provider: 'google_calendar',
    accountKind: null,
    providerSubject: 'google-subject-a',
    email: 'alex@example.test',
    displayName: 'Alex',
    status: 'active',
    grantedScopes: [...scopes],
    refreshToken: envelope,
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
    revokedAt: null,
    lastTokenRefreshAt: now - 60_000,
    ...overrides,
  }
}

function dependencies(): ProviderFunctionDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId: 'auth-user-a' })),
    repository: {
      findAccountForAuthUser: vi.fn(async () => ({ accountId })),
      getEffectiveCapabilities: vi.fn(async () => ['multi_account', 'google_calendar']),
      consumeRateLimit: vi.fn(async () => true),
      createOAuthTransaction: vi.fn(async () => undefined),
      consumeOAuthTransaction: vi.fn(async () => transaction()),
      findConnectionBySubject: vi.fn(async () => null),
      upsertConnection: vi.fn(async () => connection()),
      listConnections: vi.fn(async () => [{
        id: connectionId,
        provider: 'google_calendar' as const,
        accountKind: null,
        email: 'alex@example.test',
        displayName: 'Alex',
        status: 'active' as const,
        grantedScopes: [...scopes],
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
        : 'refresh-token-secret'),
    },
    google: {
      authorizationUrl: vi.fn((input) => {
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        url.searchParams.set('client_id', input.clientId)
        url.searchParams.set('redirect_uri', input.redirectUri)
        url.searchParams.set('state', input.state)
        url.searchParams.set('nonce', input.nonce)
        url.searchParams.set('scope', input.scopes.join(' '))
        url.searchParams.set('code_challenge', input.codeChallenge)
        return url.toString()
      }),
      exchangeAuthorizationCode: vi.fn(async () => ({
        accessToken: 'access-token-secret',
        expiresAt: now + 3_600_000,
        refreshToken: 'refresh-token-secret',
        grantedScopes: [...scopes],
        identity: {
          subject: 'google-subject-a',
          email: 'alex@example.test',
          displayName: 'Alex',
          nonce,
        },
      })),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: 'next-access-token-secret',
        expiresAt: now + 3_600_000,
        refreshToken: null,
        grantedScopes: [...scopes],
      })),
      revokeRefreshToken: vi.fn(async () => true),
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
    oauthClientId: 'google-web-client-id',
    oauthCallbackUrl: 'https://project.supabase.co/functions/v1/google-calendar-oauth-callback',
    allowedExtensionId: extensionId,
  }
}

describe('provider OAuth broker handlers', () => {
  let deps: ProviderFunctionDependencies

  beforeEach(() => {
    deps = dependencies()
  })

  it('starts one exact-scope, account-bound, encrypted PKCE transaction', async () => {
    const response = await createProviderHandlers(deps).oauthStart(request(
      'google-calendar-oauth-start', 'POST', { clientNonce: nonce, finalRedirect },
    ))
    const value = await json(response)

    expect(response.status).toBe(200)
    const authorizationUrl = new URL(value.authorizationUrl)
    expect(authorizationUrl.origin + authorizationUrl.pathname)
      .toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(authorizationUrl.searchParams.get('scope')?.split(' ')).toEqual(scopes)
    expect(authorizationUrl.searchParams.get('nonce')).toBe(nonce)
    expect(authorizationUrl.searchParams.get('state')).toBe(state)
    expect(authorizationUrl.toString()).not.toContain('google-web-client-secret')
    expect(deps.repository.createOAuthTransaction).toHaveBeenCalledWith({
      id: transactionId,
      accountId,
      provider: 'google_calendar',
      stateHash: 'state-hash',
      clientNonceHash: 'nonce-hash',
      pkce: envelope,
      finalRedirect,
      expiresAt: now + 10 * 60_000,
      correlationId,
      effectiveAt: now,
    })
    expect(JSON.stringify((deps.repository.createOAuthTransaction as any).mock.calls))
      .not.toContain(verifier)
  })

  it.each([
    [{ clientNonce: nonce, finalRedirect: `https://evil.example/google-calendar?nonce=${nonce}` }],
    [{ clientNonce: nonce, finalRedirect: `https://${extensionId}.chromiumapp.org/other?nonce=${nonce}` }],
    [{ clientNonce: nonce, finalRedirect: `${finalRedirect}&scope=calendar` }],
    [{ clientNonce: nonce, finalRedirect, scopes: [...scopes] }],
    [{ clientNonce: `${nonce}x`, finalRedirect }],
  ])('rejects redirect, scope, nonce, and extra-key substitution before storage', async (input) => {
    const response = await createProviderHandlers(deps).oauthStart(request(
      'google-calendar-oauth-start', 'POST', input,
    ))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: 'provider_request_invalid' })
    expect(deps.repository.createOAuthTransaction).not.toHaveBeenCalled()
  })

  it('requires authentication, both current capabilities, and the account/IP rate limit', async () => {
    deps.authenticate = vi.fn(async () => ({ ok: false as const }))
    expect((await createProviderHandlers(deps).oauthStart(request(
      'google-calendar-oauth-start', 'POST', { clientNonce: nonce, finalRedirect },
    ))).status).toBe(401)

    deps = dependencies()
    deps.repository.getEffectiveCapabilities = vi.fn(async () => ['google_calendar'])
    expect(await json(await createProviderHandlers(deps).oauthStart(request(
      'google-calendar-oauth-start', 'POST', { clientNonce: nonce, finalRedirect },
    )))).toEqual({ error: 'provider_entitlement_required' })

    deps = dependencies()
    deps.repository.consumeRateLimit = vi.fn(async () => false)
    expect((await createProviderHandlers(deps).oauthStart(request(
      'google-calendar-oauth-start', 'POST', { clientNonce: nonce, finalRedirect },
    ))).status).toBe(429)
  })

  it('consumes callback state once, exchanges with PKCE, and stores only encrypted refresh authority', async () => {
    deps.randomUUID = vi.fn(() => connectionId)
    const response = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=one-time-code`, 'GET', undefined,
      { authorization: '' },
    ))

    expect(response.status).toBe(302)
    expect(response.body).toBeNull()
    expect(response.headers.get('location')).toBe(`${finalRedirect}&result=success`)
    expect(deps.repository.consumeOAuthTransaction).toHaveBeenCalledWith('state-hash', now)
    expect(deps.google.exchangeAuthorizationCode).toHaveBeenCalledWith({
      code: 'one-time-code',
      clientId: 'google-web-client-id',
      redirectUri: deps.oauthCallbackUrl,
      pkceVerifier: verifier,
      expectedNonceHash: 'nonce-hash',
      hash: deps.hash,
      now,
    })
    expect(deps.repository.upsertConnection).toHaveBeenCalledWith(expect.objectContaining({
      accountId,
      providerSubject: 'google-subject-a',
      grantedScopes: [...scopes],
      refreshToken: envelope,
    }))
    const reflected = `${await response.text()} ${response.headers.get('location')}`
    expect(reflected).not.toContain('one-time-code')
    expect(reflected).not.toContain('access-token-secret')
    expect(reflected).not.toContain('refresh-token-secret')
    expect(reflected).not.toContain('google-subject-a')
  })

  it('re-encrypts a racing duplicate subject for the canonical stored connection ID', async () => {
    const racingId = '63000000-0000-4000-8000-000000000099'
    deps.randomUUID = vi.fn(() => racingId)
    deps.repository.upsertConnection = vi.fn(async () => connection({ id: connectionId }))

    const response = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=racing-connect`, 'GET', undefined,
      { authorization: '' },
    ))

    expect(response.headers.get('location')).toBe(`${finalRedirect}&result=success`)
    expect(deps.crypto.encryptSecret).toHaveBeenNthCalledWith(1, 'refresh-token-secret', {
      purpose: 'refresh_token', provider: 'google_calendar', accountId, objectId: racingId,
    })
    expect(deps.crypto.encryptSecret).toHaveBeenNthCalledWith(2, 'refresh-token-secret', {
      purpose: 'refresh_token', provider: 'google_calendar', accountId, objectId: connectionId,
    })
    expect(deps.repository.rotateRefreshToken).toHaveBeenCalledWith({
      accountId, connectionId, refreshToken: envelope, effectiveAt: now,
    })
  })

  it('rejects callback replay, expiry, provider denial, identity failure, and scope widening safely', async () => {
    deps.repository.consumeOAuthTransaction = vi.fn(async () => null)
    const replay = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=replayed`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(replay.status).toBe(400)
    expect(await json(replay)).toEqual({ error: 'provider_state_invalid' })

    deps = dependencies()
    deps.repository.consumeOAuthTransaction = vi.fn(async () => transaction({ expiresAt: now - 1 }))
    const expired = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=late`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(expired.headers.get('location')).toBe(`${finalRedirect}&result=transaction_expired`)

    deps = dependencies()
    const denied = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&error=access_denied`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(denied.headers.get('location')).toBe(`${finalRedirect}&result=access_denied`)
    expect(deps.google.exchangeAuthorizationCode).not.toHaveBeenCalled()

    deps = dependencies()
    deps.google.exchangeAuthorizationCode = vi.fn(async () => {
      throw new ProviderGoogleError('provider_identity_invalid')
    })
    const identity = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=bad-identity`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(identity.headers.get('location')).toBe(`${finalRedirect}&result=identity_invalid`)

    deps = dependencies()
    deps.google.exchangeAuthorizationCode = vi.fn(async () => ({
      accessToken: 'access-token-secret', expiresAt: now + 3_600_000,
      refreshToken: 'refresh-token-secret', identity: {
        subject: 'google-subject-a', email: 'alex@example.test', displayName: null, nonce,
      },
      grantedScopes: [...scopes, 'https://www.googleapis.com/auth/drive.readonly'],
    }))
    const widened = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=widened`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(widened.headers.get('location')).toBe(`${finalRedirect}&result=scope_mismatch`)
    expect(deps.repository.upsertConnection).not.toHaveBeenCalled()

    deps = dependencies()
    deps.crypto.decryptSecret = vi.fn(async () => { throw new Error('tampered-pkce-secret') })
    const tamperedPkce = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=tampered-pkce`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(tamperedPkce.headers.get('location')).toBe(`${finalRedirect}&result=provider_unavailable`)
    expect(await tamperedPkce.text()).not.toContain('tampered-pkce-secret')

    deps = dependencies()
    deps.repository.consumeOAuthTransaction = vi.fn(async () => transaction({
      finalRedirect: `https://evil.example/google-calendar?nonce=${nonce}`,
    }))
    const substituted = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=substituted`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(substituted.status).toBe(400)
    expect(substituted.headers.get('location')).toBeNull()
    expect(await json(substituted)).toEqual({ error: 'provider_state_invalid' })
  })

  it('requires a refresh token on first connect but permits Google to omit it on reconnect', async () => {
    deps.google.exchangeAuthorizationCode = vi.fn(async () => ({
      accessToken: 'access-token-secret', expiresAt: now + 3_600_000,
      refreshToken: null, grantedScopes: [...scopes], identity: {
        subject: 'google-subject-a', email: 'alex@example.test', displayName: null, nonce,
      },
    }))
    const first = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=no-refresh`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(first.headers.get('location')).toBe(`${finalRedirect}&result=refresh_token_required`)

    deps.repository.findConnectionBySubject = vi.fn(async () => connection())
    const reconnect = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=reconnect`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(reconnect.headers.get('location')).toBe(`${finalRedirect}&result=success`)
    expect(deps.repository.upsertConnection).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: null,
    }))
  })

  it('rechecks entitlement at callback time and rejects a mismatched verified nonce', async () => {
    deps.repository.getEffectiveCapabilities = vi.fn(async () => ['google_calendar'])
    const stale = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=stale-entitlement`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(stale.headers.get('location')).toBe(`${finalRedirect}&result=entitlement_required`)
    expect(deps.google.exchangeAuthorizationCode).not.toHaveBeenCalled()

    deps = dependencies()
    deps.google.exchangeAuthorizationCode = vi.fn(async () => ({
      accessToken: 'access-token-secret', expiresAt: now + 3_600_000,
      refreshToken: 'refresh-token-secret', grantedScopes: [...scopes], identity: {
        subject: 'google-subject-a', email: 'alex@example.test', displayName: null,
        nonce: encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x09)),
      },
    }))
    const mismatched = await createProviderHandlers(deps).oauthCallback(request(
      `google-calendar-oauth-callback?state=${state}&code=nonce-mismatch`, 'GET', undefined,
      { authorization: '' },
    ))
    expect(mismatched.headers.get('location')).toBe(`${finalRedirect}&result=identity_invalid`)
    expect(deps.repository.upsertConnection).not.toHaveBeenCalled()
  })

  it('lists only bounded public connection metadata', async () => {
    const response = await createProviderHandlers(deps).connections(request(
      'google-calendar-connections', 'GET', undefined,
    ))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ connections: [{
      id: connectionId,
      provider: 'google_calendar',
      email: 'alex@example.test',
      displayName: 'Alex',
      status: 'active',
      grantedScopes: [...scopes],
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
    }] })
    for (const secret of ['providerSubject', 'google-subject-a', 'refreshToken', 'ciphertext', 'fingerprint']) {
      expect(text).not.toContain(secret)
    }
  })

  it('issues a short-lived owned session, rejects theft/expiry, and encrypts refresh rotation', async () => {
    const response = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(await json(response)).toEqual({
      connectionId,
      accessToken: 'next-access-token-secret',
      expiresAt: now + 3_600_000,
    })

    deps = dependencies()
    deps.repository.getConnection = vi.fn(async () => connection({ accountId: otherAccountId }))
    const theft = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(theft.status).toBe(404)
    expect(await json(theft)).toEqual({ error: 'provider_connection_not_found' })

    deps = dependencies()
    deps.google.refreshAccessToken = vi.fn(async () => ({
      accessToken: 'already-expired', expiresAt: now, refreshToken: null, grantedScopes: [...scopes],
    }))
    const expired = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(expired.status).toBe(503)
    expect(await json(expired)).toEqual({ error: 'provider_session_unavailable' })

    deps = dependencies()
    deps.google.refreshAccessToken = vi.fn(async () => ({
      accessToken: 'next-access-token-secret', expiresAt: now + 3_600_000,
      refreshToken: 'rotated-refresh-token', grantedScopes: [...scopes],
    }))
    await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(deps.crypto.encryptSecret).toHaveBeenCalledWith('rotated-refresh-token', {
      purpose: 'refresh_token', provider: 'google_calendar', accountId, objectId: connectionId,
    })
    expect(deps.repository.rotateRefreshToken).toHaveBeenCalledWith(expect.objectContaining({
      accountId, connectionId, refreshToken: envelope,
    }))
  })

  it('stops session issuance after entitlement expiry and marks invalid grants for reconnect', async () => {
    deps.repository.getEffectiveCapabilities = vi.fn(async () => ['google_calendar'])
    const stale = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(stale.status).toBe(403)
    expect(deps.google.refreshAccessToken).not.toHaveBeenCalled()

    deps = dependencies()
    deps.google.refreshAccessToken = vi.fn(async () => {
      throw new ProviderGoogleError('provider_grant_invalid')
    })
    const invalid = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'POST', { connectionId },
    ))
    expect(invalid.status).toBe(409)
    expect(await json(invalid)).toEqual({ error: 'provider_reconnect_required' })
    expect(deps.repository.markReconnectRequired).toHaveBeenCalledWith(accountId, connectionId, now)
  })

  it('requires explicit confirmation and deletes exact authority even when Google revocation fails', async () => {
    const invalid = await createProviderHandlers(deps).disconnect(request(
      'google-calendar-disconnect', 'POST', { connectionId, confirmation: 'delete-events' },
    ))
    expect(invalid.status).toBe(400)
    expect(deps.repository.deleteConnection).not.toHaveBeenCalled()

    deps.google.revokeRefreshToken = vi.fn(async () => { throw new Error('provider body with secret') })
    const response = await createProviderHandlers(deps).disconnect(request(
      'google-calendar-disconnect', 'POST', { connectionId, confirmation: 'disconnect' },
    ))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ disconnected: true, revocationConfirmed: false })
    expect(deps.repository.deleteConnection).toHaveBeenCalledWith(accountId, connectionId, now)
    expect(text).not.toContain('provider body')
    expect(text).not.toContain('refresh-token-secret')
  })

  it('returns bounded method and service errors without reflecting secrets or provider bodies', async () => {
    const method = await createProviderHandlers(deps).session(request(
      'google-calendar-session', 'GET', undefined,
    ))
    expect(method.status).toBe(405)

    deps.repository.listConnections = vi.fn(async () => {
      throw new Error('database failed for refresh-token-secret and google-subject-a')
    })
    const response = await createProviderHandlers(deps).connections(request(
      'google-calendar-connections', 'GET', undefined,
    ))
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ error: 'provider_service_unavailable' })
    expect(text).not.toContain('refresh-token-secret')
    expect(text).not.toContain('google-subject-a')
  })
})

async function signedGoogleIdentity(overrides: Record<string, unknown> = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const header = encodeProviderBase64Url(new TextEncoder().encode(JSON.stringify({
    alg: 'RS256', kid: 'google-test-key', typ: 'JWT',
  })))
  const payload = encodeProviderBase64Url(new TextEncoder().encode(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: 'google-web-client-id',
    exp: Math.floor((now + 3_600_000) / 1_000),
    iat: Math.floor(now / 1_000),
    nonce,
    sub: 'google-subject-a',
    email: 'alex@example.test',
    email_verified: true,
    name: 'Alex',
    ...overrides,
  })))
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return {
    token: `${header}.${payload}.${encodeProviderBase64Url(new Uint8Array(signature))}`,
    jwks: { keys: [{ ...publicKey, kid: 'google-test-key', alg: 'RS256', use: 'sig' }] },
  }
}

function googleJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

describe('Google OAuth transport and identity verification', () => {
  it('verifies the signed issuer, audience, nonce, expiry, and exact four scopes', async () => {
    const identity = await signedGoogleIdentity()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(googleJson({
        access_token: 'access-token-secret', token_type: 'Bearer', expires_in: 3600,
        refresh_token: 'refresh-token-secret', scope: [...GOOGLE_CALENDAR_SCOPES].reverse().join(' '),
        id_token: identity.token,
      }))
      .mockResolvedValueOnce(googleJson(identity.jwks))
    const gateway = createProviderGoogleGateway({
      clientId: 'google-web-client-id', clientSecret: 'google-web-client-secret',
    }, fetchMock)

    await expect(gateway.exchangeAuthorizationCode({
      code: 'one-time-code',
      clientId: 'google-web-client-id',
      redirectUri: 'https://project.supabase.co/functions/v1/google-calendar-oauth-callback',
      pkceVerifier: verifier,
      expectedNonceHash: 'nonce-hash',
      hash: async (value) => value === nonce ? 'nonce-hash' : 'other-hash',
      now,
    })).resolves.toEqual({
      accessToken: 'access-token-secret',
      expiresAt: now + 3_600_000,
      refreshToken: 'refresh-token-secret',
      grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
      identity: {
        subject: 'google-subject-a', email: 'alex@example.test', displayName: 'Alex', nonce,
      },
    })
    const tokenRequestBody = String(fetchMock.mock.calls[0][1]?.body)
    expect(tokenRequestBody).toContain('code_verifier=')
    expect(tokenRequestBody).toContain('client_secret=google-web-client-secret')
    expect(tokenRequestBody).not.toContain('nonce-hash')
  })

  it.each([
    ['issuer', { iss: 'https://evil.example' }],
    ['audience', { aud: 'other-client-id' }],
    ['nonce', { nonce: encodeProviderBase64Url(Uint8Array.from({ length: 32 }, () => 0x09)) }],
    ['expiry', { exp: Math.floor(now / 1_000) }],
  ])('rejects a signed ID token with mismatched %s', async (_label, overrides) => {
    const identity = await signedGoogleIdentity(overrides)
    const gateway = createProviderGoogleGateway({
      clientId: 'google-web-client-id', clientSecret: 'google-web-client-secret',
    }, vi.fn()
      .mockResolvedValueOnce(googleJson({
        access_token: 'access-token-secret', token_type: 'Bearer', expires_in: 3600,
        refresh_token: 'refresh-token-secret', scope: GOOGLE_CALENDAR_SCOPES.join(' '),
        id_token: identity.token,
      }))
      .mockResolvedValueOnce(googleJson(identity.jwks)))

    await expect(gateway.exchangeAuthorizationCode({
      code: 'one-time-code', clientId: 'google-web-client-id',
      redirectUri: 'https://project.supabase.co/functions/v1/google-calendar-oauth-callback',
      pkceVerifier: verifier, expectedNonceHash: 'nonce-hash',
      hash: async (value) => value === nonce ? 'nonce-hash' : 'other-hash', now,
    })).rejects.toMatchObject({ code: 'provider_identity_invalid' })
  })

  it('rejects scope widening and maps refresh invalid_grant without exposing the response body', async () => {
    const widened = createProviderGoogleGateway({
      clientId: 'google-web-client-id', clientSecret: 'google-web-client-secret',
    }, vi.fn(async () => googleJson({
      access_token: 'access-token-secret', token_type: 'Bearer', expires_in: 3600,
      scope: `${GOOGLE_CALENDAR_SCOPES.join(' ')} https://www.googleapis.com/auth/drive.readonly`,
    })))
    await expect(widened.refreshAccessToken({
      refreshToken: 'refresh-token-secret', clientId: 'google-web-client-id', now,
      expectedScopes: GOOGLE_CALENDAR_SCOPES,
    })).rejects.toMatchObject({ code: 'provider_scope_mismatch' })

    const invalid = createProviderGoogleGateway({
      clientId: 'google-web-client-id', clientSecret: 'google-web-client-secret',
    }, vi.fn(async () => googleJson({ error: 'invalid_grant', error_description: 'secret provider body' }, 400)))
    await expect(invalid.refreshAccessToken({
      refreshToken: 'refresh-token-secret', clientId: 'google-web-client-id', now,
      expectedScopes: GOOGLE_CALENDAR_SCOPES,
    })).rejects.toEqual(new ProviderGoogleError('provider_grant_invalid'))
  })
})

describe('provider RPC repository boundary', () => {
  it('maps the metadata-only list without requesting private connection fields', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        connection_id: connectionId,
        provider: 'google_calendar',
        account_kind: null,
        email: 'alex@example.test',
        display_name: 'Alex',
        status: 'active',
        granted_scopes: [...scopes],
        created_at: new Date(now - 60_000).toISOString(),
        updated_at: new Date(now).toISOString(),
      }],
      error: null,
    }))
    await expect(createProviderRepository({ rpc }).listConnections(accountId)).resolves.toEqual([{
      id: connectionId,
      provider: 'google_calendar',
      accountKind: null,
      email: 'alex@example.test',
      displayName: 'Alex',
      status: 'active',
      grantedScopes: [...scopes],
      createdAt: now - 60_000,
      updatedAt: now,
    }])
    expect(rpc).toHaveBeenCalledWith('tab_two_provider_list_connections', {
      target_account_id: accountId,
    })
  })

  it('maps encrypted PKCE and connection envelopes without logging or returning RPC errors', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'tab_two_provider_consume_oauth_transaction') return {
        data: [{
          transaction_id: transactionId,
          account_id: accountId,
          provider: 'google_calendar',
          client_nonce_hash: 'nonce-hash',
          pkce_key_version: 1,
          pkce_verifier_nonce: envelope.nonce,
          pkce_verifier_ciphertext: envelope.ciphertext,
          pkce_verifier_fingerprint: envelope.fingerprint,
          final_redirect: finalRedirect,
          expires_at: new Date(now + 60_000).toISOString(),
          correlation_id: correlationId,
        }],
        error: null,
      }
      return { data: null, error: { message: 'database body with refresh-token-secret' } }
    })
    const repository = createProviderRepository({ rpc })
    await expect(repository.consumeOAuthTransaction('state-hash', now)).resolves.toEqual({
      id: transactionId,
      accountId,
      provider: 'google_calendar',
      clientNonceHash: 'nonce-hash',
      pkce: envelope,
      finalRedirect,
      expiresAt: now + 60_000,
      correlationId,
    })
    await expect(repository.getConnection(accountId, connectionId))
      .rejects.toThrow('provider_repository_unavailable')
  })
})
