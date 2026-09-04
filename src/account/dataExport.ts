import type { BillingPlan, BillingState } from './billing'
import type { PremiumCapability, SignedGrantSource } from './types'
import type { ProviderAccountKind, ProviderConnectionStatus, ProviderId } from '../providers/types'
import type { SyncDeviceRegistration } from '../sync/localState'
import type { SyncEntityType } from '../sync/types'

const ACCOUNT_EXPORT_ERROR = 'account_export_invalid'

export interface AccountDataExportSourceV1 {
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
    provider: ProviderId
    accountKind: ProviderAccountKind | null
    email: string
    displayName: string | null
    status: ProviderConnectionStatus
    grantedScopes: string[]
    createdAt: number
    updatedAt: number
  }>
  subscription: {
    state: BillingState | 'complimentary'
    plan: BillingPlan | null
    currentPeriodStart: number | null
    currentPeriodEnd: number | null
    courtesyEnd: number | null
    cancelAtPeriodEnd: boolean
    createdAt: number | null
    updatedAt: number | null
  }
  entitlement: {
    capabilities: PremiumCapability[]
    grantSources: SignedGrantSource[]
    expiresAt: number | null
  }
  devices: Array<{
    deviceId: string
    friendlyName: string
    state: SyncDeviceRegistration
    lastSeenAt: number
    createdAt: number
    updatedAt: number
    revokedAt: number | null
  }>
  syncedData: {
    status: 'not_created' | 'empty' | 'available'
    vaultVersion: number
    storedBytes: number
    records: AccountDataExportRecordSourceV1[]
  }
}

export type AccountDataExportRecordSourceV1 = {
  entityType: SyncEntityType
  entityId: string
  revision: number
  vaultVersion: number
} & (
  | { deleted: true }
  | { deleted: false; value: unknown }
)

interface AccountDataExportRecordV1 {
  readonly entityType: SyncEntityType
  readonly entityId: string
  readonly revision: number
  readonly vaultVersion: number
  readonly deleted: boolean
  readonly value?: unknown
}

export interface AccountDataExportV1 {
  readonly app: 'tab-two'
  readonly kind: 'account-data'
  readonly version: 1
  readonly exportedAt: string
  readonly account: {
    readonly accountId: string
    readonly email: string
    readonly displayName: string | null
    readonly createdAt: string
    readonly identityCreatedAt: string
    readonly identityUpdatedAt: string
  }
  readonly connectedAccounts: ReadonlyArray<{
    readonly connectionId: string
    readonly provider: ProviderId
    readonly accountKind: ProviderAccountKind | null
    readonly email: string
    readonly displayName: string | null
    readonly status: ProviderConnectionStatus
    readonly grantedScopes: readonly string[]
    readonly createdAt: string
    readonly updatedAt: string
  }>
  readonly subscription: {
    readonly state: BillingState | 'complimentary'
    readonly plan: BillingPlan | null
    readonly currentPeriodStart: string | null
    readonly currentPeriodEnd: string | null
    readonly courtesyEnd: string | null
    readonly cancelAtPeriodEnd: boolean
    readonly createdAt: string | null
    readonly updatedAt: string | null
  }
  readonly entitlement: {
    readonly capabilities: readonly PremiumCapability[]
    readonly grantSources: readonly SignedGrantSource[]
    readonly expiresAt: string | null
  }
  readonly devices: ReadonlyArray<{
    readonly deviceId: string
    readonly friendlyName: string
    readonly state: SyncDeviceRegistration
    readonly lastSeenAt: string
    readonly createdAt: string
    readonly updatedAt: string
    readonly revokedAt: string | null
  }>
  readonly syncedData: {
    readonly status: 'not_created' | 'empty' | 'available'
    readonly vaultVersion: number
    readonly storedBytes: number
    readonly records: readonly AccountDataExportRecordV1[]
  }
}

export interface DownloadDocumentBoundary {
  createElement(tagName: 'a'): HTMLAnchorElement
  body: Pick<HTMLElement, 'appendChild'>
}

