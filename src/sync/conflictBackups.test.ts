import { describe, expect, it, vi } from 'vitest'
import { defaults } from '../lib/storage/schema'
import { memoryDriver, type StorageDriver } from '../lib/storage/driver'
import { projectSyncEntities } from './entityPolicy'
import { createSyncLocalStateStore, SYNC_CONFLICT_BACKUPS_STORAGE_KEY } from './localState'
import {
  appendConflictBackup,
  applyRemoteWinnerWithConflictBackup,
  deleteConflictBackup,
  pruneConflictBackups,
  restoreConflictBackup,
} from './conflictBackups'

const accountId = '42000000-0000-4000-8000-000000000001'
const now = Date.UTC(2026, 8, 2, 14, 0, 0)
const DAY = 24 * 60 * 60 * 1_000

function context(seed: Record<string, unknown> = {}) {
  const driver = memoryDriver(seed)
  let randomByte = 0
  const random = {
    getRandomValues: ((target: Uint8Array) => {
      target.fill(randomByte)
      randomByte += 1
      return target
    }) as Crypto['getRandomValues'],
  } as Crypto
  return {
    driver,
    context: { driver, authority: driver.authority, crypto: random, now: () => now },
  }
}

function notes(text: string) {
  return {
    schemaVersion: 1 as const,
    entityType: 'notes' as const,
    entityId: 'singleton',
    value: { text, updatedAt: now },
  }
}

function digest(byte: number): string {
  let binary = ''
  for (const value of new Uint8Array(32).fill(byte)) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

describe('conflict backups', () => {
  it('keeps only five newest validated displaced entities for 30 days', async () => {
    const value = context()
    for (let index = 0; index < 7; index += 1) {
      await appendConflictBackup(value.context, accountId, notes(`local ${index}`), index + 1, now - index * DAY)
    }

    const store = createSyncLocalStateStore(value.driver, value.driver.authority)
    const backups = await store.readConflictBackups(accountId)
    expect(backups).toHaveLength(5)
    expect(backups.map((backup) => backup.entity.value)).toEqual([
      { text: 'local 0', updatedAt: now },
      { text: 'local 1', updatedAt: now },
      { text: 'local 2', updatedAt: now },
      { text: 'local 3', updatedAt: now },
      { text: 'local 4', updatedAt: now },
    ])
    expect(JSON.stringify(backups)).not.toContain('token')
  })

  it('prunes expired backups and deletes only the exact account-owned id', async () => {
    const value = context()
    const fresh = await appendConflictBackup(value.context, accountId, notes('fresh'), 3, now - 2 * DAY)
    await appendConflictBackup(value.context, accountId, notes('old'), 2, now - 31 * DAY)

    await pruneConflictBackups(value.context, accountId)
    await deleteConflictBackup(value.context, accountId, fresh.id)

    const store = createSyncLocalStateStore(value.driver, value.driver.authority)
    await expect(store.readConflictBackups(accountId)).resolves.toEqual([])
  })

  it('atomically saves the displaced local entity before adopting a remote winner and revision', async () => {
    const local = { ...defaults(), notes: { text: 'local draft', updatedAt: now - 1 } }
    const value = context(local)
    const remote = notes('remote winner')

    const result = await applyRemoteWinnerWithConflictBackup(value.context, {
      accountId,
      remoteWinner: remote,
      remoteRevision: 9,
      vaultVersion: 14,
      digest: digest(3),
    })

    expect(value.driver.dump().notes).toEqual(remote.value)
    expect(result.backup.entity.value).toEqual({ text: 'local draft', updatedAt: now - 1 })
    const index = await createSyncLocalStateStore(value.driver, value.driver.authority).readIndex(accountId)
    expect(index?.entities['notes:singleton']).toEqual({ revision: 9, digest: digest(3) })
    expect(index?.lastVaultVersion).toBe(14)
  })

  it('does not replace local data if the combined backup write fails', async () => {
    const local = { ...defaults(), notes: { text: 'local draft', updatedAt: now - 1 } }
    const base = memoryDriver(local)
    const failing: StorageDriver = {
      read: base.read,
      onChanged: base.onChanged,
      write: vi.fn(async () => { throw new Error('disk full') }),
    }

    await expect(applyRemoteWinnerWithConflictBackup({
      driver: failing,
      authority: base.authority,
      crypto: context().context.crypto,
      now: () => now,
    }, {
      accountId,
      remoteWinner: notes('remote winner'),
      remoteRevision: 9,
      vaultVersion: 14,
      digest: digest(3),
    })).rejects.toThrow('sync_conflict_backup_failed')

    expect(base.dump().notes).toEqual(local.notes)
    expect(base.dump()).not.toHaveProperty(SYNC_CONFLICT_BACKUPS_STORAGE_KEY)
  })

  it('restores locally at the current remote revision and returns a queued mutation without pushing', async () => {
    const value = context({ ...defaults() })
    const backup = await appendConflictBackup(value.context, accountId, notes('restore me'), 4, now)
    const push = vi.fn()

    const queued = await restoreConflictBackup(value.context, accountId, backup.id, 12)

    expect(value.driver.dump().notes).toEqual({ text: 'restore me', updatedAt: now })
    expect(queued).toEqual({ kind: 'put', entity: notes('restore me'), expectedRevision: 12 })
    expect(push).not.toHaveBeenCalled()
  })

  it('rejects malformed, secret-bearing, cross-account, and unsupported backup documents', async () => {
    const candidate = projectSyncEntities(defaults()).find((entity) => entity.entityType === 'notes')!
    const malformed = {
      version: 2,
      accountId,
      items: [{
        id: 'AAAAAAAAAAAAAAAAAAAAAA',
        entity: { ...candidate, token: 'secret' },
        observedRemoteRevision: 1,
        createdAt: now,
        reason: 'stale_remote_winner',
      }],
    }
    const value = context({ [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: malformed })
    const store = createSyncLocalStateStore(value.driver, value.driver.authority)

    await expect(store.readConflictBackups(accountId)).resolves.toEqual([])
    await expect(store.readConflictBackups('42000000-0000-4000-8000-000000000002')).resolves.toEqual([])
  })
})
