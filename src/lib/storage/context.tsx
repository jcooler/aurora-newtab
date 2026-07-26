import { createContext, useContext, type ReactNode } from 'react'
import type { AuroraStorage } from './index'

const StorageContext = createContext<AuroraStorage | null>(null)

export function StorageProvider({
  storage,
  children,
}: {
  storage: AuroraStorage
  children: ReactNode
}) {
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>
}

export function useStorage(): AuroraStorage {
  const storage = useContext(StorageContext)
  if (!storage) throw new Error('useStorage must be used inside <StorageProvider>')
  return storage
}
