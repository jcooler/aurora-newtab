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

    async get(key) {
      const found = await driver.read([key])
      return (key in found ? found[key] : defaults()[key]) as AuroraData[typeof key]
    },

    async set(key, value) {
      await driver.write({ [key]: value })
    },

    async update(key, fn) {
      const next = fn(await this.get(key))
      await this.set(key, next)
      return next
    },

    subscribe(key, cb) {
      return driver.onChanged((changes) => {
        if (key in changes) cb(changes[key] as AuroraData[typeof key])
      })
    },
  }
}
