import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateDataKey } from './crypto'
import { defaults } from '../lib/storage/schema'
import { memoryDriver } from '../lib/storage/driver'
import type { SyncGateway, SyncPullPage, SyncGatewayResult } from './gateway'
import { emptySyncIndex, type SyncIndexStateV1 } from './localState'
import type { SyncEntityV1 } from './types'
import {
  applyAcceptedOutcomes,
  createCoordinatorStorage,
  createSyncCoordinator,
  deriveQueuedMutations,
  digestSyncEntity,
  mutationBatches,
  retryDelay,
  syncEntityKey,
  type CoordinatorStorage,
} from './coordinator'

const accountId = '42000000-0000-4000-8000-000000000001'
const deviceId = 'AAECAwQFBgcICQoLDA0ODw'

function note(text: string): SyncEntityV1 {
  return { schemaVersion: 1, entityType: 'notes', entityId: 'singleton', value: { text } }
}

function gateway(overrides: Partial<SyncGateway> = {}): SyncGateway {
  const emptyPage: SyncPullPage = { records: [], nextCursor: null, vaultVersion: 0 }
  const completed = async <T>(value: T): Promise<SyncGatewayResult<T>> => ({ ok: true, value })
  return {
    bootstrap: vi.fn(),
    pull: vi.fn(async () => completed(emptyPage)),
    push: vi.fn(async () => completed([])),
    deactivateDevice: vi.fn(),
    renameDevice: vi.fn(),
    revokeDevice: vi.fn(),
    deleteVault: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  } as SyncGateway
}

