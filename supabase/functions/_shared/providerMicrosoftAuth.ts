import type { RequestAuthentication } from './requestAuth.ts'
import {
  MICROSOFT_CALENDAR_SCOPES,
  ProviderMicrosoftError,
  type ProviderMicrosoftGateway,
} from './providerMicrosoft.ts'
import { decodeProviderBase64Url, encodeProviderBase64Url, type ProviderCrypto } from './providerCrypto.ts'
import type {
  PrivateProviderConnection,
  ProviderConnectionMetadata,
  ProviderOAuthTransaction,
  ProviderRepository,
} from './providerTypes.ts'

export interface MicrosoftProviderFunctionDependencies {
  authenticate(request: Request): Promise<RequestAuthentication>
  repository: ProviderRepository
  crypto: ProviderCrypto
  microsoft: ProviderMicrosoftGateway
  now(): number
  randomUUID(): string
  randomBytes(length: number): Uint8Array
  hash(value: string): Promise<string>
  requestFingerprint(request: Request): Promise<string>
  oauthCallbackUrl: string
  allowedExtensionId: string
}

const provider = 'microsoft_calendar' as const
const transactionLifetime = 10 * 60_000
const maximumRequestBytes = 4_096
const base64Url32 = /^[A-Za-z0-9_-]{43}$/u
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const subject = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu
const personalTenant = '9188040d-6c67-4c5b-b112-36a304b66dad'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function providerError(error: string, status: number): Response {
  return jsonResponse({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

async function exactJson(request: Request, keys: readonly string[]): Promise<Record<string, unknown> | null> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return null
  }
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (!text || new TextEncoder().encode(text).byteLength > maximumRequestBytes) return null
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) && hasExactKeys(value, keys) ? value : null
  } catch {
    return null
  }
}

function exactScopes(value: readonly string[]): boolean {
  return value.length === MICROSOFT_CALENDAR_SCOPES.length
    && new Set(value).size === value.length
    && MICROSOFT_CALENDAR_SCOPES.every((scope) => value.includes(scope))
}

function safeNonce(value: unknown): value is string {
  if (typeof value !== 'string' || !base64Url32.test(value)) return false
  try {
    return decodeProviderBase64Url(value).byteLength === 32
  } catch {
    return false
  }
}

function expectedFinalRedirect(value: unknown, clientNonce: string, extensionId: string): value is string {
  if (typeof value !== 'string' || value.length > 512) return false
  try {
    const url = new URL(value)
    const entries = [...url.searchParams.entries()]
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hostname === `${extensionId}.chromiumapp.org`
      && url.pathname === '/microsoft-calendar'
      && url.hash === ''
      && entries.length === 1
      && entries[0][0] === 'nonce'
      && entries[0][1] === clientNonce
  } catch {
    return false
  }
}

function validSubject(value: string, accountKind: 'personal' | 'work_or_school'): boolean {
  const match = subject.exec(value)
  if (!match) return false
  const isPersonal = match[1].toLowerCase() === personalTenant
  return accountKind === 'personal' ? isPersonal : !isPersonal
}

function validConnectionRecord(value: PrivateProviderConnection, accountId: string): boolean {
  return uuid.test(value.id)
    && value.accountId === accountId
    && value.provider === provider
    && (value.accountKind === 'personal' || value.accountKind === 'work_or_school')
    && validSubject(value.providerSubject, value.accountKind)
    && typeof value.email === 'string'
    && value.email.length >= 3
    && value.email.length <= 320
    && (value.displayName === null || (typeof value.displayName === 'string' && value.displayName.length <= 200))
    && ['active', 'reconnect_required'].includes(value.status)
    && exactScopes(value.grantedScopes)
    && Number.isSafeInteger(value.createdAt)
    && Number.isSafeInteger(value.updatedAt)
    && (value.revokedAt === null || Number.isSafeInteger(value.revokedAt))
    && (value.lastTokenRefreshAt === null || Number.isSafeInteger(value.lastTokenRefreshAt))
}

function validConnectionMetadata(value: ProviderConnectionMetadata): boolean {
  return uuid.test(value.id)
    && value.provider === provider
    && (value.accountKind === 'personal' || value.accountKind === 'work_or_school')
    && typeof value.email === 'string'
    && value.email.length >= 3
    && value.email.length <= 320
    && (value.displayName === null || (typeof value.displayName === 'string' && value.displayName.length <= 200))
    && ['active', 'reconnect_required'].includes(value.status)
    && exactScopes(value.grantedScopes)
    && Number.isSafeInteger(value.createdAt)
    && Number.isSafeInteger(value.updatedAt)
}

