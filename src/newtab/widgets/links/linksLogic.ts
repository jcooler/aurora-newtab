import type { QuickLink } from '../../../lib/storage/schema'

export function addLink(links: QuickLink[], title: string, url: string): QuickLink[] {
  const normalized = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const fallback = new URL(normalized).hostname
  return [
    ...links,
    { id: crypto.randomUUID(), title: title.trim() || fallback, url: normalized },
  ]
}

export function removeLink(links: QuickLink[], id: string): QuickLink[] {
  return links.filter((l) => l.id !== id)
}

export function moveLink(links: QuickLink[], from: number, to: number): QuickLink[] {
  if (from < 0 || from >= links.length || to < 0 || to >= links.length) return links
  const next = [...links]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Chrome-local favicon cache — no external favicon service (requires the
 *  'favicon' permission). */
export function faviconUrl(url: string): string {
  const base = chrome.runtime.getURL('/_favicon/')
  return `${base}?pageUrl=${encodeURIComponent(url)}&size=32`
}
