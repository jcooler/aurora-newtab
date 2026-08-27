import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetBrowserNativeBoundaryForTests } from './boundary'
import {
  loadReadingList,
  removeReadingListEntry,
  setReadingListReadState,
  subscribeReadingList,
} from './readingList'

function event() {
  const listeners = new Set<() => void>()
  return {
    addListener: vi.fn((listener: () => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: () => void) => listeners.delete(listener)),
    fire: () => listeners.forEach((listener) => listener()),
  }
}

afterEach(() => {
  __resetBrowserNativeBoundaryForTests()
  vi.unstubAllGlobals()
})

describe('Reading List adapter', () => {
  it('queries all entries and normalizes newest-first title, host, and read truth', async () => {
    const query = vi.fn().mockResolvedValue([
      { url: 'https://docs.example/old', title: '', hasBeenRead: true, creationTime: 10, lastUpdateTime: 20 },
      { url: 'not a url', title: 'Invalid host', hasBeenRead: false, creationTime: 30, lastUpdateTime: 40 },
      { url: 'https://news.example/new', title: '  Launch notes  ', hasBeenRead: false, creationTime: 20, lastUpdateTime: 50 },
    ])
    vi.stubGlobal('chrome', { readingList: { query } })

    await expect(loadReadingList()).resolves.toEqual([
      { url: 'https://news.example/new', title: 'Launch notes', host: 'news.example', hasBeenRead: false, createdAt: 20, updatedAt: 50 },
      { url: 'not a url', title: 'Invalid host', host: 'Saved page', hasBeenRead: false, createdAt: 30, updatedAt: 40 },
      { url: 'https://docs.example/old', title: 'docs.example', host: 'docs.example', hasBeenRead: true, createdAt: 10, updatedAt: 20 },
    ])
    expect(query).toHaveBeenCalledWith({})
  })

  it('allows only explicit read-state and remove mutations', async () => {
    const updateEntry = vi.fn().mockResolvedValue(undefined)
    const removeEntry = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { readingList: { updateEntry, removeEntry } })

    await setReadingListReadState('https://news.example/x', true)
    await removeReadingListEntry('https://news.example/x')

    expect(updateEntry).toHaveBeenCalledWith({ url: 'https://news.example/x', hasBeenRead: true })
    expect(removeEntry).toHaveBeenCalledWith({ url: 'https://news.example/x' })
  })

  it('subscribes and cleans up all three Reading List change events', () => {
    const onEntryAdded = event()
    const onEntryUpdated = event()
    const onEntryRemoved = event()
    vi.stubGlobal('chrome', { readingList: { onEntryAdded, onEntryUpdated, onEntryRemoved } })
    const listener = vi.fn()

    const cleanup = subscribeReadingList(listener)
    onEntryUpdated.fire()
    expect(listener).toHaveBeenCalledTimes(1)
    cleanup()
    onEntryAdded.fire()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onEntryRemoved.removeListener).toHaveBeenCalledWith(listener)
  })
})
