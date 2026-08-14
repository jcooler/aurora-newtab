import {
  CURRENT_VERSION,
  defaults,
  type AuroraData,
  type DataKey,
} from './schema'
import { migrate } from './migrations'
import type { MemoryStorageDriver, StorageDriver } from './driver'
import type { StorageAuthority } from './authority'

const VERSION_KEY = 'aurora:version'
const DATA_KEYS = Object.keys(defaults()) as DataKey[]

export class AtomicRestoreRollbackError extends Error {
  constructor(
    public readonly primaryError: unknown,
    public readonly rollbackError: unknown,
  ) {
    super('Aurora storage rollback failed')
    this.name = 'AtomicRestoreRollbackError'
  }
}

export interface AuroraStorage {
  init(): Promise<void>
  get<K extends DataKey>(key: K): Promise<AuroraData[K]>
  snapshot(): Promise<AuroraData>
  set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>
  setMany(patch: Partial<AuroraData>): Promise<void>
  /**
   * `finalize` runs inside the already-held storage critical section. It may
   * not call an AuroraStorage mutation because that would reacquire authority.
   */
  replaceAllWithRollback<T>(
    next: AuroraData,
    finalize: (previous: AuroraData) => Promise<T>,
  ): Promise<{ previous: AuroraData; value: T }>
  update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]>
  subscribe<K extends DataKey>(key: K, cb: (value: AuroraData[K]) => void): () => void
}

export function createStorage(driver: MemoryStorageDriver): AuroraStorage
export function createStorage(driver: StorageDriver, authority: StorageAuthority): AuroraStorage
export function createStorage(
  driver: StorageDriver | MemoryStorageDriver,
  suppliedAuthority?: StorageAuthority,
): AuroraStorage {
  const resolvedAuthority = suppliedAuthority ?? ('authority' in driver ? driver.authority : undefined)
  if (!resolvedAuthority) throw new Error('createStorage requires a storage authority')
  const authority: StorageAuthority = resolvedAuthority
  const chains = new Map<string, Promise<unknown>>()

  async function readSnapshot(): Promise<AuroraData> {
    const found = await driver.read(DATA_KEYS)
    const fallback = defaults()
    return Object.fromEntries(DATA_KEYS.map((key) => [
      key,
      key in found ? found[key] : fallback[key],
    ])) as unknown as AuroraData
  }

  function allKeyPatch(data: AuroraData): AuroraData {
    return Object.fromEntries(DATA_KEYS.map((key) => [key, data[key]])) as unknown as AuroraData
  }

  function structurallyEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false
      }
      return left.every((value, index) => structurallyEqual(value, right[index]))
    }
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      return false
    }
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(rightRecord, key)
      && structurallyEqual(leftRecord[key], rightRecord[key])
    ))
  }

  async function readValue<K extends DataKey>(key: K): Promise<AuroraData[K]> {
    const found = await driver.read([key])
    return (key in found ? found[key] : defaults()[key]) as AuroraData[K]
  }

  async function writePatch(patch: Partial<AuroraData>): Promise<void> {
    await driver.write(patch)
  }

  async function setMany(patch: Partial<AuroraData>): Promise<void> {
    await authority.runExclusive(() => writePatch(patch))
  }

  async function set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void> {
    await setMany({ [key]: value } as Pick<AuroraData, K>)
  }

  async function replaceAllWithRollback<T>(
    next: AuroraData,
    finalize: (previous: AuroraData) => Promise<T>,
  ): Promise<{ previous: AuroraData; value: T }> {
    return authority.runExclusive(async () => {
      const previous = await readSnapshot()
      const target = allKeyPatch(next)
      try {
        await writePatch(target)
        const verified = await readSnapshot()
        if (!structurallyEqual(verified, target)) {
          throw new Error('Aurora storage target verification failed')
        }
        const value = await finalize(previous)
        return { previous, value }
      } catch (primaryError) {
        try {
          await writePatch(allKeyPatch(previous))
          const rolledBack = await readSnapshot()
          if (!structurallyEqual(rolledBack, previous)) {
            throw new Error('Aurora storage rollback verification failed')
          }
        } catch (rollbackError) {
          throw new AtomicRestoreRollbackError(primaryError, rollbackError)
        }
        throw primaryError
      }
    })
  }

  function update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]> {
    // Preserve per-key FIFO order in this instance. The injected authority is
    // the correctness boundary across every extension context.
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(() => authority.runExclusive(async () => {
      const value = fn(await readValue(key))
      await writePatch({ [key]: value } as Pick<AuroraData, K>)
      return value
    }))
    chains.set(key, next.catch(() => undefined))
    return next
  }

  return {
    async init() {
      await authority.runExclusive(async () => {
        const all = await driver.read(null)
        const stored = all[VERSION_KEY]
        if (typeof stored !== 'number') {
          await driver.write({ ...defaults(), [VERSION_KEY]: CURRENT_VERSION })
          return
        }
        if (stored < CURRENT_VERSION) {
          const { [VERSION_KEY]: _v, ...snapshot } = all
          const migrated = migrate(snapshot, stored)
          await driver.write({ ...migrated, [VERSION_KEY]: CURRENT_VERSION })
          return
        }
        if (stored > CURRENT_VERSION) {
          console.warn(`Aurora data is schema v${stored}, app expects v${CURRENT_VERSION}`)
        }
      })
    },
    get: readValue,
    snapshot: () => authority.runExclusive(readSnapshot),
    set,
    setMany,
    replaceAllWithRollback,
    update,
    subscribe(key, cb) {
      return driver.onChanged((changes) => {
        // Cast assumes keys are never REMOVED from storage — a removal would
        // deliver `undefined` here despite the AuroraData[K] type saying otherwise.
        if (key in changes) cb(changes[key] as AuroraData[typeof key])
      })
    },
  }
}
