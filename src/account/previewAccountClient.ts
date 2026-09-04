import type { AccountClient } from './client'
import { createPreviewProviderGateway } from '../providers/gateway'
import { createPreviewMicrosoftCalendarGateway } from '../providers/microsoftGateway'
import { createBillingSummary } from './billing'
import type { BillingPlan } from './billing'
import type { AccountActions, AccountSnapshot, PremiumCapability } from './types'
import type { AccountDataExportSourceV1 } from './dataExport'
import { localAccountSnapshot } from './localAccountClient'
import { generateDataKey } from '../sync/crypto'
import type { SyncGateway, SyncGatewaySummary } from '../sync/gateway'

export const TAB_TWO_PREVIEW_ACCOUNT_FIXTURE = 'TAB_TWO_PREVIEW_ACCOUNT_FIXTURE'
const PREVIEW_ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'

export type PreviewAccountState =
  | 'local'
  | 'signed-in'
  | 'active'
  | 'past-due'
  | 'device-limit'
  | 'syncing'
  | 'offline'
  | 'needs-attention'
  | 'recovery'

const capabilities: readonly PremiumCapability[] = [
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
]

const previewDevices = Object.freeze([
  { id: 'preview-device-1', name: 'Studio PC', lastSyncAt: 1_777_500_000_000, current: true, revoked: false },
  { id: 'preview-device-2', name: 'Travel Chromebook', lastSyncAt: 1_777_413_600_000, current: false, revoked: false },
  { id: 'preview-device-3', name: 'Office profile', lastSyncAt: 1_777_240_800_000, current: false, revoked: false },
  { id: 'preview-device-4', name: 'Kitchen display', lastSyncAt: 1_776_290_400_000, current: false, revoked: false },
  { id: 'preview-device-5', name: 'Old browser profile', lastSyncAt: 1_774_908_800_000, current: false, revoked: false },
])

function signedSnapshot(
  state: PreviewAccountState,
  overrides: Partial<AccountSnapshot> = {},
): AccountSnapshot {
  const active = state !== 'signed-in'
  return Object.freeze({
    mode: 'signed_in' as const,
    accountId: PREVIEW_ACCOUNT_ID,
    email: 'alex@example.com',
    displayName: 'Alex Morgan',
    billing: createBillingSummary({
      state: state === 'past-due' ? 'past_due' : active ? 'active' : 'none',
      plan: active ? 'monthly' : null,
      currentPeriodEnd: active ? 1_809_216_000_000 : null,
      courtesyEnd: state === 'past-due' ? 1_809_820_800_000 : null,
      cancelAtPeriodEnd: false,
      introductoryEligible: !active,
    }),
    lease: active
      ? Object.freeze({
          verification: 'verified' as const,
          leaseVersion: 1 as const,
          keyId: 'preview-fixture',
          accountId: PREVIEW_ACCOUNT_ID,
          capabilities,
          grantSources: Object.freeze(['preview_fixture'] as const),
          issuedAt: 1_700_000_000_000,
          expiresAt: 4_000_000_000_000,
          leaseId: 'preview-lease-1',
        })
      : null,
    sync: Object.freeze({
      enabled: false,
      phase: 'disabled' as const,
      lastSuccessAt: null,
      usedBytes: 0,
      quotaBytes: 2_097_152 as const,
    }),
    devices: Object.freeze(previewDevices.slice(0, 1)),
    ...overrides,
  })
}

function snapshotFor(state: PreviewAccountState): AccountSnapshot {
  switch (state) {
    case 'local':
      return localAccountSnapshot
    case 'signed-in':
    case 'active':
    case 'past-due':
      return signedSnapshot(state)
    case 'device-limit':
      return signedSnapshot(state, {
        sync: Object.freeze({ enabled: false, phase: 'needs_attention', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 as const }),
        devices: previewDevices,
      })
    case 'syncing':
      return signedSnapshot(state, {
        sync: Object.freeze({ enabled: true, phase: 'syncing', lastSuccessAt: 1_777_500_000_000, usedBytes: 421_888, quotaBytes: 2_097_152 as const }),
        devices: Object.freeze(previewDevices.slice(0, 2)),
      })
    case 'offline':
      return signedSnapshot(state, {
        sync: Object.freeze({ enabled: true, phase: 'offline', lastSuccessAt: 1_777_413_600_000, usedBytes: 421_888, quotaBytes: 2_097_152 as const }),
        devices: Object.freeze(previewDevices.slice(0, 2)),
      })
    case 'needs-attention':
      return signedSnapshot(state, {
        sync: Object.freeze({ enabled: true, phase: 'needs_attention', lastSuccessAt: 1_777_413_600_000, usedBytes: 421_888, quotaBytes: 2_097_152 as const }),
        devices: Object.freeze(previewDevices.slice(0, 2)),
      })
    case 'recovery':
      return signedSnapshot(state)
  }
}

const previewStates = new Set<PreviewAccountState>([
  'local',
  'signed-in',
  'active',
  'past-due',
  'device-limit',
  'syncing',
  'offline',
  'needs-attention',
  'recovery',
])

function requestedState(): PreviewAccountState {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get('accountState')
  return value && previewStates.has(value as PreviewAccountState)
    ? value as PreviewAccountState
    : 'local'
}

async function noOp(): Promise<void> {}
async function completedSync() { return { status: 'completed' as const } }

function previewSyncSummary(deviceId: string, friendlyName = 'Desktop'): SyncGatewaySummary {
  return {
    vaultVersion: 0,
    usedBytes: 0,
    currentDeviceId: deviceId,
    devices: [{ id: deviceId, name: friendlyName, lastSyncAt: 1_778_000_000_000, current: true, revoked: false }],
  }
}

