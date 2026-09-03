import { decodeProviderBase64Url } from './providerCrypto.ts'
import type { ProviderAccountKind } from './providerTypes.ts'

export const MICROSOFT_CALENDAR_SCOPES = [
  'openid',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadBasic',
] as const

export type ProviderMicrosoftErrorCode =
  | 'provider_exchange_failed'
  | 'provider_identity_invalid'
  | 'provider_grant_invalid'
  | 'provider_scope_mismatch'
  | 'provider_response_invalid'

export class ProviderMicrosoftError extends Error {
  readonly code: ProviderMicrosoftErrorCode

  constructor(code: ProviderMicrosoftErrorCode) {
    super(code)
    this.name = 'ProviderMicrosoftError'
    this.code = code
  }
}

export interface MicrosoftIdentity {
  tenantId: string
  objectId: string
  accountKind: ProviderAccountKind
  email: string
  displayName: string | null
}

export interface MicrosoftTokenResult {
  accessToken: string
  expiresAt: number
  refreshToken: string | null
  grantedScopes: string[]
}

export interface MicrosoftAuthorizationResult extends MicrosoftTokenResult {
  identity: MicrosoftIdentity
}

export interface ProviderMicrosoftGateway {
  authorizationUrl(input: {
    state: string
    nonce: string
    codeChallenge: string
    redirectUri: string
  }): string
  exchangeCode(input: {
    code: string
    verifier: string
    redirectUri: string
    expectedNonce: string
  }): Promise<MicrosoftAuthorizationResult>
  refresh(refreshToken: string): Promise<MicrosoftTokenResult>
  profile(accessToken: string): Promise<MicrosoftIdentity>
}

interface MicrosoftGatewayConfiguration {
  clientId: string
  clientSecret: string
  now?: () => number
}

const authorizationEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const graphProfileEndpoint = 'https://graph.microsoft.com/v1.0/me?$select=id%2CdisplayName%2Cmail%2CuserPrincipalName'
const personalTenant = '9188040d-6c67-4c5b-b112-36a304b66dad'
const maximumResponseBytes = 65_536
const maximumJwksBytes = 262_144
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validSecret(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 4096
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function validProfileString(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function sameScopes(value: readonly string[]): boolean {
  return value.length === MICROSOFT_CALENDAR_SCOPES.length
    && new Set(value).size === value.length
    && MICROSOFT_CALENDAR_SCOPES.every((scope) => value.includes(scope))
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
  code: ProviderMicrosoftErrorCode,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ProviderMicrosoftError(code)
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximumBytes)) {
    throw new ProviderMicrosoftError(code)
  }
  if (!response.body) throw new ProviderMicrosoftError(code)
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
        throw new ProviderMicrosoftError(code)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ProviderMicrosoftError) throw error
    throw new ProviderMicrosoftError(code)
  }
  if (total === 0) throw new ProviderMicrosoftError(code)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!isRecord(parsed)) throw new Error()
    return parsed
  } catch {
    throw new ProviderMicrosoftError(code)
  } finally {
    bytes.fill(0)
  }
}

function parseJwtSegment(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      decodeProviderBase64Url(value),
    ))
    if (!isRecord(parsed)) throw new Error()
    return parsed
  } catch {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
}

function parseJwt(value: unknown): {
  parts: [string, string, string]
  header: Record<string, unknown>
  claims: Record<string, unknown>
} {
  if (typeof value !== 'string' || value.length > 16_384) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  return {
    parts: parts as [string, string, string],
    header: parseJwtSegment(parts[0]),
    claims: parseJwtSegment(parts[1]),
  }
}

