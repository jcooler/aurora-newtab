export type PremiumCapability =
  | 'encrypted_sync'
  | 'multi_account'
  | 'metrics_history'
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'strava'

export type GrantSource = 'stripe' | 'complimentary_owner' | 'preview_fixture'

export type SubscriptionState =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceling'
  | 'expired'
  | 'complimentary'

export type SyncPhase =
  | 'disabled'
  | 'syncing'
  | 'up_to_date'
  | 'offline'
  | 'needs_attention'

export interface VerifiedEntitlementLease {
  verification: 'verified'
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
  subscription: SubscriptionState
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

export interface AccountActions {
  beginSignIn(): Promise<
    { ok: true } | { ok: false; code: 'not_configured' | 'cancelled' | 'failed' }
  >
  signOut(): Promise<void>
  enableSync(): Promise<void>
  disableSync(): Promise<void>
  syncNow(): Promise<void>
  revokeDevice(deviceId: string): Promise<void>
  openPlans(): Promise<void>
  openBilling(): Promise<void>
  deleteVault(): Promise<void>
  deleteAccount(): Promise<void>
}
