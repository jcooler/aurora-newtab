import type { AccountClient } from './client'
import type { AccountActions, AccountSnapshot } from './types'

export const localAccountSnapshot: AccountSnapshot = Object.freeze({
  mode: 'local',
  accountId: null,
  email: null,
  displayName: null,
  subscription: 'none',
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

const localActions: AccountActions = Object.freeze({
  async beginSignIn() {
    return { ok: false as const, code: 'not_configured' as const }
  },
  signOut: noOp,
  enableSync: noOp,
  disableSync: noOp,
  syncNow: noOp,
  async revokeDevice(_deviceId: string) {},
  openPlans: noOp,
  openBilling: noOp,
  deleteVault: noOp,
  deleteAccount: noOp,
})

export const localAccountClient: AccountClient = Object.freeze({
  async getSnapshot() {
    return localAccountSnapshot
  },
  subscribe() {
    return () => {}
  },
  actions: localActions,
})
