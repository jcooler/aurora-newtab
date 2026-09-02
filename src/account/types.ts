export type PremiumCapability =
  | 'encrypted_sync'
  | 'multi_account'
  | 'metrics_history'
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'strava'

export type GrantSource = 'stripe' | 'complimentary_owner' | 'preview_fixture'
export type SignedGrantSource = Exclude<GrantSource, 'preview_fixture'>

export interface LeasePayloadV1 {
  version: 1
  leaseId: string
  accountId: string
  capabilities: readonly PremiumCapability[]
  grantSources: readonly SignedGrantSource[]
  issuedAt: number
  expiresAt: number
}

export interface SignedEntitlementLeaseV1 {
  algorithm: 'Ed25519'
  keyId: string
  payload: string
  signature: string
}

import type {
  BillingActionOutcome,
  BillingPlan,
  BillingRefreshOutcome,
  BillingSummary,
} from './billing'

export type SyncPhase =
  | 'disabled'
  | 'syncing'
  | 'up_to_date'
  | 'offline'
  | 'needs_attention'

export interface VerifiedEntitlementLease {
  verification: 'verified'
  leaseVersion: 1
  keyId: string
  accountId: string
  capabilities: readonly PremiumCapability[]
  grantSources: readonly GrantSource[]
  issuedAt: number
  expiresAt: number
  leaseId: string
}

export interface AccountSnapshot {
  mode: 'local' | 'signed_in'
  accountId: string | null
  email: string | null
  displayName: string | null
  billing: BillingSummary
  lease: VerifiedEntitlementLease | null
  sync: {
    enabled: boolean
    phase: SyncPhase
    lastSuccessAt: number | null
    usedBytes: number
    quotaBytes: 2_097_152
  }
  devices: readonly {
    id: string
    name: string
    lastSyncAt: number | null
    current: boolean
    revoked: boolean
  }[]
}

export type SyncActionOutcome =
  | { status: 'completed' }
  | {
      status:
        | 'authentication_required'
        | 'entitlement_required'
        | 'device_limit'
        | 'offline'
        | 'needs_attention'
    }

export interface AccountActions {
  beginSignIn(): Promise<
    { ok: true } | { ok: false; code: 'not_configured' | 'cancelled' | 'failed' }
  >
  signOut(): Promise<void>
  enableSync(friendlyName?: string): Promise<SyncActionOutcome>
  disableSync(): Promise<SyncActionOutcome>
  syncNow(): Promise<SyncActionOutcome>
  renameDevice(deviceId: string, friendlyName: string): Promise<SyncActionOutcome>
  revokeDevice(deviceId: string): Promise<SyncActionOutcome>
  restoreConflictBackup(backupId: string): Promise<SyncActionOutcome>
  discardConflictBackup(backupId: string): Promise<SyncActionOutcome>
  openPlans(plan: BillingPlan): Promise<BillingActionOutcome>
  openBilling(): Promise<BillingActionOutcome>
  refreshBilling(): Promise<BillingRefreshOutcome>
  deleteVault(): Promise<SyncActionOutcome>
  deleteAccount(): Promise<SyncActionOutcome>
}
