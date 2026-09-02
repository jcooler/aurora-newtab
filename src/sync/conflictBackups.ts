import type { StorageAuthority } from '../lib/storage/authority'
import type { StorageDriver } from '../lib/storage/driver'
import { AURORA_DATA_KEYS, defaults, type AuroraData } from '../lib/storage/schema'
import { applySyncEntity, projectSyncEntities } from './entityPolicy'
import {
  SYNC_CONFLICT_BACKUPS_STORAGE_KEY,
  SYNC_INDEX_STORAGE_KEY,
  emptyConflictBackups,
  emptySyncIndex,
  parseConflictBackupsState,
  parseSyncIndexState,
  type SyncConflictBackupV1,
  type SyncConflictBackupsStateV1,
  type SyncIndexStateV1,
} from './localState'
import type { SyncEntityV1, SyncMutationV1 } from './types'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export interface ConflictBackupContext {
  driver: Pick<StorageDriver, 'read' | 'write'>
  authority: StorageAuthority
  crypto?: Crypto
  now?: () => number
}

export type QueuedRestoreMutation = Extract<SyncMutationV1, { kind: 'put' }> & {
  expectedRevision: number
}

interface RemoteWinnerInput {
  accountId: string
  remoteWinner: SyncEntityV1
  remoteRevision: number
  vaultVersion: number
  digest: string
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
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

function entityKey(entity: SyncEntityV1): string {
  return `${entity.entityType}:${entity.entityId}`
}

function dataFrom(found: Record<string, unknown>): AuroraData {
  const fallback = defaults()
  return Object.fromEntries(AURORA_DATA_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(found, key) ? found[key] : fallback[key],
  ])) as unknown as AuroraData
}

function dataPatch(data: AuroraData): AuroraData {
  return Object.fromEntries(AURORA_DATA_KEYS.map((key) => [key, data[key]])) as unknown as AuroraData
}

function validEntityClone(entity: SyncEntityV1): SyncEntityV1 {
  applySyncEntity(defaults(), entity)
  return structuredClone(entity)
}

function stateFrom(
  stored: unknown,
  accountId: string,
): SyncConflictBackupsStateV1 {
  if (stored === undefined) return emptyConflictBackups(accountId)
  const state = parseConflictBackupsState(stored, accountId)
  if (!state) throw new Error('sync_conflict_backup_invalid')
  return state
}

function indexFrom(stored: unknown, accountId: string): SyncIndexStateV1 {
  if (stored === undefined) return emptySyncIndex(accountId)
  const state = parseSyncIndexState(stored, accountId)
  if (!state) throw new Error('sync_index_invalid')
  return state
}

function pruned(items: readonly SyncConflictBackupV1[], now: number): SyncConflictBackupV1[] {
  return items
    .filter((item) => item.createdAt >= now - RETENTION_MS && item.createdAt <= now)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 5)
    .map((item) => structuredClone(item))
}

function newBackup(
  context: ConflictBackupContext,
  entity: SyncEntityV1,
  observedRemoteRevision: number,
  createdAt: number,
): SyncConflictBackupV1 {
  if (!Number.isSafeInteger(observedRemoteRevision) || observedRemoteRevision < 1) {
    throw new Error('sync_conflict_backup_invalid')
  }
  if (!Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > (context.now ?? Date.now)()) {
    throw new Error('sync_conflict_backup_invalid')
  }
  const cryptoImplementation = context.crypto ?? globalThis.crypto
  return {
    id: encodeBase64Url(cryptoImplementation.getRandomValues(new Uint8Array(16))),
    entity: validEntityClone(entity),
    observedRemoteRevision,
    createdAt,
    reason: 'stale_remote_winner',
  }
}

async function writeBackups(
  context: ConflictBackupContext,
  accountId: string,
  change: (state: SyncConflictBackupsStateV1) => SyncConflictBackupsStateV1,
): Promise<SyncConflictBackupsStateV1> {
  return context.authority.runExclusive(async () => {
    const found = await context.driver.read([SYNC_CONFLICT_BACKUPS_STORAGE_KEY])
    const next = change(stateFrom(found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY], accountId))
    const cleaned = parseConflictBackupsState(next, accountId)
    if (!cleaned) throw new Error('sync_conflict_backup_invalid')
    try {
      await context.driver.write({ [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: cleaned })
    } catch {
      throw new Error('sync_conflict_backup_failed')
    }
    return cleaned
  })
}

