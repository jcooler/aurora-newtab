import type { ThemeId } from '../lib/storage/schema'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'glass', label: 'Glass' },
  { id: 'mono', label: 'Mono' },
]

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}
