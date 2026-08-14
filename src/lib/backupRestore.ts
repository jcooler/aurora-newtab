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
  'rollback-failed': 'The restore failed, and Aurora could not verify recovery of your previous data. Review your settings before retrying.',
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
 * lifecycle authority is acquired before storage authority, and the atomic
 * finalizer uses only the already-held context release with the supplied
 * restored ownership state.
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
      const replaced = await storage.replaceAllWithRollback(prepared.data, async (previous) => {
        const previousOwned = ownedOriginPatterns({
          connectors: previous.connectors,
          photoPrefs: previous.photoPrefs,
        })
        const candidates = previousOwned.filter((pattern) => !restoredOwned.has(pattern))
        const cleanup = await context.releaseUnownedOrigins(candidates, restoredState)
        return cleanup.pending
      })
      return { ok: true, value: replaced.value, ownerCommitted: true }
    },
    authority,
  )
  return transaction.then((result) => mapTransaction(result, prepared))
}
