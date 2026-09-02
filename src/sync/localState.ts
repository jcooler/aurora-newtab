import type { StorageAuthority } from '../lib/storage/authority'
import type { StorageDriver } from '../lib/storage/driver'
import { defaults } from '../lib/storage/schema'
import { applySyncEntity, isValidSyncEntityIdentity } from './entityPolicy'
import type { SyncEntityType, SyncEntityV1 } from './types'

export const SYNC_DEVICE_STORAGE_KEY = 'tab-two:sync-device:v1' as const
export const SYNC_INDEX_STORAGE_KEY = 'tab-two:sync-index:v1' as const
export const SYNC_CONFLICT_BACKUPS_STORAGE_KEY = 'tab-two:sync-conflict-backups:v1' as const

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const RANDOM_ID = /^[A-Za-z0-9_-]{22}$/u
const DIGEST = /^[A-Za-z0-9_-]{43}$/u
const registrations = new Set<SyncDeviceRegistration>(['unregistered', 'active', 'inactive', 'revoked'])

export type SyncDeviceRegistration = 'unregistered' | 'active' | 'inactive' | 'revoked'

export interface SyncDeviceStateV1 {
  version: 1
  accountId: string
  deviceId: string
  friendlyName: string
  enabled: boolean
  registration: SyncDeviceRegistration
}

export interface SyncAcceptedEntityRevisionV1 {
  revision: number
  digest: string
}

export interface SyncIndexStateV1 {
  version: 1
  accountId: string
  lastVaultVersion: number
  entities: Record<string, SyncAcceptedEntityRevisionV1>
}

export interface SyncConflictBackupV1 {
  id: string
  entity: SyncEntityV1
  observedRemoteRevision: number
  createdAt: number
  reason: 'stale_remote_winner'
}

export interface SyncConflictBackupsStateV1 {
  version: 1
  accountId: string
  items: SyncConflictBackupV1[]
}

