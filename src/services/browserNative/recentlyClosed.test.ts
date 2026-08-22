import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetBrowserNativeBoundaryForTests } from './boundary'
import { loadRecentlyClosed, restoreRecentlyClosed, subscribeRecentlyClosed } from './recentlyClosed'

afterEach(() => {
  __resetBrowserNativeBoundaryForTests()
  vi.unstubAllGlobals()
})

describe('Recently Closed adapter', () => {
  it('requests Chrome maximum 25 and emits deterministic restorable rows', async () => {
    const getRecentlyClosed = vi.fn().mockResolvedValue([
      { lastModified: 30, tab: { sessionId: 'tab-b', title: '', url: 'https://news.example/item' } },
      { lastModified: 40, window: { sessionId: 'window-a', tabs: [{}, {}, {}] } },
      { lastModified: 50, tab: { title: 'No session id' } },
      { lastModified: 20, tab: { sessionId: 'tab-a', title: '  Aurora  ' } },
    ])
    vi.stubGlobal('chrome', { sessions: { getRecentlyClosed } })

    await expect(loadRecentlyClosed()).resolves.toEqual([
      { sessionId: 'window-a', type: 'window', title: '3 tabs', tabCount: 3, closedAt: 40_000 },
      { sessionId: 'tab-b', type: 'tab', title: 'news.example', tabCount: 1, closedAt: 30_000 },
      { sessionId: 'tab-a', type: 'tab', title: 'Aurora', tabCount: 1, closedAt: 20_000 },
    ])
    expect(getRecentlyClosed).toHaveBeenCalledWith({ maxResults: 25 })
  })

  it('restores exactly the selected session id', async () => {
    const restore = vi.fn().mockResolvedValue({})
    vi.stubGlobal('chrome', { sessions: { restore } })
    await restoreRecentlyClosed('session-7')
    expect(restore).toHaveBeenCalledWith('session-7')
    await expect(restoreRecentlyClosed('   ')).rejects.toThrow('session id')
  })

  it('owns and releases the sessions change listener', () => {
    const onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
    vi.stubGlobal('chrome', { sessions: { onChanged } })
    const listener = vi.fn()
    const cleanup = subscribeRecentlyClosed(listener)
    expect(onChanged.addListener).toHaveBeenCalledWith(listener)
    cleanup()
    expect(onChanged.removeListener).toHaveBeenCalledWith(listener)
  })
})
