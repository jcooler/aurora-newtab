import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_SESSION_STORAGE_KEY,
  AccountSessionStorageError,
  createAccountSessionStore,
} from './sessionStorage'
import type { AccountSessionStorageBoundary, StoredAccountSessionV1 } from './sessionStorage'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)
const validSession: StoredAccountSessionV1 = {
  version: 1,
  accessToken: 'access-token-secret-value',
  refreshToken: 'refresh-token-secret-value',
  expiresAt: now + 60_000,
  tokenType: 'bearer',
}

function memoryBoundary(seed?: unknown) {
  let value = seed
  const listeners = new Set<(value: unknown) => void>()
  const boundary: AccountSessionStorageBoundary = {
    get: vi.fn(async () => value),
    set: vi.fn(async (_key, next) => {
      value = next
      for (const listener of listeners) listener(next)
    }),
    remove: vi.fn(async () => {
      value = undefined
      for (const listener of listeners) listener(undefined)
    }),
    onChanged: vi.fn((_key, listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
  }
  return {
    boundary,
    readValue: () => value,
    emit: (next: unknown) => {
      value = next
      for (const listener of listeners) listener(next)
    },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('AccountSessionStore', () => {
  it('returns null when the dedicated key is absent', async () => {
    const memory = memoryBoundary()
    await expect(createAccountSessionStore(memory.boundary, () => now).read()).resolves.toBeNull()
    expect(memory.boundary.get).toHaveBeenCalledWith(ACCOUNT_SESSION_STORAGE_KEY)
  })

  it('writes and reads only the exact validated v1 session', async () => {
    const memory = memoryBoundary()
    const store = createAccountSessionStore(memory.boundary, () => now)

    await store.write(validSession)

    expect(memory.boundary.set).toHaveBeenCalledWith(ACCOUNT_SESSION_STORAGE_KEY, validSession)
    await expect(store.read()).resolves.toEqual(validSession)
    expect(memory.readValue()).toEqual(validSession)
  })

  it.each([
    ['malformed', { ...validSession, refreshToken: 7 }],
    ['expired', { ...validSession, expiresAt: now }],
    ['unknown version', { ...validSession, version: 2 }],
    ['unknown property', { ...validSession, profile: 'must-not-survive' }],
    ['wrong token type', { ...validSession, tokenType: 'mac' }],
  ])('fails closed and removes a %s stored value', async (_name, stored) => {
    const memory = memoryBoundary(stored)
    const store = createAccountSessionStore(memory.boundary, () => now)

    await expect(store.read()).resolves.toBeNull()
    expect(memory.boundary.remove).toHaveBeenCalledWith(ACCOUNT_SESSION_STORAGE_KEY)
    expect(memory.readValue()).toBeUndefined()
  })

  it('rejects an invalid write with a fixed error that contains no token text', async () => {
    const memory = memoryBoundary()
    const store = createAccountSessionStore(memory.boundary, () => now)

    await expect(store.write({ ...validSession, expiresAt: now } as never)).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_session', message: 'invalid_session' }),
    )
    try {
      await store.write({ ...validSession, expiresAt: now } as never)
    } catch (error) {
      expect(String(error)).not.toContain(validSession.accessToken)
      expect(String(error)).not.toContain(validSession.refreshToken)
    }
  })

  it('clears only the dedicated account session key', async () => {
    const memory = memoryBoundary(validSession)
    await createAccountSessionStore(memory.boundary, () => now).clear()
    expect(memory.boundary.remove).toHaveBeenCalledWith(ACCOUNT_SESSION_STORAGE_KEY)
  })

  it('never reads, writes, or clears encrypted-sync state keys', async () => {
    const memory = memoryBoundary(validSession)
    const store = createAccountSessionStore(memory.boundary, () => now)
    await store.read()
    await store.write(validSession)
    await store.clear()

    const touched = [
      ...vi.mocked(memory.boundary.get).mock.calls,
      ...vi.mocked(memory.boundary.set).mock.calls,
      ...vi.mocked(memory.boundary.remove).mock.calls,
    ].flat()
    expect(touched).not.toContain('tab-two:sync-device:v1')
    expect(touched).not.toContain('tab-two:sync-index:v1')
    expect(touched).not.toContain('tab-two:sync-conflict-backups:v1')
  })

  it('propagates valid external changes and invalidation without exposing malformed data', async () => {
    const memory = memoryBoundary()
    const listener = vi.fn()
    const unsubscribe = createAccountSessionStore(memory.boundary, () => now).subscribe(listener)

    memory.emit(validSession)
    await flush()
    expect(listener).toHaveBeenLastCalledWith(validSession)

    memory.emit({ ...validSession, accessToken: 'external-secret', extra: true })
    await flush()
    expect(listener).toHaveBeenLastCalledWith(null)
    expect(memory.boundary.remove).toHaveBeenCalledWith(ACCOUNT_SESSION_STORAGE_KEY)

    unsubscribe()
    memory.emit(validSession)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('wraps storage failures in fixed diagnostic-safe errors', async () => {
    const failure = new Error(`failed while storing ${validSession.accessToken}`)
    const boundary = memoryBoundary().boundary
    boundary.get = vi.fn(async () => { throw failure })
    boundary.set = vi.fn(async () => { throw failure })
    boundary.remove = vi.fn(async () => { throw failure })
    const store = createAccountSessionStore(boundary, () => now)

    for (const operation of [store.read(), store.write(validSession), store.clear()]) {
      await expect(operation).rejects.toBeInstanceOf(AccountSessionStorageError)
      await expect(operation).rejects.toEqual(
        expect.objectContaining({ code: 'storage_unavailable', message: 'storage_unavailable' }),
      )
    }
  })
})
