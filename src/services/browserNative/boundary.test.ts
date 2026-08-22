import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetBrowserNativeBoundaryForTests,
  browserNativeBoundary,
} from './boundary'

afterEach(() => {
  __resetBrowserNativeBoundaryForTests()
  vi.unstubAllGlobals()
})

describe('browserNativeBoundary', () => {
  it('uses the five exact Chrome namespaces without exposing tabs or history', () => {
    const readingList = { query: vi.fn() }
    const sessions = { getRecentlyClosed: vi.fn() }
    const downloads = { search: vi.fn() }
    const tabGroups = { query: vi.fn() }
    const windows = { update: vi.fn() }
    vi.stubGlobal('chrome', { readingList, sessions, downloads, tabGroups, windows })

    const boundary = browserNativeBoundary()

    expect(boundary).toEqual({ readingList, sessions, downloads, tabGroups, windows })
    expect('tabs' in boundary).toBe(false)
    expect('history' in boundary).toBe(false)
  })

  it('resolves once per page lifetime', () => {
    const first = {
      readingList: {}, sessions: {}, downloads: {}, tabGroups: {}, windows: {},
    }
    const second = {
      readingList: {}, sessions: {}, downloads: {}, tabGroups: {}, windows: {},
    }
    vi.stubGlobal('chrome', first)
    expect(browserNativeBoundary().readingList).toBe(first.readingList)
    vi.stubGlobal('chrome', second)
    expect(browserNativeBoundary().readingList).toBe(first.readingList)
  })
})
