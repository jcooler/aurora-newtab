export type Changes = Record<string, unknown>

export interface StorageDriver {
  read(keys: string[] | null): Promise<Record<string, unknown>>
  write(patch: Record<string, unknown>): Promise<void>
  onChanged(cb: (changes: Changes) => void): () => void
}

/** In-memory driver for tests. `write` notifies listeners like chrome.storage does. */
export function memoryDriver(
  seed: Record<string, unknown> = {},
): StorageDriver & { dump(): Record<string, unknown> } {
  const store: Record<string, unknown> = { ...seed }
  const listeners = new Set<(c: Changes) => void>()
  return {
    async read(keys) {
      if (keys === null) return { ...store }
      const out: Record<string, unknown> = {}
      for (const k of keys) if (k in store) out[k] = store[k]
      return out
    },
    async write(patch) {
      Object.assign(store, patch)
      for (const cb of listeners) cb({ ...patch })
    },
    onChanged(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    dump: () => ({ ...store }),
  }
}
