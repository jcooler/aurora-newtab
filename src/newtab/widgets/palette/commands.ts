import { fuzzyScore } from '../../../lib/fuzzy'
import { THEMES } from '../../../theme/index'
import type { QuickLink, Settings, ThemeId } from '../../../lib/storage/schema'

export interface Command {
  id: string
  label: string
  hint?: string
  run(): void | Promise<void>
}

export interface CommandContext {
  links: QuickLink[]
  settings: Settings
  openUrl(url: string): void
  webSearch(query: string): void
  addTodo(text: string): Promise<void>
  setTheme(theme: ThemeId): Promise<void>
  openSettings(): void
}

export function buildCommands(ctx: CommandContext): Command[] {
  return [
    ...ctx.links.map((l) => ({
      id: `link:${l.id}`,
      label: l.title,
      hint: l.url,
      run: () => ctx.openUrl(l.url),
    })),
    ...THEMES.map((t) => ({
      id: `theme:${t.id}`,
      label: `Theme: ${t.label}`,
      run: () => void ctx.setTheme(t.id),
    })),
    { id: 'settings', label: 'Open settings', run: () => ctx.openSettings() },
  ]
}

export function filterCommands(
  commands: Command[],
  query: string,
  ctx: CommandContext,
): Command[] {
  const q = query.trim()
  const todoMatch = /^(?:add\s+)?todo:\s*(.+)$/i.exec(q)
  if (todoMatch) {
    const text = todoMatch[1]
    return [
      {
        id: 'todo:add',
        label: `Add to-do: “${text}”`,
        run: () => void ctx.addTodo(text),
      },
    ]
  }
  if (q === '') return commands
  const scored = commands
    .map((c) => ({ c, s: fuzzyScore(q, c.label) }))
    .filter((x): x is { c: Command; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
  return [
    ...scored,
    {
      id: 'web-search',
      label: `Search the web for “${q}”`,
      run: () => ctx.webSearch(q),
    },
  ]
}
