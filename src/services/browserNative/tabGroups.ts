import { browserNativeBoundary } from './boundary'

export interface BrowserTabGroup {
  id: number
  windowId: number
  windowOrdinal: number
  title: string
  color: chrome.tabGroups.Color | `${chrome.tabGroups.Color}`
  collapsed: boolean
  shared: boolean
}

export function normalizeTabGroups(groups: readonly chrome.tabGroups.TabGroup[]): BrowserTabGroup[] {
  const windowIds = [...new Set(groups.map((group) => group.windowId))].sort((a, b) => a - b)
  const ordinals = new Map(windowIds.map((id, index) => [id, index + 1]))
  return groups
    .map((group) => ({
      id: group.id,
      windowId: group.windowId,
      windowOrdinal: ordinals.get(group.windowId) ?? 1,
      title: group.title?.trim() || `Untitled ${group.color} group`,
      color: group.color,
      collapsed: group.collapsed,
      shared: group.shared,
    }))
    .sort((a, b) => a.windowOrdinal - b.windowOrdinal || a.title.localeCompare(b.title) || a.id - b.id)
}

export async function loadTabGroups(): Promise<BrowserTabGroup[]> {
  return normalizeTabGroups(await browserNativeBoundary().tabGroups.query({}))
}

export async function focusTabGroupWindow(windowId: number): Promise<void> {
  await browserNativeBoundary().windows.update(windowId, { focused: true })
}

export async function setTabGroupCollapsed(groupId: number, collapsed: boolean): Promise<void> {
  await browserNativeBoundary().tabGroups.update(groupId, { collapsed })
}

export function subscribeTabGroups(listener: () => void): () => void {
  const { onCreated, onUpdated, onMoved, onRemoved } = browserNativeBoundary().tabGroups
  onCreated.addListener(listener)
  onUpdated.addListener(listener)
  onMoved.addListener(listener)
  onRemoved.addListener(listener)
  return () => {
    onCreated.removeListener(listener)
    onUpdated.removeListener(listener)
    onMoved.removeListener(listener)
    onRemoved.removeListener(listener)
  }
}
