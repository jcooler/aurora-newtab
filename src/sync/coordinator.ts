import type { StorageAuthority } from '../lib/storage/authority'
import type { StorageDriver } from '../lib/storage/driver'
import { AURORA_DATA_KEYS, defaults, type AuroraData } from '../lib/storage/schema'
import { canonicalUtf8 } from './canonical'
import { decryptSyncRecord, encryptSyncRecord } from './crypto'
import { applySyncEntity, isValidSyncEntityIdentity, projectSyncEntities, removeSyncEntity } from './entityPolicy'
import type { SyncGateway, SyncPushMutationV1, SyncPushOutcome } from './gateway'
import {
  SYNC_INDEX_STORAGE_KEY,
  SYNC_CONFLICT_BACKUPS_STORAGE_KEY,
  emptyConflictBackups,
  emptySyncIndex,
  parseConflictBackupsState,
  parseSyncIndexState,
  type SyncIndexStateV1,
} from './localState'
import type { SyncEntityType, SyncEntityV1 } from './types'

const PUSH_DEBOUNCE_MS = 750
const PUSH_MAX_WAIT_MS = 5_000
const VISIBLE_PULL_MS = 60_000
const FOCUS_PULL_THRESHOLD_MS = 15_000
const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000] as const
const MAX_PUSH_BYTES = 256 * 1_024
const CONFLICT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export type CoordinatorPhase = 'syncing' | 'up_to_date' | 'offline' | 'needs_attention'

export interface CoordinatorState {
  phase: CoordinatorPhase
  lastSuccessAt: number | null
  usedBytes: number
  quotaBytes: 2_097_152
}

export interface QueuedMutation {
  entityType: SyncEntityType
  entityId: string
  entity: SyncEntityV1 | null
  expectedRevision: number
  revision: number
  digest: string
}

export interface CoordinatorStorage {
  project(): Promise<readonly SyncEntityV1[]>
  readIndex(): Promise<SyncIndexStateV1>
  writeIndex(index: SyncIndexStateV1): Promise<void>
  applyRemote(input: {
    entityType: SyncEntityType
    entityId: string
    entity: SyncEntityV1 | null
    revision: number
    vaultVersion: number
    digest: string
    conflict: boolean
  }): Promise<void>
  applyRemoteBatch(inputs: readonly Parameters<CoordinatorStorage['applyRemote']>[0][]): Promise<void>
  subscribe(listener: () => void): () => void
}

export interface SyncCoordinatorDependencies {
  accountId: string
  deviceId: string
  key: CryptoKey
  gateway: SyncGateway
  storage: CoordinatorStorage
  crypto?: Crypto
  now?: () => number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
  onState?(state: CoordinatorState): void
}

interface PendingPushBatch {
  queued: QueuedMutation[]
  mutations: SyncPushMutationV1[]
}

function encodedPushBytes(deviceId: string, mutations: readonly SyncPushMutationV1[]): number {
  return new TextEncoder().encode(JSON.stringify({
    deviceId,
    mutations: mutations.map((item) => ({
      idempotencyId: item.idempotencyId,
      envelopeVersion: item.record.envelopeVersion,
      entityType: item.record.entityType,
      entityId: item.record.entityId,
      expectedRevision: item.expectedRevision,
      revision: item.record.revision,
      tombstone: item.record.tombstone,
      nonce: item.record.nonce,
      ciphertext: item.record.ciphertext,
    })),
  })).byteLength
}

