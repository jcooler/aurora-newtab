// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Background from './Background'
import { listUploads } from '../../lib/idb'
import type { PhotoPrefs } from '../../lib/storage/schema'

// Only 'upload' mode touches IndexedDB; mock the whole module so the two
// upload-mode cases below don't need real IndexedDB (unavailable in jsdom).
vi.mock('../../lib/idb', () => ({ listUploads: vi.fn() }))

describe('Background', () => {
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL

  beforeEach(() => {
    // Pin "today" so lastRotated comparisons are deterministic regardless of
    // the wall-clock date the suite happens to run on.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T12:00:00'))
    vi.mocked(listUploads).mockReset()
    vi.mocked(listUploads).mockResolvedValue([])
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (spyOn requires the method to already exist), so they're stubbed
    // directly rather than spied-on.
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    vi.useRealTimers()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('gradient mode renders no photo and never calls onPrefsChange', () => {
    const onPrefsChange = vi.fn()
    // lastRotated is deliberately STALE: without the mode gate, rotation logic
    // would fire onPrefsChange here. This proves gradient mode suppresses it.
    const prefs: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2020-01-01' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)

    expect(container.querySelector('img')).toBeNull()
    expect(onPrefsChange).not.toHaveBeenCalled()
  })

  it('auto mode with a stale lastRotated calls onPrefsChange exactly once', () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2020-01-01' }
    render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)

    expect(onPrefsChange).toHaveBeenCalledTimes(1)
  })

  it('upload mode with a populated gallery shows the current photo and the refresh control', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
      { key: 'photo:b', blob: new Blob(['b'], { type: 'image/png' }) },
    ])
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
    const { container, unmount } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    // Flush the listUploads() promise + the resulting state update; fake
    // timers only affect timer-based APIs, but testing-library's own
    // waitFor() polls via setTimeout, so it never wakes up under them —
    // act(async) drains microtasks directly instead.
    await act(async () => {})

    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:mock-url')
    expect(screen.getByRole('button', { name: 'New background photo' })).toBeTruthy()

    // Unmount now, while URL.revokeObjectURL is still the stub installed
    // above: this component held a live object URL, so the unmount effect
    // calls revokeObjectURL, and this file's afterEach restores the
    // (jsdom-absent) original before the suite's automatic post-test cleanup
    // would otherwise unmount it.
    unmount()
  })

  it('upload mode with an empty gallery falls back to the bundled photo set', async () => {
    vi.mocked(listUploads).mockResolvedValue([])
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    await act(async () => {})

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/photos/')
  })
})
