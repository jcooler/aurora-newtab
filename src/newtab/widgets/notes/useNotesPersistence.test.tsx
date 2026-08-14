// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver, type StorageDriver } from '../../../lib/storage/driver'
import { useNotesPersistence } from './useNotesPersistence'

type HeldWrite = {
  patch: Record<string, unknown>
  resolve: () => void
  reject: (error: Error) => void
}

async function controlledStorage() {
  const base = memoryDriver()
  let next: 'pass' | 'defer' | 'reject' = 'pass'
  const held: HeldWrite[] = []
  const writes: Record<string, unknown>[] = []
  const driver: StorageDriver = {
    read: (keys) => base.read(keys),
    onChanged: (cb) => base.onChanged(cb),
    write: async (patch) => {
      const controlsNotes = Object.prototype.hasOwnProperty.call(patch, 'notes')
      if (!controlsNotes || next === 'pass') {
        if (controlsNotes) writes.push(patch)
        await base.write(patch)
        return
      }
      const mode = next
      next = 'pass'
      writes.push(patch)
      if (mode === 'reject') throw new Error('configured notes write failure')
      await new Promise<void>((resolve, reject) => held.push({ patch, resolve, reject }))
    },
  }
  const storage = createStorage(driver, base.authority)
  await storage.init()
  writes.length = 0
  return {
    storage,
    base,
    writes,
    deferNext: () => { next = 'defer' as const },
    rejectNext: () => { next = 'reject' as const },
    release: async () => {
      for (let attempts = 0; held.length === 0 && attempts < 10; attempts += 1) {
        await Promise.resolve()
      }
      const write = held.shift()
      if (!write) throw new Error('No deferred Notes write')
      await base.write(write.patch)
      write.resolve()
    },
  }
}

function wrapper(storage: AuroraStorage, strict = false) {
  return ({ children }: { children: ReactNode }) => (
    <StorageProvider storage={storage}>
      {strict ? <StrictMode>{children}</StrictMode> : children}
    </StorageProvider>
  )
}

describe('useNotesPersistence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('hydrates without writing and reports Saved only after the latest deferred write fulfills', async () => {
    const control = await controlledStorage()
    await control.storage.set('notes', { text: 'Persisted', updatedAt: 1 })
    control.writes.length = 0
    control.deferNext()
    const { result } = renderHook(() => useNotesPersistence(), {
      wrapper: wrapper(control.storage),
    })
    await act(async () => {})
    expect(result.current).toMatchObject({ ready: true, text: 'Persisted', status: 'idle' })
    expect(control.writes).toHaveLength(0)

    act(() => result.current.edit('Latest'))
    expect(result.current.status).toBe('saving')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(result.current.status).toBe('saving')
    expect((await control.storage.get('notes')).text).toBe('Persisted')

    await act(async () => { await control.release() })
    expect(result.current.status).toBe('saved')
    expect((await control.storage.get('notes')).text).toBe('Latest')
    await act(async () => { await vi.advanceTimersByTimeAsync(1_400) })
    expect(result.current.status).toBe('idle')
  })

  it('coalesces debounce edits and drains a newer edit after an older deferred write', async () => {
    const control = await controlledStorage()
    const { result } = renderHook(() => useNotesPersistence(), { wrapper: wrapper(control.storage) })
    await act(async () => {})
    act(() => {
      result.current.edit('one')
      result.current.edit('two')
      result.current.edit('three')
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(control.writes).toHaveLength(1)
    expect((control.writes[0].notes as { text: string }).text).toBe('three')

    control.deferNext()
    act(() => result.current.edit('first in flight'))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    act(() => result.current.edit('newer while pending'))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(result.current.status).toBe('saving')
    await act(async () => { await control.release() })
    await act(async () => {})
    expect((await control.storage.get('notes')).text).toBe('newer while pending')
    expect(result.current.status).toBe('saved')
  })

  it('keeps a failed draft and retries the latest edit rather than the rejected value', async () => {
    const control = await controlledStorage()
    await control.storage.set('notes', { text: 'Old', updatedAt: 1 })
    control.rejectNext()
    const { result } = renderHook(() => useNotesPersistence(), { wrapper: wrapper(control.storage) })
    await act(async () => {})
    act(() => result.current.edit('Rejected'))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(result.current).toMatchObject({ text: 'Rejected', status: 'error' })
    expect((await control.storage.get('notes')).text).toBe('Old')

    act(() => result.current.edit('Newest retry'))
    let ok = false
    await act(async () => { ok = await result.current.retry() })
    expect(ok).toBe(true)
    expect(result.current).toMatchObject({ text: 'Newest retry', status: 'saved' })
    expect((await control.storage.get('notes')).text).toBe('Newest retry')
  })

  it('shares concurrent forced flushes and returns false without clearing a rejected draft', async () => {
    const control = await controlledStorage()
    control.deferNext()
    const { result } = renderHook(() => useNotesPersistence(), { wrapper: wrapper(control.storage) })
    await act(async () => {})
    act(() => result.current.edit('Close me safely'))
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = result.current.flushLatest()
      second = result.current.flushLatest()
    })
    expect(first).toBe(second)
    await act(async () => { await control.release() })
    await expect(first).resolves.toBe(true)

    control.rejectNext()
    act(() => result.current.edit('Still here'))
    let rejected = true
    await act(async () => { rejected = await result.current.flushLatest() })
    expect(rejected).toBe(false)
    expect(result.current).toMatchObject({ text: 'Still here', status: 'error' })
  })

  it('guards beforeunload only while dirty and removes the guard after persistence', async () => {
    const control = await controlledStorage()
    control.deferNext()
    const { result } = renderHook(() => useNotesPersistence(), { wrapper: wrapper(control.storage) })
    await act(async () => {})
    const clean = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(clean) })
    expect(clean.defaultPrevented).toBe(false)

    act(() => result.current.edit('Navigate safely'))
    const dirty = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(dirty) })
    expect(dirty.defaultPrevented).toBe(true)
    await act(async () => { await control.release() })
    const saved = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(saved) })
    expect(saved.defaultPrevented).toBe(false)
  })

  it('keeps the latest authority-ordered external value while focused and reconciles it on blur', async () => {
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    const control = await controlledStorage()
    const remote = createStorage(control.base)
    const { result } = renderHook(() => useNotesPersistence(), { wrapper: wrapper(control.storage) })
    await act(async () => {})
    act(() => result.current.focus())
    await act(async () => {
      await remote.set('notes', { text: 'Remote same millisecond', updatedAt: Date.now() })
    })
    expect(result.current.text).toBe('')
    act(() => result.current.blur())
    expect(result.current.text).toBe('Remote same millisecond')

    control.deferNext()
    act(() => {
      result.current.focus()
      result.current.edit('Local authority winner')
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const remoteWrite = remote.set('notes', { text: 'Remote after local', updatedAt: Date.now() })
    await act(async () => { await control.release(); await remoteWrite })
    expect(result.current.text).toBe('Local authority winner')
    act(() => result.current.blur())
    expect(result.current.text).toBe('Remote after local')
  })
})