export interface SyncCoordinator {
  start(): void
  stop(): void
  syncNow(): Promise<void>
  focus(): void
  getState(): CoordinatorState
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

export function syncEntityKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

function parseEntityKey(value: string): { entityType: SyncEntityType; entityId: string } | null {
  const separator = value.indexOf(':')
  if (separator < 1) return null
  const entityType = value.slice(0, separator) as SyncEntityType
  const entityId = value.slice(separator + 1)
  return isValidSyncEntityIdentity(entityType, entityId) ? { entityType, entityId } : null
}

export async function digestSyncEntity(
  entity: SyncEntityV1 | null,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<string> {
  const digest = await cryptoImplementation.subtle.digest(
    'SHA-256',
    Uint8Array.from(canonicalUtf8(entity)).buffer,
  )
  return encodeBase64Url(new Uint8Array(digest))
}

export async function deriveQueuedMutations(
  entities: readonly SyncEntityV1[],
  index: SyncIndexStateV1,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<QueuedMutation[]> {
  const current = new Map(entities.map((entity) => [syncEntityKey(entity.entityType, entity.entityId), entity]))
  const keys = [...new Set([...current.keys(), ...Object.keys(index.entities)])].sort()
  const queue: QueuedMutation[] = []
  for (const key of keys) {
    const identity = parseEntityKey(key)
    if (!identity) throw new Error('sync_index_invalid')
    const entity = current.get(key) ?? null
    const digest = await digestSyncEntity(entity, cryptoImplementation)
    const accepted = index.entities[key]
    if (accepted?.digest === digest) continue
    const expectedRevision = accepted?.revision ?? 0
    queue.push(Object.freeze({
      ...identity,
      entity: entity ? structuredClone(entity) : null,
      expectedRevision,
      revision: expectedRevision + 1,
      digest,
    }))
  }
  return queue.sort((left, right) => {
    const leftPriority = left.entityType === 'layout_manifest' && left.entity !== null ? 1 : 0
    const rightPriority = right.entityType === 'layout_manifest' && right.entity !== null ? 1 : 0
    return leftPriority - rightPriority
      || syncEntityKey(left.entityType, left.entityId).localeCompare(syncEntityKey(right.entityType, right.entityId))
  })
}

export function mutationBatches<T>(items: readonly T[], maximum = 50): readonly (readonly T[])[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 50) {
    throw new Error('sync_batch_limit_invalid')
  }
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += maximum) {
    batches.push(items.slice(index, index + maximum))
  }
  return batches
}

export function retryDelay(failureCount: number): number {
  if (!Number.isSafeInteger(failureCount) || failureCount < 1) throw new Error('sync_failure_count_invalid')
  return BACKOFF_MS[Math.min(failureCount - 1, BACKOFF_MS.length - 1)]
}

export function applyAcceptedOutcomes(
  index: SyncIndexStateV1,
  queued: readonly QueuedMutation[],
  outcomes: readonly SyncPushOutcome[],
): SyncIndexStateV1 {
  if (queued.length !== outcomes.length) throw new Error('sync_outcome_invalid')
  const entities = { ...index.entities }
  let lastVaultVersion = index.lastVaultVersion
  outcomes.forEach((outcome, position) => {
    const mutation = queued[position]!
    if (outcome.entityType !== mutation.entityType || outcome.entityId !== mutation.entityId) {
      throw new Error('sync_outcome_invalid')
    }
    if (outcome.status !== 'accepted') return
    if (outcome.revision !== mutation.revision) throw new Error('sync_outcome_invalid')
    entities[syncEntityKey(mutation.entityType, mutation.entityId)] = {
      revision: outcome.revision,
      digest: mutation.digest,
    }
    lastVaultVersion = Math.max(lastVaultVersion, outcome.vaultVersion)
  })
  return Object.freeze({ ...index, lastVaultVersion, entities: Object.freeze(entities) })
}

function dataFrom(found: Record<string, unknown>): AuroraData {
  const fallback = defaults()
  return Object.fromEntries(AURORA_DATA_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(found, key) ? found[key] : fallback[key],
  ])) as unknown as AuroraData
}

function dataPatch(data: AuroraData): AuroraData {
  return Object.fromEntries(AURORA_DATA_KEYS.map((key) => [key, data[key]])) as unknown as AuroraData
}