export async function appendConflictBackup(
  context: ConflictBackupContext,
  accountId: string,
  entity: SyncEntityV1,
  observedRemoteRevision: number,
  createdAt: number = (context.now ?? Date.now)(),
): Promise<SyncConflictBackupV1> {
  const backup = newBackup(context, entity, observedRemoteRevision, createdAt)
  await writeBackups(context, accountId, (state) => ({
    ...state,
    items: pruned([backup, ...state.items], (context.now ?? Date.now)()),
  }))
  return immutable(backup)
}

export async function deleteConflictBackup(
  context: ConflictBackupContext,
  accountId: string,
  backupId: string,
): Promise<void> {
  await writeBackups(context, accountId, (state) => ({
    ...state,
    items: state.items.filter((item) => item.id !== backupId),
  }))
}

export async function pruneConflictBackups(
  context: ConflictBackupContext,
  accountId: string,
): Promise<void> {
  await writeBackups(context, accountId, (state) => ({
    ...state,
    items: pruned(state.items, (context.now ?? Date.now)()),
  }))
}

export async function restoreConflictBackup(
  context: ConflictBackupContext,
  accountId: string,
  backupId: string,
  currentRemoteRevision: number,
): Promise<QueuedRestoreMutation> {
  if (!Number.isSafeInteger(currentRemoteRevision) || currentRemoteRevision < 0) {
    throw new Error('sync_revision_invalid')
  }
  return context.authority.runExclusive(async () => {
    const keys = [...AURORA_DATA_KEYS, SYNC_CONFLICT_BACKUPS_STORAGE_KEY]
    const found = await context.driver.read(keys)
    const state = stateFrom(found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY], accountId)
    const backup = state.items.find((item) => item.id === backupId)
    if (!backup) throw new Error('sync_conflict_backup_not_found')
    const nextData = applySyncEntity(dataFrom(found), backup.entity)
    const nextState = { ...state, items: state.items.filter((item) => item.id !== backupId) }
    try {
      await context.driver.write({
        ...dataPatch(nextData),
        [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: nextState,
      })
    } catch {
      throw new Error('sync_conflict_restore_failed')
    }
    return immutable({
      kind: 'put',
      entity: structuredClone(backup.entity),
      expectedRevision: currentRemoteRevision,
    })
  })
}

export async function applyRemoteWinnerWithConflictBackup(
  context: ConflictBackupContext,
  input: RemoteWinnerInput,
): Promise<{ backup: SyncConflictBackupV1; index: SyncIndexStateV1 }> {
  return context.authority.runExclusive(async () => {
    const keys = [...AURORA_DATA_KEYS, SYNC_CONFLICT_BACKUPS_STORAGE_KEY, SYNC_INDEX_STORAGE_KEY]
    const found = await context.driver.read(keys)
    const currentData = dataFrom(found)
    const remoteWinner = validEntityClone(input.remoteWinner)
    const displaced = projectSyncEntities(currentData).find((candidate) =>
      candidate.entityType === remoteWinner.entityType && candidate.entityId === remoteWinner.entityId)
    if (!displaced) throw new Error('sync_conflict_backup_invalid')

    const now = (context.now ?? Date.now)()
    const backup = newBackup(context, displaced, input.remoteRevision, now)
    const backups = stateFrom(found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY], input.accountId)
    const nextBackups = {
      ...backups,
      items: pruned([backup, ...backups.items], now),
    }
    const index = indexFrom(found[SYNC_INDEX_STORAGE_KEY], input.accountId)
    const nextIndexCandidate: SyncIndexStateV1 = {
      ...index,
      lastVaultVersion: input.vaultVersion,
      entities: {
        ...index.entities,
        [entityKey(remoteWinner)]: { revision: input.remoteRevision, digest: input.digest },
      },
    }
    const nextIndex = parseSyncIndexState(nextIndexCandidate, input.accountId)
    const cleanedBackups = parseConflictBackupsState(nextBackups, input.accountId)
    if (!nextIndex || !cleanedBackups || input.vaultVersion < index.lastVaultVersion) {
      throw new Error('sync_conflict_backup_invalid')
    }
    const nextData = applySyncEntity(currentData, remoteWinner)
    try {
      await context.driver.write({
        ...dataPatch(nextData),
        [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: cleanedBackups,
        [SYNC_INDEX_STORAGE_KEY]: nextIndex,
      })
    } catch {
      throw new Error('sync_conflict_backup_failed')
    }
    return immutable({ backup, index: nextIndex })
  })
}
