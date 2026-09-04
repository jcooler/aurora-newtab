import type { BillingPlan, BillingState } from '../account/billing'
import type { AccountSnapshot, SyncPhase } from '../account/types'
import type { SyncAttention, SyncViewState } from '../sync/SyncProvider'

const PRODUCT = 'Tab Two' as const
const SCHEMA_VERSION = 1 as const
const APP_VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/u
const MAX_TIMESTAMP = 8_640_000_000_000_000
const MAX_DEVICES = 5
const MAX_RECOVERIES = 5

const ACCOUNT_MODES = new Set<AccountSnapshot['mode']>(['local', 'signed_in'])
const BILLING_STATES = new Set<BillingState>([
  'none', 'active', 'past_due', 'canceling', 'expired', 'complimentary',
])
const BILLING_PLANS = new Set<BillingPlan>(['monthly', 'annual', 'intro_annual'])
const SYNC_PHASES = new Set<SyncPhase>([
  'disabled', 'syncing', 'up_to_date', 'offline', 'needs_attention',
])
const SYNC_ATTENTION = new Set<SyncAttention>([
  'authentication_required',
  'entitlement_required',
  'device_limit',
  'offline',
  'needs_attention',
  'coordinator_elsewhere',
])

export interface DiagnosticInput {
  now: number
  appVersion: string
  account: AccountSnapshot
  sync: SyncViewState
}

export interface DiagnosticReportV1 {
  readonly product: typeof PRODUCT
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly generatedAt: string
  readonly appVersion: string
  readonly account: Readonly<{
    mode: AccountSnapshot['mode']
    billingState: BillingState
    plan: BillingPlan | null
    leasePresent: boolean
  }>
  readonly sync: Readonly<{
    enabled: boolean
    phase: SyncPhase
    attention: SyncAttention | null
    usedBytes: number
    quotaBytes: 2_097_152
    activeDeviceCount: number
    revokedDeviceCount: number
    recoveryCount: number
    lastSuccessAt: string | null
  }>
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP
}

function iso(value: number): string {
  if (!validTimestamp(value)) throw new Error('diagnostic_input_invalid')
  return new Date(value).toISOString()
}

function validCount(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export function createDiagnosticReport(input: DiagnosticInput): DiagnosticReportV1 {
  const { account, sync } = input
  const activeDeviceCount = sync.devices.filter((device) => !device.revoked).length
  const revokedDeviceCount = sync.devices.filter((device) => device.revoked).length

  if (!APP_VERSION.test(input.appVersion)
    || !ACCOUNT_MODES.has(account.mode)
    || !BILLING_STATES.has(account.billing.state)
    || (account.billing.plan !== null && !BILLING_PLANS.has(account.billing.plan))
    || !SYNC_PHASES.has(sync.phase)
    || (sync.attention !== null && !SYNC_ATTENTION.has(sync.attention))
    || typeof sync.enabled !== 'boolean'
    || !validCount(sync.usedBytes, sync.quotaBytes)
    || sync.quotaBytes !== 2_097_152
    || sync.devices.length > MAX_DEVICES
    || sync.recoveries.length > MAX_RECOVERIES
    || !validCount(activeDeviceCount, MAX_DEVICES)
    || !validCount(revokedDeviceCount, MAX_DEVICES)) {
    throw new Error('diagnostic_input_invalid')
  }

  return Object.freeze({
    product: PRODUCT,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: iso(input.now),
    appVersion: input.appVersion,
    account: Object.freeze({
      mode: account.mode,
      billingState: account.billing.state,
      plan: account.billing.plan,
      leasePresent: account.lease !== null,
    }),
    sync: Object.freeze({
      enabled: sync.enabled,
      phase: sync.phase,
      attention: sync.attention,
      usedBytes: sync.usedBytes,
      quotaBytes: sync.quotaBytes,
      activeDeviceCount,
      revokedDeviceCount,
      recoveryCount: sync.recoveries.length,
      lastSuccessAt: sync.lastSuccessAt === null ? null : iso(sync.lastSuccessAt),
    }),
  })
}

export function serializeDiagnosticReport(report: DiagnosticReportV1): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

export function diagnosticFilename(report: DiagnosticReportV1): string {
  return `tab-two-diagnostic-${report.generatedAt.slice(0, 10)}.json`
}
