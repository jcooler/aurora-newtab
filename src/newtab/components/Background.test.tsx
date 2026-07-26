// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import Background from './Background'
import type { PhotoPrefs } from '../../lib/storage/schema'

// Neither case below touches IndexedDB (only 'upload' mode does), so plain
// jsdom is sufficient and no idb mocking is needed.

describe('Background', () => {
  beforeEach(() => {
    // Pin "today" so lastRotated comparisons are deterministic regardless of
    // the wall-clock date the suite happens to run on.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
