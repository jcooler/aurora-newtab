import { jsonResponse } from './http.ts'
import type {
  SyncAccount,
  SyncDeviceSummary,
  SyncFunctionDependencies,
  SyncPullRecord,
  SyncRateLimitAction,
  SyncSummary,
} from './syncTypes.ts'

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u
const FIVE_MINUTES = 5 * 60 * 1_000
const MAX_CLOCK_SKEW = 60 * 1_000
const MAX_BODY_BYTES = 2_048
const MAX_PUSH_BYTES = 256 * 1_024
const MAX_PULL_BYTES = 256 * 1_024
const ENTITY_TYPES = new Set([
  'settings', 'focus', 'todo_list', 'quick_link', 'timer_config', 'location',
  'notes', 'world_clock', 'countdown', 'legacy_layout', 'layout_manifest',
  'named_layout', 'calendar_preference', 'calendar_week_start',
  'connector_preference', 'habit', 'habit_completion', 'progress_goal',
])

type SyncError =
  | 'method_not_allowed'
  | 'authentication_required'
  | 'fresh_authentication_required'
  | 'account_not_found'
  | 'entitlement_required'
  | 'device_limit'
  | 'device_not_found'
  | 'invalid_request'
  | 'service_unavailable'
  | 'retryable'
  | 'rate_limited'

function errorResponse(error: SyncError, status: number): Response {
  return jsonResponse({ error }, status)
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function canonicalBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null
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
    && canonicalBase64Url(value)?.byteLength === 16
}

function validFriendlyName(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 48
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

async function exactJsonObject(
  request: Request,
  keys: readonly string[],
  maximumBytes = MAX_BODY_BYTES,
): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) {
    return null
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > maximumBytes) return null
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (new TextEncoder().encode(text).byteLength > maximumBytes) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const value = parsed as Record<string, unknown>
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key)) ? value : null
}

function normalizeAccount(value: SyncAccount | null): SyncAccount | null {
  if (!value) return null
  if (!value || Object.keys(value).length !== 1 || !ACCOUNT_UUID.test(value.accountId)) {
    throw new Error('sync_account_invalid')
  }
  return { accountId: value.accountId }
}

function normalizeDevice(value: SyncDeviceSummary): SyncDeviceSummary {
  if (!value
    || Object.keys(value).sort().join(',')
      !== 'acknowledgedVaultVersion,deviceId,friendlyName,lastSeenAt,state'
    || !validDeviceId(value.deviceId)
    || !validFriendlyName(value.friendlyName)
    || !['active', 'inactive', 'revoked'].includes(value.state)
    || !Number.isSafeInteger(value.acknowledgedVaultVersion)
    || value.acknowledgedVaultVersion < 0
    || !Number.isSafeInteger(value.lastSeenAt)
    || value.lastSeenAt < 0) {
    throw new Error('sync_summary_invalid')
  }
  return { ...value }
}

function normalizeSummary(value: SyncSummary, expectedCurrentDeviceId: string): SyncSummary {
  if (!value
    || Object.keys(value).sort().join(',') !== 'currentDeviceId,devices,encodedSize,vaultVersion'
    || value.currentDeviceId !== expectedCurrentDeviceId
    || !Number.isSafeInteger(value.vaultVersion)
    || value.vaultVersion < 0
    || !Number.isSafeInteger(value.encodedSize)
    || value.encodedSize < 0
    || value.encodedSize > 2_097_152
    || !Array.isArray(value.devices)
    || value.devices.length > 5) {
    throw new Error('sync_summary_invalid')
  }
  const devices = value.devices.map(normalizeDevice)
  if (new Set(devices.map((device) => device.deviceId)).size !== devices.length
    || !devices.some((device) => device.deviceId === expectedCurrentDeviceId)) {
    throw new Error('sync_summary_invalid')
  }
  return {
    vaultVersion: value.vaultVersion,
    encodedSize: value.encodedSize,
    currentDeviceId: expectedCurrentDeviceId,
    devices,
  }
}

async function resolveAccount(
  request: Request,
  dependencies: SyncFunctionDependencies,
): Promise<{ account: SyncAccount; authTime: number | null; effectiveAt: number } | Response> {
  const resolved = await resolveAuthenticatedAccount(request, dependencies)
  if (resolved instanceof Response) return resolved
  const capabilities = await dependencies.repository.getEffectiveCapabilities(
    resolved.account.accountId,
    resolved.effectiveAt,
  )
  if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== 'string')) {
    throw new Error('sync_entitlement_invalid')
  }
  if (!capabilities.includes('encrypted_sync')) return errorResponse('entitlement_required', 403)
  return resolved
}

