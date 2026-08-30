import type { PrepareBackupResult } from './backup'
import { AtomicRestoreRollbackError, type AuroraStorage } from './storage'
import { ownedOriginPatterns, type OriginOwnershipState } from '../services/originOwnership'
import {
  runOriginTransaction,
  type OriginPermissionAuthority,
  type OriginTransactionResult,
} from '../services/permissionTransactions'
import type { ConnectorId } from '../services/connectors/types'

export type PreparedBackup = Extract<PrepareBackupResult, { ok: true }>

type RestoreFailureStatus =
  | 'permission-unavailable'
  | 'denied'
  | 'access-lost'
  | 'failed'
  | 'rollback-failed'

export type RestoreBackupResult =
  | {
      status: 'committed'
      pendingCleanup: string[]
      reentryRequired: ConnectorId[]
    }
  | {
      status: RestoreFailureStatus
      pendingCleanup: string[]
      message: string
    }

const FAILURE_COPY: Record<RestoreFailureStatus, string> = {
  'permission-unavailable': 'Chrome site access is unavailable right now. You can retry the restore.',
  denied: 'Chrome did not grant the site access needed for this restore. You can retry.',
  'access-lost': 'Chrome site access changed before the restore could finish. Your current data was left unchanged. You can retry.',
  failed: 'That backup could not be restored. Your current data was left unchanged. You can retry.',
  'rollback-failed': 'The restore failed, and Tab Two could not verify recovery of your previous data. Review your settings before retrying.',
}

function failure(
  status: RestoreFailureStatus,
  pendingCleanup: readonly string[] = [],
): RestoreBackupResult {
  return { status, pendingCleanup: [...pendingCleanup], message: FAILURE_COPY[status] }
}

function ownershipState(prepared: PreparedBackup): OriginOwnershipState {
  return {
    connectors: prepared.data.connectors,
    photoPrefs: prepared.data.photoPrefs,
  }
}

function mapTransaction(
  transaction: OriginTransactionResult<string[]>,
  prepared: PreparedBackup,
): RestoreBackupResult {
  switch (transaction.status) {
    case 'committed':
      return {
        status: 'committed',
        pendingCleanup: [...transaction.value],
        reentryRequired: [...prepared.redactions.reentryRequired],
      }
    case 'permission-unavailable':
      return failure('permission-unavailable')
    case 'denied':
      return failure('denied')
    case 'access-lost':
      return failure('access-lost', transaction.pendingCleanup)
    case 'aborted':
      return failure('failed', transaction.pendingCleanup)
    case 'failed':
      return failure(
        transaction.error instanceof AtomicRestoreRollbackError ? 'rollback-failed' : 'failed',
        transaction.pendingCleanup,
      )
  }
}

/**
 * Begins the gesture-sensitive origin transaction synchronously. The
 * lifecycle authority is acquired before storage authority. Irreversible
 * permission release runs only after the rollbackable storage replacement
 * has committed, using the already-held lifecycle context.
 */
export function restorePreparedBackup(
  storage: AuroraStorage,
  prepared: PreparedBackup,
  authority?: OriginPermissionAuthority,
): Promise<RestoreBackupResult> {
  const restoredState = ownershipState(prepared)
  const restoredOwned = new Set(ownedOriginPatterns(restoredState))
  const transaction = runOriginTransaction(
    storage,
    prepared.requiredOrigins,
    async (context) => {
      const replaced = await storage.replaceAllWithRollback(prepared.data, async () => undefined)
      const previousOwned = ownedOriginPatterns({
        connectors: replaced.previous.connectors,
        photoPrefs: replaced.previous.photoPrefs,
      })
      const candidates = previousOwned.filter((pattern) => !restoredOwned.has(pattern))
      let pendingCleanup = [...candidates]
      try {
        const cleanup = await context.releaseUnownedOrigins(candidates, restoredState)
        pendingCleanup = cleanup.pending
      } catch {
        // Storage is already committed. Conservatively retain every canonical
        // candidate for the durable Settings retry instead of rolling back.
      }
      return { ok: true, value: pendingCleanup, ownerCommitted: true }
    },
    authority,
  )
  return transaction.then((result) => mapTransaction(result, prepared))
}
