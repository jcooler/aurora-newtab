import type {
  GoogleCalendarScope,
  ProviderConnection,
  ProviderConnectionAction,
  ProviderConnectionResult,
  ProviderConnectionsState,
  ProviderId,
  ProviderSession,
} from './types'

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const satisfies readonly GoogleCalendarScope[]

export const MAX_PROVIDER_CONNECTIONS = 5

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PROVIDERS = new Set<ProviderId>(['google_calendar'])
const STATUSES = new Set(['active', 'reconnect_required', 'revoked'])
const STATUS_ORDER = new Map([
  ['active', 0],
  ['reconnect_required', 1],
  ['revoked', 2],
])
const MAX_SESSION_LIFETIME_MS = 2 * 60 * 60 * 1_000

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && actual.every((key) => Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function validEmail(value: unknown): value is string {
  if (typeof value !== 'string'
    || value !== value.trim()
    || value.length < 3
    || value.length > 254
    || /[\s\u0000-\u001f\u007f]/u.test(value)) return false
  const separator = value.indexOf('@')
  return separator > 0 && separator === value.lastIndexOf('@') && separator < value.length - 1
}

function validDisplayName(value: unknown): value is string | null {
  return value === null || (typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 120
    && !/[\u0000-\u001f\u007f]/u.test(value))
}

function validScopes(value: unknown): value is readonly GoogleCalendarScope[] {
  return Array.isArray(value)
    && value.length === GOOGLE_CALENDAR_SCOPES.length
    && value.every((scope, index) => scope === GOOGLE_CALENDAR_SCOPES[index])
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value)
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(clone)
  return clone
}

function compareConnections(left: ProviderConnection, right: ProviderConnection): number {
  const status = (STATUS_ORDER.get(left.status) ?? Number.MAX_SAFE_INTEGER)
    - (STATUS_ORDER.get(right.status) ?? Number.MAX_SAFE_INTEGER)
  if (status !== 0) return status
  const email = left.displayEmail.toLocaleLowerCase('en-US')
    .localeCompare(right.displayEmail.toLocaleLowerCase('en-US'), 'en-US')
  if (email !== 0) return email
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
  return left.connectionId.localeCompare(right.connectionId, 'en-US')
}

export function parseProviderConnection(value: unknown): ProviderConnection | null {
  if (!record(value) || !exactKeys(value, [
    'connectionId', 'provider', 'displayEmail', 'displayName', 'status',
    'grantedScopes', 'createdAt', 'updatedAt',
  ])) return null
  if (!validUuid(value.connectionId)
    || typeof value.provider !== 'string'
    || !PROVIDERS.has(value.provider as ProviderId)
    || !validEmail(value.displayEmail)
    || !validDisplayName(value.displayName)
    || typeof value.status !== 'string'
    || !STATUSES.has(value.status)
    || !validScopes(value.grantedScopes)
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)
    || value.updatedAt < value.createdAt) return null
  return immutable(value as unknown as ProviderConnection)
}

export function parseProviderSession(
  value: unknown,
  expectedConnectionId: string,
  now = Date.now(),
): ProviderSession | null {
  if (!validUuid(expectedConnectionId)
    || !validTimestamp(now)
    || !record(value)
    || !exactKeys(value, ['connectionId', 'provider', 'accessToken', 'expiresAt'])) return null
  if (value.connectionId !== expectedConnectionId
    || typeof value.provider !== 'string'
    || !PROVIDERS.has(value.provider as ProviderId)
    || typeof value.accessToken !== 'string'
    || value.accessToken !== value.accessToken.trim()
    || value.accessToken.length < 1
    || value.accessToken.length > 4_096
    || /[\u0000-\u001f\u007f]/u.test(value.accessToken)
    || !validTimestamp(value.expiresAt)
    || value.expiresAt <= now
    || value.expiresAt > now + MAX_SESSION_LIFETIME_MS) return null
  return immutable(value as unknown as ProviderSession)
}

function sortedState(
  accountId: string,
  connections: readonly ProviderConnection[],
): ProviderConnectionsState {
  return immutable({ accountId, connections: [...connections].sort(compareConnections) })
}

export function replaceProviderConnections(
  _current: ProviderConnectionsState | null,
  accountId: string,
  candidates: readonly unknown[],
): ProviderConnectionResult {
  if (!validUuid(accountId)) return { ok: false, code: 'invalid_account' }
  if (!Array.isArray(candidates)) return { ok: false, code: 'invalid_connection' }
  if (candidates.length > MAX_PROVIDER_CONNECTIONS) return { ok: false, code: 'connection_limit' }
  const connections: ProviderConnection[] = []
  const ids = new Set<string>()
  for (const candidate of candidates) {
    const parsed = parseProviderConnection(candidate)
    if (!parsed) return { ok: false, code: 'invalid_connection' }
    if (ids.has(parsed.connectionId)) return { ok: false, code: 'duplicate_connection' }
    ids.add(parsed.connectionId)
    connections.push(parsed)
  }
  return { ok: true, value: sortedState(accountId, connections) }
}

export function reduceProviderConnections(
  current: ProviderConnectionsState,
  action: ProviderConnectionAction,
): ProviderConnectionResult {
  const validated = replaceProviderConnections(null, current.accountId, current.connections)
  if (!validated.ok) return validated
  const connections = [...validated.value.connections]

  if (action.type === 'upsert') {
    const connection = parseProviderConnection(action.connection)
    if (!connection) return { ok: false, code: 'invalid_connection' }
    const index = connections.findIndex((item) => item.connectionId === connection.connectionId)
    if (index < 0) {
      if (connections.length >= MAX_PROVIDER_CONNECTIONS) {
        return { ok: false, code: 'connection_limit' }
      }
      connections.push(connection)
    } else {
      if (connection.updatedAt < connections[index]!.updatedAt) {
        return { ok: false, code: 'stale_connection' }
      }
      connections[index] = connection
    }
  } else if (action.type === 'revoke') {
    if (!validUuid(action.connectionId) || !validTimestamp(action.updatedAt)) {
      return { ok: false, code: 'invalid_connection' }
    }
    const index = connections.findIndex((item) => item.connectionId === action.connectionId)
    if (index < 0) return { ok: false, code: 'connection_not_found' }
    if (action.updatedAt < connections[index]!.updatedAt) {
      return { ok: false, code: 'stale_connection' }
    }
    const revoked = parseProviderConnection({
      ...connections[index],
      status: 'revoked',
      updatedAt: action.updatedAt,
    })
    if (!revoked) return { ok: false, code: 'invalid_connection' }
    connections[index] = revoked
  } else if (action.type === 'remove') {
    if (!validUuid(action.connectionId)) return { ok: false, code: 'invalid_connection' }
    const index = connections.findIndex((item) => item.connectionId === action.connectionId)
    if (index < 0) return { ok: false, code: 'connection_not_found' }
    connections.splice(index, 1)
  }

  return { ok: true, value: sortedState(current.accountId, connections) }
}

export function selectUsableProviderConnections(
  state: ProviderConnectionsState,
  provider: ProviderId,
): readonly ProviderConnection[] {
  return immutable(state.connections.filter((connection) => (
    connection.provider === provider && connection.status === 'active'
  )))
}
