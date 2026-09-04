import { describe, expect, it } from 'vitest'

import type { AccountSnapshot } from '../account/types'
import type { SyncViewState } from '../sync/SyncProvider'
import {
  createDiagnosticReport,
  diagnosticFilename,
  serializeDiagnosticReport,
} from './diagnostics'

const ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'
const CURRENT_DEVICE_ID = 'a-device-id-that-must-not-escape'
const CURRENT_DEVICE_NAME = 'Jon Desktop'
const ACCOUNT_EMAIL = 'private-owner@example.test'
const ACCESS_TOKEN = 'ya29.private-access-token'
const CALENDAR_URL = 'https://calendar.example/private.ics?token=secret'
const EVENT_TEXT = 'Private medical appointment'
const TASK_TEXT = 'Confidential acquisition task'

function account(): AccountSnapshot {
  return {
    mode: 'signed_in',
    accountId: ACCOUNT_ID,
    email: ACCOUNT_EMAIL,
    displayName: 'Private Owner',
    billing: {
      state: 'active',
      plan: 'annual',
      currentPeriodEnd: Date.parse('2027-09-03T18:00:00.000Z'),
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      introductoryEligible: false,
    },
    lease: {
      verification: 'verified',
      leaseVersion: 1,
      keyId: 'private-key-id',
      accountId: ACCOUNT_ID,
      capabilities: ['encrypted_sync', 'metrics_history', 'strava'],
      grantSources: ['stripe'],
      issuedAt: Date.parse('2026-09-03T17:00:00.000Z'),
      expiresAt: Date.parse('2026-10-03T17:00:00.000Z'),
      leaseId: 'private-lease-id',
    },
    sync: {
      enabled: true,
      phase: 'needs_attention',
      lastSuccessAt: Date.parse('2026-09-03T17:55:00.000Z'),
      usedBytes: 128,
      quotaBytes: 2_097_152,
    },
    devices: [{
      id: CURRENT_DEVICE_ID,
      name: CURRENT_DEVICE_NAME,
      lastSyncAt: Date.parse('2026-09-03T17:55:00.000Z'),
      current: true,
      revoked: false,
    }],
  }
}

function sync(): SyncViewState {
  return {
    enabled: true,
    phase: 'needs_attention',
    attention: 'offline',
    lastSuccessAt: Date.parse('2026-09-03T17:55:00.000Z'),
    usedBytes: 128,
    quotaBytes: 2_097_152,
    devices: [
      { id: CURRENT_DEVICE_ID, name: CURRENT_DEVICE_NAME, lastSyncAt: null, current: true, revoked: false },
      { id: 'second-private-id', name: 'Travel profile', lastSyncAt: null, current: false, revoked: false },
      { id: 'revoked-private-id', name: 'Old machine', lastSyncAt: null, current: false, revoked: true },
    ],
    recoveries: [{
      id: 'private-recovery-id',
      entityType: 'notes',
      entityId: 'private-note-id',
      createdAt: Date.parse('2026-09-03T17:50:00.000Z'),
    }],
  }
}

describe('local diagnostic report', () => {
  it('selects an exact status-only allowlist and freezes every level', () => {
    const accountSnapshot = Object.assign(account(), {
      accessToken: ACCESS_TOKEN,
      nested: { url: CALENDAR_URL, event: EVENT_TEXT, task: TASK_TEXT },
    })
    const syncState = Object.assign(sync(), {
      rawMetrics: { taskTitle: TASK_TEXT, value: 99 },
      providerPayload: { token: ACCESS_TOKEN },
    })

    const report = createDiagnosticReport({
      now: Date.parse('2026-09-03T18:00:00.000Z'),
      appVersion: '2.0.0',
      account: accountSnapshot,
      sync: syncState,
    })

    expect(report).toEqual({
      product: 'Tab Two',
      schemaVersion: 1,
      generatedAt: '2026-09-03T18:00:00.000Z',
      appVersion: '2.0.0',
      account: {
        mode: 'signed_in',
        billingState: 'active',
        plan: 'annual',
        leasePresent: true,
      },
      sync: {
        enabled: true,
        phase: 'needs_attention',
        attention: 'offline',
        usedBytes: 128,
        quotaBytes: 2_097_152,
        activeDeviceCount: 2,
        revokedDeviceCount: 1,
        recoveryCount: 1,
        lastSuccessAt: '2026-09-03T17:55:00.000Z',
      },
    })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.account)).toBe(true)
    expect(Object.isFrozen(report.sync)).toBe(true)
  })

  it('never serializes identity, device, authority, content, browsing, or raw-value sentinels', () => {
    const report = createDiagnosticReport({
      now: Date.parse('2026-09-03T18:00:00.000Z'),
      appVersion: '2.0.0',
      account: account(),
      sync: sync(),
    })
    const serialized = serializeDiagnosticReport(report)

    for (const forbidden of [
      ACCOUNT_ID,
      ACCOUNT_EMAIL,
      CURRENT_DEVICE_ID,
      CURRENT_DEVICE_NAME,
      ACCESS_TOKEN,
      CALENDAR_URL,
      EVENT_TEXT,
      TASK_TEXT,
      'private-key-id',
      'private-lease-id',
      'private-recovery-id',
      'strava',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(serialized.endsWith('\n')).toBe(true)
  })

  it('represents Local and disabled sync without inventing account details', () => {
    const local = account()
    local.mode = 'local'
    local.accountId = null
    local.email = null
    local.displayName = null
    local.billing = { ...local.billing, state: 'none', plan: null }
    local.lease = null
    const disabled = sync()
    disabled.enabled = false
    disabled.phase = 'disabled'
    disabled.attention = null
    disabled.lastSuccessAt = null
    disabled.devices = []
    disabled.recoveries = []

    const report = createDiagnosticReport({ now: 0, appVersion: '2.0.0', account: local, sync: disabled })
    expect(report.account).toEqual({ mode: 'local', billingState: 'none', plan: null, leasePresent: false })
    expect(report.sync).toEqual(expect.objectContaining({
      enabled: false,
      phase: 'disabled',
      attention: null,
      activeDeviceCount: 0,
      revokedDeviceCount: 0,
      recoveryCount: 0,
      lastSuccessAt: null,
    }))
  })

  it('fails closed on invalid timestamps, versions, byte totals, and counts', () => {
    expect(() => createDiagnosticReport({ now: Number.NaN, appVersion: '2.0.0', account: account(), sync: sync() })).toThrow('diagnostic_input_invalid')
    expect(() => createDiagnosticReport({ now: 0, appVersion: ACCESS_TOKEN, account: account(), sync: sync() })).toThrow('diagnostic_input_invalid')
    expect(() => createDiagnosticReport({ now: 0, appVersion: '2.0.0', account: account(), sync: { ...sync(), usedBytes: -1 } })).toThrow('diagnostic_input_invalid')
    expect(() => createDiagnosticReport({ now: 0, appVersion: '2.0.0', account: account(), sync: { ...sync(), devices: new Array(101).fill(sync().devices[0]) } })).toThrow('diagnostic_input_invalid')
  })

  it('uses a stable local filename derived only from the report date', () => {
    const report = createDiagnosticReport({
      now: Date.parse('2026-09-03T23:59:59.000Z'),
      appVersion: '2.0.0',
      account: account(),
      sync: sync(),
    })
    expect(diagnosticFilename(report)).toBe('tab-two-diagnostic-2026-09-03.json')
  })
})
