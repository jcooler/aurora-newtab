import { browserNativeBoundary } from './boundary'

export interface RecentlyClosedItem {
  sessionId: string
  type: 'tab' | 'window'
  title: string
  tabCount: number
  closedAt: number
}

function normalizeSession(session: chrome.sessions.Session): RecentlyClosedItem | null {
  if (session.tab?.sessionId) {
    return {
      sessionId: session.tab.sessionId,
      type: 'tab',
      // sessions-only access does not promise tab title or URL metadata.
      title: 'Closed tab',
      tabCount: 1,
      closedAt: session.lastModified * 1_000,
    }
  }
  if (session.window?.sessionId) {
    const tabCount = session.window.tabs?.length ?? 0
    return {
      sessionId: session.window.sessionId,
      type: 'window',
      title: 'Closed window',
      tabCount,
      closedAt: session.lastModified * 1_000,
    }
  }
  return null
}

export function normalizeRecentlyClosed(sessions: readonly chrome.sessions.Session[]): RecentlyClosedItem[] {
  return sessions
    .map(normalizeSession)
    .filter((item): item is RecentlyClosedItem => item !== null)
    .sort((a, b) => b.closedAt - a.closedAt || a.sessionId.localeCompare(b.sessionId))
    .slice(0, 25)
}

export async function loadRecentlyClosed(): Promise<RecentlyClosedItem[]> {
  return normalizeRecentlyClosed(
    await browserNativeBoundary().sessions.getRecentlyClosed({ maxResults: 25 }),
  )
}

export async function restoreRecentlyClosed(sessionId: string): Promise<void> {
  const id = sessionId.trim()
  if (!id) throw new Error('A session id is required to restore an item')
  await browserNativeBoundary().sessions.restore(id)
}

export function subscribeRecentlyClosed(listener: () => void): () => void {
  const { onChanged } = browserNativeBoundary().sessions
  onChanged.addListener(listener)
  return () => onChanged.removeListener(listener)
}
