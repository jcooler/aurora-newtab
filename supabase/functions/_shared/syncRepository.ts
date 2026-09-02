import type {
  StoredWrappedDataKey,
  SyncRepository,
  SyncSummary,
} from './syncTypes.ts'

export interface SyncRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

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
  }
}
