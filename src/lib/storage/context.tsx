import { createContext, useContext, type ReactNode } from 'react'
import type { AuroraStorage } from './index'
import type { StorageDriver } from './driver'
import type { StorageAuthority } from './authority'

const StorageContext = createContext<AuroraStorage | null>(null)
export interface SyncStorageRuntime {
  driver: Pick<StorageDriver, 'read' | 'write' | 'onChanged'>
  authority: StorageAuthority
}
const SyncStorageContext = createContext<SyncStorageRuntime | null>(null)

export function StorageProvider({
  storage,
  syncRuntime = null,
  children,
}: {
  storage: AuroraStorage
  syncRuntime?: SyncStorageRuntime | null
  children: ReactNode
}) {
  return (
    <StorageContext.Provider value={storage}>
      <SyncStorageContext.Provider value={syncRuntime}>{children}</SyncStorageContext.Provider>
    </StorageContext.Provider>
  )
}

export function useSyncStorageRuntime(): SyncStorageRuntime | null {
  return useContext(SyncStorageContext)
}

export function useStorage(): AuroraStorage {
  const storage = useContext(StorageContext)
  if (!storage) throw new Error('useStorage must be used inside <StorageProvider>')
  return storage
}