async function getJson(
  fetchImplementation: typeof fetch,
  url: string,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchImplementation(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  if (!response.ok) throw new ProviderMicrosoftError('provider_identity_invalid')
  return boundedJson(response, maximumBytes, 'provider_identity_invalid')
}

async function verifiedIdentity(input: {
  idToken: unknown
  clientId: string
  expectedNonce: string
  now: number
  fetchImplementation: typeof fetch
}): Promise<{ tenantId: string; objectId: string }> {
  const jwt = parseJwt(input.idToken)
  const { header, claims, parts } = jwt
  if (
    header.alg !== 'RS256'
    || typeof header.kid !== 'string'
    || header.kid.length < 1
    || header.kid.length > 200
    || !guid.test(String(claims.tid))
  ) throw new ProviderMicrosoftError('provider_identity_invalid')

  const tenantId = String(claims.tid).toLowerCase()
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
  const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  const discovery = await getJson(
    input.fetchImplementation,
    `${issuer}/.well-known/openid-configuration`,
    maximumResponseBytes,
  )
  if (discovery.issuer !== issuer || discovery.jwks_uri !== jwksUri) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  const jwks = await getJson(input.fetchImplementation, jwksUri, maximumJwksBytes)
  if (!Array.isArray(jwks.keys) || jwks.keys.length > 20) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  const matchingKey = jwks.keys.find((candidate) => isRecord(candidate)
    && candidate.kid === header.kid
    && candidate.kty === 'RSA'
    && (candidate.alg === undefined || candidate.alg === 'RS256')
    && candidate.use === 'sig')
  if (!matchingKey) throw new ProviderMicrosoftError('provider_identity_invalid')
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
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }

  const nowSeconds = Math.floor(input.now / 1_000)
  const audience = typeof claims.aud === 'string'
    ? claims.aud === input.clientId
    : Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === input.clientId
  if (
    claims.iss !== issuer
    || !audience
    || !Number.isSafeInteger(claims.exp)
    || (claims.exp as number) <= nowSeconds + 30
    || !Number.isSafeInteger(claims.iat)
    || (claims.iat as number) > nowSeconds + 60
    || (claims.iat as number) < nowSeconds - 3_600
    || !Number.isSafeInteger(claims.nbf)
    || (claims.nbf as number) > nowSeconds + 60
    || (claims.nbf as number) < nowSeconds - 3_600
    || claims.nonce !== input.expectedNonce
    || String(claims.tid).toLowerCase() !== tenantId
    || !guid.test(String(claims.oid))
  ) throw new ProviderMicrosoftError('provider_identity_invalid')
  return { tenantId, objectId: String(claims.oid).toLowerCase() }
}

