import { describe, expect, it, vi } from 'vitest'

import {
  accountDataExportFilename,
  createAccountDataExportV1,
  downloadJsonFile,
  serializeAccountDataExport,
  type AccountDataExportSourceV1,
} from './dataExport'

const accountId = '44000000-0000-4000-8000-000000000001'
const exportedAt = Date.parse('2026-09-04T12:00:00.000Z')

function source(): AccountDataExportSourceV1 {
  return {
    account: {
      accountId,
      email: 'alex@example.test',
      displayName: 'Alex Morgan',
      createdAt: Date.parse('2026-08-31T10:00:00.000Z'),
      identityCreatedAt: Date.parse('2026-08-31T10:01:00.000Z'),
      identityUpdatedAt: Date.parse('2026-09-03T18:30:00.000Z'),
    },
    connectedAccounts: [{
      connectionId: '55000000-0000-4000-8000-000000000002',
      provider: 'microsoft_calendar',
      accountKind: 'work_or_school',
      email: 'alex@work.example',
      displayName: 'Alex at Work',
      status: 'active',
      grantedScopes: ['User.Read', 'Calendars.ReadBasic'],
      createdAt: Date.parse('2026-09-03T12:00:00.000Z'),
      updatedAt: Date.parse('2026-09-03T12:30:00.000Z'),
    }, {
      connectionId: '55000000-0000-4000-8000-000000000001',
      provider: 'google_calendar',
      accountKind: null,
      email: 'alex@gmail.example',
      displayName: 'Alex',
      status: 'reconnect_required',
      grantedScopes: ['openid', 'email'],
      createdAt: Date.parse('2026-09-02T12:00:00.000Z'),
      updatedAt: Date.parse('2026-09-03T11:00:00.000Z'),
    }],
    subscription: {
      state: 'active',
      plan: 'annual',
      currentPeriodStart: Date.parse('2026-09-01T00:00:00.000Z'),
      currentPeriodEnd: Date.parse('2027-09-01T00:00:00.000Z'),
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: Date.parse('2026-09-01T00:00:00.000Z'),
      updatedAt: Date.parse('2026-09-03T00:00:00.000Z'),
    },
    entitlement: {
      capabilities: ['metrics_history', 'encrypted_sync'],
      grantSources: ['stripe'],
      expiresAt: Date.parse('2027-09-01T00:00:00.000Z'),
    },
    devices: [{
      deviceId: 'BBBBBBBBBBBBBBBBBBBBBB',
      friendlyName: 'Work laptop',
      state: 'inactive',
      lastSeenAt: Date.parse('2026-09-03T10:00:00.000Z'),
      createdAt: Date.parse('2026-09-01T10:00:00.000Z'),
      updatedAt: Date.parse('2026-09-03T10:00:00.000Z'),
      revokedAt: null,
    }, {
      deviceId: 'AAAAAAAAAAAAAAAAAAAAAA',
      friendlyName: 'Desktop',
      state: 'active',
      lastSeenAt: Date.parse('2026-09-04T11:00:00.000Z'),
      createdAt: Date.parse('2026-09-01T09:00:00.000Z'),
      updatedAt: Date.parse('2026-09-04T11:00:00.000Z'),
      revokedAt: null,
    }],
    syncedData: {
      status: 'available',
      vaultVersion: 7,
      storedBytes: 2_048,
      records: [{
        entityType: 'todo_list',
        entityId: 'list-a',
        revision: 2,
        vaultVersion: 7,
        deleted: true,
      }, {
        entityType: 'notes',
        entityId: 'singleton',
        revision: 1,
        vaultVersion: 6,
        deleted: false,
        value: { text: 'Keep this readable', updatedAt: exportedAt - 1_000 },
      }],
    },
  }
}

