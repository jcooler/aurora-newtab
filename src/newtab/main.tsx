import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createStorage, type AuroraStorage } from '../lib/storage/index'
import { chromeDriver } from '../lib/storage/chrome'
import type { StorageDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { createWebLockStorageAuthority } from '../lib/storage/authority'
import { initializePermissionMirror } from '../services/permissionMirror'
import { AccountProvider } from '../account/AccountContext'
import { SyncProvider } from '../sync/SyncProvider'
import { MetricsProvider } from '../metrics/MetricsProvider'
import { GoogleCalendarProvider } from '../providers/GoogleCalendarProvider'
import { MicrosoftCalendarProvider } from '../providers/MicrosoftCalendarProvider'
import './index.css'

type NotesHarnessController = Readonly<{
  deferNext(): void
  rejectNext(): void
  releaseNext(): Promise<void>
  rejectPending(): void
  reset(): Promise<void>
  snapshot(): Readonly<{
    mode: 'pass' | 'defer' | 'reject'
    pending: number
    attempted: number
    released: number
    rejected: number
  }>
}>

const nativeDriver = chromeDriver()
let driver: StorageDriver = nativeDriver
let notesHarness: NotesHarnessController | undefined

if (import.meta.env.MODE === 'preview') {
  let mode: 'pass' | 'defer' | 'reject' = 'pass'
  let attempted = 0
  let released = 0
  let rejected = 0
  const pending: Array<{
    patch: Parameters<StorageDriver['write']>[0]
    resolve: () => void
    reject: (error: Error) => void
  }> = []

  driver = {
    read: (keys) => nativeDriver.read(keys),
    onChanged: (callback) => nativeDriver.onChanged(callback),
    write: async (patch) => {
      if (!Object.prototype.hasOwnProperty.call(patch, 'notes')) {
        await nativeDriver.write(patch)
        return
      }
      attempted += 1
      const selected = mode
      mode = 'pass'
      if (selected === 'reject') {
        rejected += 1
        throw new Error('Preview Notes write rejection')
      }
      if (selected === 'defer') {
        await new Promise<void>((resolve, reject) => pending.push({ patch, resolve, reject }))
        return
      }
      await nativeDriver.write(patch)
    },
  }

  const rejectPending = () => {
    for (const operation of pending.splice(0)) {
      rejected += 1
      operation.reject(new Error('Preview Notes write reset'))
    }
  }
  notesHarness = Object.freeze({
    deferNext: () => { mode = 'defer' },
    rejectNext: () => { mode = 'reject' },
    releaseNext: async () => {
      const operation = pending.shift()
      if (!operation) throw new Error('No deferred Notes write')
      try {
        await nativeDriver.write(operation.patch)
        released += 1
        operation.resolve()
      } catch (error) {
        operation.reject(error instanceof Error ? error : new Error(String(error)))
        throw error
      }
    },
    rejectPending,
    reset: async () => {
      mode = 'pass'
      rejectPending()
      await Promise.resolve()
    },
    snapshot: () => Object.freeze({ mode, pending: pending.length, attempted, released, rejected }),
  })
}

const storageAuthority = createWebLockStorageAuthority(navigator.locks)
const storage = createStorage(driver, storageAuthority)
await storage.init()
await initializePermissionMirror()

if (import.meta.env.MODE === 'preview') {
  ;(globalThis as typeof globalThis & {
    __auroraStorageHarness?: Pick<AuroraStorage, 'update'> & { notes: NotesHarnessController }
  }).__auroraStorageHarness = { update: storage.update, notes: notesHarness! }
}

createRoot(document.getElementById('root')!, {
  // WidgetBoundary already emits the one fixed-safe diagnostic. React 19's
  // default caught-error reporter would log the raw thrown value first.
  onCaughtError: () => {},
  // Replacing React's other default reporters prevents secret-bearing thrown
  // values and component stacks from reaching the console. These fixed
  // diagnostics still make root-level failures observable without attaching
  // the error or errorInfo capability data.
  onUncaughtError: () => console.error('[aurora] uncaught root render failure'),
  onRecoverableError: () => console.error('[aurora] recoverable root render failure'),
}).render(
  <StrictMode>
    <StorageProvider storage={storage} syncRuntime={{ driver, authority: storageAuthority }}>
      <AccountProvider>
        <GoogleCalendarProvider>
          <MicrosoftCalendarProvider>
            <MetricsProvider>
              <SyncProvider>
                <App />
              </SyncProvider>
            </MetricsProvider>
          </MicrosoftCalendarProvider>
        </GoogleCalendarProvider>
      </AccountProvider>
    </StorageProvider>
  </StrictMode>,
)
