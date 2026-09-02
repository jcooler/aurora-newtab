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
}
