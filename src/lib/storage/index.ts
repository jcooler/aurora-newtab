import {
  CURRENT_VERSION,
  defaults,
  type AuroraData,
  type DataKey,
} from './schema'
import { migrate } from './migrations'
import type { MemoryStorageDriver, StorageDriver } from './driver'
import type { StorageAuthority } from './authority'
import { LegacyLayoutValidationError } from '../layout/v2'
import { LAYOUT_DENSITY_PREFERENCES } from '../layout/types'
import { isPlainObject } from '../object'

const VERSION_KEY = 'aurora:version'
const DATA_KEYS = Object.keys(defaults()) as DataKey[]
const LAYOUT_DENSITY_SET: ReadonlySet<unknown> = new Set(LAYOUT_DENSITY_PREFERENCES)

export class AtomicRestoreRollbackError extends Error {
  constructor(
    public readonly primaryError: unknown,
    public readonly rollbackError: unknown,
  ) {
    super('Aurora storage rollback failed')
    this.name = 'AtomicRestoreRollbackError'
  }
}

export class StorageInitializationError extends Error {
  constructor(public readonly cause: unknown) {
    super('Aurora storage initialization failed')
    this.name = 'StorageInitializationError'
  }
}

export class AtomicMigrationRollbackError extends Error {
  constructor(
    public readonly primaryError: unknown,
    public readonly rollbackError: unknown,
  ) {
    super('Aurora storage migration rollback failed')
    this.name = 'AtomicMigrationRollbackError'
  }
}

export interface AuroraStorage {
  init(): Promise<void>
  get<K extends DataKey>(key: K): Promise<AuroraData[K]>
  snapshot(): Promise<AuroraData>
  set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>
  setMany(patch: Partial<AuroraData>): Promise<void>
  updateMany<K extends DataKey>(
    keys: readonly K[],
    fn: (values: Pick<AuroraData, K>) => Partial<Pick<AuroraData, K>>,
  ): Promise<Partial<Pick<AuroraData, K>>>
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

