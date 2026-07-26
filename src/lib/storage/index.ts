import {
  CURRENT_VERSION,
  defaults,
  type AuroraData,
  type DataKey,
} from './schema'
import { migrate } from './migrations'
import type { StorageDriver } from './driver'

const VERSION_KEY = 'aurora:version'

export interface AuroraStorage {
  init(): Promise<void>
  get<K extends DataKey>(key: K): Promise<AuroraData[K]>
  set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>
  update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]>
  subscribe<K extends DataKey>(key: K, cb: (value: AuroraData[K]) => void): () => void
}

export function createStorage(driver: StorageDriver): AuroraStorage {
  const chains = new Map<string, Promise<unknown>>()

  async function get<K extends DataKey>(key: K): Promise<AuroraData[K]> {
    const found = await driver.read([key])
    return (key in found ? found[key] : defaults()[key]) as AuroraData[K]
  }

  async function set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void> {
    await driver.write({ [key]: value })
  }

  function update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]> {
    // Serialize read-modify-write per key: concurrent updates in THIS context
    // can no longer drop writes. (Cross-tab remains last-write-wins.)
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      const value = fn(await get(key))
      await set(key, value)
      return value
    })
    chains.set(key, next.catch(() => undefined))
    return next
  }

  return {
    async init() {
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
    },
    get,
    set,
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