function createPreviewSyncGateway(): SyncGateway {
  let currentDeviceId: string = previewExportDeviceIds[0]
  let currentDeviceName = 'Desktop'
  const summary = () => previewSyncSummary(currentDeviceId, currentDeviceName)
  return {
    async bootstrap(input) {
      currentDeviceId = input.deviceId
      currentDeviceName = input.friendlyName
      return { ok: true, value: { dataKey: await generateDataKey(), summary: summary() } }
    },
    async pull() { return { ok: true, value: { records: [], nextCursor: null, vaultVersion: 0 } } },
    async push(input) {
      return { ok: true, value: input.mutations.map((mutation, index) => ({
        status: 'accepted' as const,
        entityType: mutation.record.entityType,
        entityId: mutation.record.entityId,
        revision: mutation.record.revision,
        vaultVersion: index + 1,
      })) }
    },
    async deactivateDevice() { return { ok: true, value: summary() } },
    async renameDevice(input) {
      currentDeviceName = input.friendlyName
      return { ok: true, value: summary() }
    },
    async revokeDevice() { return { ok: true, value: summary() } },
    async deleteVault() { return { ok: true, value: undefined } },
    async deleteAccount() { return { ok: true, value: undefined } },
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const previewExportDeviceIds = [
  'AAECAwQFBgcICQoLDA0ODw',
  'AQEBAQEBAQEBAQEBAQEBAQ',
  'AgICAgICAgICAgICAgICAg',
  'AwMDAwMDAwMDAwMDAwMDAw',
  'BAQEBAQEBAQEBAQEBAQEBA',
] as const

function previewAccountData(snapshot: AccountSnapshot): AccountDataExportSourceV1 | null {
  if (snapshot.mode !== 'signed_in' || snapshot.accountId === null || snapshot.email === null) return null
  return deepFreeze({
    account: {
      accountId: snapshot.accountId,
      email: snapshot.email,
      displayName: snapshot.displayName,
      createdAt: 1_700_000_000_000,
      identityCreatedAt: 1_700_000_001_000,
      identityUpdatedAt: 1_777_500_000_000,
    },
    connectedAccounts: [],
    subscription: {
      state: snapshot.billing.state,
      plan: snapshot.billing.plan,
      currentPeriodStart: null,
      currentPeriodEnd: snapshot.billing.currentPeriodEnd,
      courtesyEnd: snapshot.billing.courtesyEnd,
      cancelAtPeriodEnd: snapshot.billing.cancelAtPeriodEnd,
      createdAt: null,
      updatedAt: null,
    },
    entitlement: {
      capabilities: [...(snapshot.lease?.capabilities ?? [])],
      grantSources: ['complimentary_owner'],
      expiresAt: snapshot.lease?.expiresAt ?? null,
    },
    devices: snapshot.devices.map((device, index) => ({
      deviceId: previewExportDeviceIds[index] ?? previewExportDeviceIds[0],
      friendlyName: device.name,
      state: device.revoked ? 'revoked' as const : 'active' as const,
      lastSeenAt: device.lastSyncAt ?? 1_777_500_000_000,
      createdAt: (device.lastSyncAt ?? 1_777_500_000_000) - 86_400_000,
      updatedAt: device.lastSyncAt ?? 1_777_500_000_000,
      revokedAt: device.revoked ? device.lastSyncAt : null,
    })),
    syncedData: {
      status: 'empty',
      vaultVersion: 0,
      storedBytes: 0,
      records: [],
    },
  })
}

function createPreviewActions(snapshot: AccountSnapshot): AccountActions {
  return Object.freeze({
  async beginSignIn() { return { ok: true as const } },
  signOut: noOp,
  enableSync: completedSync,
  disableSync: completedSync,
  syncNow: completedSync,
  renameDevice: completedSync,
  revokeDevice: completedSync,
  restoreConflictBackup: completedSync,
  discardConflictBackup: completedSync,
  async openPlans(plan: BillingPlan) {
    globalThis.open(
      `https://checkout.stripe.com/c/pay/tab-two-preview-${plan.replace('_', '-')}`,
      '_blank',
      'noopener',
    )
    return { status: 'opened' as const }
  },
  async openBilling() {
    globalThis.open('https://billing.stripe.com/p/session/tab-two-preview', '_blank', 'noopener')
    return { status: 'opened' as const }
  },
  async refreshBilling() { return { status: 'refreshed' as const } },
  async prepareAccountDataExport() {
    const fixtureState = new URLSearchParams(globalThis.location?.search ?? '').get('accountExportState')
    if (fixtureState === 'preparing') {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500))
    }
    if (fixtureState === 'failure') return { status: 'data_unavailable' as const }
    const value = previewAccountData(snapshot)
    return value
      ? { status: 'ready' as const, value }
      : { status: 'authentication_required' as const }
  },
  deleteVault: completedSync,
  deleteAccount: completedSync,
  })
}

export function createPreviewAccountClient(): AccountClient {
  const state = requestedState()
  const snapshot = snapshotFor(state)
  const providerGateway = createPreviewProviderGateway('two-account', Date.UTC(2026, 8, 3, 15, 0, 0))
  const microsoftProviderGateway = createPreviewMicrosoftCalendarGateway(
    'two-account', Date.UTC(2026, 8, 3, 15, 0, 0),
  )
  return Object.freeze({
    accountDataExportEnabled: true,
    async getSnapshot() { return snapshot },
    subscribe() { return () => {} },
    actions: createPreviewActions(snapshot),
    syncGateway: state === 'recovery' ? createPreviewSyncGateway() : null,
    providerGateways: Object.freeze({
      google_calendar: providerGateway,
      microsoft_calendar: microsoftProviderGateway,
    }),
  })
}
