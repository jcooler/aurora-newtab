import type { AccountDataExportSourceV1, AccountDataExportRecordSourceV1 } from './dataExport'
import type { PremiumCapability, SignedGrantSource } from './types'
import { decryptSyncRecord, importDataKey, type EncryptedSyncRecordV1 } from '../sync/crypto'
import { isValidSyncEntity, isValidSyncEntityIdentity } from '../sync/entityPolicy'
import { SYNC_ENTITY_TYPES, type SyncEntityType } from '../sync/types'
import type {
  ProviderAccountKind,
  ProviderConnectionStatus,
  ProviderId,
} from '../providers/types'
import type { BillingPlan, BillingState } from './billing'

const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024
const MAX_CONNECTIONS = 20
const MAX_DEVICES = 1_000
const MAX_RECORDS = 20_000
const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u
const ENTITY_TYPES: ReadonlySet<string> = new Set(SYNC_ENTITY_TYPES)
const CAPABILITIES: ReadonlySet<string> = new Set([
  'encrypted_sync', 'multi_account', 'metrics_history', 'google_calendar',
  'microsoft_calendar', 'strava',
])
const GRANT_SOURCES: ReadonlySet<string> = new Set(['stripe', 'complimentary_owner'])

export type AccountDataExportFailure =
  | 'authentication_required'
  | 'verification_required'
  | 'offline'
  | 'rate_limited'
  | 'data_unavailable'

export type AccountDataExportGatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: AccountDataExportFailure }

export interface AccountDataExportGateway {
  prepare(
    input: { accountId: string },
    signal?: AbortSignal,
  ): Promise<AccountDataExportGatewayResult<AccountDataExportSourceV1>>
}

export interface AccountDataExportGatewayDependencies {
  origin: string
  allowedOrigins: readonly [string]
  enabled: boolean
  getAccessToken(accountId: string, signal?: AbortSignal): Promise<string | null>
  invalidateAuthentication(): Promise<void>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
  crypto?: Crypto
}

interface ServiceRecord extends EncryptedSyncRecordV1 {
  vaultVersion: number
}

interface ServiceSnapshot {
  account: AccountDataExportSourceV1['account']
  connectedAccounts: AccountDataExportSourceV1['connectedAccounts']
  subscription: AccountDataExportSourceV1['subscription']
  entitlement: AccountDataExportSourceV1['entitlement']
  devices: AccountDataExportSourceV1['devices']
  vault: {
    status: AccountDataExportSourceV1['syncedData']['status']
    vaultVersion: number
    storedBytes: number
    records: ServiceRecord[]
  }
  dataKey: string | null
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

function boundedText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) return null
  try {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
    const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return encodeBase64Url(decoded) === value ? decoded : null
  } catch {
    return null
  }
}

function timestamp(value: unknown): value is number {
  return integer(value) && value <= 8_640_000_000_000_000
}

function nullableTimestamp(value: unknown): value is number | null {
  return value === null || timestamp(value)
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]!)
}

function stringList(value: unknown, allowed?: ReadonlySet<string>): value is string[] {
  return Array.isArray(value)
    && value.length <= 32
    && value.every((entry) => boundedText(entry, 1, 200) && (!allowed || allowed.has(entry)))
    && new Set(value).size === value.length
}

function account(value: unknown, expectedAccountId: string): value is ServiceSnapshot['account'] {
  return record(value)
    && exactKeys(value, [
      'accountId', 'email', 'displayName', 'createdAt', 'identityCreatedAt', 'identityUpdatedAt',
    ])
    && value.accountId === expectedAccountId
    && ACCOUNT_UUID.test(expectedAccountId)
    && boundedText(value.email, 3, 320)
    && (value.displayName === null || boundedText(value.displayName, 1, 200))
    && timestamp(value.createdAt)
    && timestamp(value.identityCreatedAt)
    && timestamp(value.identityUpdatedAt)
    && value.identityUpdatedAt >= value.identityCreatedAt
}