async function resolveAccount(
  request: Request,
  dependencies: MicrosoftProviderFunctionDependencies,
): Promise<{ accountId: string } | Response> {
  const authentication = await dependencies.authenticate(request)
  if (!authentication.ok) return providerError('authentication_required', 401)
  const account = await dependencies.repository.findAccountForAuthUser(authentication.authUserId)
  if (!account || !uuid.test(account.accountId)) return providerError('provider_account_not_found', 403)
  return account
}

async function requireCapabilities(
  accountId: string,
  dependencies: MicrosoftProviderFunctionDependencies,
  effectiveAt: number,
): Promise<Response | null> {
  const capabilities = await dependencies.repository.getEffectiveCapabilities(accountId, effectiveAt)
  if (!Array.isArray(capabilities)
    || !capabilities.includes('multi_account')
    || !capabilities.includes('microsoft_calendar')) {
    return providerError('provider_entitlement_required', 403)
  }
  return null
}

function callbackRedirect(transaction: ProviderOAuthTransaction, result: string): Response {
  const separator = transaction.finalRedirect.includes('?') ? '&' : '?'
  return new Response(null, {
    status: 302,
    headers: {
      location: `${transaction.finalRedirect}${separator}result=${encodeURIComponent(result)}`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

function callbackResult(error: ProviderMicrosoftError): string {
  switch (error.code) {
    case 'provider_identity_invalid': return 'identity_invalid'
    case 'provider_scope_mismatch': return 'scope_mismatch'
    case 'provider_grant_invalid': return 'grant_invalid'
    case 'provider_exchange_failed':
    case 'provider_response_invalid': return 'provider_unavailable'
  }
}

function organizationApproval(error: string, description: string | null): boolean {
  return error === 'admin_consent_required'
    || error === 'consent_required'
    || (description !== null && description.length <= 2_048 && description.includes('AADSTS65001'))
}

export function createMicrosoftProviderHandlers(dependencies: MicrosoftProviderFunctionDependencies): {
  oauthStart(request: Request): Promise<Response>
  oauthCallback(request: Request): Promise<Response>
  connections(request: Request): Promise<Response>
  session(request: Request): Promise<Response>
  disconnect(request: Request): Promise<Response>
} {
  return {
    async oauthStart(request) {
      if (request.method !== 'POST') return providerError('method_not_allowed', 405)
      try {
        if (request.headers.get('origin') !== `chrome-extension://${dependencies.allowedExtensionId}`) {
          return providerError('provider_request_invalid', 400)
        }
        const body = await exactJson(request, ['clientNonce', 'finalRedirect'])
        if (!body
          || !safeNonce(body.clientNonce)
          || !expectedFinalRedirect(body.finalRedirect, body.clientNonce, dependencies.allowedExtensionId)) {
          return providerError('provider_request_invalid', 400)
        }
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const effectiveAt = dependencies.now()
        if (!Number.isSafeInteger(effectiveAt)) throw new Error('invalid_clock')
        const entitlement = await requireCapabilities(resolved.accountId, dependencies, effectiveAt)
        if (entitlement) return entitlement
        if (!await dependencies.repository.consumeRateLimit({
          accountId: resolved.accountId,
          action: 'start',
          ipFingerprint: await dependencies.requestFingerprint(request),
          effectiveAt,
        })) return providerError('provider_rate_limited', 429)

        const stateBytes = dependencies.randomBytes(32)
        const verifierBytes = dependencies.randomBytes(32)
        if (stateBytes.byteLength !== 32 || verifierBytes.byteLength !== 32) throw new Error('random_invalid')
        const state = encodeProviderBase64Url(stateBytes)
        const pkceVerifier = encodeProviderBase64Url(verifierBytes)
        stateBytes.fill(0)
        verifierBytes.fill(0)
        const transactionId = dependencies.randomUUID()
        const correlationId = dependencies.randomUUID()
        if (!uuid.test(transactionId) || !uuid.test(correlationId)) throw new Error('uuid_invalid')
        const [stateHash, clientNonceHash, codeChallenge] = await Promise.all([
          dependencies.hash(state),
          dependencies.hash(body.clientNonce),
          dependencies.hash(pkceVerifier),
        ])
        const pkce = await dependencies.crypto.encryptSecret(pkceVerifier, {
          purpose: 'pkce_verifier', provider,
          accountId: resolved.accountId, objectId: transactionId,
        })
        await dependencies.repository.createOAuthTransaction({
          id: transactionId,
          accountId: resolved.accountId,
          provider,
          stateHash,
          clientNonceHash,
          pkce,
          finalRedirect: body.finalRedirect,
          expiresAt: effectiveAt + transactionLifetime,
          correlationId,
          effectiveAt,
        })
        return jsonResponse({
          authorizationUrl: dependencies.microsoft.authorizationUrl({
            state,
            nonce: body.clientNonce,
            codeChallenge,
            redirectUri: dependencies.oauthCallbackUrl,
          }),
        })
      } catch {
        return providerError('provider_service_unavailable', 503)
      }
    },

    async oauthCallback(request) {
      if (request.method !== 'GET') return providerError('method_not_allowed', 405)
      const url = new URL(request.url)
      const state = url.searchParams.get('state')
      if (!safeNonce(state)) return providerError('provider_state_invalid', 400)
      try {
        const effectiveAt = dependencies.now()
        const transaction = await dependencies.repository.consumeOAuthTransaction(
          await dependencies.hash(state), effectiveAt,
        )
        if (!transaction) {
          await dependencies.repository.consumeRateLimit({
            accountId: null,
            action: 'callback_failure',
            ipFingerprint: await dependencies.requestFingerprint(request),
            effectiveAt,
          })
          return providerError('provider_state_invalid', 400)
        }
        const clientNonce = new URL(transaction.finalRedirect).searchParams.get('nonce') ?? ''
        if (transaction.provider !== provider
          || !uuid.test(transaction.id)
          || !uuid.test(transaction.accountId)
          || !uuid.test(transaction.correlationId)
          || !safeNonce(clientNonce)
          || !expectedFinalRedirect(transaction.finalRedirect, clientNonce, dependencies.allowedExtensionId)
          || await dependencies.hash(clientNonce) !== transaction.clientNonceHash) {
          return providerError('provider_state_invalid', 400)
        }
        if (transaction.expiresAt <= effectiveAt) return callbackRedirect(transaction, 'transaction_expired')
        const entitlement = await requireCapabilities(transaction.accountId, dependencies, effectiveAt)
        if (entitlement) return callbackRedirect(transaction, 'entitlement_required')

        const providerErrorValue = url.searchParams.get('error')
        if (providerErrorValue !== null) {
          const description = url.searchParams.get('error_description')
          const result = organizationApproval(providerErrorValue, description)
            ? 'organization_approval_required'
            : providerErrorValue === 'access_denied' ? 'access_denied' : 'provider_denied'
          return callbackRedirect(transaction, result)
        }
        const code = url.searchParams.get('code')
        if (!code || code.length > 2_048 || /[\u0000-\u001f\u007f]/u.test(code)) {
          return callbackRedirect(transaction, 'request_invalid')
        }
        try {
          const pkceVerifier = await dependencies.crypto.decryptSecret(transaction.pkce, {
            purpose: 'pkce_verifier', provider,
            accountId: transaction.accountId, objectId: transaction.id,
          })
          const result = await dependencies.microsoft.exchangeCode({
            code,
            verifier: pkceVerifier,
            redirectUri: dependencies.oauthCallbackUrl,
            expectedNonce: clientNonce,
          })
          if (!guid.test(result.identity.tenantId)
            || !guid.test(result.identity.objectId)
            || !exactScopes(result.grantedScopes)
            || result.expiresAt <= effectiveAt + 30_000) {
            return callbackRedirect(transaction, 'identity_invalid')
          }
          const providerSubject = `${result.identity.tenantId.toLowerCase()}:${result.identity.objectId.toLowerCase()}`
          if (!validSubject(providerSubject, result.identity.accountKind)) {
            return callbackRedirect(transaction, 'identity_invalid')
          }
          const existing = await dependencies.repository.findConnectionBySubject(
            transaction.accountId, provider, providerSubject,
          )
          if (!result.refreshToken && !existing) {
            return callbackRedirect(transaction, 'refresh_token_required')
          }
          const targetConnectionId = existing?.id ?? dependencies.randomUUID()
          if (!uuid.test(targetConnectionId)) throw new Error('uuid_invalid')
          const refreshToken = result.refreshToken
            ? await dependencies.crypto.encryptSecret(result.refreshToken, {
                purpose: 'refresh_token', provider,
                accountId: transaction.accountId, objectId: targetConnectionId,
              })
            : null
          const persisted = await dependencies.repository.upsertConnection({
            id: targetConnectionId,
            accountId: transaction.accountId,
            provider,
            accountKind: result.identity.accountKind,
            providerSubject,
            email: result.identity.email,
            displayName: result.identity.displayName,
            grantedScopes: result.grantedScopes,
            refreshToken,
            effectiveAt,
          })
          if (!validConnectionRecord(persisted, transaction.accountId)) throw new Error('invalid_connection')
          if (result.refreshToken && persisted.id !== targetConnectionId) {
            const corrected = await dependencies.crypto.encryptSecret(result.refreshToken, {
              purpose: 'refresh_token', provider,
              accountId: transaction.accountId, objectId: persisted.id,
            })
            if (!await dependencies.repository.rotateRefreshToken({
              accountId: transaction.accountId,
              connectionId: persisted.id,
              refreshToken: corrected,
              effectiveAt,
            })) throw new Error('provider_rotation_failed')
          }
          return callbackRedirect(transaction, 'success')
        } catch (error) {
          return callbackRedirect(
            transaction,
            error instanceof ProviderMicrosoftError ? callbackResult(error) : 'provider_unavailable',
          )
        }
      } catch {
        return providerError('provider_service_unavailable', 503)
      }
    },

    async connections(request) {
      if (request.method !== 'GET') return providerError('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const connections = (await dependencies.repository.listConnections(resolved.accountId))
          .filter((connection) => connection.provider === provider)
        if (connections.length > 5) throw new Error('invalid_connections')
        const publicConnections = connections.map((connection) => {
          if (!validConnectionMetadata(connection)) throw new Error('invalid_connection')
          return {
            id: connection.id,
            provider: connection.provider,
            accountKind: connection.accountKind,
            email: connection.email,
            displayName: connection.displayName,
            status: connection.status,
            grantedScopes: [...connection.grantedScopes],
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
          }
        })
        return jsonResponse({ connections: publicConnections })
      } catch {
        return providerError('provider_service_unavailable', 503)
      }
    },

    async session(request) {
      if (request.method !== 'POST') return providerError('method_not_allowed', 405)
      try {
        const body = await exactJson(request, ['connectionId'])
        if (!body || typeof body.connectionId !== 'string' || !uuid.test(body.connectionId)) {
          return providerError('provider_request_invalid', 400)
        }
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const effectiveAt = dependencies.now()
        const entitlement = await requireCapabilities(resolved.accountId, dependencies, effectiveAt)
        if (entitlement) return entitlement
        if (!await dependencies.repository.consumeRateLimit({
          accountId: resolved.accountId,
          action: 'session',
          ipFingerprint: await dependencies.requestFingerprint(request),
          effectiveAt,
        })) return providerError('provider_rate_limited', 429)
        const connection = await dependencies.repository.getConnection(resolved.accountId, body.connectionId)
        if (!connection || !validConnectionRecord(connection, resolved.accountId)) {
          return providerError('provider_connection_not_found', 404)
        }
        if (connection.status !== 'active' || connection.revokedAt !== null) {
          return providerError('provider_reconnect_required', 409)
        }
        const refreshToken = await dependencies.crypto.decryptSecret(connection.refreshToken, {
          purpose: 'refresh_token', provider,
          accountId: resolved.accountId, objectId: connection.id,
        })
        let result
        try {
          result = await dependencies.microsoft.refresh(refreshToken)
        } catch (error) {
          if (error instanceof ProviderMicrosoftError && error.code === 'provider_grant_invalid') {
            await dependencies.repository.markReconnectRequired(resolved.accountId, connection.id, effectiveAt)
            return providerError('provider_reconnect_required', 409)
          }
          return providerError('provider_session_unavailable', 503)
        }
        if (!exactScopes(result.grantedScopes) || result.expiresAt <= effectiveAt + 30_000) {
          return providerError('provider_session_unavailable', 503)
        }
        if (result.refreshToken) {
          const rotated = await dependencies.crypto.encryptSecret(result.refreshToken, {
            purpose: 'refresh_token', provider,
            accountId: resolved.accountId, objectId: connection.id,
          })
          if (!await dependencies.repository.rotateRefreshToken({
            accountId: resolved.accountId,
            connectionId: connection.id,
            refreshToken: rotated,
            effectiveAt,
          })) return providerError('provider_session_unavailable', 503)
        }
        return jsonResponse({
          connectionId: connection.id,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
        })
      } catch {
        return providerError('provider_session_unavailable', 503)
      }
    },

    async disconnect(request) {
      if (request.method !== 'POST') return providerError('method_not_allowed', 405)
      try {
        const body = await exactJson(request, ['confirmation', 'connectionId'])
        if (!body
          || body.confirmation !== 'disconnect'
          || typeof body.connectionId !== 'string'
          || !uuid.test(body.connectionId)) {
          return providerError('provider_request_invalid', 400)
        }
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const effectiveAt = dependencies.now()
        if (!await dependencies.repository.consumeRateLimit({
          accountId: resolved.accountId,
          action: 'disconnect',
          ipFingerprint: await dependencies.requestFingerprint(request),
          effectiveAt,
        })) return providerError('provider_rate_limited', 429)
        const connection = await dependencies.repository.getConnection(resolved.accountId, body.connectionId)
        if (!connection || !validConnectionRecord(connection, resolved.accountId)) {
          return providerError('provider_connection_not_found', 404)
        }
        if (!await dependencies.repository.deleteConnection(resolved.accountId, connection.id, effectiveAt)) {
          return providerError('provider_service_unavailable', 503)
        }
        return jsonResponse({ disconnected: true, revocationConfirmed: false })
      } catch {
        return providerError('provider_service_unavailable', 503)
      }
    },
  }
}
