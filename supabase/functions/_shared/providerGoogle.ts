import { decodeProviderBase64Url, encodeProviderBase64Url } from './providerCrypto.ts'

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const

export type GoogleCalendarScope = typeof GOOGLE_CALENDAR_SCOPES[number]

export type ProviderGoogleErrorCode =
  | 'provider_exchange_failed'
  | 'provider_identity_invalid'
  | 'provider_grant_invalid'
  | 'provider_scope_mismatch'
  | 'provider_response_invalid'

export class ProviderGoogleError extends Error {
  readonly code: ProviderGoogleErrorCode

  constructor(code: ProviderGoogleErrorCode) {
    super(code)
    this.name = 'ProviderGoogleError'
    this.code = code
  }
}

export interface GoogleIdentity {
  subject: string
  email: string
  displayName: string | null
  nonce: string
}

export interface GoogleTokenResult {
  accessToken: string
  expiresAt: number
  refreshToken: string | null
  grantedScopes: string[]
}

export interface GoogleAuthorizationResult extends GoogleTokenResult {
  identity: GoogleIdentity
}

export interface ProviderGoogleGateway {
  authorizationUrl(input: {
    clientId: string
    redirectUri: string
    state: string
    nonce: string
    scopes: readonly string[]
    codeChallenge: string
  }): string
  exchangeAuthorizationCode(input: {
    code: string
    clientId: string
    redirectUri: string
    pkceVerifier: string
    expectedNonceHash: string
    hash(value: string): Promise<string>
    now: number
  }): Promise<GoogleAuthorizationResult>
  refreshAccessToken(input: {
    refreshToken: string
    clientId: string
    now: number
    expectedScopes: readonly string[]
  }): Promise<GoogleTokenResult>
  revokeRefreshToken(refreshToken: string): Promise<boolean>
}

interface GoogleGatewayConfiguration {
  clientId: string
  clientSecret: string
}

const tokenEndpoint = 'https://oauth2.googleapis.com/token'
const revokeEndpoint = 'https://oauth2.googleapis.com/revoke'
const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
const jwksEndpoint = 'https://www.googleapis.com/oauth2/v3/certs'
const maximumTokenResponseBytes = 65_536
const maximumJwksResponseBytes = 262_144

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactScopes(value: unknown): value is string[] {
  if (typeof value !== 'string') return false
  const parsed = value.split(' ').filter(Boolean)
  return (
    parsed.length === GOOGLE_CALENDAR_SCOPES.length
    && new Set(parsed).size === parsed.length
    && GOOGLE_CALENDAR_SCOPES.every((scope) => parsed.includes(scope))
  )
}

function sameScopeSet(value: readonly string[]): boolean {
  return (
    value.length === GOOGLE_CALENDAR_SCOPES.length
    && new Set(value).size === value.length
    && GOOGLE_CALENDAR_SCOPES.every((scope) => value.includes(scope))
  )
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
  errorCode: ProviderGoogleErrorCode,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ProviderGoogleError(errorCode)
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximumBytes)) {
    throw new ProviderGoogleError(errorCode)
  }
  if (!response.body) throw new ProviderGoogleError(errorCode)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) {
        await reader.cancel()
        throw new ProviderGoogleError(errorCode)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ProviderGoogleError) throw error
    throw new ProviderGoogleError(errorCode)
  }
  if (total === 0) throw new ProviderGoogleError(errorCode)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ProviderGoogleError(errorCode)
  } finally {
    bytes.fill(0)
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)) throw new Error()
    return value
  } catch {
    throw new ProviderGoogleError(errorCode)
  }
}

function validTokenString(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value)
}

function tokenResult(
  value: Record<string, unknown>,
  now: number,
  expectedScopes: readonly string[],
): GoogleTokenResult {
  if (
    !validTokenString(value.access_token)
    || value.token_type !== 'Bearer'
    || !Number.isSafeInteger(value.expires_in)
    || (value.expires_in as number) < 60
    || (value.expires_in as number) > 7_200
    || (value.refresh_token !== undefined && !validTokenString(value.refresh_token))
  ) {
    throw new ProviderGoogleError('provider_response_invalid')
  }
  const grantedScopes = value.scope === undefined
    ? [...expectedScopes]
    : exactScopes(value.scope)
      ? value.scope.split(' ').filter(Boolean)
      : null
  if (!grantedScopes || !sameScopeSet(grantedScopes) || !sameScopeSet(expectedScopes)) {
    throw new ProviderGoogleError('provider_scope_mismatch')
  }
  return {
    accessToken: value.access_token,
    expiresAt: now + (value.expires_in as number) * 1_000,
    refreshToken: typeof value.refresh_token === 'string' ? value.refresh_token : null,
    grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
  }
}

function parseJwtSegment(segment: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      decodeProviderBase64Url(segment),
    ))
    if (!isRecord(value)) throw new Error()
    return value
  } catch {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
}

