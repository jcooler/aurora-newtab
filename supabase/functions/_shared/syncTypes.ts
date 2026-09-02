import type { SyncKeyring } from './syncKeyring.ts'

export interface SyncAccount {
  accountId: string
}

export type SyncDeviceState = 'active' | 'inactive' | 'revoked'

export interface SyncDeviceSummary {
  deviceId: string
  friendlyName: string
  state: SyncDeviceState
  acknowledgedVaultVersion: number
  lastSeenAt: number
}

export interface SyncSummary {
  vaultVersion: number
  encodedSize: number
  currentDeviceId: string
  devices: SyncDeviceSummary[]
}

export interface StoredWrappedDataKey {
  keyVersion: 1
  wrappedDataKey: string
}

export interface SyncPullRecord {
  entityType: string
  entityId: string
  revision: number
  vaultVersion: number
  tombstone: boolean
  nonce: string
  ciphertext: string
  storedSize: number
}

export interface SyncPullPage {
  records: SyncPullRecord[]
  nextCursor: number | null
  vaultVersion: number
}

export interface AccountDeletionState {
  operationId: string
  accountId: string
  authUserId: string
  state: 'pending_stripe' | 'stripe_canceled' | 'data_deleted' | 'completed'
  subscriptionId: string | null
}

export type SyncRateLimitAction =
  | 'bootstrap'
  | 'pull'
  | 'push'
  | 'rename'
  | 'deactivate'
  | 'revoke'
  | 'delete_vault'
  | 'delete_account'

export interface SyncRepository {
  findAccountForAuthUser(authUserId: string): Promise<SyncAccount | null>
  getEffectiveCapabilities(accountId: string, effectiveAt: number): Promise<readonly string[]>
  registerDevice(input: {
    accountId: string
    deviceId: string
    friendlyName: string
    effectiveAt: number
  }): Promise<SyncSummary>
  getAccountKey(accountId: string, deviceId: string): Promise<StoredWrappedDataKey | null>
  storeAccountKey(input: {
    accountId: string
    keyVersion: 1
    wrappedDataKey: string
    effectiveAt: number
  }): Promise<boolean>
  getSummary(accountId: string, currentDeviceId: string): Promise<SyncSummary>
  deactivateDevice(input: { accountId: string; deviceId: string; effectiveAt: number }): Promise<boolean>
  renameDevice(input: {
    accountId: string
    deviceId: string
    friendlyName: string
    effectiveAt: number
  }): Promise<boolean>
  revokeDevice(input: {
    accountId: string
    currentDeviceId: string
    targetDeviceId: string
    effectiveAt: number
  }): Promise<boolean>
  consumeRateLimit(input: {
    accountId: string
    action: SyncRateLimitAction
    ipFingerprint: string
    effectiveAt: number
  }): Promise<boolean>
  pullRecords(input: {
    accountId: string; deviceId: string; afterVaultVersion: number; cursor: number; limit: number
  }): Promise<SyncPullPage>
  acknowledgePull(input: {
    accountId: string; deviceId: string; vaultVersion: number; effectiveAt: number
  }): Promise<boolean>
  applyMutations(input: {
    accountId: string; deviceId: string; mutations: readonly Record<string, unknown>[]; effectiveAt: number
  }): Promise<readonly Record<string, unknown>[]>
  deleteVault(input: { accountId: string; deviceId: string; effectiveAt: number }): Promise<boolean>
  findDeletionForAuthUser(authUserId: string): Promise<AccountDeletionState | null>
  beginAccountDeletion(input: {
    accountId: string; authUserId: string; effectiveAt: number
  }): Promise<AccountDeletionState>
  markDeletionStripeCanceled(operationId: string, effectiveAt: number): Promise<AccountDeletionState>
  deleteAccountData(operationId: string, effectiveAt: number): Promise<AccountDeletionState>
  completeAccountDeletion(operationId: string, effectiveAt: number): Promise<boolean>
}

export type SyncRequestAuthentication =
  | { ok: true; authUserId: string; authTime: number | null }
  | { ok: false }

export interface SyncFunctionDependencies {
  authenticate(request: Request): Promise<SyncRequestAuthentication>
  repository: SyncRepository
  keyring: SyncKeyring
  now(): number
  randomBytes(length: number): Uint8Array
  requestFingerprint(request: Request): Promise<string>
  cancelSandboxSubscription(subscriptionId: string): Promise<{
    id: string
    livemode: boolean
    status: 'canceled'
  }>
  deleteAuthUser(authUserId: string): Promise<void>
}
