import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createStorage } from '../lib/storage/index'
import { chromeDriver } from '../lib/storage/chrome'
import { StorageProvider } from '../lib/storage/context'
import './index.css'

const storage = createStorage(chromeDriver())
await storage.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StorageProvider storage={storage}>
      <App />
    </StorageProvider>
  </StrictMode>,
)
