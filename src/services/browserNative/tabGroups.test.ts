import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetBrowserNativeBoundaryForTests } from './boundary'
import {
  focusTabGroupWindow,
  loadTabGroups,
  setTabGroupCollapsed,
  subscribeTabGroups,
} from './tabGroups'

afterEach(() => {
  __resetBrowserNativeBoundaryForTests()
  vi.unstubAllGlobals()
})

describe('Tab Groups adapter', () => {
  it('queries metadata only and derives stable window ordinals and title fallbacks', async () => {
    const query = vi.fn().mockResolvedValue([
      { id: 8, windowId: 22, title: '', color: 'red', collapsed: true, shared: false },
      { id: 3, windowId: 10, title: '  Work  ', color: 'blue', collapsed: false, shared: true },
      { id: 4, windowId: 22, title: 'Research', color: 'green', collapsed: false, shared: false },
    ])
    vi.stubGlobal('chrome', { tabGroups: { query } })

    await expect(loadTabGroups()).resolves.toEqual([
      { id: 3, windowId: 10, windowOrdinal: 1, title: 'Work', color: 'blue', collapsed: false, shared: true },
      { id: 4, windowId: 22, windowOrdinal: 2, title: 'Research', color: 'green', collapsed: false, shared: false },
      { id: 8, windowId: 22, windowOrdinal: 2, title: 'Untitled red group', color: 'red', collapsed: true, shared: false },
    ])
    expect(query).toHaveBeenCalledWith({})
  })

  it('focuses only the selected window and changes only collapsed state', async () => {
    const updateWindow = vi.fn().mockResolvedValue({})
    const updateGroup = vi.fn().mockResolvedValue({})
    vi.stubGlobal('chrome', { windows: { update: updateWindow }, tabGroups: { update: updateGroup } })
    await focusTabGroupWindow(22)
    await setTabGroupCollapsed(8, false)
    expect(updateWindow).toHaveBeenCalledWith(22, { focused: true })
    expect(updateGroup).toHaveBeenCalledWith(8, { collapsed: false })
  })

  it('subscribes to every group lifecycle event without touching chrome.tabs', () => {
    const makeEvent = () => ({ addListener: vi.fn(), removeListener: vi.fn() })
    const onCreated = makeEvent()
    const onUpdated = makeEvent()
    const onMoved = makeEvent()
    const onRemoved = makeEvent()
    vi.stubGlobal('chrome', { tabGroups: { onCreated, onUpdated, onMoved, onRemoved } })
    const cleanup = subscribeTabGroups(vi.fn())
    for (const source of [onCreated, onUpdated, onMoved, onRemoved]) expect(source.addListener).toHaveBeenCalled()
    cleanup()
    for (const source of [onCreated, onUpdated, onMoved, onRemoved]) expect(source.removeListener).toHaveBeenCalled()
  })
})
