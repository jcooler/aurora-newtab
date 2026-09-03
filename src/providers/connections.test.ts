import { describe, expect, it } from 'vitest'
import {
  GOOGLE_CALENDAR_SCOPES,
  MAX_PROVIDER_CONNECTIONS_PER_PROVIDER,
  MAX_PROVIDER_CONNECTIONS_TOTAL,
  MICROSOFT_CALENDAR_SCOPES,
  parseProviderConnection,
  parseProviderSession,
  reduceProviderConnections,
  replaceProviderConnections,
  selectUsableProviderConnections,
} from './connections'
import type { ProviderConnection, ProviderConnectionsState } from './types'

const accountId = '42000000-0000-4000-8000-000000000001'
const otherAccountId = '42000000-0000-4000-8000-000000000002'
const now = Date.UTC(2026, 8, 3, 16, 0, 0)

function connection(
  index: number,
  overrides: Partial<ProviderConnection> = {},
): ProviderConnection {
  return {
    connectionId: `52000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    provider: 'google_calendar',
    accountKind: null,
    displayEmail: `person-${index}@example.com`,
    displayName: `Person ${index}`,
    status: 'active',
    grantedScopes: GOOGLE_CALENDAR_SCOPES,
    createdAt: now - 10_000 + index,
    updatedAt: now - 1_000 + index,
    ...overrides,
  }
}

function microsoftConnection(
  index: number,
  overrides: Partial<ProviderConnection> = {},
): ProviderConnection {
  return connection(index, {
    provider: 'microsoft_calendar',
    accountKind: index % 2 === 0 ? 'work_or_school' : 'personal',
    displayEmail: `microsoft-${index}@example.com`,
    displayName: `Microsoft ${index}`,
    grantedScopes: MICROSOFT_CALENDAR_SCOPES,
    ...overrides,
  })
}

function state(items: readonly ProviderConnection[] = []): ProviderConnectionsState {
  const result = replaceProviderConnections(null, accountId, items)
  if (!result.ok) throw new Error(result.code)
  return result.value
}

describe('provider connection parsing', () => {
  it('accepts only the closed public Google Calendar shape and freezes its result', () => {
    const parsed = parseProviderConnection(connection(1))

    expect(parsed).toEqual(connection(1))
    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      'accountKind', 'connectionId', 'createdAt', 'displayEmail', 'displayName', 'grantedScopes',
      'provider', 'status', 'updatedAt',
    ])
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed?.grantedScopes)).toBe(true)
  })

  it.each(['personal', 'work_or_school'] as const)(
    'accepts the exact Microsoft Calendar scope set and %s account kind',
    (accountKind) => {
      expect(parseProviderConnection(microsoftConnection(2, { accountKind }))).toEqual(
        microsoftConnection(2, { accountKind }),
      )
    },
  )

  it.each([
    ['malformed UUID', { ...connection(1), connectionId: 'connection-1' }],
    ['unknown provider', { ...connection(1), provider: 'gmail' }],
    ['unknown status', { ...connection(1), status: 'paused' }],
    ['non-null Google account kind', { ...connection(1), accountKind: 'personal' }],
    ['missing Microsoft account kind', { ...microsoftConnection(1), accountKind: null }],
    ['unknown Microsoft account kind', { ...microsoftConnection(1), accountKind: 'consumer' }],
    ['unknown scope', { ...connection(1), grantedScopes: [...GOOGLE_CALENDAR_SCOPES, 'drive.readonly'] }],
    ['missing scope', { ...connection(1), grantedScopes: GOOGLE_CALENDAR_SCOPES.slice(0, -1) }],
    ['wrong Microsoft scope order', {
      ...microsoftConnection(1),
      grantedScopes: [MICROSOFT_CALENDAR_SCOPES[1], MICROSOFT_CALENDAR_SCOPES[0], ...MICROSOFT_CALENDAR_SCOPES.slice(2)],
    }],
    ['missing Microsoft scope', {
      ...microsoftConnection(1), grantedScopes: MICROSOFT_CALENDAR_SCOPES.slice(0, -1),
    }],
    ['broader Microsoft scope', {
      ...microsoftConnection(1),
      grantedScopes: [...MICROSOFT_CALENDAR_SCOPES, 'https://graph.microsoft.com/Calendars.Read'],
    }],
    ['Google scopes on Microsoft', { ...microsoftConnection(1), grantedScopes: GOOGLE_CALENDAR_SCOPES }],
    ['Microsoft scopes on Google', { ...connection(1), grantedScopes: MICROSOFT_CALENDAR_SCOPES }],
    ['provider subject', { ...connection(1), providerSubject: 'google-subject' }],
    ['refresh token', { ...connection(1), refreshToken: 'secret' }],
    ['access token', { ...connection(1), accessToken: 'secret' }],
    ['token fingerprint', { ...connection(1), tokenFingerprint: 'secret' }],
    ['PKCE verifier', { ...connection(1), pkceVerifier: 'secret' }],
    ['hosted encryption metadata', { ...connection(1), encryptedToken: 'ciphertext' }],
  ])('rejects %s', (_name, candidate) => {
    expect(parseProviderConnection(candidate)).toBeNull()
  })

  it('rejects accessors rather than invoking an untrusted field', () => {
    let reads = 0
    const candidate = { ...connection(1) }
    Object.defineProperty(candidate, 'displayEmail', {
      enumerable: true,
      get() {
        reads += 1
        return 'person-1@example.com'
      },
    })

    expect(parseProviderConnection(candidate)).toBeNull()
    expect(reads).toBe(0)
  })

  it('admits only a current, exact-key, short-lived in-memory session', () => {
    const session = {
      connectionId: connection(1).connectionId,
      provider: 'google_calendar' as const,
      accessToken: 'short-lived-provider-token',
      expiresAt: now + 60_000,
    }

    expect(parseProviderSession(session, connection(1).connectionId, now)).toEqual(session)
    expect(parseProviderSession({ ...session, expiresAt: now }, connection(1).connectionId, now)).toBeNull()
    expect(parseProviderSession({ ...session, refreshToken: 'never' }, connection(1).connectionId, now)).toBeNull()
    expect(parseProviderSession(session, connection(2).connectionId, now)).toBeNull()
    expect(parseProviderSession(session, connection(1).connectionId, now, 'microsoft_calendar')).toBeNull()
  })
})

describe('account-scoped provider connection state', () => {
  it('replaces all prior connections when the signed-in Tab Two account changes', () => {
    const current = state([connection(1)])
    const result = replaceProviderConnections(current, otherAccountId, [connection(2)])

    expect(result).toEqual({
      ok: true,
      value: { accountId: otherAccountId, connections: [connection(2)] },
    })
  })

  it('rejects duplicate connection identities even when the duplicate crosses providers', () => {
    expect(replaceProviderConnections(null, accountId, [
      connection(1),
      microsoftConnection(1),
    ])).toEqual({
      ok: false,
      code: 'duplicate_connection',
    })
  })

  it('enforces five connections per provider and ten connections overall', () => {
    expect(replaceProviderConnections(
      null,
      accountId,
      Array.from({ length: MAX_PROVIDER_CONNECTIONS_PER_PROVIDER + 1 }, (_, index) => connection(index + 1)),
    )).toEqual({ ok: false, code: 'connection_limit' })

    const ten = [
      ...Array.from({ length: MAX_PROVIDER_CONNECTIONS_PER_PROVIDER }, (_, index) => connection(index + 1)),
      ...Array.from(
        { length: MAX_PROVIDER_CONNECTIONS_PER_PROVIDER },
        (_, index) => microsoftConnection(index + 6),
      ),
    ]
    expect(ten).toHaveLength(MAX_PROVIDER_CONNECTIONS_TOTAL)
    expect(replaceProviderConnections(null, accountId, ten).ok).toBe(true)
    expect(replaceProviderConnections(null, accountId, [...ten, microsoftConnection(11)])).toEqual({
      ok: false,
      code: 'connection_limit',
    })
  })

  it('adds, updates, revokes, and removes one connection without disabling another', () => {
    const initial = state([connection(2), connection(1)])
    const added = reduceProviderConnections(initial, { type: 'upsert', connection: connection(3) })
    expect(added.ok && added.value.connections.map((item) => item.connectionId)).toEqual([
      connection(1).connectionId,
      connection(2).connectionId,
      connection(3).connectionId,
    ])

    if (!added.ok) throw new Error(added.code)
    const updatedConnection = connection(2, {
      displayName: 'Renamed person',
      status: 'reconnect_required',
      updatedAt: now + 1,
    })
    const updated = reduceProviderConnections(added.value, {
      type: 'upsert', connection: updatedConnection,
    })
    if (!updated.ok) throw new Error(updated.code)
    expect(updated.value.connections.at(-1)).toEqual(updatedConnection)
    expect(selectUsableProviderConnections(updated.value, 'google_calendar').map((item) => item.connectionId)).toEqual([
      connection(1).connectionId,
      connection(3).connectionId,
    ])

    const revoked = reduceProviderConnections(updated.value, {
      type: 'revoke', connectionId: connection(3).connectionId, updatedAt: now + 2,
    })
    if (!revoked.ok) throw new Error(revoked.code)
    expect(selectUsableProviderConnections(revoked.value, 'google_calendar').map((item) => item.connectionId)).toEqual([
      connection(1).connectionId,
    ])

    const removed = reduceProviderConnections(revoked.value, {
      type: 'remove', connectionId: connection(2).connectionId,
    })
    expect(removed.ok && removed.value.connections.some((item) => item.connectionId === connection(2).connectionId)).toBe(false)
  })

  it('uses status, normalized email, creation time, and UUID as deterministic display tiebreakers', () => {
    const items = [
      connection(4, { displayEmail: 'z@example.com', status: 'reconnect_required' }),
      connection(3, { displayEmail: 'A@example.com' }),
      connection(2, { displayEmail: 'a@example.com' }),
      connection(1, { displayEmail: 'z@example.com', status: 'revoked' }),
    ]
    const result = replaceProviderConnections(null, accountId, items)

    expect(result.ok && result.value.connections.map((item) => item.connectionId)).toEqual([
      connection(2).connectionId,
      connection(3).connectionId,
      connection(4).connectionId,
      connection(1).connectionId,
    ])
  })

  it('orders providers before the existing display tiebreakers', () => {
    const result = replaceProviderConnections(null, accountId, [
      microsoftConnection(4, { status: 'active', displayEmail: 'a@example.com' }),
      connection(3, { status: 'revoked', displayEmail: 'z@example.com' }),
      microsoftConnection(2, { status: 'reconnect_required', displayEmail: 'z@example.com' }),
      connection(1, { status: 'active', displayEmail: 'a@example.com' }),
    ])

    expect(result.ok && result.value.connections.map((item) => item.provider)).toEqual([
      'google_calendar',
      'google_calendar',
      'microsoft_calendar',
      'microsoft_calendar',
    ])
  })

  it('allows a sixth overall connection when it is the first connection for another provider', () => {
    const googleConnections = Array.from(
      { length: MAX_PROVIDER_CONNECTIONS_PER_PROVIDER },
      (_, index) => connection(index + 1),
    )
    const result = reduceProviderConnections(state(googleConnections), {
      type: 'upsert',
      connection: microsoftConnection(6),
    })

    expect(result.ok && result.value.connections).toHaveLength(6)
  })
})
