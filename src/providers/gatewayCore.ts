import {
  GOOGLE_CALENDAR_SCOPES,
  MICROSOFT_CALENDAR_SCOPES,
  parseProviderSession,
  replaceProviderConnections,
} from './connections'
import type {
  ProviderConnectionsState,
  ProviderId,
  ProviderScope,
  ProviderSession,
} from './types'

export interface ProviderIdentityBoundary {
  getRedirectURL(path?: string): string
  launchWebAuthFlow(details: { url: string; interactive: boolean }): Promise<string | undefined>
}

export interface ProviderOAuthAttempt {
  clientNonce: string
  baseRedirect: string
  finalRedirect: string
}

export type ProviderOAuthResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'invalid_authorization_url'
        | 'invalid_return'
        | 'popup_closed'
        | 'provider_denied'
        | 'provider_unavailable'
        | 'entitlement_required'
        | 'reconnect_required'
        | 'organization_approval_required'
    }

export type ProviderGatewayErrorCode =
  | 'not_configured'
  | 'authentication_required'
  | 'entitlement_required'
  | 'permission_denied'
  | 'popup_closed'
  | 'provider_denied'
  | 'invalid_authorization_url'
  | 'invalid_return'
  | 'unavailable'
  | 'reconnect_required'
  | 'organization_approval_required'
  | 'rate_limited'
  | 'connection_not_found'

export type ProviderGatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProviderGatewayErrorCode }

export interface ProviderGatewayAccount {
  accountId: string
  capabilities: readonly string[]
  leaseExpiresAt: number
}

export interface ProviderGateway {
  listConnections(): Promise<ProviderGatewayResult<ProviderConnectionsState>>
  connect(): Promise<ProviderGatewayResult<ProviderConnectionsState>>
  getSession(connectionId: string): Promise<ProviderGatewayResult<ProviderSession>>
  disconnect(connectionId: string): Promise<ProviderGatewayResult<{
    revocationConfirmed: boolean
    remainingConnections: number
  }>>
  clearMemory(): void
}

export interface ProviderGatewayConfig {
  provider: ProviderId
  capability: 'google_calendar' | 'microsoft_calendar'
  functionPrefix: 'google-calendar' | 'microsoft-calendar'
  scopes: readonly ProviderScope[]
  createAttempt(): ProviderOAuthAttempt | null
  launch(authorizationUrl: string, attempt: ProviderOAuthAttempt): Promise<ProviderOAuthResult>
}

export interface ProviderOriginBoundary {
  request(): Promise<boolean>
  remove(): Promise<boolean>
}

