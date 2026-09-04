import type {
  AccountExportRecord,
  AccountExportRepository,
  AccountExportServiceSnapshot,
} from './accountExportTypes.ts'

export interface AccountExportRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u
const BASE64URL = /^[A-Za-z0-9_-]+$/u
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/u
const EMAIL = /^[^\s@]+@[^\s@]+$/u
const MAX_VAULT_BYTES = 2_097_152
const MAX_CONNECTIONS = 20
const MAX_DEVICES = 1_000
const MAX_RECORDS = 20_000
const ENTITY_TYPES = new Set([
  'settings', 'focus', 'todo_list', 'quick_link', 'timer_config', 'location',
  'notes', 'world_clock', 'countdown', 'legacy_layout', 'layout_manifest',
  'named_layout', 'calendar_preference', 'calendar_week_start',
  'connector_preference', 'habit', 'habit_completion', 'progress_goal',
  'metric_bucket',
])
const CAPABILITIES = new Set([
  'encrypted_sync', 'multi_account', 'metrics_history', 'google_calendar',
  'microsoft_calendar', 'strava',
])
const GRANT_SOURCES = new Set(['stripe', 'complimentary_owner'])

function fail(): never {
  throw new Error('account_export_repository_unavailable')
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const record = value as Record<string, unknown>
  const actual = Object.keys(record).sort()
  if (actual.join(',') !== [...keys].sort().join(',')) fail()
  return record
}

function string(value: unknown, maximum: number, minimum = 1): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) fail()
  return value
}

function nullableString(value: unknown, maximum: number): string | null {
  return value === null ? null : string(value, maximum)
}

function uuid(value: unknown): string {
  const parsed = string(value, 36, 36)
  if (!UUID.test(parsed)) fail()
  return parsed
}

function timestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value !== 'string') fail()
  const parsed = Date.parse(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail()
  return parsed
}

function nullableTimestamp(value: unknown): number | null {
  return value === null ? null : timestamp(value)
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || (parsed as number) < minimum || (parsed as number) > maximum) fail()
  return parsed as number
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail()
  return value
}

function email(value: unknown): string {
  const parsed = string(value, 320, 3)
  if (!EMAIL.test(parsed) || /[\u0000-\u001f\u007f]/u.test(parsed)) fail()
  return parsed
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail()
  return value as T
}

function boundedStrings(value: unknown, allowed?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value) || value.length > 32) fail()
  const parsed = value.map((entry) => string(entry, 200))
  if (new Set(parsed).size !== parsed.length || (allowed && parsed.some((entry) => !allowed.has(entry)))) fail()
  return parsed
}

function sortedUnique(value: string[]): string[] {
  if (value.some((entry, index) => index > 0 && entry <= value[index - 1]!)) fail()
  return value
}

function account(value: unknown): AccountExportServiceSnapshot['account'] {
  const row = object(value, [
    'accountId', 'email', 'displayName', 'accountCreatedAt',
    'identityCreatedAt', 'identityUpdatedAt',
  ])
  const createdAt = timestamp(row.accountCreatedAt)
  const identityCreatedAt = timestamp(row.identityCreatedAt)
  const identityUpdatedAt = timestamp(row.identityUpdatedAt)
  if (identityUpdatedAt < identityCreatedAt) fail()
  return {
    accountId: uuid(row.accountId),
    email: email(row.email),
    displayName: nullableString(row.displayName, 200),
    createdAt,
    identityCreatedAt,
    identityUpdatedAt,
  }
}

function alreadyNormalizedAccount(value: unknown): AccountExportServiceSnapshot['account'] {
  const row = object(value, [
    'accountId', 'email', 'displayName', 'createdAt', 'identityCreatedAt', 'identityUpdatedAt',
  ])
  const identityCreatedAt = timestamp(row.identityCreatedAt)
  const identityUpdatedAt = timestamp(row.identityUpdatedAt)
  if (identityUpdatedAt < identityCreatedAt) fail()
  return {
    accountId: uuid(row.accountId), email: email(row.email),
    displayName: nullableString(row.displayName, 200), createdAt: timestamp(row.createdAt),
    identityCreatedAt, identityUpdatedAt,
  }
}