describe('account data export', () => {
  it('builds an exact immutable v1 document with deterministic order and UTC dates', () => {
    const input = source()
    const value = createAccountDataExportV1(input, exportedAt)

    expect(Object.keys(value)).toEqual([
      'app', 'kind', 'version', 'exportedAt', 'account', 'connectedAccounts',
      'subscription', 'entitlement', 'devices', 'syncedData',
    ])
    expect(value).toMatchObject({
      app: 'tab-two',
      kind: 'account-data',
      version: 1,
      exportedAt: '2026-09-04T12:00:00.000Z',
      account: { createdAt: '2026-08-31T10:00:00.000Z' },
      subscription: { currentPeriodEnd: '2027-09-01T00:00:00.000Z' },
    })
    expect(value.connectedAccounts.map(({ provider }) => provider)).toEqual([
      'google_calendar', 'microsoft_calendar',
    ])
    expect(value.devices.map(({ friendlyName }) => friendlyName)).toEqual(['Desktop', 'Work laptop'])
    expect(value.entitlement.capabilities).toEqual(['encrypted_sync', 'metrics_history'])
    expect(value.syncedData.records.map(({ entityType, entityId }) => `${entityType}:${entityId}`))
      .toEqual(['notes:singleton', 'todo_list:list-a'])
    expect(value.syncedData.records[1]).not.toHaveProperty('value')

    input.account.displayName = 'Changed after export'
    expect(value.account.displayName).toBe('Alex Morgan')
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.syncedData.records[0])).toBe(true)
  })

  it('selects only customer fields and excludes service-only metadata', () => {
    const dirty = source() as AccountDataExportSourceV1 & Record<string, unknown>
    Object.assign(dirty, { rawDataKey: 'raw-key-secret', auditLogs: ['private-log'] })
    Object.assign(dirty.account, { authUserId: 'private-auth-user', providerSubject: 'google-subject' })
    Object.assign(dirty.connectedAccounts[0]!, {
      refreshToken: 'provider-refresh-secret',
      providerSubject: 'microsoft-subject',
      rawResponse: 'provider-payload',
    })
    Object.assign(dirty.subscription, {
      stripeCustomerId: 'cus_private',
      stripeSubscriptionId: 'sub_private',
    })
    Object.assign(dirty.syncedData, { wrappedDataKey: 'wrapped-secret' })
    Object.assign(dirty.syncedData.records[0]!, { nonce: 'nonce-secret', ciphertext: 'ciphertext-secret' })

    const json = serializeAccountDataExport(createAccountDataExportV1(dirty, exportedAt))
    for (const forbidden of [
      'raw-key-secret', 'private-log', 'private-auth-user', 'google-subject',
      'provider-refresh-secret', 'microsoft-subject', 'provider-payload',
      'cus_private', 'sub_private', 'wrapped-secret', 'nonce-secret', 'ciphertext-secret',
    ]) expect(json).not.toContain(forbidden)
    expect(json.endsWith('\n')).toBe(true)
    expect(json).toContain('\n  "account": {\n')
  })

  it('creates and revokes one local JSON download', async () => {
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const anchor = { href: '', download: '', click, remove }
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:account-data')
    const revokeObjectURL = vi.fn()
    const documentBoundary = {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    }
    const urlBoundary = { createObjectURL, revokeObjectURL }
    const json = serializeAccountDataExport(createAccountDataExportV1(source(), exportedAt))

    downloadJsonFile(
      json,
      accountDataExportFilename(exportedAt),
      documentBoundary as unknown as import('./dataExport').DownloadDocumentBoundary,
      urlBoundary,
    )

    expect(accountDataExportFilename(exportedAt)).toBe('tab-two-account-data-2026-09-04.json')
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0]![0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe(json)
    expect(anchor).toMatchObject({
      href: 'blob:account-data',
      download: 'tab-two-account-data-2026-09-04.json',
    })
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:account-data')
  })

  it('rejects impossible export timestamps', () => {
    expect(() => createAccountDataExportV1(source(), Number.NaN)).toThrow('account_export_invalid')
    expect(() => accountDataExportFilename(-1)).toThrow('account_export_invalid')
  })
})