export interface ProviderGatewayCoreDependencies {
  enabled: boolean
  origin: string
  allowedOrigins: readonly string[]
  fetch: typeof fetch
  now(): number
  randomBytes(size: number): Uint8Array
  getAccount(): ProviderGatewayAccount | null
  getAccessToken(): Promise<string | null>
  invalidateAuthentication(): Promise<void> | void
  identity: ProviderIdentityBoundary
  originPermission: ProviderOriginBoundary
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MAX_RESPONSE_BYTES = 64 * 1024
const SESSION_REFRESH_WINDOW_MS = 60_000
const REQUEST_TIMEOUT_MS = 20_000

const PROVIDER_CONTRACTS = {
  google_calendar: {
    capability: 'google_calendar',
    functionPrefix: 'google-calendar',
    scopes: GOOGLE_CALENDAR_SCOPES,
  },
  microsoft_calendar: {
    capability: 'microsoft_calendar',
    functionPrefix: 'microsoft-calendar',
    scopes: MICROSOFT_CALENDAR_SCOPES,
  },
} as const

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function trustedOrigin(origin: string, allowed: readonly string[]): boolean {
  try {
    const parsed = new URL(origin)
    const secure = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')
    return parsed.origin === origin && secure && allowed.includes(origin)
  } catch {
    return false
  }
}

function exactScopes(actual: readonly ProviderScope[], expected: readonly ProviderScope[]): boolean {
  return actual.length === expected.length && actual.every((scope, index) => scope === expected[index])
}

function validConfig(config: ProviderGatewayConfig): boolean {
  const expected = PROVIDER_CONTRACTS[config.provider]
  return config.capability === expected.capability
    && config.functionPrefix === expected.functionPrefix
    && exactScopes(config.scopes, expected.scopes)
}

function statusCode(status: number): ProviderGatewayErrorCode {
  switch (status) {
    case 401: return 'authentication_required'
    case 403: return 'entitlement_required'
    case 404: return 'connection_not_found'
    case 409: return 'reconnect_required'
    case 429: return 'rate_limited'
    default: return 'unavailable'
  }
}

async function boundedJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return null
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) return null
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function createProviderGatewayCore(
  config: ProviderGatewayConfig,
  deps: ProviderGatewayCoreDependencies,
): ProviderGateway {
  const sessions = new Map<string, ProviderSession>()
  const pendingSessions = new Map<string, Promise<ProviderGatewayResult<ProviderSession>>>()
  let ownerAccountId: string | null = null
  let generation = 0

  const clearMemory = (): void => {
    generation += 1
    sessions.clear()
    pendingSessions.clear()
    ownerAccountId = null
  }

  const prepare = (): ProviderGatewayResult<ProviderGatewayAccount> => {
    if (!deps.enabled || !validConfig(config) || !trustedOrigin(deps.origin, deps.allowedOrigins)) {
      return { ok: false, code: 'not_configured' }
    }
    const account = deps.getAccount()
    if (!account) return { ok: false, code: 'authentication_required' }
    if (!UUID.test(account.accountId)
      || account.leaseExpiresAt <= deps.now()
      || !account.capabilities.includes('multi_account')
      || !account.capabilities.includes(config.capability)) {
      return { ok: false, code: 'entitlement_required' }
    }
    if (ownerAccountId !== null && ownerAccountId !== account.accountId) clearMemory()
    ownerAccountId = account.accountId
    return { ok: true, value: account }
  }

  const request = async (
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<ProviderGatewayResult<unknown>> => {
    let accessToken: string | null
    try {
      accessToken = await deps.getAccessToken()
    } catch {
      return { ok: false, code: 'unavailable' }
    }
    if (!accessToken
      || accessToken !== accessToken.trim()
      || accessToken.length > 4_096
      || /[\u0000-\u001f\u007f]/u.test(accessToken)) {
      return { ok: false, code: 'authentication_required' }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await deps.fetch(`${deps.origin}/functions/v1/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) {
        const code = statusCode(response.status)
        if (response.status === 401) {
          clearMemory()
          await deps.invalidateAuthentication()
        }
        return { ok: false, code }
      }
      const value = await boundedJson(response)
      return value === null ? { ok: false, code: 'unavailable' } : { ok: true, value }
    } catch {
      return { ok: false, code: 'unavailable' }
    } finally {
      clearTimeout(timeout)
    }
  }

  const listConnections = async (): Promise<ProviderGatewayResult<ProviderConnectionsState>> => {
    const prepared = prepare()
    if (!prepared.ok) return prepared
    const response = await request(`${config.functionPrefix}-connections`, 'GET')
    if (!response.ok) return response
    if (!record(response.value)
      || !exactKeys(response.value, ['connections'])
      || !Array.isArray(response.value.connections)) {
      return { ok: false, code: 'unavailable' }
    }
    const normalized: unknown[] = []
    const expectedKeys = config.provider === 'google_calendar'
      ? ['id', 'provider', 'email', 'displayName', 'status', 'grantedScopes', 'createdAt', 'updatedAt']
      : ['id', 'provider', 'accountKind', 'email', 'displayName', 'status', 'grantedScopes', 'createdAt', 'updatedAt']
    for (const value of response.value.connections) {
      if (!record(value) || !exactKeys(value, expectedKeys)) {
        return { ok: false, code: 'unavailable' }
      }
      normalized.push({
        connectionId: value.id,
        provider: value.provider,
        accountKind: config.provider === 'google_calendar' ? null : value.accountKind,
        displayEmail: value.email,
        displayName: value.displayName,
        status: value.status,
        grantedScopes: value.grantedScopes,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })
    }
    const parsed = replaceProviderConnections(null, prepared.value.accountId, normalized)
    if (!parsed.ok || parsed.value.connections.some((connection) => connection.provider !== config.provider)) {
      return { ok: false, code: 'unavailable' }
    }
    return parsed
  }

  const connect = async (): Promise<ProviderGatewayResult<ProviderConnectionsState>> => {
    const prepared = prepare()
    if (!prepared.ok) return prepared
    let permission: Promise<boolean>
    try {
      permission = deps.originPermission.request()
    } catch {
      return { ok: false, code: 'permission_denied' }
    }
    try {
      if (!await permission) return { ok: false, code: 'permission_denied' }
    } catch {
      return { ok: false, code: 'permission_denied' }
    }
    const attempt = config.createAttempt()
    if (!attempt) return { ok: false, code: 'invalid_return' }
    const started = await request(`${config.functionPrefix}-oauth-start`, 'POST', {
      clientNonce: attempt.clientNonce,
      finalRedirect: attempt.finalRedirect,
    })
    if (!started.ok) return started
    if (!record(started.value)
      || !exactKeys(started.value, ['authorizationUrl'])
      || typeof started.value.authorizationUrl !== 'string') {
      return { ok: false, code: 'unavailable' }
    }
    const authorized = await config.launch(started.value.authorizationUrl, attempt)
    if (!authorized.ok) {
      return {
        ok: false,
        code: authorized.code === 'provider_unavailable' ? 'unavailable' : authorized.code,
      }
    }
    return listConnections()
  }

  const getSession = async (connectionId: string): Promise<ProviderGatewayResult<ProviderSession>> => {
    const prepared = prepare()
    if (!prepared.ok) return prepared
    if (!UUID.test(connectionId)) return { ok: false, code: 'connection_not_found' }
    const cached = sessions.get(connectionId)
    if (cached && cached.expiresAt > deps.now() + SESSION_REFRESH_WINDOW_MS) {
      return { ok: true, value: cached }
    }
    const pending = pendingSessions.get(connectionId)
    if (pending) return pending
    const requestGeneration = generation
    const refresh = (async (): Promise<ProviderGatewayResult<ProviderSession>> => {
      const response = await request(`${config.functionPrefix}-session`, 'POST', { connectionId })
      if (!response.ok) return response
      if (!record(response.value)
        || !exactKeys(response.value, ['connectionId', 'accessToken', 'expiresAt'])) {
        return { ok: false, code: 'unavailable' }
      }
      const parsed = parseProviderSession(
        { ...response.value, provider: config.provider },
        connectionId,
        deps.now(),
        config.provider,
      )
      if (!parsed) return { ok: false, code: 'unavailable' }
      if (generation !== requestGeneration || ownerAccountId !== prepared.value.accountId) {
        return { ok: false, code: 'authentication_required' }
      }
      sessions.set(connectionId, parsed)
      return { ok: true, value: parsed }
    })()
    pendingSessions.set(connectionId, refresh)
    void refresh.finally(() => {
      if (pendingSessions.get(connectionId) === refresh) pendingSessions.delete(connectionId)
    })
    return refresh
  }

  const disconnect = async (connectionId: string): Promise<ProviderGatewayResult<{
    revocationConfirmed: boolean
    remainingConnections: number
  }>> => {
    const prepared = prepare()
    if (!prepared.ok) return prepared
    if (!UUID.test(connectionId)) return { ok: false, code: 'connection_not_found' }
    const disconnected = await request(`${config.functionPrefix}-disconnect`, 'POST', {
      connectionId,
      confirmation: 'disconnect',
    })
    if (!disconnected.ok) return disconnected
    if (!record(disconnected.value)
      || !exactKeys(disconnected.value, ['disconnected', 'revocationConfirmed'])
      || disconnected.value.disconnected !== true
      || typeof disconnected.value.revocationConfirmed !== 'boolean') {
      return { ok: false, code: 'unavailable' }
    }
    sessions.delete(connectionId)
    pendingSessions.delete(connectionId)
    const listed = await listConnections()
    if (!listed.ok) return listed
    const remainingConnections = listed.value.connections.length
    if (remainingConnections === 0) {
      try {
        await deps.originPermission.remove()
      } catch {
        // Disconnect authority is already removed; optional-origin cleanup can be retried later.
      }
    }
    return {
      ok: true,
      value: { revocationConfirmed: disconnected.value.revocationConfirmed, remainingConnections },
    }
  }

  return { listConnections, connect, getSession, disconnect, clearMemory }
}