  function knownSnapshotFrom(
    source: Record<string, unknown>,
    legacyLayoutDefault = false,
  ): Record<string, unknown> {
    const fallback = defaults() as unknown as Record<string, unknown>
    return Object.fromEntries(DATA_KEYS.map((key) => [
      key,
      Object.prototype.hasOwnProperty.call(source, key)
        ? source[key]
        : legacyLayoutDefault && key === 'layout'
          ? {}
          : fallback[key],
    ]))
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

  async function verifyFreshDefaults(): Promise<void> {
    const target = allKeyPatch(defaults())
    let writeError: unknown
    try {
      await driver.write(target as unknown as Record<string, unknown>)
    } catch (caught) {
      writeError = caught
    }
    try {
      const verified = await driver.read([...DATA_KEYS])
      if (!structurallyEqual(verified, target)) {
        throw new Error('Aurora storage defaults verification failed')
      }
    } catch (verificationError) {
      throw new StorageInitializationError(writeError ?? verificationError)
    }
  }

  async function stampAndVerifyVersion(): Promise<void> {
    const target = { [VERSION_KEY]: CURRENT_VERSION }
    let writeError: unknown
    try {
      await driver.write(target)
    } catch (caught) {
      writeError = caught
    }
    try {
      const verified = await driver.read([VERSION_KEY])
      if (!structurallyEqual(verified, target)) {
        throw new Error('Aurora storage version verification failed')
      }
    } catch (verificationError) {
      throw new StorageInitializationError(writeError ?? verificationError)
    }
  }

  function isExactInterruptedDefaults(all: Record<string, unknown>): boolean {
    const expected = allKeyPatch(defaults())
    return DATA_KEYS.every((key) => (
      Object.prototype.hasOwnProperty.call(all, key)
      && structurallyEqual(all[key], expected[key])
    ))
  }

  async function migrateAndVerify(
    all: Record<string, unknown>,
    storedVersion: number,
  ): Promise<void> {
    const { [VERSION_KEY]: _version, ...snapshot } = all
    // Migration and its typed legacy validation complete before the first
    // write, so malformed known state can never create a partial target.
    let migrated: AuroraData
    try {
      migrated = migrate(snapshot, storedVersion)
    } catch (caught) {
      if (caught instanceof LegacyLayoutValidationError) throw caught
      throw new StorageInitializationError(caught)
    }
    if (!isPlainObject(migrated.settings)) {
      throw new StorageInitializationError(undefined)
    }
    const target: Record<string, unknown> = {
      ...allKeyPatch(migrated),
      [VERSION_KEY]: CURRENT_VERSION,
    }
    const previous: Record<string, unknown> = {
      ...knownSnapshotFrom(snapshot, true),
      [VERSION_KEY]: storedVersion,
    }
    const verificationKeys = [...DATA_KEYS, VERSION_KEY]
    let primaryError: unknown
    try {
      await driver.write(target)
      const verified = await driver.read(verificationKeys)
      if (!structurallyEqual(verified, target)) {
        throw new Error('Aurora storage migration verification failed')
      }
      return
    } catch (caught) {
      primaryError = caught
    }

    try {
      await driver.write(previous)
      const rolledBack = await driver.read(verificationKeys)
      if (!structurallyEqual(rolledBack, previous)) {
        throw new Error('Aurora storage migration rollback verification failed')
      }
    } catch (rollbackError) {
      throw new AtomicMigrationRollbackError(primaryError, rollbackError)
    }
    throw new StorageInitializationError(primaryError)
  }

  async function upgradeV11MetadataOnly(): Promise<void> {
    const target = { [VERSION_KEY]: CURRENT_VERSION }
    const previous = { [VERSION_KEY]: 11 }
    let primaryError: unknown
    try {
      await driver.write(target)
      const verified = await driver.read([VERSION_KEY])
      if (!structurallyEqual(verified, target)) {
        throw new Error('Aurora storage version migration verification failed')
      }
      return
    } catch (caught) {
      primaryError = caught
    }

    try {
      await driver.write(previous)
      const rolledBack = await driver.read([VERSION_KEY])
      if (!structurallyEqual(rolledBack, previous)) {
        throw new Error('Aurora storage version migration rollback verification failed')
      }
    } catch (rollbackError) {
      throw new AtomicMigrationRollbackError(primaryError, rollbackError)
    }
    throw new StorageInitializationError(primaryError)
  }

  async function repairCurrentDensity(all: Record<string, unknown>): Promise<void> {
    const settings = all.settings
    if (!isPlainObject(settings) || LAYOUT_DENSITY_SET.has(settings.layoutDensity)) return

    const target = { ...settings, layoutDensity: 'auto' }
    let primaryError: unknown
    try {
      await driver.write({ settings: target })
      const verified = await driver.read(['settings'])
      if (!structurallyEqual(verified, { settings: target })) {
        throw new Error('Aurora storage density repair verification failed')
      }
      return
    } catch (caught) {
      primaryError = caught
    }

    try {
      await driver.write({ settings })
      const rolledBack = await driver.read(['settings'])
      if (!structurallyEqual(rolledBack, { settings })) {
        throw new Error('Aurora storage density repair rollback verification failed')
      }
    } catch (rollbackError) {
      throw new AtomicMigrationRollbackError(primaryError, rollbackError)
    }
    throw new StorageInitializationError(primaryError)
  }

  async function setMany(patch: Partial<AuroraData>): Promise<void> {
    await authority.runExclusive(() => writePatch(patch))
  }

  async function set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void> {
    await setMany({ [key]: value } as Pick<AuroraData, K>)
  }

  async function updateMany<K extends DataKey>(
    keys: readonly K[],
    fn: (values: Pick<AuroraData, K>) => Partial<Pick<AuroraData, K>>,
  ): Promise<Partial<Pick<AuroraData, K>>> {
    return authority.runExclusive(async () => {
      const found = await driver.read([...keys])
      const fallback = defaults()
      const values = Object.fromEntries(keys.map((key) => [
        key,
        key in found ? found[key] : fallback[key],
      ])) as Pick<AuroraData, K>
      const patch = fn(values)
      if (Object.keys(patch).length > 0) {
        await writePatch(patch as Partial<AuroraData>)
      }
      return patch
    })
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
        const hasVersion = Object.prototype.hasOwnProperty.call(all, VERSION_KEY)
        const stored = all[VERSION_KEY]
        if (!hasVersion) {
          const hasKnownData = DATA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(all, key))
          if (!hasKnownData) {
            await verifyFreshDefaults()
            await stampAndVerifyVersion()
            return
          }
          if (!isExactInterruptedDefaults(all)) {
            throw new StorageInitializationError(undefined)
          }
          await stampAndVerifyVersion()
          return
        }
        if (typeof stored !== 'number' || !Number.isFinite(stored)
          || !Number.isInteger(stored) || stored < 1) {
          throw new StorageInitializationError(undefined)
        }
        if (stored === 11 && CURRENT_VERSION === 12) {
          await upgradeV11MetadataOnly()
          return
        }
        if (stored < CURRENT_VERSION) {
          await migrateAndVerify(all, stored)
          return
        }
        if (stored === CURRENT_VERSION) {
          await repairCurrentDensity(all)
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
    updateMany,
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
