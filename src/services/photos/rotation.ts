import type { PhotoPrefs } from '../../lib/storage/schema'

function hashDay(dateKey: string): number {
  let h = 0
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export function resolvePhoto(
  prefs: PhotoPrefs,
  today: string,
  count: number,
): { index: number; rotated: boolean } {
  if (count <= 0) return { index: 0, rotated: false }
  if (prefs.lastRotated !== today) return { index: hashDay(today) % count, rotated: true }
  return { index: prefs.index % count, rotated: false }
}

export function nextPhoto(prefs: PhotoPrefs, today: string, count: number): PhotoPrefs {
  if (count <= 0) return prefs
  const { index } = resolvePhoto(prefs, today, count)
  return { ...prefs, index: (index + 1) % count, lastRotated: today }
}
