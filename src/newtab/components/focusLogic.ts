import type { Focus } from '../../lib/storage/schema'

export function currentFocus(focus: Focus | null, today: string): Focus | null {
  return focus && focus.date === today ? focus : null
}

export function setFocusText(text: string, today: string): Focus | null {
  const trimmed = text.trim()
  return trimmed ? { text: trimmed, date: today, done: false } : null
}