function connectedAccounts(value: unknown): AccountExportServiceSnapshot['connectedAccounts'] {
  if (!Array.isArray(value) || value.length > MAX_CONNECTIONS) fail()
  const result = value.map((entry) => {
    const row = object(entry, [
      'connectionId', 'provider', 'accountKind', 'email', 'displayName', 'status',
      'grantedScopes', 'createdAt', 'updatedAt',
    ])
    const provider = enumValue(row.provider, ['google_calendar', 'microsoft_calendar'] as const)
    const accountKind = row.accountKind === null
      ? null
      : enumValue(row.accountKind, ['personal', 'work_or_school'] as const)
    if ((provider === 'google_calendar' && accountKind !== null)
      || (provider === 'microsoft_calendar' && accountKind === null)) fail()
    const createdAt = timestamp(row.createdAt)
    const updatedAt = timestamp(row.updatedAt)
    if (updatedAt < createdAt) fail()
    return {
      connectionId: uuid(row.connectionId), provider, accountKind,
      email: email(row.email), displayName: nullableString(row.displayName, 200),
      status: enumValue(row.status, ['active', 'reconnect_required'] as const),
      grantedScopes: boundedStrings(row.grantedScopes), createdAt, updatedAt,
    }
  })
  if (new Set(result.map((entry) => entry.connectionId)).size !== result.length) fail()
  return result
}

function subscription(value: unknown): AccountExportServiceSnapshot['subscription'] {
  const row = object(value, [
    'state', 'plan', 'currentPeriodStart', 'currentPeriodEnd', 'courtesyEnd',
    'cancelAtPeriodEnd', 'createdAt', 'updatedAt',
  ])
  const plan = row.plan === null ? null : enumValue(row.plan, ['monthly', 'annual', 'intro_annual'] as const)
  const state = enumValue(row.state, [
    'none', 'active', 'past_due', 'canceling', 'expired', 'complimentary',
  ] as const)
  if ((state === 'complimentary' || state === 'none') && plan !== null) fail()
  return {
    state, plan,
    currentPeriodStart: nullableTimestamp(row.currentPeriodStart),
    currentPeriodEnd: nullableTimestamp(row.currentPeriodEnd),
    courtesyEnd: nullableTimestamp(row.courtesyEnd),
    cancelAtPeriodEnd: boolean(row.cancelAtPeriodEnd),
    createdAt: nullableTimestamp(row.createdAt),
    updatedAt: nullableTimestamp(row.updatedAt),
  }
}

function entitlement(value: unknown): AccountExportServiceSnapshot['entitlement'] {
  const row = object(value, ['capabilities', 'grantSources', 'expiresAt'])
  return {
    capabilities: sortedUnique(boundedStrings(row.capabilities, CAPABILITIES)),
    grantSources: sortedUnique(boundedStrings(row.grantSources, GRANT_SOURCES)),
    expiresAt: nullableTimestamp(row.expiresAt),
  }
}

function devices(value: unknown): AccountExportServiceSnapshot['devices'] {
  if (!Array.isArray(value) || value.length > MAX_DEVICES) fail()
  const result = value.map((entry) => {
    const row = object(entry, [
      'deviceId', 'friendlyName', 'state', 'lastSeenAt', 'createdAt', 'updatedAt', 'revokedAt',
    ])
    const deviceId = string(row.deviceId, 22, 22)
    if (!DEVICE_ID.test(deviceId)) fail()
    const friendlyName = string(row.friendlyName, 48)
    if (friendlyName !== friendlyName.trim() || /[\u0000-\u001f\u007f]/u.test(friendlyName)) fail()
    const createdAt = timestamp(row.createdAt)
    const lastSeenAt = timestamp(row.lastSeenAt)
    const updatedAt = timestamp(row.updatedAt)
    const revokedAt = nullableTimestamp(row.revokedAt)
    if (lastSeenAt < createdAt || updatedAt < createdAt || (revokedAt !== null && revokedAt < createdAt)) fail()
    return {
      deviceId, friendlyName,
      state: enumValue(row.state, ['active', 'inactive', 'revoked'] as const),
      lastSeenAt, createdAt, updatedAt, revokedAt,
    }
  })
  if (new Set(result.map((entry) => entry.deviceId)).size !== result.length) fail()
  return result
}