function connectedAccount(value: unknown): value is AccountDataExportSourceV1['connectedAccounts'][number] {
  if (!record(value)
    || !exactKeys(value, [
      'connectionId', 'provider', 'accountKind', 'email', 'displayName', 'status',
      'grantedScopes', 'createdAt', 'updatedAt',
    ])
    || typeof value.connectionId !== 'string'
    || !ACCOUNT_UUID.test(value.connectionId)
    || !['google_calendar', 'microsoft_calendar'].includes(value.provider as string)
    || !(value.accountKind === null || ['personal', 'work_or_school'].includes(value.accountKind as string))
    || !boundedText(value.email, 3, 320)
    || !(value.displayName === null || boundedText(value.displayName, 1, 200))
    || !['active', 'reconnect_required'].includes(value.status as string)
    || !stringList(value.grantedScopes)
    || !timestamp(value.createdAt)
    || !timestamp(value.updatedAt)
    || value.updatedAt < value.createdAt) return false
  return (value.provider === 'google_calendar' && value.accountKind === null)
    || (value.provider === 'microsoft_calendar' && value.accountKind !== null)
}

function connectedAccounts(value: unknown): value is ServiceSnapshot['connectedAccounts'] {
  return Array.isArray(value)
    && value.length <= MAX_CONNECTIONS
    && value.every(connectedAccount)
    && new Set(value.map((entry) => entry.connectionId)).size === value.length
    && value.every((entry, index) => index === 0
      || `${entry.provider}\u0000${entry.createdAt.toString().padStart(16, '0')}\u0000${entry.connectionId}`
        > `${value[index - 1]!.provider}\u0000${value[index - 1]!.createdAt.toString().padStart(16, '0')}\u0000${value[index - 1]!.connectionId}`)
}

function subscription(value: unknown): value is ServiceSnapshot['subscription'] {
  if (!record(value)
    || !exactKeys(value, [
      'state', 'plan', 'currentPeriodStart', 'currentPeriodEnd', 'courtesyEnd',
      'cancelAtPeriodEnd', 'createdAt', 'updatedAt',
    ])
    || !['none', 'active', 'past_due', 'canceling', 'expired', 'complimentary'].includes(value.state as string)
    || !(value.plan === null || ['monthly', 'annual', 'intro_annual'].includes(value.plan as string))
    || !nullableTimestamp(value.currentPeriodStart)
    || !nullableTimestamp(value.currentPeriodEnd)
    || !nullableTimestamp(value.courtesyEnd)
    || typeof value.cancelAtPeriodEnd !== 'boolean'
    || !nullableTimestamp(value.createdAt)
    || !nullableTimestamp(value.updatedAt)) return false
  return !((value.state === 'none' || value.state === 'complimentary') && value.plan !== null)
}

function entitlement(value: unknown): value is ServiceSnapshot['entitlement'] {
  return record(value)
    && exactKeys(value, ['capabilities', 'grantSources', 'expiresAt'])
    && stringList(value.capabilities, CAPABILITIES)
    && sortedUnique(value.capabilities)
    && stringList(value.grantSources, GRANT_SOURCES)
    && sortedUnique(value.grantSources)
    && nullableTimestamp(value.expiresAt)
}

function device(value: unknown): value is ServiceSnapshot['devices'][number] {
  return record(value)
    && exactKeys(value, [
      'deviceId', 'friendlyName', 'state', 'lastSeenAt', 'createdAt', 'updatedAt', 'revokedAt',
    ])
    && typeof value.deviceId === 'string'
    && DEVICE_ID.test(value.deviceId)
    && decodeBase64Url(value.deviceId)?.byteLength === 16
    && boundedText(value.friendlyName, 1, 48)
    && value.friendlyName === value.friendlyName.trim()
    && ['active', 'inactive', 'revoked'].includes(value.state as string)
    && timestamp(value.lastSeenAt)
    && timestamp(value.createdAt)
    && timestamp(value.updatedAt)
    && nullableTimestamp(value.revokedAt)
    && value.lastSeenAt >= value.createdAt
    && value.updatedAt >= value.createdAt
    && (value.revokedAt === null || value.revokedAt >= value.createdAt)
}

function devices(value: unknown): value is ServiceSnapshot['devices'] {
  return Array.isArray(value)
    && value.length <= MAX_DEVICES
    && value.every(device)
    && new Set(value.map((entry) => entry.deviceId)).size === value.length
    && value.every((entry, index) => index === 0
      || `${entry.createdAt.toString().padStart(16, '0')}\u0000${entry.deviceId}`
        > `${value[index - 1]!.createdAt.toString().padStart(16, '0')}\u0000${value[index - 1]!.deviceId}`)
}

