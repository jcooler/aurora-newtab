import { useCallback, useEffect, useState } from 'react'
import type { AuroraData, DataKey } from '../storage/schema'
import { useStorage } from '../storage/context'

export function useStoredKey<K extends DataKey>(key: K) {
  const storage = useStorage()
  const [value, setValue] = useState<AuroraData[K] | undefined>(undefined)

  useEffect(() => {
    let live = true
    let gotUpdate = false
    // Subscribe BEFORE the initial read, and let any subscribed update win:
    // otherwise a slow get() can resolve after a fresher onChanged value and
    // clobber it with stale data.
    const unsubscribe = storage.subscribe(key, (v) => {
      gotUpdate = true
      setValue(v)
    })
    void storage.get(key).then((v) => {
      if (live && !gotUpdate) setValue(v)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [key, storage])

  const save = useCallback(
    (next: AuroraData[K]) => {
      setValue(next) // optimistic; subscribe confirms
      storage.set(key, next).catch((error: unknown) => {
        // Persist failed (quota, invalidated context): re-sync from storage
        // so local state doesn't silently diverge from what's persisted.
        console.error(`[aurora] failed to persist ${key}:`, error)
        void storage.get(key).then((v) => setValue(v))
      })
    },
    [key, storage],
  )

  return [value, save] as const
}
