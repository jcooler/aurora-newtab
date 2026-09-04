import type { AccountClient } from './client'
import { localBillingSummary } from './billing'
import type { BillingPlan } from './billing'
import type { AccountActions, AccountSnapshot } from './types'

export const localAccountSnapshot: AccountSnapshot = Object.freeze({
  mode: 'local',
  accountId: null,
  email: null,
  displayName: null,
  billing: localBillingSummary,
  lease: null,
  sync: Object.freeze({
    enabled: false,
    phase: 'disabled',
    lastSuccessAt: null,
    usedBytes: 0,
    quotaBytes: 2_097_152 as const,
  }),
  devices: Object.freeze([]),
})

async function noOp(): Promise<void> {}
async function unavailableSync() { return { status: 'authentication_required' as const } }

const localActions: AccountActions = Object.freeze({
  async beginSignIn() {
    return { ok: false as const, code: 'not_configured' as const }
  },
  signOut: noOp,
  enableSync: unavailableSync,
  disableSync: unavailableSync,
  syncNow: unavailableSync,
  renameDevice: unavailableSync,
  revokeDevice: unavailableSync,
  restoreConflictBackup: unavailableSync,
  discardConflictBackup: unavailableSync,
  async openPlans(_plan: BillingPlan) { return { status: 'not_configured' as const } },
  async openBilling() { return { status: 'not_configured' as const } },
  async refreshBilling() { return { status: 'authentication_required' as const } },
  async prepareAccountDataExport() { return { status: 'data_unavailable' as const } },
  deleteVault: unavailableSync,
  deleteAccount: unavailableSync,
})

export const localAccountClient: AccountClient = Object.freeze({
  accountDataExportEnabled: false,
  async getSnapshot() {
    return localAccountSnapshot
  },
  subscribe() {
    return () => {}
  },
  actions: localActions,
  syncGateway: null,
  providerGateways: Object.freeze({}),
})
