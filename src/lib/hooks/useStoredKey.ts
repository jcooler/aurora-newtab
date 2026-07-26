import { useCallback, useEffect, useState } from 'react'
import type { AuroraData, DataKey } from '../storage/schema'
import { useStorage } from '../storage/context'

export function useStoredKey<K extends DataKey>(key: K) {
  const storage = useStorage()
  const [value, setValue] = useState<AuroraData[K] | undefined>(undefined)

  useEffect(() => {
    let live = true
    void storage.get(key).then((v) => {
      if (live) setValue(v)
    })
    const unsubscribe = storage.subscribe(key, setValue)
    return () => {
      live = false
      unsubscribe()
    }
  }, [key, storage])

  const save = useCallback(
    (next: AuroraData[K]) => {
      setValue(next) // optimistic; subscribe confirms
      void storage.set(key, next)
    },
    [key, storage],
  )

  return [value, save] as const
}