function encryptedRecord(value: unknown, expectedAccountId: string): value is ServiceRecord {
  if (!record(value)
    || !exactKeys(value, [
      'envelopeVersion', 'accountId', 'entityType', 'entityId', 'revision',
      'vaultVersion', 'tombstone', 'nonce', 'ciphertext',
    ])
    || value.envelopeVersion !== 1
    || value.accountId !== expectedAccountId
    || typeof value.entityType !== 'string'
    || !ENTITY_TYPES.has(value.entityType)
    || typeof value.entityId !== 'string'
    || !ENTITY_ID.test(value.entityId)
    || !isValidSyncEntityIdentity(value.entityType as SyncEntityType, value.entityId)
    || !integer(value.revision, 1)
    || !integer(value.vaultVersion, 1)
    || typeof value.tombstone !== 'boolean') return false
  return decodeBase64Url(value.nonce)?.byteLength === 12
    && (decodeBase64Url(value.ciphertext)?.byteLength ?? 0) >= 16
}

function serviceSnapshot(value: unknown, expectedAccountId: string): ServiceSnapshot | null {
  if (!record(value)
    || !exactKeys(value, [
      'version', 'account', 'connectedAccounts', 'subscription', 'entitlement',
      'devices', 'vault', 'dataKey',
    ])
    || value.version !== 1
    || !account(value.account, expectedAccountId)
    || !connectedAccounts(value.connectedAccounts)
    || !subscription(value.subscription)
    || !entitlement(value.entitlement)
    || !devices(value.devices)
    || !record(value.vault)) return null
  const vault = value.vault
  if (!exactKeys(vault, ['status', 'vaultVersion', 'storedBytes', 'records'])
    || !['not_created', 'empty', 'available'].includes(vault.status as string)
    || !integer(vault.vaultVersion)
    || !integer(vault.storedBytes, 0, 2_097_152)
    || !Array.isArray(vault.records)
    || vault.records.length > MAX_RECORDS
    || !vault.records.every((entry) => encryptedRecord(entry, expectedAccountId))) return null
  const vaultVersion = vault.vaultVersion
  const storedBytes = vault.storedBytes
  const records = vault.records as ServiceRecord[]
  if (records.some((entry) => entry.vaultVersion > vaultVersion)
    || records.some((entry, index) => index > 0
      && `${entry.entityType}\u0000${entry.entityId}`
        <= `${records[index - 1]!.entityType}\u0000${records[index - 1]!.entityId}`)) return null

  const status = vault.status
  if (status === 'not_created'
    && (vaultVersion !== 0 || storedBytes !== 0 || records.length !== 0)) return null
  if (status === 'empty' && records.length !== 0) return null
  if (status === 'available' && (records.length === 0 || storedBytes === 0)) return null
  const keyBytes = value.dataKey === null ? null : decodeBase64Url(value.dataKey)
  if ((records.length === 0 && value.dataKey !== null)
    || (records.length > 0 && keyBytes?.byteLength !== 32)) return null

  return {
    account: value.account,
    connectedAccounts: value.connectedAccounts,
    subscription: value.subscription,
    entitlement: value.entitlement,
    devices: value.devices,
    vault: {
      status: status as ServiceSnapshot['vault']['status'],
      vaultVersion,
      storedBytes,
      records,
    },
    dataKey: value.dataKey as string | null,
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

async function safeInvalidate(dependencies: AccountDataExportGatewayDependencies): Promise<void> {
  try {
    await dependencies.invalidateAuthentication()
  } catch {
    // The server authentication result remains authoritative if local cleanup fails.
  }
}

function failure(status: number, value: unknown): AccountDataExportFailure {
  const error = record(value) && exactKeys(value, ['error']) && typeof value.error === 'string'
    ? value.error
    : ''
  if (status === 401 && error === 'fresh_authentication_required') return 'verification_required'
  if (status === 401 || (status === 403 && error === 'account_not_found')) {
    return 'authentication_required'
  }
  if (status === 429 && error === 'rate_limited') return 'rate_limited'
  return 'data_unavailable'
}

export function createAccountDataExportGateway(
  dependencies: AccountDataExportGatewayDependencies,
): AccountDataExportGateway {
  let parsedOrigin: URL | null = null
  try {
    parsedOrigin = new URL(dependencies.origin)
  } catch {
    // Rejected by the complete configuration guard below.
  }
  const timeoutMs = dependencies.timeoutMs ?? 15_000
  if (!parsedOrigin
    || parsedOrigin.origin !== dependencies.origin
    || dependencies.allowedOrigins.length !== 1
    || dependencies.allowedOrigins[0] !== dependencies.origin
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1
    || timeoutMs > 30_000) {
    throw new Error('account_export_gateway_config_invalid')
  }

  const gateway: AccountDataExportGateway = {
    async prepare(
      input: { accountId: string },
      signal?: AbortSignal,
    ): Promise<AccountDataExportGatewayResult<AccountDataExportSourceV1>> {
      if (!dependencies.enabled) return { ok: false, kind: 'data_unavailable' }
      if (!input || !ACCOUNT_UUID.test(input.accountId)) return { ok: false, kind: 'data_unavailable' }
      if (signal?.aborted) return { ok: false, kind: 'offline' }

      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timeout = globalThis.setTimeout(abort, timeoutMs)
      try {
        const token = await dependencies.getAccessToken(input.accountId, controller.signal)
        if (!token || controller.signal.aborted) {
          return { ok: false, kind: token ? 'offline' : 'authentication_required' }
        }
        const response = await dependencies.fetch(
          `${dependencies.origin}/functions/v1/account-export`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ accountId: input.accountId }),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          },
        )
        const declaredLength = response.headers.get('content-length')
        if (declaredLength !== null
          && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
          return { ok: false, kind: 'data_unavailable' }
        }
        if (!/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get('cache-control') ?? '')
          || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')) {
          return { ok: false, kind: 'data_unavailable' }
        }
        const text = await response.text()
        if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
          return { ok: false, kind: 'data_unavailable' }
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          return { ok: false, kind: 'data_unavailable' }
        }
        if (!response.ok) {
          const kind = failure(response.status, parsed)
          if (kind === 'authentication_required') await safeInvalidate(dependencies)
          return { ok: false, kind }
        }
        const snapshot = serviceSnapshot(parsed, input.accountId)
        if (!snapshot) return { ok: false, kind: 'data_unavailable' }

        let key: CryptoKey | null = null
        if (snapshot.dataKey !== null) {
          const rawKey = decodeBase64Url(snapshot.dataKey)
          if (rawKey?.byteLength !== 32) return { ok: false, kind: 'data_unavailable' }
          try {
            key = await importDataKey(rawKey, dependencies.crypto)
          } finally {
            rawKey.fill(0)
          }
        }

        const records: AccountDataExportRecordSourceV1[] = []
        for (const encrypted of snapshot.vault.records) {
          if (!key) return { ok: false, kind: 'data_unavailable' }
          const decrypted = await decryptSyncRecord(key, encrypted, dependencies.crypto)
          if (encrypted.tombstone) {
            if (decrypted !== null) return { ok: false, kind: 'data_unavailable' }
            records.push({
              entityType: encrypted.entityType,
              entityId: encrypted.entityId,
              revision: encrypted.revision,
              vaultVersion: encrypted.vaultVersion,
              deleted: true,
            })
            continue
          }
          if (!isValidSyncEntity(decrypted)
            || decrypted.entityType !== encrypted.entityType
            || decrypted.entityId !== encrypted.entityId) {
            return { ok: false, kind: 'data_unavailable' }
          }
          records.push({
            entityType: encrypted.entityType,
            entityId: encrypted.entityId,
            revision: encrypted.revision,
            vaultVersion: encrypted.vaultVersion,
            deleted: false,
            value: structuredClone(decrypted.value),
          })
        }

        const source: AccountDataExportSourceV1 = structuredClone({
          account: snapshot.account,
          connectedAccounts: snapshot.connectedAccounts as Array<{
            connectionId: string
            provider: ProviderId
            accountKind: ProviderAccountKind | null
            email: string
            displayName: string | null
            status: ProviderConnectionStatus
            grantedScopes: string[]
            createdAt: number
            updatedAt: number
          }>,
          subscription: snapshot.subscription as {
            state: BillingState | 'complimentary'
            plan: BillingPlan | null
            currentPeriodStart: number | null
            currentPeriodEnd: number | null
            courtesyEnd: number | null
            cancelAtPeriodEnd: boolean
            createdAt: number | null
            updatedAt: number | null
          },
          entitlement: snapshot.entitlement as {
            capabilities: PremiumCapability[]
            grantSources: SignedGrantSource[]
            expiresAt: number | null
          },
          devices: snapshot.devices,
          syncedData: {
            status: snapshot.vault.status,
            vaultVersion: snapshot.vault.vaultVersion,
            storedBytes: snapshot.vault.storedBytes,
            records,
          },
        })
        return { ok: true, value: deepFreeze(source) }
      } catch {
        return { ok: false, kind: controller.signal.aborted ? 'offline' : 'data_unavailable' }
      } finally {
        globalThis.clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
  return Object.freeze(gateway)
}