async function resolveAuthenticatedAccount(
  request: Request,
  dependencies: SyncFunctionDependencies,
): Promise<{ account: SyncAccount; authUserId: string; authTime: number | null; effectiveAt: number } | Response> {
  const authentication = await dependencies.authenticate(request)
  if (!authentication.ok) return errorResponse('authentication_required', 401)
  const account = normalizeAccount(
    await dependencies.repository.findAccountForAuthUser(authentication.authUserId),
  )
  if (!account) return errorResponse('account_not_found', 403)
  const effectiveAt = dependencies.now()
  if (!Number.isSafeInteger(effectiveAt)) throw new Error('sync_clock_invalid')
  return { account, authUserId: authentication.authUserId, authTime: authentication.authTime, effectiveAt }
}

function fresh(authTime: number | null, effectiveAt: number): boolean {
  return authTime !== null
    && Number.isSafeInteger(authTime)
    && authTime <= effectiveAt + MAX_CLOCK_SKEW
    && effectiveAt - authTime <= FIVE_MINUTES
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum
}

function validEntityType(value: unknown): value is string {
  return typeof value === 'string' && ENTITY_TYPES.has(value)
}

function validEntityId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u.test(value)
}

function validMutation(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = [
    'idempotencyId', 'envelopeVersion', 'entityType', 'entityId',
    'expectedRevision', 'revision', 'tombstone', 'nonce', 'ciphertext',
  ]
  const actual = Object.keys(record)
  return actual.length === keys.length
    && actual.every((key) => keys.includes(key))
    && typeof record.idempotencyId === 'string'
    && ACCOUNT_UUID.test(record.idempotencyId)
    && record.envelopeVersion === 1
    && validEntityType(record.entityType)
    && validEntityId(record.entityId)
    && integer(record.expectedRevision)
    && integer(record.revision, 1)
    && record.revision === (record.expectedRevision as number) + 1
    && typeof record.tombstone === 'boolean'
    && typeof record.nonce === 'string'
    && record.nonce.length === 16
    && canonicalBase64Url(record.nonce)?.byteLength === 12
    && typeof record.ciphertext === 'string'
    && record.ciphertext.length >= 22
    && record.ciphertext.length <= 262144
    && (canonicalBase64Url(record.ciphertext)?.byteLength ?? 0) >= 16
}

async function mutationWithDigest(value: Record<string, unknown>): Promise<Record<string, unknown>> {
  const normalized = {
    idempotencyId: value.idempotencyId,
    envelopeVersion: value.envelopeVersion,
    entityType: value.entityType,
    entityId: value.entityId,
    expectedRevision: value.expectedRevision,
    revision: value.revision,
    tombstone: value.tombstone,
    nonce: value.nonce,
    ciphertext: value.ciphertext,
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(normalized)),
  )
  return { ...normalized, requestDigest: encodeBase64Url(new Uint8Array(digest)) }
}

function validPullRecord(value: unknown): value is SyncPullRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = [
    'entityType', 'entityId', 'revision', 'vaultVersion', 'tombstone',
    'nonce', 'ciphertext', 'storedSize',
  ]
  const actual = Object.keys(record)
  return actual.length === keys.length
    && actual.every((key) => keys.includes(key))
    && validEntityType(record.entityType)
    && validEntityId(record.entityId)
    && integer(record.revision, 1)
    && integer(record.vaultVersion, 1)
    && typeof record.tombstone === 'boolean'
    && typeof record.nonce === 'string'
    && record.nonce.length === 16
    && canonicalBase64Url(record.nonce)?.byteLength === 12
    && typeof record.ciphertext === 'string'
    && record.ciphertext.length >= 22
    && record.ciphertext.length <= 262144
    && (canonicalBase64Url(record.ciphertext)?.byteLength ?? 0) >= 16
    && integer(record.storedSize, 1)
    && record.storedSize <= MAX_PULL_BYTES
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function validWinner(
  value: unknown,
  entityType: string,
  entityId: string,
  revision: number,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const winner = value as Record<string, unknown>
  return exactKeys(winner, [
    'envelopeVersion', 'entityType', 'entityId', 'revision', 'vaultVersion',
    'tombstone', 'nonce', 'ciphertext',
  ])
    && winner.envelopeVersion === 1
    && winner.entityType === entityType
    && winner.entityId === entityId
    && winner.revision === revision
    && integer(winner.revision, 1)
    && integer(winner.vaultVersion, 1)
    && typeof winner.tombstone === 'boolean'
    && typeof winner.nonce === 'string'
    && winner.nonce.length === 16
    && canonicalBase64Url(winner.nonce)?.byteLength === 12
    && typeof winner.ciphertext === 'string'
    && winner.ciphertext.length >= 22
    && winner.ciphertext.length <= 262144
    && (canonicalBase64Url(winner.ciphertext)?.byteLength ?? 0) >= 16
}

