import { parseConflictBackupsState, type SyncConflictBackupV1 } from './localState'
import type { SyncEntityV1 } from './types'

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const RECOVERY_EXPORT_ERROR = 'sync_conflict_export_invalid'

export interface SyncConflictRecoveryExportV1 {
  readonly app: 'tab-two'
  readonly kind: 'sync-conflict-recovery'
  readonly version: 1
  readonly exportedAt: string
  readonly accountId: string
  readonly recovery: {
    readonly id: string
    readonly entity: SyncEntityV1
    readonly observedRemoteRevision: number
    readonly createdAt: string
    readonly reason: 'stale_remote_winner'
  }
}

function timestamp(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(RECOVERY_EXPORT_ERROR)
  try {
    return new Date(value).toISOString()
  } catch {
    throw new Error(RECOVERY_EXPORT_ERROR)
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

export function createConflictRecoveryExportV1(
  accountId: string,
  recovery: SyncConflictBackupV1,
  exportedAt: number,
): SyncConflictRecoveryExportV1 {
  if (!ACCOUNT_UUID.test(accountId)) throw new Error(RECOVERY_EXPORT_ERROR)
  const parsed = parseConflictBackupsState({
    version: 1,
    accountId,
    items: [recovery],
  }, accountId)
  const accepted = parsed?.items[0]
  if (!accepted) throw new Error(RECOVERY_EXPORT_ERROR)
  return immutable({
    app: 'tab-two',
    kind: 'sync-conflict-recovery',
    version: 1,
    exportedAt: timestamp(exportedAt),
    accountId,
    recovery: {
      id: accepted.id,
      entity: accepted.entity,
      observedRemoteRevision: accepted.observedRemoteRevision,
      createdAt: timestamp(accepted.createdAt),
      reason: accepted.reason,
    },
  })
}

export function serializeConflictRecoveryExport(value: SyncConflictRecoveryExportV1): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function conflictRecoveryFilename(
  recovery: Pick<SyncConflictBackupV1, 'entity'>,
  exportedAt: number,
): string {
  const entity = recovery.entity.entityType.replace(/[^a-z0-9_-]/giu, '-').toLowerCase()
  const exported = timestamp(exportedAt)
  const compactTime = `${exported.slice(0, 10)}T${exported.slice(11, 19).replace(/:/gu, '')}Z`
  return `tab-two-recovery-${entity}-${compactTime}.json`
}