export interface SyncLocalStateStore {
  readDevice(accountId: string): Promise<SyncDeviceStateV1 | null>
  ensureDevice(accountId: string, friendlyName: string): Promise<SyncDeviceStateV1>
  updateDevice(
    accountId: string,
    update: (current: SyncDeviceStateV1) => SyncDeviceStateV1,
  ): Promise<SyncDeviceStateV1>
  readIndex(accountId: string): Promise<SyncIndexStateV1 | null>
  updateIndex(
    accountId: string,
    update: (current: SyncIndexStateV1) => SyncIndexStateV1,
  ): Promise<SyncIndexStateV1>
  readConflictBackups(accountId: string): Promise<readonly SyncConflictBackupV1[]>
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && actual.every((key) => Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_UUID.test(value)
}

function validFriendlyName(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 48
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function validEntityKey(value: string): boolean {
  const separator = value.indexOf(':')
  if (separator <= 0 || value.length > 400) return false
  return isValidSyncEntityIdentity(
    value.slice(0, separator) as SyncEntityType,
    value.slice(separator + 1),
  )
}

function validSyncEntity(value: unknown): value is SyncEntityV1 {
  try {
    applySyncEntity(defaults(), value as SyncEntityV1)
    return true
  } catch {
    return false
  }
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

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function canonicalBase64UrlBytes(value: string, expectedBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return false
  try {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
    const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return decoded.byteLength === expectedBytes && encodeBase64Url(decoded) === value
  } catch {
    return false
  }
}

export function emptySyncIndex(accountId: string): SyncIndexStateV1 {
  if (!validAccountId(accountId)) throw new Error('sync_account_invalid')
  return immutable({ version: 1, accountId, lastVaultVersion: 0, entities: {} })
}

export function emptyConflictBackups(accountId: string): SyncConflictBackupsStateV1 {
  if (!validAccountId(accountId)) throw new Error('sync_account_invalid')
  return immutable({ version: 1, accountId, items: [] })
}

export function parseSyncDeviceState(value: unknown, accountId: string): SyncDeviceStateV1 | null {
  if (!record(value) || !exactKeys(value, [
    'version', 'accountId', 'deviceId', 'friendlyName', 'enabled', 'registration',
  ])) return null
  if (value.version !== 1
    || value.accountId !== accountId
    || !validAccountId(value.accountId)
    || typeof value.deviceId !== 'string'
    || !RANDOM_ID.test(value.deviceId)
    || !canonicalBase64UrlBytes(value.deviceId, 16)
    || !validFriendlyName(value.friendlyName)
    || typeof value.enabled !== 'boolean'
    || typeof value.registration !== 'string'
    || !registrations.has(value.registration as SyncDeviceRegistration)) return null
  return immutable(value as unknown as SyncDeviceStateV1)
}

export function parseSyncIndexState(value: unknown, accountId: string): SyncIndexStateV1 | null {
  if (!record(value) || !exactKeys(value, ['version', 'accountId', 'lastVaultVersion', 'entities'])) return null
  if (value.version !== 1
    || value.accountId !== accountId
    || !validAccountId(value.accountId)
    || !Number.isSafeInteger(value.lastVaultVersion)
    || (value.lastVaultVersion as number) < 0
    || !record(value.entities)
    || Object.keys(value.entities).length > 10_000) return null
  for (const [entityKey, revision] of Object.entries(value.entities)) {
    if (!validEntityKey(entityKey)
      || !record(revision)
      || !exactKeys(revision, ['revision', 'digest'])
      || !Number.isSafeInteger(revision.revision)
      || (revision.revision as number) < 1
      || typeof revision.digest !== 'string'
      || !DIGEST.test(revision.digest)
      || !canonicalBase64UrlBytes(revision.digest, 32)) return null
  }
  return immutable(value as unknown as SyncIndexStateV1)
}

export function parseConflictBackupsState(
  value: unknown,
  accountId: string,
): SyncConflictBackupsStateV1 | null {
  if (!record(value) || !exactKeys(value, ['version', 'accountId', 'items'])) return null
  if (value.version !== 1
    || value.accountId !== accountId
    || !validAccountId(value.accountId)
    || !Array.isArray(value.items)
    || value.items.length > 5) return null
  const ids = new Set<string>()
  for (const item of value.items) {
    if (!record(item)
      || !exactKeys(item, ['id', 'entity', 'observedRemoteRevision', 'createdAt', 'reason'])
      || typeof item.id !== 'string'
      || !RANDOM_ID.test(item.id)
      || !canonicalBase64UrlBytes(item.id, 16)
      || ids.has(item.id)
      || !validSyncEntity(item.entity)
      || !Number.isSafeInteger(item.observedRemoteRevision)
      || (item.observedRemoteRevision as number) < 1
      || !Number.isSafeInteger(item.createdAt)
      || (item.createdAt as number) < 0
      || item.reason !== 'stale_remote_winner') return null
    ids.add(item.id)
  }
  return immutable(value as unknown as SyncConflictBackupsStateV1)
}

export function createSyncLocalStateStore(
  driver: Pick<StorageDriver, 'read' | 'write'>,
  authority: StorageAuthority,
  cryptoImplementation: Crypto = globalThis.crypto,
): SyncLocalStateStore {
  return {
    readDevice(accountId) {
      return authority.runExclusive(async () => {
        const found = await driver.read([SYNC_DEVICE_STORAGE_KEY])
        const value = found[SYNC_DEVICE_STORAGE_KEY]
        return value === undefined ? null : parseSyncDeviceState(value, accountId)
      })
    },
    ensureDevice(accountId, friendlyName) {
      return authority.runExclusive(async () => {
        if (!validAccountId(accountId)) throw new Error('sync_account_invalid')
        if (!validFriendlyName(friendlyName)) throw new Error('sync_device_name_invalid')
        const found = await driver.read([SYNC_DEVICE_STORAGE_KEY])
        if (found[SYNC_DEVICE_STORAGE_KEY] !== undefined) {
          const existing = parseSyncDeviceState(found[SYNC_DEVICE_STORAGE_KEY], accountId)
          if (!existing) throw new Error('sync_device_state_invalid')
          return existing
        }
        const state: SyncDeviceStateV1 = {
          version: 1,
          accountId,
          deviceId: encodeBase64Url(cryptoImplementation.getRandomValues(new Uint8Array(16))),
          friendlyName,
          enabled: false,
          registration: 'unregistered',
        }
        const cleaned = parseSyncDeviceState(state, accountId)
        if (!cleaned) throw new Error('sync_device_state_invalid')
        await driver.write({ [SYNC_DEVICE_STORAGE_KEY]: cleaned })
        return cleaned
      })
    },
    updateDevice(accountId, update) {
      return authority.runExclusive(async () => {
        const found = await driver.read([SYNC_DEVICE_STORAGE_KEY])
        const current = parseSyncDeviceState(found[SYNC_DEVICE_STORAGE_KEY], accountId)
        if (!current) throw new Error('sync_device_state_invalid')
        const next = parseSyncDeviceState(update(immutable(current)), accountId)
        if (!next || next.deviceId !== current.deviceId) throw new Error('sync_device_state_invalid')
        await driver.write({ [SYNC_DEVICE_STORAGE_KEY]: next })
        return next
      })
    },
    readIndex(accountId) {
      return authority.runExclusive(async () => {
        const found = await driver.read([SYNC_INDEX_STORAGE_KEY])
        const value = found[SYNC_INDEX_STORAGE_KEY]
        return value === undefined ? null : parseSyncIndexState(value, accountId)
      })
    },
    updateIndex(accountId, update) {
      return authority.runExclusive(async () => {
        const found = await driver.read([SYNC_INDEX_STORAGE_KEY])
        const stored = found[SYNC_INDEX_STORAGE_KEY]
        const current = stored === undefined ? emptySyncIndex(accountId) : parseSyncIndexState(stored, accountId)
        if (!current) throw new Error('sync_index_invalid')
        const next = parseSyncIndexState(update(immutable(current)), accountId)
        if (!next) throw new Error('sync_index_invalid')
        await driver.write({ [SYNC_INDEX_STORAGE_KEY]: next })
        return next
      })
    },
    readConflictBackups(accountId) {
      return authority.runExclusive(async () => {
        const found = await driver.read([SYNC_CONFLICT_BACKUPS_STORAGE_KEY])
        const value = found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY]
        if (value === undefined) return immutable([] as SyncConflictBackupV1[])
        return parseConflictBackupsState(value, accountId)?.items ?? immutable([] as SyncConflictBackupV1[])
      })
    },
  }
}