function validOutcome(value: unknown, mutation: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const outcome = value as Record<string, unknown>
  if (outcome.entityType !== mutation.entityType || outcome.entityId !== mutation.entityId) return false
  if (outcome.status === 'accepted') {
    return exactKeys(outcome, ['status', 'entityType', 'entityId', 'revision', 'vaultVersion'])
      && outcome.revision === mutation.revision
      && integer(outcome.revision, 1)
      && integer(outcome.vaultVersion, 1)
  }
  if (outcome.status === 'quota') {
    return exactKeys(outcome, ['status', 'entityType', 'entityId', 'encodedSize', 'limit'])
      && integer(outcome.encodedSize)
      && outcome.encodedSize <= 2_097_152
      && outcome.limit === 2_097_152
  }
  if (outcome.status === 'stale') {
    return exactKeys(outcome, ['status', 'entityType', 'entityId', 'revision', 'winner'])
      && integer(outcome.revision)
      && (outcome.revision === 0
        ? outcome.winner === null
        : validWinner(
            outcome.winner,
            mutation.entityType as string,
            mutation.entityId as string,
            outcome.revision,
          ))
  }
  return false
}

async function withinRateLimit(
  request: Request,
  dependencies: SyncFunctionDependencies,
  accountId: string,
  action: SyncRateLimitAction,
  effectiveAt: number,
): Promise<boolean> {
  const ipFingerprint = await dependencies.requestFingerprint(request)
  if (canonicalBase64Url(ipFingerprint)?.byteLength !== 32) {
    throw new Error('sync_fingerprint_invalid')
  }
  return dependencies.repository.consumeRateLimit({
    accountId,
    action,
    ipFingerprint,
    effectiveAt,
  })
}

function mappedFailure(error: unknown): Response {
  return error instanceof Error && error.message === 'sync_device_limit'
    ? errorResponse('device_limit', 409)
    : errorResponse('service_unavailable', 503)
}