export interface DownloadUrlBoundary {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function iso(value: number): string {
  if (!validTimestamp(value)) throw new Error(ACCOUNT_EXPORT_ERROR)
  try {
    return new Date(value).toISOString()
  } catch {
    throw new Error(ACCOUNT_EXPORT_ERROR)
  }
}

function optionalIso(value: number | null): string | null {
  return value === null ? null : iso(value)
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value)
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(clone)
  return clone
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function record(source: AccountDataExportRecordSourceV1): AccountDataExportRecordV1 {
  const base = {
    entityType: source.entityType,
    entityId: source.entityId,
    revision: source.revision,
    vaultVersion: source.vaultVersion,
    deleted: source.deleted,
  }
  return source.deleted ? base : { ...base, value: structuredClone(source.value) }
}

export function createAccountDataExportV1(
  source: AccountDataExportSourceV1,
  exportedAt: number,
): AccountDataExportV1 {
  const output: AccountDataExportV1 = {
    app: 'tab-two',
    kind: 'account-data',
    version: 1,
    exportedAt: iso(exportedAt),
    account: {
      accountId: source.account.accountId,
      email: source.account.email,
      displayName: source.account.displayName,
      createdAt: iso(source.account.createdAt),
      identityCreatedAt: iso(source.account.identityCreatedAt),
      identityUpdatedAt: iso(source.account.identityUpdatedAt),
    },
    connectedAccounts: source.connectedAccounts
      .map((connection) => ({
        connectionId: connection.connectionId,
        provider: connection.provider,
        accountKind: connection.accountKind,
        email: connection.email,
        displayName: connection.displayName,
        status: connection.status,
        grantedScopes: [...connection.grantedScopes],
        createdAt: iso(connection.createdAt),
        updatedAt: iso(connection.updatedAt),
      }))
      .sort((left, right) => compare(
        `${left.provider}\u0000${left.email}\u0000${left.connectionId}`,
        `${right.provider}\u0000${right.email}\u0000${right.connectionId}`,
      )),
    subscription: {
      state: source.subscription.state,
      plan: source.subscription.plan,
      currentPeriodStart: optionalIso(source.subscription.currentPeriodStart),
      currentPeriodEnd: optionalIso(source.subscription.currentPeriodEnd),
      courtesyEnd: optionalIso(source.subscription.courtesyEnd),
      cancelAtPeriodEnd: source.subscription.cancelAtPeriodEnd,
      createdAt: optionalIso(source.subscription.createdAt),
      updatedAt: optionalIso(source.subscription.updatedAt),
    },
    entitlement: {
      capabilities: [...source.entitlement.capabilities].sort(compare),
      grantSources: [...source.entitlement.grantSources].sort(compare),
      expiresAt: optionalIso(source.entitlement.expiresAt),
    },
    devices: source.devices
      .map((device) => ({
        deviceId: device.deviceId,
        friendlyName: device.friendlyName,
        state: device.state,
        lastSeenAt: iso(device.lastSeenAt),
        createdAt: iso(device.createdAt),
        updatedAt: iso(device.updatedAt),
        revokedAt: optionalIso(device.revokedAt),
      }))
      .sort((left, right) => compare(
        `${left.friendlyName}\u0000${left.deviceId}`,
        `${right.friendlyName}\u0000${right.deviceId}`,
      )),
    syncedData: {
      status: source.syncedData.status,
      vaultVersion: source.syncedData.vaultVersion,
      storedBytes: source.syncedData.storedBytes,
      records: source.syncedData.records
        .map(record)
        .sort((left, right) => compare(
          `${left.entityType}\u0000${left.entityId}`,
          `${right.entityType}\u0000${right.entityId}`,
        )),
    },
  }
  return immutable(output)
}

export function serializeAccountDataExport(value: AccountDataExportV1): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function accountDataExportFilename(exportedAt: number): string {
  return `tab-two-account-data-${iso(exportedAt).slice(0, 10)}.json`
}

export function downloadJsonFile(
  serialized: string,
  filename: string,
  documentBoundary: DownloadDocumentBoundary = document,
  urlBoundary: DownloadUrlBoundary = URL,
): void {
  const blobUrl = urlBoundary.createObjectURL(new Blob([serialized], { type: 'application/json' }))
  const anchor = documentBoundary.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  let appended = false
  try {
    documentBoundary.body.appendChild(anchor)
    appended = true
    anchor.click()
  } finally {
    if (appended) anchor.remove()
    urlBoundary.revokeObjectURL(blobUrl)
  }
}
