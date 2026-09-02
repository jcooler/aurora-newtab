import { jsonResponse } from './http.ts'
import type {
  SyncAccount,
  SyncDeviceSummary,
  SyncFunctionDependencies,
  SyncSummary,
} from './syncTypes.ts'

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u
const FIVE_MINUTES = 5 * 60 * 1_000
const MAX_CLOCK_SKEW = 60 * 1_000
const MAX_BODY_BYTES = 2_048

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

function errorResponse(error: SyncError, status: number): Response {
  return jsonResponse({ error }, status)
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function canonicalBase64UrlBytes(value: string, byteLength: number): boolean {
  if (!DEVICE_ID.test(value)) return false
  try {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
    const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return decoded.byteLength === byteLength && encodeBase64Url(decoded) === value
  } catch {
    return false
  }
}

function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && canonicalBase64UrlBytes(value, 16)
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
): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) {
    return null
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return null
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null
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
  const authentication = await dependencies.authenticate(request)
  if (!authentication.ok) return errorResponse('authentication_required', 401)
  const account = normalizeAccount(
    await dependencies.repository.findAccountForAuthUser(authentication.authUserId),
  )
  if (!account) return errorResponse('account_not_found', 403)
  const effectiveAt = dependencies.now()
  if (!Number.isSafeInteger(effectiveAt)) throw new Error('sync_clock_invalid')
  const capabilities = await dependencies.repository.getEffectiveCapabilities(account.accountId, effectiveAt)
  if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== 'string')) {
    throw new Error('sync_entitlement_invalid')
  }
  if (!capabilities.includes('encrypted_sync')) return errorResponse('entitlement_required', 403)
  return { account, authTime: authentication.authTime, effectiveAt }
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
        if (resolved.authTime === null
          || !Number.isSafeInteger(resolved.authTime)
          || resolved.authTime > resolved.effectiveAt + MAX_CLOCK_SKEW
          || resolved.effectiveAt - resolved.authTime > FIVE_MINUTES) {
          return errorResponse('fresh_authentication_required', 401)
        }
        const body = await exactJsonObject(request, ['currentDeviceId', 'targetDeviceId'])
        if (!body
          || !validDeviceId(body.currentDeviceId)
          || !validDeviceId(body.targetDeviceId)
          || body.currentDeviceId === body.targetDeviceId) {
          return errorResponse('invalid_request', 400)
        }
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
  }
}