async function fetchProfile(
  fetchImplementation: typeof fetch,
  accessToken: string,
  expected: { tenantId: string; objectId: string },
): Promise<MicrosoftIdentity> {
  let response: Response
  try {
    response = await fetchImplementation(graphProfileEndpoint, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  if (!response.ok) throw new ProviderMicrosoftError('provider_identity_invalid')
  const value = await boundedJson(response, maximumResponseBytes, 'provider_identity_invalid')
  if (!guid.test(String(value.id)) || String(value.id).toLowerCase() !== expected.objectId) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  const emailValue = validProfileString(value.mail, 320)
    ? value.mail
    : validProfileString(value.userPrincipalName, 320)
      ? value.userPrincipalName
      : null
  if (!emailValue || !emailValue.includes('@')) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  if (value.displayName !== undefined && value.displayName !== null && !validProfileString(value.displayName, 200)) {
    throw new ProviderMicrosoftError('provider_identity_invalid')
  }
  return {
    tenantId: expected.tenantId,
    objectId: expected.objectId,
    accountKind: expected.tenantId === personalTenant ? 'personal' : 'work_or_school',
    email: emailValue.trim(),
    displayName: validProfileString(value.displayName, 200) ? value.displayName.trim() : null,
  }
}

function tokenResult(value: Record<string, unknown>, now: number): MicrosoftTokenResult {
  if (
    !validSecret(value.access_token)
    || value.token_type !== 'Bearer'
    || !Number.isSafeInteger(value.expires_in)
    || (value.expires_in as number) < 60
    || (value.expires_in as number) > 7_200
    || (value.refresh_token !== undefined && !validSecret(value.refresh_token))
  ) throw new ProviderMicrosoftError('provider_response_invalid')
  const scopes = value.scope === undefined
    ? [...MICROSOFT_CALENDAR_SCOPES]
    : typeof value.scope === 'string'
      ? value.scope.split(' ').filter(Boolean)
      : []
  if (!sameScopes(scopes)) throw new ProviderMicrosoftError('provider_scope_mismatch')
  return {
    accessToken: value.access_token,
    expiresAt: now + (value.expires_in as number) * 1_000,
    refreshToken: typeof value.refresh_token === 'string' ? value.refresh_token : null,
    grantedScopes: [...MICROSOFT_CALENDAR_SCOPES],
  }
}

export function createProviderMicrosoftGateway(
  configuration: MicrosoftGatewayConfiguration,
  fetchImplementation: typeof fetch = fetch,
): ProviderMicrosoftGateway {
  const clientId = configuration.clientId.trim()
  const clientSecret = configuration.clientSecret.trim()
  if (!clientId || !clientSecret) throw new Error('provider_microsoft_configuration_required')
  const clock = configuration.now ?? Date.now
  const pendingProfiles = new Map<string, { tenantId: string; objectId: string }>()

  async function accessTokenFingerprint(accessToken: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(accessToken),
    ))
    try {
      return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
    } finally {
      digest.fill(0)
    }
  }

  async function profile(accessToken: string): Promise<MicrosoftIdentity> {
    const fingerprint = await accessTokenFingerprint(accessToken)
    const expectedIdentity = pendingProfiles.get(fingerprint)
    pendingProfiles.delete(fingerprint)
    if (!expectedIdentity) throw new ProviderMicrosoftError('provider_identity_invalid')
    return fetchProfile(fetchImplementation, accessToken, expectedIdentity)
  }

  async function tokenRequest(parameters: URLSearchParams, grant: 'exchange' | 'refresh') {
    let response: Response
    try {
      response = await fetchImplementation(tokenEndpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: parameters.toString(),
        cache: 'no-store',
        redirect: 'error',
      })
    } catch {
      throw new ProviderMicrosoftError(grant === 'refresh' ? 'provider_grant_invalid' : 'provider_exchange_failed')
    }
    const value = await boundedJson(response, maximumResponseBytes, 'provider_response_invalid')
    if (!response.ok) {
      if (grant === 'refresh' && value.error === 'invalid_grant') {
        throw new ProviderMicrosoftError('provider_grant_invalid')
      }
      throw new ProviderMicrosoftError(grant === 'refresh' ? 'provider_grant_invalid' : 'provider_exchange_failed')
    }
    return value
  }

  return {
    authorizationUrl(input) {
      const url = new URL(authorizationEndpoint)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('response_mode', 'query')
      url.searchParams.set('scope', MICROSOFT_CALENDAR_SCOPES.join(' '))
      url.searchParams.set('state', input.state)
      url.searchParams.set('nonce', input.nonce)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('prompt', 'select_account')
      return url.toString()
    },
    async exchangeCode(input) {
      const value = await tokenRequest(new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }), 'exchange')
      const token = tokenResult(value, clock())
      const expected = await verifiedIdentity({
        idToken: value.id_token,
        clientId,
        expectedNonce: input.expectedNonce,
        now: clock(),
        fetchImplementation,
      })
      const fingerprint = await accessTokenFingerprint(token.accessToken)
      pendingProfiles.set(fingerprint, expected)
      let identity: MicrosoftIdentity
      try {
        identity = await profile(token.accessToken)
      } finally {
        pendingProfiles.delete(fingerprint)
      }
      return { ...token, identity }
    },
    async refresh(refreshToken) {
      const value = await tokenRequest(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: MICROSOFT_CALENDAR_SCOPES.join(' '),
      }), 'refresh')
      return tokenResult(value, clock())
    },
    profile,
  }
}