export function createCoordinatorStorage(input: {
  driver: Pick<StorageDriver, 'read' | 'write' | 'onChanged'>
  authority: StorageAuthority
  accountId: string
}): CoordinatorStorage {
  const readIndexUnlocked = async () => {
    const found = await input.driver.read([SYNC_INDEX_STORAGE_KEY])
    const value = found[SYNC_INDEX_STORAGE_KEY]
    if (value === undefined) return emptySyncIndex(input.accountId)
    const index = parseSyncIndexState(value, input.accountId)
    if (!index) throw new Error('sync_index_invalid')
    return index
  }
  const applyRemoteBatch: CoordinatorStorage['applyRemoteBatch'] = (remotes) => (
    input.authority.runExclusive(async () => {
      if (remotes.length < 1 || remotes.length > 100) throw new Error('sync_remote_page_invalid')
      const found = await input.driver.read([
        ...AURORA_DATA_KEYS,
        SYNC_INDEX_STORAGE_KEY,
        SYNC_CONFLICT_BACKUPS_STORAGE_KEY,
      ])
      let index = found[SYNC_INDEX_STORAGE_KEY] === undefined
        ? emptySyncIndex(input.accountId)
        : parseSyncIndexState(found[SYNC_INDEX_STORAGE_KEY], input.accountId)
      let backups = found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY] === undefined
        ? emptyConflictBackups(input.accountId)
        : parseConflictBackupsState(found[SYNC_CONFLICT_BACKUPS_STORAGE_KEY], input.accountId)
      if (!index || !backups) throw new Error('sync_local_state_invalid')
      let data = dataFrom(found)
      for (const remote of remotes) {
        if (remote.vaultVersion < index.lastVaultVersion
          || (remote.entity && (remote.entity.entityType !== remote.entityType
            || remote.entity.entityId !== remote.entityId))) {
          throw new Error('sync_index_invalid')
        }
        if (remote.conflict) {
          const displaced = projectSyncEntities(data).find((candidate) =>
            candidate.entityType === remote.entityType && candidate.entityId === remote.entityId)
          if (!displaced) throw new Error('sync_conflict_backup_invalid')
          const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
          const createdAt = Date.now()
          const backup = {
            id: encodeBase64Url(bytes),
            entity: displaced,
            observedRemoteRevision: remote.revision,
            createdAt,
            reason: 'stale_remote_winner' as const,
          }
          backups = parseConflictBackupsState({
            ...backups,
            items: [backup, ...backups.items]
              .filter((item) => item.createdAt >= createdAt - CONFLICT_RETENTION_MS
                && item.createdAt <= createdAt)
              .sort((left, right) => right.createdAt - left.createdAt)
              .slice(0, 5),
          }, input.accountId)
          if (!backups) throw new Error('sync_conflict_backup_invalid')
        }
        data = remote.entity
          ? applySyncEntity(data, remote.entity)
          : removeSyncEntity(data, remote.entityType, remote.entityId)
        index = parseSyncIndexState({
          ...index,
          lastVaultVersion: remote.vaultVersion,
          entities: {
            ...index.entities,
            [syncEntityKey(remote.entityType, remote.entityId)]: {
              revision: remote.revision,
              digest: remote.digest,
            },
          },
        }, input.accountId)
        if (!index) throw new Error('sync_index_invalid')
      }
      await input.driver.write({
        ...dataPatch(data),
        [SYNC_INDEX_STORAGE_KEY]: index,
        [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: backups,
      })
    })
  )
  return {
    project: () => input.authority.runExclusive(async () => projectSyncEntities(dataFrom(
      await input.driver.read([...AURORA_DATA_KEYS]),
    ))),
    readIndex: () => input.authority.runExclusive(readIndexUnlocked),
    writeIndex: (index) => input.authority.runExclusive(async () => {
      const cleaned = parseSyncIndexState(index, input.accountId)
      if (!cleaned) throw new Error('sync_index_invalid')
      await input.driver.write({ [SYNC_INDEX_STORAGE_KEY]: cleaned })
    }),
    applyRemote: async (remote) => applyRemoteBatch([remote]),
    applyRemoteBatch,
    subscribe(listener) {
      return input.driver.onChanged((changes) => {
        if (Object.keys(changes).some((key) => (AURORA_DATA_KEYS as readonly string[]).includes(key))) listener()
      })
    },
  }
}