function record(value: unknown): AccountExportRecord {
  const row = object(value, [
    'envelopeVersion', 'accountId', 'entityType', 'entityId', 'revision',
    'vaultVersion', 'tombstone', 'nonce', 'ciphertext',
  ])
  const entityType = string(row.entityType, 64)
  const entityId = string(row.entityId, 256)
  const nonce = string(row.nonce, 16, 16)
  const ciphertext = string(row.ciphertext, 262_144, 22)
  if (row.envelopeVersion !== 1 || !ENTITY_TYPES.has(entityType) || !ENTITY_ID.test(entityId)
    || !BASE64URL.test(nonce) || !BASE64URL.test(ciphertext)) fail()
  return {
    envelopeVersion: 1,
    accountId: uuid(row.accountId),
    entityType,
    entityId,
    revision: integer(row.revision, 1),
    vaultVersion: integer(row.vaultVersion, 1),
    tombstone: boolean(row.tombstone),
    nonce,
    ciphertext,
  }
}

function vault(value: unknown, accountId: string): AccountExportServiceSnapshot['vault'] {
  const row = object(value, ['status', 'vaultVersion', 'storedBytes', 'wrappedDataKey', 'records'])
  const status = enumValue(row.status, ['not_created', 'empty', 'available'] as const)
  const vaultVersion = integer(row.vaultVersion)
  const storedBytes = integer(row.storedBytes, 0, MAX_VAULT_BYTES)
  if (!Array.isArray(row.records) || row.records.length > MAX_RECORDS) fail()
  const records = row.records.map(record)
  const wrappedDataKey = row.wrappedDataKey === null
    ? null
    : string(row.wrappedDataKey, 54, 54)
  if (wrappedDataKey !== null && !BASE64URL.test(wrappedDataKey)) fail()
  if (records.some((entry) => entry.accountId !== accountId || entry.vaultVersion > vaultVersion)) fail()
  if (records.some((entry, index) => index > 0
    && `${entry.entityType}\u0000${entry.entityId}` <= `${records[index - 1]!.entityType}\u0000${records[index - 1]!.entityId}`)) fail()
  if (status === 'not_created'
    && (vaultVersion !== 0 || storedBytes !== 0 || wrappedDataKey !== null || records.length !== 0)) fail()
  if (status === 'empty'
    && (records.length !== 0 || wrappedDataKey !== null)) fail()
  if (status === 'available'
    && (records.length === 0 || wrappedDataKey === null || storedBytes === 0)) fail()
  return { status, vaultVersion, storedBytes, wrappedDataKey, records }
}

export function normalizeAccountExportServiceSnapshot(
  value: unknown,
  shape: 'database' | 'normalized' = 'normalized',
): AccountExportServiceSnapshot {
  const row = object(value, [
    'account', 'connectedAccounts', 'subscription', 'entitlement', 'devices', 'vault',
  ])
  const normalizedAccount = shape === 'database' ? account(row.account) : alreadyNormalizedAccount(row.account)
  return {
    account: normalizedAccount,
    connectedAccounts: connectedAccounts(row.connectedAccounts),
    subscription: subscription(row.subscription),
    entitlement: entitlement(row.entitlement),
    devices: devices(row.devices),
    vault: vault(row.vault, normalizedAccount.accountId),
  }
}

function effectiveAt(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) fail()
  return new Date(value).toISOString()
}

async function call(
  client: AccountExportRpcClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters)
  if (error) fail()
  return Array.isArray(data) ? data[0] ?? null : data
}

export function createAccountExportRepository(client: AccountExportRpcClient): AccountExportRepository {
  return {
    async findAccountForAuthUser(authUserId) {
      const value = await call(client, 'tab_two_account_snapshot_for_auth', {
        target_auth_user_id: authUserId,
      })
      if (value === null) return null
      const row = object(value, ['account_id', 'display_name', 'email'])
      return { accountId: uuid(row.account_id) }
    },
    async consumeRateLimit(input) {
      return await call(client, 'tab_two_consume_sync_rate_limit', {
        target_account_id: input.accountId,
        target_action: input.action,
        target_ip_fingerprint: input.ipFingerprint,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async getSnapshot(accountId, at) {
      const value = await call(client, 'tab_two_account_data_export', {
        target_account_id: accountId,
        effective_at: effectiveAt(at),
      })
      return value === null ? null : normalizeAccountExportServiceSnapshot(value, 'database')
    },
    async recordAudit(input) {
      await call(client, 'tab_two_record_account_export_event', {
        target_account_id: input.accountId,
        outcome_code: input.outcome,
        record_count: integer(input.recordCount),
        byte_count: integer(input.byteCount),
        occurred_at: effectiveAt(input.occurredAt),
      })
    },
  }
}
