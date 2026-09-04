import { describe, expect, it } from 'vitest'

import type { SyncConflictBackupV1 } from './localState'
import {
  conflictRecoveryFilename,
  createConflictRecoveryExportV1,
  serializeConflictRecoveryExport,
} from './recoveryExport'

const accountId = '44000000-0000-4000-8000-000000000001'
const exportedAt = Date.parse('2026-09-04T12:00:00.000Z')

function recovery(): SyncConflictBackupV1 {
  return {
    id: 'AAAAAAAAAAAAAAAAAAAAAA',
    entity: {
      schemaVersion: 1,
      entityType: 'notes',
      entityId: 'singleton',
      value: { text: 'A displaced local edit', updatedAt: exportedAt - 5_000 },
    },
    observedRemoteRevision: 2,
    createdAt: exportedAt - 10_000,
    reason: 'stale_remote_winner',
  }
}

describe('conflict recovery export', () => {
  it('creates one exact immutable account-bound recovery document', () => {
    const source = recovery()
    const value = createConflictRecoveryExportV1(accountId, source, exportedAt)

    expect(Object.keys(value)).toEqual([
      'app', 'kind', 'version', 'exportedAt', 'accountId', 'recovery',
    ])
    expect(value).toEqual({
      app: 'tab-two',
      kind: 'sync-conflict-recovery',
      version: 1,
      exportedAt: '2026-09-04T12:00:00.000Z',
      accountId,
      recovery: {
        id: source.id,
        entity: source.entity,
        observedRemoteRevision: 2,
        createdAt: '2026-09-04T11:59:50.000Z',
        reason: 'stale_remote_winner',
      },
    })
    source.entity.value = { text: 'mutated', updatedAt: exportedAt }
    expect(value.recovery.entity.value).toEqual({
      text: 'A displaced local edit', updatedAt: exportedAt - 5_000,
    })
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.recovery.entity)).toBe(true)
  })

  it('uses a sanitized entity type and compact UTC timestamp in the filename', () => {
    expect(conflictRecoveryFilename(recovery(), exportedAt))
      .toBe('tab-two-recovery-notes-2026-09-04T120000Z.json')
  })

  it('serializes pretty JSON with no local-store envelope or service metadata', () => {
    const json = serializeConflictRecoveryExport(
      createConflictRecoveryExportV1(accountId, recovery(), exportedAt),
    )

    expect(json).toContain('\n  "recovery": {\n')
    expect(json.endsWith('\n')).toBe(true)
    expect(json).not.toContain('wrappedDataKey')
    expect(json).not.toContain('syncIndex')
    expect(json).not.toContain('nonce')
    expect(json).not.toContain('ciphertext')
  })

  it('rejects account mismatch, malformed recoveries, and impossible timestamps', () => {
    expect(() => createConflictRecoveryExportV1('not-an-account', recovery(), exportedAt))
      .toThrow('sync_conflict_export_invalid')
    expect(() => createConflictRecoveryExportV1(accountId, {
      ...recovery(),
      observedRemoteRevision: 0,
    }, exportedAt)).toThrow('sync_conflict_export_invalid')
    expect(() => createConflictRecoveryExportV1(accountId, {
      ...recovery(),
      wrappedDataKey: 'private-wrapped-key',
    } as SyncConflictBackupV1, exportedAt)).toThrow('sync_conflict_export_invalid')
    expect(() => createConflictRecoveryExportV1(accountId, recovery(), -1))
      .toThrow('sync_conflict_export_invalid')
  })
})
