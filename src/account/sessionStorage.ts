export const ACCOUNT_SESSION_STORAGE_KEY = 'tab-two:account-session:v1' as const

export interface StoredAccountSessionV1 {
  version: 1
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: 'bearer'
}

export interface AccountSessionStorageBoundary {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  onChanged(key: string, listener: (value: unknown) => void): () => void
}

export type AccountSessionStorageErrorCode = 'invalid_session' | 'storage_unavailable'

export class AccountSessionStorageError extends Error {
  readonly code: AccountSessionStorageErrorCode

  constructor(code: AccountSessionStorageErrorCode) {
    super(code)
    this.name = 'AccountSessionStorageError'
    this.code = code
  }
}

export interface AccountSessionStore {
  read(): Promise<StoredAccountSessionV1 | null>
  write(session: StoredAccountSessionV1): Promise<void>
  clear(): Promise<void>
  subscribe(listener: (session: StoredAccountSessionV1 | null) => void): () => void
}

const sessionKeys = ['version', 'accessToken', 'refreshToken', 'expiresAt', 'tokenType']

function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16_384
}

function cleanSession(value: unknown, now: number): StoredAccountSessionV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const expected = [...sessionKeys].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null
  if (
    record.version !== 1
    || !validToken(record.accessToken)
    || !validToken(record.refreshToken)
    || !Number.isSafeInteger(record.expiresAt)
    || (record.expiresAt as number) <= now
    || record.tokenType !== 'bearer'
  ) {
    return null
  }
  return Object.freeze({
    version: 1,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt as number,
    tokenType: 'bearer',
  })
}

function storageError(): AccountSessionStorageError {
  return new AccountSessionStorageError('storage_unavailable')
}

export function createChromeAccountSessionStorageBoundary(): AccountSessionStorageBoundary {
  return {
    async get(key) {
      return (await chrome.storage.local.get(key))[key]
    },
    async set(key, value) {
      await chrome.storage.local.set({ [key]: value })
    },
    async remove(key) {
      await chrome.storage.local.remove(key)
    },
    onChanged(key, listener) {
      const chromeListener = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === 'local' && key in changes) listener(changes[key].newValue)
      }
      chrome.storage.onChanged.addListener(chromeListener)
      return () => chrome.storage.onChanged.removeListener(chromeListener)
    },
  }
}

export function createAccountSessionStore(
  storage: AccountSessionStorageBoundary,
  now: () => number = Date.now,
): AccountSessionStore {
  return {
    async read() {
      let stored: unknown
      try {
        stored = await storage.get(ACCOUNT_SESSION_STORAGE_KEY)
      } catch {
        throw storageError()
      }
      if (stored === undefined) return null
      const session = cleanSession(stored, now())
      if (session) return session
      try {
        await storage.remove(ACCOUNT_SESSION_STORAGE_KEY)
      } catch {
        throw storageError()
      }
      return null
    },

    async write(session) {
      const cleaned = cleanSession(session, now())
      if (!cleaned) throw new AccountSessionStorageError('invalid_session')
      try {
        await storage.set(ACCOUNT_SESSION_STORAGE_KEY, cleaned)
      } catch {
        throw storageError()
      }
    },

    async clear() {
      try {
        await storage.remove(ACCOUNT_SESSION_STORAGE_KEY)
      } catch {
        throw storageError()
      }
    },

    subscribe(listener) {
      let cleaningInvalidValue = false
      return storage.onChanged(ACCOUNT_SESSION_STORAGE_KEY, (value) => {
        if (cleaningInvalidValue) return
        if (value === undefined) {
          listener(null)
          return
        }
        const session = cleanSession(value, now())
        if (session) {
          listener(session)
          return
        }
        listener(null)
        cleaningInvalidValue = true
        void storage.remove(ACCOUNT_SESSION_STORAGE_KEY)
          .catch(() => undefined)
          .finally(() => { cleaningInvalidValue = false })
      })
    },
  }
}
