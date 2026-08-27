import { browserNativeBoundary } from './boundary'

export interface ReadingListItem {
  url: string
  title: string
  host: string
  hasBeenRead: boolean
  createdAt: number
  updatedAt: number
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || 'Saved page'
  } catch {
    return 'Saved page'
  }
}

export function normalizeReadingList(entries: readonly chrome.readingList.ReadingListEntry[]): ReadingListItem[] {
  return entries
    .map((entry) => {
      const host = hostOf(entry.url)
      return {
        url: entry.url,
        title: entry.title.trim() || host,
        host,
        hasBeenRead: entry.hasBeenRead,
        createdAt: entry.creationTime,
        updatedAt: entry.lastUpdateTime,
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.url.localeCompare(b.url))
}

export async function loadReadingList(): Promise<ReadingListItem[]> {
  return normalizeReadingList(await browserNativeBoundary().readingList.query({}))
}

export async function setReadingListReadState(url: string, hasBeenRead: boolean): Promise<void> {
  await browserNativeBoundary().readingList.updateEntry({ url, hasBeenRead })
}

export async function removeReadingListEntry(url: string): Promise<void> {
  await browserNativeBoundary().readingList.removeEntry({ url })
}

export function subscribeReadingList(listener: () => void): () => void {
  const { onEntryAdded, onEntryUpdated, onEntryRemoved } = browserNativeBoundary().readingList
  onEntryAdded.addListener(listener)
  onEntryUpdated.addListener(listener)
  onEntryRemoved.addListener(listener)
  return () => {
    onEntryAdded.removeListener(listener)
    onEntryUpdated.removeListener(listener)
    onEntryRemoved.removeListener(listener)
  }
}
