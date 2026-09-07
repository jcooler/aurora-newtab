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
  it('observes a namespace made available by an optional grant without replacing the page boundary', () => {
    const native: { readingList?: object } = {}
    vi.stubGlobal('chrome', native)
    const boundary = browserNativeBoundary()
    expect(boundary.readingList).toBeUndefined()
    native.readingList = { query: vi.fn() }
    expect(browserNativeBoundary()).toBe(boundary)
    expect(boundary.readingList).toBe(native.readingList)
  })
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
