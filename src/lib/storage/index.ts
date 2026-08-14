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

export interface AuroraStorage {
  init(): Promise<void>
  get<K extends DataKey>(key: K): Promise<AuroraData[K]>
  set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>
  setMany(patch: Partial<AuroraData>): Promise<void>
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
    set,
    setMany,
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
