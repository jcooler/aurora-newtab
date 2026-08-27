let epoch = 0
const listeners = new Set<() => void>()

/**
 * Full-store replacement changes ownership even when a connector config or
 * location is byte-identical. Derived-cache writers capture this epoch so a
 * request born before restore cannot repopulate data the restore cleared.
 */
export function currentCacheAuthorityEpoch(): number {
  return epoch
}

export function subscribeCacheAuthority(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function invalidateCacheAuthority(): void {
  epoch += 1
  for (const listener of listeners) listener()
}