export function createSyncHandlers(dependencies: SyncFunctionDependencies): {
  bootstrap(request: Request): Promise<Response>
  deactivateDevice(request: Request): Promise<Response>
  renameDevice(request: Request): Promise<Response>
  revokeDevice(request: Request): Promise<Response>
  pull(request: Request): Promise<Response>
  push(request: Request): Promise<Response>
  deleteVault(request: Request): Promise<Response>
  deleteAccount(request: Request): Promise<Response>
} {
  return {
    async bootstrap(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const body = await exactJsonObject(request, ['deviceId', 'friendlyName'])
        if (!body || !validDeviceId(body.deviceId) || !validFriendlyName(body.friendlyName)) {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'bootstrap', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)

        const summary = normalizeSummary(await dependencies.repository.registerDevice({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          friendlyName: body.friendlyName,
          effectiveAt: resolved.effectiveAt,
        }), body.deviceId)

        let rawDataKey: Uint8Array | null = null
        try {
          const stored = await dependencies.repository.getAccountKey(
            resolved.account.accountId,
            body.deviceId,
          )
          if (stored) {
            if (stored.keyVersion !== dependencies.keyring.keyVersion) throw new Error('sync_key_version_invalid')
            rawDataKey = await dependencies.keyring.unwrapDataKey(stored.wrappedDataKey)
          } else {
            rawDataKey = dependencies.randomBytes(32)
            if (!(rawDataKey instanceof Uint8Array) || rawDataKey.byteLength !== 32) {
              throw new Error('sync_data_key_invalid')
            }
            const wrappedDataKey = await dependencies.keyring.wrapDataKey(rawDataKey)
            const storedNewKey = await dependencies.repository.storeAccountKey({
              accountId: resolved.account.accountId,
              keyVersion: dependencies.keyring.keyVersion,
              wrappedDataKey,
              effectiveAt: resolved.effectiveAt,
            })
            if (!storedNewKey) {
              rawDataKey.fill(0)
              rawDataKey = null
              const winner = await dependencies.repository.getAccountKey(
                resolved.account.accountId,
                body.deviceId,
              )
              if (!winner || winner.keyVersion !== dependencies.keyring.keyVersion) {
                throw new Error('sync_key_race_unresolved')
              }
              rawDataKey = await dependencies.keyring.unwrapDataKey(winner.wrappedDataKey)
            }
          }
          if (!(rawDataKey instanceof Uint8Array) || rawDataKey.byteLength !== 32) {
            throw new Error('sync_data_key_invalid')
          }
          const keyMaterial = encodeBase64Url(rawDataKey)
          return jsonResponse({ keyVersion: dependencies.keyring.keyVersion, keyMaterial, summary })
        } finally {
          rawDataKey?.fill(0)
        }
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async deactivateDevice(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const body = await exactJsonObject(request, ['deviceId'])
        if (!body || !validDeviceId(body.deviceId)) return errorResponse('invalid_request', 400)
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'deactivate', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        const changed = await dependencies.repository.deactivateDevice({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          effectiveAt: resolved.effectiveAt,
        })
        if (!changed) return errorResponse('device_not_found', 404)
        const summary = normalizeSummary(
          await dependencies.repository.getSummary(resolved.account.accountId, body.deviceId),
          body.deviceId,
        )
        return jsonResponse({ status: 'completed', summary })
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async renameDevice(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const body = await exactJsonObject(request, ['deviceId', 'friendlyName'])
        if (!body || !validDeviceId(body.deviceId) || !validFriendlyName(body.friendlyName)) {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'rename', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        const changed = await dependencies.repository.renameDevice({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          friendlyName: body.friendlyName,
          effectiveAt: resolved.effectiveAt,
        })
        if (!changed) return errorResponse('device_not_found', 404)
        const summary = normalizeSummary(
          await dependencies.repository.getSummary(resolved.account.accountId, body.deviceId),
          body.deviceId,
        )
        return jsonResponse({ status: 'completed', summary })
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async revokeDevice(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        if (!fresh(resolved.authTime, resolved.effectiveAt)) {
          return errorResponse('fresh_authentication_required', 401)
        }
        const body = await exactJsonObject(request, ['currentDeviceId', 'targetDeviceId'])
        if (!body
          || !validDeviceId(body.currentDeviceId)
          || !validDeviceId(body.targetDeviceId)
          || body.currentDeviceId === body.targetDeviceId) {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'revoke', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        const changed = await dependencies.repository.revokeDevice({
          accountId: resolved.account.accountId,
          currentDeviceId: body.currentDeviceId,
          targetDeviceId: body.targetDeviceId,
          effectiveAt: resolved.effectiveAt,
        })
        if (!changed) return errorResponse('device_not_found', 404)
        const summary = normalizeSummary(
          await dependencies.repository.getSummary(resolved.account.accountId, body.currentDeviceId),
          body.currentDeviceId,
        )
        return jsonResponse({ status: 'completed', summary })
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async pull(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const body = await exactJsonObject(request, [
          'deviceId', 'afterVaultVersion', 'cursor', 'limit', 'acknowledgeVaultVersion',
        ])
        if (!body || !validDeviceId(body.deviceId)
          || !integer(body.afterVaultVersion) || !integer(body.cursor)
          || !integer(body.limit, 1) || body.limit > 100
          || !(body.acknowledgeVaultVersion === null || integer(body.acknowledgeVaultVersion))) {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'pull', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        if (body.acknowledgeVaultVersion !== null) {
          const acknowledged = await dependencies.repository.acknowledgePull({
            accountId: resolved.account.accountId,
            deviceId: body.deviceId,
            vaultVersion: body.acknowledgeVaultVersion as number,
            effectiveAt: resolved.effectiveAt,
          })
          if (!acknowledged) return errorResponse('device_not_found', 404)
        }
        const page = await dependencies.repository.pullRecords({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          afterVaultVersion: body.afterVaultVersion as number,
          cursor: body.cursor as number,
          limit: body.limit as number,
        })
        if (!page || Object.keys(page).sort().join(',') !== 'nextCursor,records,vaultVersion'
          || !Array.isArray(page.records) || page.records.length > 100
          || !page.records.every(validPullRecord)
          || !integer(page.vaultVersion)
          || !(page.nextCursor === null || integer(page.nextCursor))
          || page.records.some((record, index) => record.vaultVersion > page.vaultVersion
            || (index > 0 && record.vaultVersion <= page.records[index - 1]!.vaultVersion))
          || (page.nextCursor !== null
            && page.nextCursor !== page.records.at(-1)?.vaultVersion)
          || new TextEncoder().encode(JSON.stringify(page)).byteLength > MAX_PULL_BYTES) {
          throw new Error('sync_pull_invalid')
        }
        return jsonResponse(page)
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async push(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const body = await exactJsonObject(request, ['deviceId', 'mutations'], MAX_PUSH_BYTES)
        if (!body || !validDeviceId(body.deviceId) || !Array.isArray(body.mutations)
          || body.mutations.length < 1 || body.mutations.length > 50
          || !body.mutations.every(validMutation)) {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'push', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        const mutations = await Promise.all(body.mutations.map(mutationWithDigest))
        const outcomes = await dependencies.repository.applyMutations({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          mutations,
          effectiveAt: resolved.effectiveAt,
        })
        if (!Array.isArray(outcomes) || outcomes.length !== body.mutations.length) {
          throw new Error('sync_push_invalid')
        }
        if (!outcomes.every((outcome, index) => validOutcome(outcome, mutations[index]!))) {
          throw new Error('sync_push_invalid')
        }
        const responseBody = { outcomes }
        if (new TextEncoder().encode(JSON.stringify(responseBody)).byteLength > MAX_PUSH_BYTES) {
          throw new Error('sync_push_invalid')
        }
        return jsonResponse(responseBody)
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async deleteVault(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAuthenticatedAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        if (!fresh(resolved.authTime, resolved.effectiveAt)) {
          return errorResponse('fresh_authentication_required', 401)
        }
        const body = await exactJsonObject(request, ['accountId', 'deviceId', 'confirmation'])
        if (!body || body.accountId !== resolved.account.accountId
          || !validDeviceId(body.deviceId) || body.confirmation !== 'DELETE') {
          return errorResponse('invalid_request', 400)
        }
        if (!await withinRateLimit(
          request, dependencies, resolved.account.accountId, 'delete_vault', resolved.effectiveAt,
        )) return errorResponse('rate_limited', 429)
        const deleted = await dependencies.repository.deleteVault({
          accountId: resolved.account.accountId,
          deviceId: body.deviceId,
          effectiveAt: resolved.effectiveAt,
        })
        return deleted ? jsonResponse({ status: 'completed' }) : errorResponse('device_not_found', 404)
      } catch (error) {
        return mappedFailure(error)
      }
    },

    async deleteAccount(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const authentication = await dependencies.authenticate(request)
        if (!authentication.ok) return errorResponse('authentication_required', 401)
        const effectiveAt = dependencies.now()
        if (!fresh(authentication.authTime, effectiveAt)) {
          return errorResponse('fresh_authentication_required', 401)
        }
        const body = await exactJsonObject(request, ['accountId', 'confirmation'])
        if (!body || typeof body.accountId !== 'string' || !ACCOUNT_UUID.test(body.accountId)
          || body.confirmation !== 'DELETE') return errorResponse('invalid_request', 400)

        let deletion = await dependencies.repository.findDeletionForAuthUser(authentication.authUserId)
        if (!deletion) {
          const account = normalizeAccount(
            await dependencies.repository.findAccountForAuthUser(authentication.authUserId),
          )
          if (!account || account.accountId !== body.accountId) return errorResponse('account_not_found', 403)
          deletion = await dependencies.repository.beginAccountDeletion({
            accountId: account.accountId,
            authUserId: authentication.authUserId,
            effectiveAt,
          })
        } else if (deletion.accountId !== body.accountId || deletion.authUserId !== authentication.authUserId) {
          return errorResponse('account_not_found', 403)
        }
        if (!await withinRateLimit(
          request, dependencies, deletion.accountId, 'delete_account', effectiveAt,
        )) return errorResponse('rate_limited', 429)

        if (deletion.state === 'pending_stripe') {
          if (deletion.subscriptionId !== null) {
            if (!/^sub_[A-Za-z0-9_]+$/u.test(deletion.subscriptionId)) throw new Error('sync_deletion_invalid')
            const canceled = await dependencies.cancelSandboxSubscription(deletion.subscriptionId)
            if (canceled.id !== deletion.subscriptionId || canceled.livemode || canceled.status !== 'canceled') {
              throw new Error('sync_deletion_invalid')
            }
          }
          deletion = await dependencies.repository.markDeletionStripeCanceled(deletion.operationId, effectiveAt)
        }
        if (deletion.state === 'stripe_canceled') {
          deletion = await dependencies.repository.deleteAccountData(deletion.operationId, effectiveAt)
        }
        if (deletion.state === 'data_deleted' || deletion.state === 'completed') {
          await dependencies.repository.completeAccountDeletion(deletion.operationId, effectiveAt)
          deletion = { ...deletion, state: 'completed' }
        }
        if (deletion.state === 'completed') {
          await dependencies.deleteAuthUser(deletion.authUserId)
        }
        return jsonResponse({ status: 'completed' })
      } catch {
        return errorResponse('retryable', 503)
      }
    },
  }
}