function storage(initial: readonly SyncEntityV1[] = []): CoordinatorStorage & {
  emit(): void
  index: SyncIndexStateV1
  entities: SyncEntityV1[]
} {
  let listener = () => {}
  const value = {
    index: emptySyncIndex(accountId),
    entities: structuredClone(initial) as SyncEntityV1[],
    project: vi.fn(async () => structuredClone(value.entities)),
    readIndex: vi.fn(async () => structuredClone(value.index)),
    writeIndex: vi.fn(async (next: SyncIndexStateV1) => { value.index = structuredClone(next) }),
    applyRemote: vi.fn(async (input: Parameters<CoordinatorStorage['applyRemote']>[0]) => {
      value.entities = input.entity ? [structuredClone(input.entity)] : []
      value.index = {
        ...value.index,
        lastVaultVersion: input.vaultVersion,
        entities: {
          ...value.index.entities,
          [syncEntityKey(input.entityType, input.entityId)]: {
            revision: input.revision,
            digest: input.digest,
          },
        },
      }
      listener()
    }),
    applyRemoteBatch: vi.fn(async (inputs: readonly Parameters<CoordinatorStorage['applyRemote']>[0][]) => {
      for (const input of inputs) await value.applyRemote(input)
    }),
    subscribe: vi.fn((next: () => void) => { listener = next; return () => { listener = () => {} } }),
    emit: () => listener(),
  }
  return value
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('sync coordinator revision algebra', () => {
  it('queues deterministic puts and tombstones only when the canonical digest changed', async () => {
    const accepted = note('accepted')
    const removed = { schemaVersion: 1, entityType: 'quick_link', entityId: 'removed', value: { title: 'A', url: 'https://example.com' } } satisfies SyncEntityV1
    const index: SyncIndexStateV1 = {
      ...emptySyncIndex(accountId),
      entities: {
        [syncEntityKey('notes', 'singleton')]: { revision: 2, digest: await digestSyncEntity(accepted) },
        [syncEntityKey('quick_link', 'removed')]: { revision: 4, digest: await digestSyncEntity(removed) },
      },
    }
    const queue = await deriveQueuedMutations([note('edited')], index)
    expect(queue).toEqual([
      expect.objectContaining({ entityType: 'notes', expectedRevision: 2, revision: 3, entity: note('edited') }),
      expect.objectContaining({ entityType: 'quick_link', entityId: 'removed', expectedRevision: 4, revision: 5, entity: null }),
    ])
    expect(await deriveQueuedMutations([accepted, removed], index)).toEqual([])
  })

  it('splits at 50 and applies only identity-matched accepted revisions', async () => {
    expect(mutationBatches(Array.from({ length: 101 }, (_, index) => index)).map((batch) => batch.length))
      .toEqual([50, 50, 1])
    expect([1, 2, 3, 4, 5].map(retryDelay)).toEqual([5_000, 30_000, 120_000, 300_000, 300_000])
    const queued = await deriveQueuedMutations([note('one')], emptySyncIndex(accountId))
    const index = applyAcceptedOutcomes(emptySyncIndex(accountId), queued, [{
      status: 'accepted', entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 8,
    }])
    expect(index.lastVaultVersion).toBe(8)
    expect(index.entities['notes:singleton']).toEqual({ revision: 1, digest: queued[0]!.digest })
  })
})

describe('sync coordinator lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pulls on start, after the focus threshold, and every 60 seconds while running', async () => {
    let at = 0
    const api = gateway()
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: storage(), now: () => at,
    })
    coordinator.start()
    await settle()
    expect(api.pull).toHaveBeenCalledTimes(1)
    at = 14_999
    coordinator.focus()
    await settle()
    expect(api.pull).toHaveBeenCalledTimes(1)
    at = 15_000
    coordinator.focus()
    await settle()
    expect(api.pull).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.pull).toHaveBeenCalledTimes(3)
    coordinator.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.pull).toHaveBeenCalledTimes(3)
  })

  it('debounces local edits at 750 ms but flushes sustained edits by five seconds', async () => {
    const api = gateway()
    const local = storage()
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: local,
    })
    coordinator.start()
    await settle()
    vi.mocked(api.pull).mockClear()
    for (let elapsed = 0; elapsed < 4_500; elapsed += 500) {
      local.emit()
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(api.pull).not.toHaveBeenCalled()
    local.emit()
    await vi.advanceTimersByTimeAsync(500)
    await settle()
    expect(api.pull).toHaveBeenCalledTimes(1)
    coordinator.stop()
  })

  it('paginates before success and suppresses the storage echo from a remote apply', async () => {
    const key = await generateDataKey()
    const remote = note('remote')
    const { encryptSyncRecord } = await import('./crypto')
    const record = await encryptSyncRecord(key, {
      envelopeVersion: 1, accountId, entityType: 'notes', entityId: 'singleton', revision: 1, tombstone: false,
    }, remote)
    let page = 0
    const api = gateway({
      pull: vi.fn(async () => ({ ok: true as const, value: page++ === 0
        ? { records: [{ ...record, vaultVersion: 1 }], nextCursor: 1, vaultVersion: 2 }
        : { records: [], nextCursor: null, vaultVersion: 2 } })),
      push: vi.fn(async () => ({ ok: true as const, value: [] })),
    })
    const local = storage()
    let completed!: () => void
    const completion = new Promise<void>((resolve) => { completed = resolve })
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key, gateway: api, storage: local,
      onState: (state) => { if (state.phase === 'up_to_date' && state.lastSuccessAt !== null) completed() },
    })
    coordinator.start()
    await completion
    expect(api.pull).toHaveBeenCalledTimes(3)
    expect(api.pull).toHaveBeenLastCalledWith(expect.objectContaining({
      afterVaultVersion: 0,
      cursor: 2,
      limit: 100,
      acknowledgeVaultVersion: 2,
    }), expect.any(AbortSignal))
    expect(local.applyRemote).toHaveBeenCalledOnce()
    expect(api.push).not.toHaveBeenCalled()
    expect(coordinator.getState().phase).toBe('up_to_date')
    coordinator.stop()
  })

  it('uses one in-flight operation and rejects a completion after stop', async () => {
    let release!: (value: SyncGatewayResult<SyncPullPage>) => void
    const api = gateway({
      pull: vi.fn(() => new Promise<SyncGatewayResult<SyncPullPage>>((resolve) => { release = resolve })),
    })
    const states: string[] = []
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: storage(),
      onState: (state) => states.push(state.phase),
    })
    coordinator.start()
    await settle()
    const first = coordinator.syncNow()
    expect(api.pull).toHaveBeenCalledTimes(1)
    coordinator.stop()
    release({ ok: true, value: { records: [], nextCursor: null, vaultVersion: 9 } })
    await first
    expect(states.at(-1)).toBe('syncing')
  })

  it('reuses the exact idempotency mutation after an unknown-outcome retry', async () => {
    const local = storage([note('offline edit')])
    let attempts = 0
    const seen: string[][] = []
    const api = gateway({
      push: vi.fn(async (input: Parameters<SyncGateway['push']>[0]) => {
        seen.push(input.mutations.map((mutation) => mutation.idempotencyId))
        attempts += 1
        if (attempts === 1) return { ok: false as const, kind: 'offline' as const }
        return { ok: true as const, value: input.mutations.map((mutation, index) => ({
          status: 'accepted' as const,
          entityType: mutation.record.entityType,
          entityId: mutation.record.entityId,
          revision: mutation.record.revision,
          vaultVersion: index + 1,
        })) }
      }),
    })
    let offline!: () => void
    let completed!: () => void
    const reachedOffline = new Promise<void>((resolve) => { offline = resolve })
    const reachedCompleted = new Promise<void>((resolve) => { completed = resolve })
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: local,
      onState: (next) => {
        if (next.phase === 'offline') offline()
        if (next.phase === 'up_to_date' && next.lastSuccessAt !== null) completed()
      },
    })
    coordinator.start()
    await reachedOffline
    expect(coordinator.getState().phase).toBe('offline')
    await vi.advanceTimersByTimeAsync(5_000)
    await reachedCompleted
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    coordinator.stop()
  })

  it('splits encrypted payloads at the actual 256 KiB request boundary', async () => {
    const large = 'x'.repeat(150_000)
    const entities: SyncEntityV1[] = ['a', 'b'].map((id) => ({
      schemaVersion: 1,
      entityType: 'quick_link',
      entityId: id,
      value: { title: id, url: large },
    }))
    const local = storage(entities)
    const sizes: number[] = []
    const api = gateway({
      push: vi.fn(async (input: Parameters<SyncGateway['push']>[0]) => {
        sizes.push(input.mutations.length)
        return { ok: true as const, value: input.mutations.map((mutation, index) => ({
          status: 'accepted' as const,
          entityType: mutation.record.entityType,
          entityId: mutation.record.entityId,
          revision: mutation.record.revision,
          vaultVersion: sizes.length + index,
        })) }
      }),
    })
    let finish!: () => void
    const completed = new Promise<void>((resolve) => { finish = resolve })
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: local,
      onState: (next) => { if (next.phase === 'up_to_date' && next.lastSuccessAt !== null) finish() },
    })
    coordinator.start()
    await completed
    expect(sizes).toEqual([1, 1])
    coordinator.stop()
  })

  it('never sends a single encoded mutation larger than 256 KiB', async () => {
    const local = storage([note('x'.repeat(300_000))])
    const api = gateway()
    let attention!: () => void
    const needsAttention = new Promise<void>((resolve) => { attention = resolve })
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key: await generateDataKey(), gateway: api, storage: local,
      onState: (next) => { if (next.phase === 'needs_attention') attention() },
    })
    coordinator.start()
    await needsAttention
    expect(api.push).not.toHaveBeenCalled()
    expect(coordinator.getState().phase).toBe('needs_attention')
    coordinator.stop()
  })

  it('atomically backs up a displaced value before a conflicting remote tombstone', async () => {
    const driver = memoryDriver({ ...defaults(), notes: { text: 'local draft', updatedAt: 1 } })
    const adapter = createCoordinatorStorage({ driver, authority: driver.authority, accountId })
    await adapter.applyRemote({
      entityType: 'notes', entityId: 'singleton', entity: null,
      revision: 2, vaultVersion: 3, digest: await digestSyncEntity(null), conflict: true,
    })
    expect(driver.dump().notes).toEqual(defaults().notes)
    const backups = driver.dump()['tab-two:sync-conflict-backups:v1'] as { items: SyncEntityV1[] }
    expect(backups.items).toHaveLength(1)
    expect(JSON.stringify(backups)).toContain('local draft')
    expect((driver.dump()['tab-two:sync-index:v1'] as SyncIndexStateV1).lastVaultVersion).toBe(3)
  })

  it('leaves the full page unapplied and unacknowledged when a later record cannot authenticate', async () => {
    const key = await generateDataKey()
    const { encryptSyncRecord } = await import('./crypto')
    const valid = await encryptSyncRecord(key, {
      envelopeVersion: 1, accountId, entityType: 'notes', entityId: 'singleton', revision: 1, tombstone: false,
    }, note('remote'))
    const corrupt = { ...valid, entityId: 'second', ciphertext: `${valid.ciphertext.slice(0, -1)}A` }
    const driver = memoryDriver({ ...defaults(), notes: { text: 'local draft', updatedAt: 1 } })
    const api = gateway({
      pull: vi.fn(async () => ({ ok: true as const, value: {
        records: [{ ...valid, vaultVersion: 1 }, { ...corrupt, vaultVersion: 2 }],
        nextCursor: null,
        vaultVersion: 2,
      } })),
    })
    let failed!: () => void
    const failure = new Promise<void>((resolve) => { failed = resolve })
    const coordinator = createSyncCoordinator({
      accountId, deviceId, key, gateway: api,
      storage: createCoordinatorStorage({ driver, authority: driver.authority, accountId }),
      onState: (next) => { if (next.phase === 'needs_attention') failed() },
    })
    coordinator.start()
    await failure
    expect(driver.dump().notes).toEqual({ text: 'local draft', updatedAt: 1 })
    expect(driver.dump()['tab-two:sync-index:v1']).toBeUndefined()
    expect(api.pull).toHaveBeenCalledTimes(1)
    coordinator.stop()
  })
})
