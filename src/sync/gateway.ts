import { importDataKey, type EncryptedSyncRecordV1 } from './crypto'
import { SYNC_ENTITY_TYPES, type SyncEntityType } from './types'

const MAX_RESPONSE_BYTES = 256 * 1_024
const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u
const ENTITY_TYPES: ReadonlySet<string> = new Set(SYNC_ENTITY_TYPES)

export type SyncGatewayFailure =
  | 'authentication_required'
  | 'entitlement_required'
  | 'device_limit'
  | 'offline'
  | 'needs_attention'

export type SyncGatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: SyncGatewayFailure }

export interface SyncGatewaySummary {
  vaultVersion: number
  usedBytes: number
  currentDeviceId: string
  devices: readonly {
    id: string
    name: string
    lastSyncAt: number | null
    current: boolean
    revoked: boolean
  }[]
}

export interface SyncPulledRecordV1 extends EncryptedSyncRecordV1 {
  vaultVersion: number
}

export interface SyncPullPage {
  records: readonly SyncPulledRecordV1[]
  nextCursor: number | null
  vaultVersion: number
}

export interface SyncPushMutationV1 {
  idempotencyId: string
  expectedRevision: number
  record: EncryptedSyncRecordV1
}

export type SyncPushOutcome =
  | { status: 'accepted'; entityType: SyncEntityType; entityId: string; revision: number; vaultVersion: number }
  | { status: 'quota'; entityType: SyncEntityType; entityId: string; encodedSize: number; limit: 2_097_152 }
  | { status: 'stale'; entityType: SyncEntityType; entityId: string; revision: number; winner: SyncPulledRecordV1 | null }

export interface SyncGateway {
  bootstrap(input: {
    accountId: string
    deviceId: string
    friendlyName: string
  }, signal?: AbortSignal): Promise<SyncGatewayResult<{ dataKey: CryptoKey; summary: SyncGatewaySummary }>>
  pull(input: {
    accountId: string
    deviceId: string
    afterVaultVersion: number
    cursor: number
    limit: number
    acknowledgeVaultVersion: number | null
  }, signal?: AbortSignal): Promise<SyncGatewayResult<SyncPullPage>>
  push(input: {
    accountId: string
    deviceId: string
    mutations: readonly SyncPushMutationV1[]
  }, signal?: AbortSignal): Promise<SyncGatewayResult<readonly SyncPushOutcome[]>>
  deactivateDevice(input: { accountId: string; deviceId: string }, signal?: AbortSignal): Promise<SyncGatewayResult<SyncGatewaySummary>>
  renameDevice(input: { accountId: string; deviceId: string; friendlyName: string }, signal?: AbortSignal): Promise<SyncGatewayResult<SyncGatewaySummary>>
  revokeDevice(input: { accountId: string; currentDeviceId: string; targetDeviceId: string }, signal?: AbortSignal): Promise<SyncGatewayResult<SyncGatewaySummary>>
  deleteVault(input: { accountId: string; deviceId: string }, signal?: AbortSignal): Promise<SyncGatewayResult<void>>
  deleteAccount(input: { accountId: string }, signal?: AbortSignal): Promise<SyncGatewayResult<void>>
}

