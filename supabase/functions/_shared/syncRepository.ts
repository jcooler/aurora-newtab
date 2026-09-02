import type {
  AccountDeletionState,
  StoredWrappedDataKey,
  SyncRepository,
  SyncSummary,
} from './syncTypes.ts'

export interface SyncRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function oneRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
}

function repositoryError(error: unknown): never {
  const message = error && typeof error === 'object' ? Reflect.get(error, 'message') : null
  if (message === 'sync_device_limit') throw new Error('sync_device_limit')
  throw new Error('sync_repository_unavailable')
}

async function call(
  client: SyncRpcClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters)
  if (error) repositoryError(error)
  return data
}

function effectiveAt(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('sync_repository_input_invalid')
  return new Date(value).toISOString()
}

export function createSyncRepository(client: SyncRpcClient): SyncRepository {
  const deletionState = (value: unknown): AccountDeletionState => {
    const row = oneRow(value)
    if (!row
      || Object.keys(row).sort().join(',') !== 'accountId,authUserId,operationId,state,subscriptionId'
      || typeof row.operationId !== 'string' || !UUID.test(row.operationId)
      || typeof row.accountId !== 'string' || !UUID.test(row.accountId)
      || typeof row.authUserId !== 'string' || !UUID.test(row.authUserId)
      || !['pending_stripe', 'stripe_canceled', 'data_deleted', 'completed'].includes(row.state as string)
      || !(row.subscriptionId === null
        || (typeof row.subscriptionId === 'string' && /^sub_[A-Za-z0-9_]+$/u.test(row.subscriptionId)))) {
      throw new Error('sync_repository_unavailable')
    }
    return {
      operationId: row.operationId,
      accountId: row.accountId,
      authUserId: row.authUserId,
      state: row.state as AccountDeletionState['state'],
      subscriptionId: row.subscriptionId as string | null,
    }
  }
  const getSummary = async (accountId: string, currentDeviceId: string): Promise<SyncSummary> => {
    const value = await call(client, 'tab_two_sync_summary', {
      target_account_id: accountId,
      current_device_id: currentDeviceId,
    })
    const row = oneRow(value)
    if (!row) throw new Error('sync_repository_unavailable')
    return row as unknown as SyncSummary
  }

  return {
    async findAccountForAuthUser(authUserId) {
      const row = oneRow(await call(client, 'tab_two_account_snapshot_for_auth', {
        target_auth_user_id: authUserId,
      }))
      return row ? { accountId: row.account_id as string } : null
    },
    async getEffectiveCapabilities(accountId, at) {
      const row = oneRow(await call(client, 'tab_two_effective_entitlement_for_account', {
        target_account_id: accountId,
        effective_at: effectiveAt(at),
      }))
      return row ? row.capabilities as string[] : []
    },
    async registerDevice(input) {
      await call(client, 'tab_two_sync_register_device', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        target_friendly_name: input.friendlyName,
        effective_at: effectiveAt(input.effectiveAt),
      })
      return getSummary(input.accountId, input.deviceId)
    },
    async getAccountKey(accountId, deviceId) {
      const row = oneRow(await call(client, 'tab_two_sync_account_key', {
        target_account_id: accountId,
        target_device_id: deviceId,
      }))
      if (!row) return null
      return {
        keyVersion: row.key_version as StoredWrappedDataKey['keyVersion'],
        wrappedDataKey: row.wrapped_dek as string,
      }
    },
    async storeAccountKey(input) {
      return await call(client, 'tab_two_sync_store_account_key', {
        target_account_id: input.accountId,
        target_key_version: input.keyVersion,
        target_wrapped_dek: input.wrappedDataKey,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    getSummary,
    async deactivateDevice(input) {
      return await call(client, 'tab_two_sync_deactivate_device', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async renameDevice(input) {
      return await call(client, 'tab_two_sync_rename_device', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        target_friendly_name: input.friendlyName,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async revokeDevice(input) {
      return await call(client, 'tab_two_sync_revoke_device', {
        target_account_id: input.accountId,
        current_device_id: input.currentDeviceId,
        target_device_id: input.targetDeviceId,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async consumeRateLimit(input) {
      return await call(client, 'tab_two_consume_sync_rate_limit', {
        target_account_id: input.accountId,
        target_action: input.action,
        target_ip_fingerprint: input.ipFingerprint,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async pullRecords(input) {
      const rowsValue = await call(client, 'tab_two_sync_pull_records', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        after_vault_version: input.afterVaultVersion,
        cursor_vault_version: input.cursor,
        page_limit: input.limit,
      })
      const rows = Array.isArray(rowsValue) ? rowsValue as Record<string, unknown>[] : []
      const records = rows.map((row) => ({
        entityType: row.entity_type as string,
        entityId: row.entity_id as string,
        revision: Number(row.revision),
        vaultVersion: Number(row.vault_version),
        tombstone: row.tombstone as boolean,
        nonce: row.nonce as string,
        ciphertext: row.ciphertext as string,
        storedSize: Number(row.stored_size),
      }))
      const summary = await getSummary(input.accountId, input.deviceId)
      const last = records.at(-1)?.vaultVersion ?? null
      return {
        records,
        nextCursor: last !== null && last < summary.vaultVersion ? last : null,
        vaultVersion: summary.vaultVersion,
      }
    },
    async acknowledgePull(input) {
      return await call(client, 'tab_two_sync_acknowledge_pull', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        acknowledged_version: input.vaultVersion,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async applyMutations(input) {
      const value = await call(client, 'tab_two_sync_apply_mutations', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        mutations: input.mutations,
        effective_at: effectiveAt(input.effectiveAt),
      })
      if (!Array.isArray(value)) throw new Error('sync_repository_unavailable')
      return value as Record<string, unknown>[]
    },
    async deleteVault(input) {
      await getSummary(input.accountId, input.deviceId)
      return await call(client, 'tab_two_sync_delete_vault', {
        target_account_id: input.accountId,
        target_device_id: input.deviceId,
        confirmation: 'operator-confirmed',
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async findDeletionForAuthUser(authUserId) {
      const value = await call(client, 'tab_two_account_deletion_for_auth', {
        target_auth_user_id: authUserId,
      })
      return value === null || (Array.isArray(value) && value.length === 0) ? null : deletionState(value)
    },
    async beginAccountDeletion(input) {
      return deletionState(await call(client, 'tab_two_begin_account_deletion', {
        target_account_id: input.accountId,
        target_auth_user_id: input.authUserId,
        effective_at: effectiveAt(input.effectiveAt),
      }))
    },
    async markDeletionStripeCanceled(operationId, at) {
      return deletionState(await call(client, 'tab_two_mark_deletion_stripe_canceled', {
        target_operation_id: operationId,
        effective_at: effectiveAt(at),
      }))
    },
    async deleteAccountData(operationId, at) {
      return deletionState(await call(client, 'tab_two_delete_account_data', {
        target_operation_id: operationId,
        effective_at: effectiveAt(at),
      }))
    },
    async completeAccountDeletion(operationId, at) {
      return await call(client, 'tab_two_complete_account_deletion', {
        target_operation_id: operationId,
        effective_at: effectiveAt(at),
      }) === true
    },
  }
}
