import type { SyncKeyring } from './syncKeyring.ts'
import type { SyncRequestAuthentication } from './syncTypes.ts'

export type AccountExportAuditOutcome = 'success' | 'rate_limited' | 'data_unavailable'

export interface AccountExportRecord {
  envelopeVersion: 1
  accountId: string
  entityType: string
  entityId: string
  revision: number
  vaultVersion: number
  tombstone: boolean
  nonce: string
  ciphertext: string
}

export interface AccountExportServiceSnapshot {
  account: {
    accountId: string
    email: string
    displayName: string | null
    createdAt: number
    identityCreatedAt: number
    identityUpdatedAt: number
  }
  connectedAccounts: Array<{
    connectionId: string
    provider: 'google_calendar' | 'microsoft_calendar'
    accountKind: 'personal' | 'work_or_school' | null
    email: string
    displayName: string | null
    status: 'active' | 'reconnect_required'
    grantedScopes: string[]
    createdAt: number
    updatedAt: number
  }>
  subscription: {
    state: 'none' | 'active' | 'past_due' | 'canceling' | 'expired' | 'complimentary'
    plan: 'monthly' | 'annual' | 'intro_annual' | null
    currentPeriodStart: number | null
    currentPeriodEnd: number | null
    courtesyEnd: number | null
    cancelAtPeriodEnd: boolean
    createdAt: number | null
    updatedAt: number | null
  }
  entitlement: {
    capabilities: string[]
    grantSources: string[]
    expiresAt: number | null
  }
  devices: Array<{
    deviceId: string
    friendlyName: string
    state: 'active' | 'inactive' | 'revoked'
    lastSeenAt: number
    createdAt: number
    updatedAt: number
    revokedAt: number | null
  }>
  vault: {
    status: 'not_created' | 'empty' | 'available'
    vaultVersion: number
    storedBytes: number
    wrappedDataKey: string | null
    records: AccountExportRecord[]
  }
}

export interface AccountExportRepository {
  findAccountForAuthUser(authUserId: string): Promise<{ accountId: string } | null>
  consumeRateLimit(input: {
    accountId: string
    action: 'export_account'
    ipFingerprint: string
    effectiveAt: number
  }): Promise<boolean>
  getSnapshot(accountId: string, effectiveAt: number): Promise<AccountExportServiceSnapshot | null>
  recordAudit(input: {
    accountId: string
    outcome: AccountExportAuditOutcome
    recordCount: number
    byteCount: number
    occurredAt: number
  }): Promise<void>
}

export interface AccountExportDependencies {
  authenticate(request: Request): Promise<SyncRequestAuthentication>
  repository: AccountExportRepository
  keyring: SyncKeyring
  now(): number
  requestFingerprint(request: Request): Promise<string>
}