async function verifiedIdentity(input: {
  idToken: unknown
  clientId: string
  expectedNonceHash: string
  hash(value: string): Promise<string>
  now: number
  fetchImplementation: typeof fetch
}): Promise<GoogleIdentity> {
  if (typeof input.idToken !== 'string' || input.idToken.length > 16_384) {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
  const parts = input.idToken.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
  const header = parseJwtSegment(parts[0])
  const payload = parseJwtSegment(parts[1])
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) {
    throw new ProviderGoogleError('provider_identity_invalid')
  }

  let jwksResponse: Response
  try {
    jwksResponse = await input.fetchImplementation(jwksEndpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
  if (!jwksResponse.ok) throw new ProviderGoogleError('provider_identity_invalid')
  const jwks = await boundedJson(jwksResponse, maximumJwksResponseBytes, 'provider_identity_invalid')
  if (!Array.isArray(jwks.keys) || jwks.keys.length > 20) {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
  const matchingKey = jwks.keys.find((candidate) => (
    isRecord(candidate)
    && candidate.kid === header.kid
    && candidate.kty === 'RSA'
    && candidate.alg === 'RS256'
    && candidate.use === 'sig'
  ))
  if (!matchingKey) throw new ProviderGoogleError('provider_identity_invalid')

  try {
    const key = await crypto.subtle.importKey(
      'jwk', matchingKey as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    )
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, decodeProviderBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    if (!valid) throw new Error()
  } catch {
    throw new ProviderGoogleError('provider_identity_invalid')
  }

  const nowSeconds = Math.floor(input.now / 1_000)
  const audience = typeof payload.aud === 'string'
    ? payload.aud === input.clientId
    : Array.isArray(payload.aud) && payload.aud.length === 1 && payload.aud[0] === input.clientId
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(String(payload.iss))
    || !audience
    || !Number.isSafeInteger(payload.exp)
    || (payload.exp as number) <= nowSeconds + 30
    || !Number.isSafeInteger(payload.iat)
    || (payload.iat as number) > nowSeconds + 60
    || (payload.iat as number) < nowSeconds - 3_600
    || typeof payload.nonce !== 'string'
    || payload.nonce.length !== 43
    || await input.hash(payload.nonce) !== input.expectedNonceHash
    || typeof payload.sub !== 'string'
    || payload.sub.length < 1
    || payload.sub.length > 255
    || typeof payload.email !== 'string'
    || payload.email.length < 3
    || payload.email.length > 320
    || payload.email_verified !== true
    || (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.length > 200))
  ) {
    throw new ProviderGoogleError('provider_identity_invalid')
  }
  return {
    subject: payload.sub,
    email: payload.email,
    displayName: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
    nonce: payload.nonce,
  }
}

export function createProviderGoogleGateway(
  configuration: GoogleGatewayConfiguration,
  fetchImplementation: typeof fetch = fetch,
): ProviderGoogleGateway {
  if (!configuration.clientId.trim() || !configuration.clientSecret.trim()) {
    throw new Error('provider_google_configuration_required')
  }

  async function tokenRequest(parameters: URLSearchParams, grant: 'exchange' | 'refresh') {
    let response: Response
    try {
      response = await fetchImplementation(tokenEndpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: parameters.toString(),
        cache: 'no-store',
        redirect: 'error',
      })
    } catch {
      throw new ProviderGoogleError(grant === 'refresh' ? 'provider_grant_invalid' : 'provider_exchange_failed')
    }
    const value = await boundedJson(
      response,
      maximumTokenResponseBytes,
      grant === 'refresh' ? 'provider_grant_invalid' : 'provider_exchange_failed',
    )
    if (!response.ok) {
      if (grant === 'refresh' && value.error === 'invalid_grant') {
        throw new ProviderGoogleError('provider_grant_invalid')
      }
      throw new ProviderGoogleError(grant === 'refresh' ? 'provider_grant_invalid' : 'provider_exchange_failed')
    }
    return value
  }

  return {
    authorizationUrl(input) {
      if (input.clientId !== configuration.clientId || !sameScopeSet(input.scopes)) {
        throw new ProviderGoogleError('provider_scope_mismatch')
      }
      const url = new URL(authorizationEndpoint)
      url.searchParams.set('client_id', input.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '))
      url.searchParams.set('state', input.state)
      url.searchParams.set('nonce', input.nonce)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('include_granted_scopes', 'false')
      return url.toString()
    },
    async exchangeAuthorizationCode(input) {
      if (input.clientId !== configuration.clientId) {
        throw new ProviderGoogleError('provider_identity_invalid')
      }
      const value = await tokenRequest(new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        redirect_uri: input.redirectUri,
        code_verifier: input.pkceVerifier,
      }), 'exchange')
      const result = tokenResult(value, input.now, GOOGLE_CALENDAR_SCOPES)
      const identity = await verifiedIdentity({
        idToken: value.id_token,
        clientId: input.clientId,
        expectedNonceHash: input.expectedNonceHash,
        hash: input.hash,
        now: input.now,
        fetchImplementation,
      })
      return { ...result, identity }
    },
    async refreshAccessToken(input) {
      if (input.clientId !== configuration.clientId) {
        throw new ProviderGoogleError('provider_grant_invalid')
      }
      const value = await tokenRequest(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
      }), 'refresh')
      return tokenResult(value, input.now, input.expectedScopes)
    },
    async revokeRefreshToken(refreshToken) {
      try {
        const response = await fetchImplementation(revokeEndpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: refreshToken }).toString(),
          cache: 'no-store',
          redirect: 'error',
        })
        return response.ok
      } catch {
        return false
      }
    },
  }
}

export async function providerSha256Base64Url(value: string): Promise<string> {
  return encodeProviderBase64Url(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value),
  )))
}
