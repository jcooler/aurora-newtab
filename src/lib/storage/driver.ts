import { createInProcessStorageAuthority, type StorageAuthority } from './authority'

export type Changes = Record<string, unknown>

export interface StorageDriver {
  read(keys: string[] | null): Promise<Record<string, unknown>>
  write(patch: Record<string, unknown>): Promise<void>
  onChanged(cb: (changes: Changes) => void): () => void
}

export interface MemoryStorageDriver extends StorageDriver {
  readonly authority: StorageAuthority
  dump(): Record<string, unknown>
}

/** In-memory driver for tests. `write` notifies listeners like chrome.storage does. */
export function memoryDriver(
  seed: Record<string, unknown> = {},
): MemoryStorageDriver {
  const store: Record<string, unknown> = { ...seed }
  const listeners = new Set<(c: Changes) => void>()
  return {
    authority: createInProcessStorageAuthority(),
    async read(keys) {
      if (keys === null) return { ...store }
      const out: Record<string, unknown> = {}
      for (const k of keys) if (k in store) out[k] = store[k]
      return out
    },
    async write(patch) {
      const changed: Changes = {}
      for (const k of Object.keys(patch)) {
        if (JSON.stringify(store[k]) !== JSON.stringify(patch[k])) changed[k] = patch[k]
      }
      Object.assign(store, patch)
      if (Object.keys(changed).length === 0) return
      for (const cb of listeners) cb(changed)
    },
    onChanged(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    dump: () => ({ ...store }),
  }
}