export function createSyncCoordinator(dependencies: SyncCoordinatorDependencies): SyncCoordinator {
  const cryptoImplementation = dependencies.crypto ?? globalThis.crypto
  const now = dependencies.now ?? Date.now
  const setTimeoutFn = dependencies.setTimeout ?? globalThis.setTimeout
  const clearTimeoutFn = dependencies.clearTimeout ?? globalThis.clearTimeout
  const setIntervalFn = dependencies.setInterval ?? globalThis.setInterval
  const clearIntervalFn = dependencies.clearInterval ?? globalThis.clearInterval
  let state: CoordinatorState = Object.freeze({
    phase: 'up_to_date', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152,
  })
  let running = false
  let generation = 0
  let inFlight: Promise<void> | null = null
  let rerun = false
  let unsubscribe = () => {}
  let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let maxWaitTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let pullInterval: ReturnType<typeof globalThis.setInterval> | null = null
  let firstPendingAt: number | null = null
  let lastPullAt: number | null = null
  let failures = 0
  let controller: AbortController | null = null
  let applyingRemote = false
  let pendingPushes: PendingPushBatch[] | null = null

  const publish = (patch: Partial<CoordinatorState>) => {
    state = Object.freeze({ ...state, ...patch })
    dependencies.onState?.(state)
  }
  const clearTimer = (timer: ReturnType<typeof globalThis.setTimeout> | null) => {
    if (timer !== null) clearTimeoutFn(timer)
  }
  const clearPushTimers = () => {
    clearTimer(debounceTimer)
    clearTimer(maxWaitTimer)
    debounceTimer = null
    maxWaitTimer = null
    firstPendingAt = null
  }
  const scheduleRetry = () => {
    clearTimer(retryTimer)
    retryTimer = setTimeoutFn(() => { retryTimer = null; void runCycle('retry') }, retryDelay(failures))
  }
  const fail = (kind: 'offline' | 'needs_attention') => {
    publish({ phase: kind })
    if (kind === 'offline' && running) {
      failures += 1
      scheduleRetry()
    }
  }

  async function pullAll(key: CryptoKey, cycleGeneration: number, signal: AbortSignal): Promise<boolean> {
    let index = await dependencies.storage.readIndex()
    const afterVaultVersion = index.lastVaultVersion
    let cursor = index.lastVaultVersion
    let acknowledgeVaultVersion: number | null = null
    do {
      const page = await dependencies.gateway.pull({
        accountId: dependencies.accountId,
        deviceId: dependencies.deviceId,
        afterVaultVersion,
        cursor,
        limit: 100,
        acknowledgeVaultVersion,
      }, signal)
      if (!running || cycleGeneration !== generation) return false
      if (!page.ok) { fail(page.kind === 'offline' ? 'offline' : 'needs_attention'); return false }
      const remoteBatch: Parameters<CoordinatorStorage['applyRemote']>[0][] = []
      const localByKey = new Map((await dependencies.storage.project()).map((candidate) => [
        syncEntityKey(candidate.entityType, candidate.entityId),
        candidate,
      ]))
      for (const record of page.value.records) {
        const entity = await decryptSyncRecord(key, record, cryptoImplementation)
        if (!running || cycleGeneration !== generation) return false
        const digest = await digestSyncEntity(entity, cryptoImplementation)
        const entityKey = syncEntityKey(record.entityType, record.entityId)
        const accepted = index.entities[entityKey]
        const local = localByKey.get(entityKey) ?? null
        const localDigest = await digestSyncEntity(local, cryptoImplementation)
        const conflict = Boolean(local && localDigest !== digest
          && (!accepted || (accepted.digest !== localDigest && accepted.revision < record.revision)))
        remoteBatch.push({
          entityType: record.entityType,
          entityId: record.entityId,
          entity,
          revision: record.revision,
          vaultVersion: record.vaultVersion,
          digest,
          conflict,
        })
        if (entity) localByKey.set(entityKey, entity)
        else localByKey.delete(entityKey)
      }
      if (remoteBatch.length > 0) {
        applyingRemote = true
        try {
          await dependencies.storage.applyRemoteBatch(remoteBatch)
        } finally {
          applyingRemote = false
        }
        index = await dependencies.storage.readIndex()
      }
      cursor = page.value.nextCursor ?? page.value.vaultVersion
      if (page.value.nextCursor === null) {
        if (page.value.vaultVersion > index.lastVaultVersion) {
          index = { ...index, lastVaultVersion: page.value.vaultVersion }
          await dependencies.storage.writeIndex(index)
        }
        if (page.value.vaultVersion === 0 || acknowledgeVaultVersion === page.value.vaultVersion) break
        acknowledgeVaultVersion = page.value.vaultVersion
      }
    } while (true)
    lastPullAt = now()
    return true
  }

  async function buildPendingPushes(key: CryptoKey): Promise<PendingPushBatch[]> {
    let index = await dependencies.storage.readIndex()
    const queued = await deriveQueuedMutations(await dependencies.storage.project(), index, cryptoImplementation)
    const batches: PendingPushBatch[] = []
    let current: PendingPushBatch = { queued: [], mutations: [] }
    for (const mutation of queued) {
        // UUID v4 is the reviewed server idempotency shape.
        const bytes = cryptoImplementation.getRandomValues(new Uint8Array(16))
        bytes[6] = (bytes[6]! & 0x0f) | 0x40
        bytes[8] = (bytes[8]! & 0x3f) | 0x80
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
        const idempotencyId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        const encrypted: SyncPushMutationV1 = {
          idempotencyId,
          expectedRevision: mutation.expectedRevision,
          record: await encryptSyncRecord(key, {
            envelopeVersion: 1,
            accountId: dependencies.accountId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            revision: mutation.revision,
            tombstone: mutation.entity === null,
          }, mutation.entity, { crypto: cryptoImplementation }),
        }
        const candidate = [...current.mutations, encrypted]
        const encodedBytes = encodedPushBytes(dependencies.deviceId, candidate)
        if (current.mutations.length > 0
          && (current.mutations.length === 50 || encodedBytes > MAX_PUSH_BYTES)) {
          batches.push(current)
          current = { queued: [], mutations: [] }
        }
        if (encodedPushBytes(dependencies.deviceId, [...current.mutations, encrypted]) > MAX_PUSH_BYTES) {
          throw new Error('sync_mutation_too_large')
        }
        current.queued.push(mutation)
        current.mutations.push(encrypted)
      }
    if (current.mutations.length > 0) batches.push(current)
    return batches
  }

  async function pushLocal(
    key: CryptoKey,
    cycleGeneration: number,
    signal: AbortSignal,
  ): Promise<false | 'none' | 'pushed'> {
    let index = await dependencies.storage.readIndex()
    const activePending = pendingPushes ?? await buildPendingPushes(key)
    pendingPushes = activePending
    if (activePending.length === 0) {
      pendingPushes = null
      return 'none'
    }
    let didPush = false
    while (activePending.length > 0) {
      const batch = activePending[0]!
      const pushed = await dependencies.gateway.push({
        accountId: dependencies.accountId,
        deviceId: dependencies.deviceId,
        mutations: batch.mutations,
      }, signal)
      if (!running || cycleGeneration !== generation) return false
      if (!pushed.ok) { fail(pushed.kind === 'offline' ? 'offline' : 'needs_attention'); return false }
      if (pushed.value.some((outcome) => outcome.status === 'quota')) {
        fail('needs_attention')
        return false
      }
      for (let position = 0; position < pushed.value.length; position += 1) {
        const outcome = pushed.value[position]!
        if (outcome.status !== 'stale') continue
        if (outcome.revision === 0 && outcome.winner === null) {
          const currentIndex = await dependencies.storage.readIndex()
          const entities = { ...currentIndex.entities }
          delete entities[syncEntityKey(outcome.entityType, outcome.entityId)]
          await dependencies.storage.writeIndex({ ...currentIndex, entities })
          continue
        }
        const winnerEntity = outcome.winner
          ? await decryptSyncRecord(key, outcome.winner, cryptoImplementation)
          : null
        const digest = await digestSyncEntity(winnerEntity, cryptoImplementation)
        applyingRemote = true
        try {
          await dependencies.storage.applyRemote({
            entityType: outcome.entityType,
            entityId: outcome.entityId,
            entity: winnerEntity,
            revision: outcome.revision,
            vaultVersion: outcome.winner?.vaultVersion ?? index.lastVaultVersion,
            digest,
            conflict: batch.queued[position]!.entity !== null,
          })
        } finally {
          applyingRemote = false
        }
      }
      index = await dependencies.storage.readIndex()
      index = applyAcceptedOutcomes(index, batch.queued, pushed.value)
      await dependencies.storage.writeIndex(index)
      activePending.shift()
      didPush = true
    }
    pendingPushes = null
    return didPush ? 'pushed' : 'none'
  }

  async function execute(cycleGeneration: number): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    publish({ phase: 'syncing' })
    try {
      const pulled = await pullAll(dependencies.key, cycleGeneration, controller.signal)
      if (!pulled) return
      const pushed = await pushLocal(dependencies.key, cycleGeneration, controller.signal)
      if (!pushed) return
      if (pushed === 'pushed') {
        const converged = await pullAll(dependencies.key, cycleGeneration, controller.signal)
        if (!converged) return
      }
      if (!running || cycleGeneration !== generation) return
      failures = 0
      clearTimer(retryTimer)
      retryTimer = null
      publish({ phase: 'up_to_date', lastSuccessAt: now() })
    } catch {
      if (running && cycleGeneration === generation) fail(controller.signal.aborted ? 'offline' : 'needs_attention')
    }
  }

  function runCycle(reason: string): Promise<void> {
    if (!running) return Promise.resolve()
    clearPushTimers()
    if (retryTimer !== null && !['retry', 'focus', 'manual'].includes(reason)) {
      return Promise.resolve()
    }
    if (retryTimer !== null && ['focus', 'manual'].includes(reason)) {
      clearTimer(retryTimer)
      retryTimer = null
    }
    if (inFlight) {
      rerun = true
      return inFlight
    }
    const cycleGeneration = generation
    inFlight = execute(cycleGeneration).finally(() => {
      inFlight = null
      if (rerun && running && cycleGeneration === generation) {
        rerun = false
        void runCycle('rerun')
      }
    })
    return inFlight
  }

  function localChanged() {
    if (!running || applyingRemote) return
    if (firstPendingAt === null) {
      firstPendingAt = now()
      maxWaitTimer = setTimeoutFn(() => { void runCycle('max-wait') }, PUSH_MAX_WAIT_MS)
    }
    clearTimer(debounceTimer)
    debounceTimer = setTimeoutFn(() => { void runCycle('debounce') }, PUSH_DEBOUNCE_MS)
  }

  return Object.freeze({
    start() {
      if (running) return
      running = true
      generation += 1
      unsubscribe = dependencies.storage.subscribe(localChanged)
      pullInterval = setIntervalFn(() => { void runCycle('interval') }, VISIBLE_PULL_MS)
      void runCycle('start')
    },
    stop() {
      if (!running) return
      running = false
      generation += 1
      controller?.abort()
      controller = null
      unsubscribe()
      unsubscribe = () => {}
      clearPushTimers()
      clearTimer(retryTimer)
      retryTimer = null
      if (pullInterval !== null) clearIntervalFn(pullInterval)
      pullInterval = null
    },
    async syncNow() {
      await runCycle('manual')
      while (inFlight) await inFlight
    },
    focus() {
      if (running && (lastPullAt === null || now() - lastPullAt >= FOCUS_PULL_THRESHOLD_MS)) {
        void runCycle('focus')
      }
    },
    getState: () => state,
  })
}
