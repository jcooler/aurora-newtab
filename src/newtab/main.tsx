import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createStorage, type AuroraStorage } from '../lib/storage/index'
import { chromeDriver } from '../lib/storage/chrome'
import { StorageProvider } from '../lib/storage/context'
import { createWebLockStorageAuthority } from '../lib/storage/authority'
import './index.css'

const storage = createStorage(chromeDriver(), createWebLockStorageAuthority(navigator.locks))
await storage.init()

if (import.meta.env.MODE === 'preview') {
  ;(globalThis as typeof globalThis & {
    __auroraStorageHarness?: Pick<AuroraStorage, 'update'>
  }).__auroraStorageHarness = { update: storage.update }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StorageProvider storage={storage}>
      <App />
    </StorageProvider>
  </StrictMode>,
)