export interface SyncGatewayDependencies {
  origin: string
  allowedOrigins: readonly [string]
  enabled: boolean
  getAccessToken(accountId: string, signal?: AbortSignal): Promise<string | null>
  invalidateAuthentication(): Promise<void>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
  crypto?: Crypto
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum
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

function validDeviceId(value: unknown): value is string {
  return typeof value === 'string'
    && DEVICE_ID.test(value)
    && decodeBase64Url(value)?.byteLength === 16
}

function validFriendlyName(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 48
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function validEntityType(value: unknown): value is SyncEntityType {
  return typeof value === 'string' && ENTITY_TYPES.has(value)
}

function validEntityId(value: unknown): value is string {
  return typeof value === 'string' && ENTITY_ID.test(value)
}

function validEncryptedRecord(value: unknown, accountId: string): value is EncryptedSyncRecordV1 {
  if (!record(value)) return false
  return exactKeys(value, [
    'envelopeVersion', 'accountId', 'entityType', 'entityId', 'revision',
    'tombstone', 'nonce', 'ciphertext',
  ])
    && value.envelopeVersion === 1
    && value.accountId === accountId
    && ACCOUNT_UUID.test(accountId)
    && validEntityType(value.entityType)
    && validEntityId(value.entityId)
    && integer(value.revision, 1)
    && typeof value.tombstone === 'boolean'
    && decodeBase64Url(value.nonce)?.byteLength === 12
    && (decodeBase64Url(value.ciphertext)?.byteLength ?? 0) >= 16
}

function normalizeSummary(value: unknown): SyncGatewaySummary | null {
  if (!record(value)
    || !exactKeys(value, ['vaultVersion', 'encodedSize', 'currentDeviceId', 'devices'])
    || !integer(value.vaultVersion)
    || !integer(value.encodedSize)
    || value.encodedSize > 2_097_152
    || !validDeviceId(value.currentDeviceId)
    || !Array.isArray(value.devices)
    || value.devices.length > 5) return null

  const devices: SyncGatewaySummary['devices'][number][] = []
  const seen = new Set<string>()
  for (const candidate of value.devices) {
    if (!record(candidate)
      || !exactKeys(candidate, [
        'deviceId', 'friendlyName', 'state', 'acknowledgedVaultVersion', 'lastSeenAt',
      ])
      || !validDeviceId(candidate.deviceId)
      || seen.has(candidate.deviceId)
      || !validFriendlyName(candidate.friendlyName)
      || !['active', 'inactive', 'revoked'].includes(candidate.state as string)
      || !integer(candidate.acknowledgedVaultVersion)
      || !integer(candidate.lastSeenAt)) return null
    seen.add(candidate.deviceId)
    devices.push(Object.freeze({
      id: candidate.deviceId,
      name: candidate.friendlyName,
      lastSyncAt: candidate.lastSeenAt,
      current: candidate.deviceId === value.currentDeviceId,
      revoked: candidate.state === 'revoked',
    }))
  }
  if (!seen.has(value.currentDeviceId)) return null
  const summary: SyncGatewaySummary = {
    vaultVersion: value.vaultVersion,
    usedBytes: value.encodedSize,
    currentDeviceId: value.currentDeviceId,
    devices: Object.freeze(devices),
  }
  return Object.freeze(summary)
}

function normalizePushOutcome(
  value: unknown,
  mutation: SyncPushMutationV1,
  accountId: string,
): SyncPushOutcome | null {
  if (!record(value)
    || value.entityType !== mutation.record.entityType
    || value.entityId !== mutation.record.entityId) return null
  if (value.status === 'accepted') {
    return exactKeys(value, ['status', 'entityType', 'entityId', 'revision', 'vaultVersion'])
      && value.revision === mutation.record.revision
      && integer(value.revision, 1)
      && integer(value.vaultVersion, 1)
      ? Object.freeze({
          status: 'accepted',
          entityType: value.entityType as SyncEntityType,
          entityId: value.entityId as string,
          revision: value.revision,
          vaultVersion: value.vaultVersion,
        })
      : null
  }
  if (value.status === 'quota') {
    return exactKeys(value, ['status', 'entityType', 'entityId', 'encodedSize', 'limit'])
      && integer(value.encodedSize)
      && value.encodedSize <= 2_097_152
      && value.limit === 2_097_152
      ? Object.freeze({
          status: 'quota',
          entityType: value.entityType as SyncEntityType,
          entityId: value.entityId as string,
          encodedSize: value.encodedSize,
          limit: 2_097_152,
        })
      : null
  }
  if (value.status !== 'stale'
    || !exactKeys(value, ['status', 'entityType', 'entityId', 'revision', 'winner'])
    || !integer(value.revision)) return null
  if (value.revision === 0) {
    return value.winner === null ? Object.freeze({
      status: 'stale',
      entityType: value.entityType as SyncEntityType,
      entityId: value.entityId as string,
      revision: 0,
      winner: null,
    }) : null
  }
  if (!record(value.winner)
    || !exactKeys(value.winner, [
      'envelopeVersion', 'entityType', 'entityId', 'revision', 'vaultVersion',
      'tombstone', 'nonce', 'ciphertext',
    ])) return null
  const winner: SyncPulledRecordV1 = {
    envelopeVersion: value.winner.envelopeVersion as 1,
    accountId,
    entityType: value.winner.entityType as SyncEntityType,
    entityId: value.winner.entityId as string,
    revision: value.winner.revision as number,
    vaultVersion: value.winner.vaultVersion as number,
    tombstone: value.winner.tombstone as boolean,
    nonce: value.winner.nonce as string,
    ciphertext: value.winner.ciphertext as string,
  }
  return validEncryptedRecord({
    envelopeVersion: winner.envelopeVersion,
    accountId: winner.accountId,
    entityType: winner.entityType,
    entityId: winner.entityId,
    revision: winner.revision,
    tombstone: winner.tombstone,
    nonce: winner.nonce,
    ciphertext: winner.ciphertext,
  }, accountId)
    && winner.entityType === mutation.record.entityType
    && winner.entityId === mutation.record.entityId
    && winner.revision === value.revision
    && integer(winner.vaultVersion, 1)
    ? Object.freeze({
        status: 'stale',
        entityType: winner.entityType,
        entityId: winner.entityId,
        revision: winner.revision,
        winner: Object.freeze(winner),
      })
    : null
}

function mapFailure(status: number, value: unknown): SyncGatewayFailure {
  const error = record(value) && exactKeys(value, ['error']) && typeof value.error === 'string'
    ? value.error
    : ''
  if (status === 401) return 'authentication_required'
  if (status === 403 && error === 'entitlement_required') return 'entitlement_required'
  if (status === 403 && error === 'account_not_found') return 'authentication_required'
  if (status === 409 && error === 'device_limit') return 'device_limit'
  if (status === 429 || status >= 500) return 'offline'
  return 'needs_attention'
}

export function createSyncGateway(dependencies: SyncGatewayDependencies): SyncGateway {
  let parsedOrigin: URL | null = null
  try {
    parsedOrigin = new URL(dependencies.origin)
  } catch {
    // Rejected by the complete configuration guard below.
  }
  if (!parsedOrigin
    || parsedOrigin.origin !== dependencies.origin
    || dependencies.allowedOrigins.length !== 1
    || dependencies.allowedOrigins[0] !== dependencies.origin
    || !Number.isSafeInteger(dependencies.timeoutMs ?? 10_000)
    || (dependencies.timeoutMs ?? 10_000) < 1
    || (dependencies.timeoutMs ?? 10_000) > 30_000) {
    throw new Error('sync_gateway_config_invalid')
  }
  const timeoutMs = dependencies.timeoutMs ?? 10_000

  async function request(
    path: string,
    body: unknown,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<SyncGatewayResult<unknown>> {
    if (!dependencies.enabled) return { ok: false, kind: 'needs_attention' }
    if (signal?.aborted) return { ok: false, kind: 'offline' }
    let encodedBody: string
    try {
      encodedBody = JSON.stringify(body)
    } catch {
      return { ok: false, kind: 'needs_attention' }
    }
    if (new TextEncoder().encode(encodedBody).byteLength > MAX_RESPONSE_BYTES) {
      return { ok: false, kind: 'needs_attention' }
    }

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timeout = globalThis.setTimeout(abort, timeoutMs)
    try {
      const token = await dependencies.getAccessToken(accountId, controller.signal)
      if (!token || controller.signal.aborted) {
        return { ok: false, kind: token ? 'offline' : 'authentication_required' }
      }
      const response = await dependencies.fetch(`${dependencies.origin}/functions/v1/${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: encodedBody,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })
      const declaredLength = response.headers.get('content-length')
      if (declaredLength !== null
        && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
        return { ok: false, kind: 'needs_attention' }
      }
      if (!/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get('cache-control') ?? '')
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')) {
        return { ok: false, kind: 'needs_attention' }
      }
      const text = await response.text()
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        return { ok: false, kind: 'needs_attention' }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return { ok: false, kind: 'needs_attention' }
      }
      if (!response.ok) {
        const kind = mapFailure(response.status, parsed)
        if (kind === 'authentication_required') {
          try {
            await dependencies.invalidateAuthentication()
          } catch {
            // The verified server result remains authoritative even if local cleanup fails.
          }
        }
        return { ok: false, kind }
      }
      return { ok: true, value: parsed }
    } catch {
      return { ok: false, kind: 'offline' }
    } finally {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }

  async function summaryAction(
    path: string,
    body: unknown,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<SyncGatewayResult<SyncGatewaySummary>> {
    const result = await request(path, body, accountId, signal)
    if (!result.ok) return result
    if (!record(result.value)
      || !exactKeys(result.value, ['status', 'summary'])
      || result.value.status !== 'completed') return { ok: false, kind: 'needs_attention' }
    const summary = normalizeSummary(result.value.summary)
    return summary ? { ok: true, value: summary } : { ok: false, kind: 'needs_attention' }
  }

  const gateway: SyncGateway = {
    async bootstrap(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)
        || !validDeviceId(input.deviceId)
        || !validFriendlyName(input.friendlyName)) return { ok: false, kind: 'needs_attention' }
      const result = await request('sync-bootstrap', {
        deviceId: input.deviceId,
        friendlyName: input.friendlyName,
      }, input.accountId, signal)
      if (!result.ok) return result
      if (!record(result.value)
        || !exactKeys(result.value, ['keyVersion', 'keyMaterial', 'summary'])
        || result.value.keyVersion !== 1) return { ok: false, kind: 'needs_attention' }
      const rawKey = decodeBase64Url(result.value.keyMaterial)
      const summary = normalizeSummary(result.value.summary)
      if (!rawKey || rawKey.byteLength !== 32 || !summary) {
        rawKey?.fill(0)
        return { ok: false, kind: 'needs_attention' }
      }
      try {
        const dataKey = await importDataKey(rawKey, dependencies.crypto)
        return { ok: true, value: Object.freeze({ dataKey, summary }) }
      } catch {
        return { ok: false, kind: 'needs_attention' }
      } finally {
        rawKey.fill(0)
      }
    },

    async pull(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)
        || !validDeviceId(input.deviceId)
        || !integer(input.afterVaultVersion)
        || !integer(input.cursor)
        || !integer(input.limit, 1) || input.limit > 100
        || !(input.acknowledgeVaultVersion === null || integer(input.acknowledgeVaultVersion))) {
        return { ok: false, kind: 'needs_attention' }
      }
      const result = await request('sync-pull', {
        deviceId: input.deviceId,
        afterVaultVersion: input.afterVaultVersion,
        cursor: input.cursor,
        limit: input.limit,
        acknowledgeVaultVersion: input.acknowledgeVaultVersion,
      }, input.accountId, signal)
      if (!result.ok) return result
      if (!record(result.value)
        || !exactKeys(result.value, ['records', 'nextCursor', 'vaultVersion'])
        || !Array.isArray(result.value.records)
        || result.value.records.length > 100
        || !integer(result.value.vaultVersion)
        || !(result.value.nextCursor === null || integer(result.value.nextCursor))) {
        return { ok: false, kind: 'needs_attention' }
      }
      const pageVaultVersion = result.value.vaultVersion as number
      const nextCursor = result.value.nextCursor as number | null
      const records: SyncPulledRecordV1[] = []
      for (const candidate of result.value.records) {
        if (!record(candidate)
          || !exactKeys(candidate, [
            'entityType', 'entityId', 'revision', 'vaultVersion', 'tombstone',
            'nonce', 'ciphertext', 'storedSize',
          ])) return { ok: false, kind: 'needs_attention' }
        const withAccount: EncryptedSyncRecordV1 = {
          envelopeVersion: 1,
          accountId: input.accountId,
          entityType: candidate.entityType as SyncEntityType,
          entityId: candidate.entityId as string,
          revision: candidate.revision as number,
          tombstone: candidate.tombstone as boolean,
          nonce: candidate.nonce as string,
          ciphertext: candidate.ciphertext as string,
        }
        if (!validEncryptedRecord(withAccount, input.accountId)
          || !integer(candidate.vaultVersion, 1)
          || !integer(candidate.storedSize, 1)) return { ok: false, kind: 'needs_attention' }
        records.push(Object.freeze({
          ...withAccount,
          vaultVersion: candidate.vaultVersion,
        }) as SyncPulledRecordV1)
      }
      if (records.some((candidate, index) => candidate.vaultVersion > pageVaultVersion
        || (index > 0 && candidate.vaultVersion <= records[index - 1]!.vaultVersion))
        || (nextCursor !== null && nextCursor !== records.at(-1)?.vaultVersion)) {
        return { ok: false, kind: 'needs_attention' }
      }
      return { ok: true, value: Object.freeze({
        records: Object.freeze(records),
        nextCursor,
        vaultVersion: pageVaultVersion,
      }) }
    },

    async push(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)
        || !validDeviceId(input.deviceId)
        || !Array.isArray(input.mutations)
        || input.mutations.length < 1
        || input.mutations.length > 50
        || input.mutations.some((mutation) => !record(mutation)
          || !exactKeys(mutation, ['idempotencyId', 'expectedRevision', 'record'])
          || typeof mutation.idempotencyId !== 'string'
          || !ACCOUNT_UUID.test(mutation.idempotencyId)
          || !integer(mutation.expectedRevision)
          || !validEncryptedRecord(mutation.record, input.accountId)
          || mutation.record.revision !== mutation.expectedRevision + 1)) {
        return { ok: false, kind: 'needs_attention' }
      }
      const result = await request('sync-push', {
        deviceId: input.deviceId,
        mutations: input.mutations.map((mutation) => ({
          idempotencyId: mutation.idempotencyId,
          envelopeVersion: mutation.record.envelopeVersion,
          entityType: mutation.record.entityType,
          entityId: mutation.record.entityId,
          expectedRevision: mutation.expectedRevision,
          revision: mutation.record.revision,
          tombstone: mutation.record.tombstone,
          nonce: mutation.record.nonce,
          ciphertext: mutation.record.ciphertext,
        })),
      }, input.accountId, signal)
      if (!result.ok) return result
      if (!record(result.value)
        || !exactKeys(result.value, ['outcomes'])
        || !Array.isArray(result.value.outcomes)
        || result.value.outcomes.length !== input.mutations.length) {
        return { ok: false, kind: 'needs_attention' }
      }
      const outcomes = result.value.outcomes.map((outcome, index) => (
        normalizePushOutcome(outcome, input.mutations[index]!, input.accountId)
      ))
      return outcomes.every((outcome): outcome is SyncPushOutcome => outcome !== null)
        ? { ok: true, value: Object.freeze(outcomes) }
        : { ok: false, kind: 'needs_attention' }
    },

    deactivateDevice(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId) || !validDeviceId(input.deviceId)) {
        return Promise.resolve({ ok: false, kind: 'needs_attention' })
      }
      return summaryAction(
        'sync-deactivate-device', { deviceId: input.deviceId }, input.accountId, signal,
      )
    },

    renameDevice(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)
        || !validDeviceId(input.deviceId)
        || !validFriendlyName(input.friendlyName)) {
        return Promise.resolve({ ok: false, kind: 'needs_attention' })
      }
      return summaryAction('sync-rename-device', {
        deviceId: input.deviceId,
        friendlyName: input.friendlyName,
      }, input.accountId, signal)
    },

    revokeDevice(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)
        || !validDeviceId(input.currentDeviceId)
        || !validDeviceId(input.targetDeviceId)
        || input.currentDeviceId === input.targetDeviceId) {
        return Promise.resolve({ ok: false, kind: 'needs_attention' })
      }
      return summaryAction('sync-revoke-device', {
        currentDeviceId: input.currentDeviceId,
        targetDeviceId: input.targetDeviceId,
      }, input.accountId, signal)
    },

    async deleteVault(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId) || !validDeviceId(input.deviceId)) {
        return { ok: false, kind: 'needs_attention' }
      }
      const result = await request('sync-delete-vault', {
        accountId: input.accountId,
        deviceId: input.deviceId,
        confirmation: 'DELETE',
      }, input.accountId, signal)
      if (!result.ok) return result
      return record(result.value)
        && exactKeys(result.value, ['status'])
        && result.value.status === 'completed'
        ? { ok: true, value: undefined }
        : { ok: false, kind: 'needs_attention' }
    },

    async deleteAccount(input, signal) {
      if (!ACCOUNT_UUID.test(input.accountId)) return { ok: false, kind: 'needs_attention' }
      const result = await request('account-delete', {
        accountId: input.accountId,
        confirmation: 'DELETE',
      }, input.accountId, signal)
      if (!result.ok) return result
      return record(result.value)
        && exactKeys(result.value, ['status'])
        && result.value.status === 'completed'
        ? { ok: true, value: undefined }
        : { ok: false, kind: 'needs_attention' }
    },
  }
  return Object.freeze(gateway)
}
