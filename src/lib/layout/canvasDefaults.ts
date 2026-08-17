import type { WidgetRegistryEntry } from '../../newtab/widgetRegistry'
import type {
  CanvasPlacement,
  CanvasProfile,
  CanvasProfileKey,
  CanvasSize,
} from './canvasTypes'

export const CANVAS_PROFILE_LABELS: Readonly<Record<CanvasProfileKey, string>> = Object.freeze({
  compact: 'Small',
  standard: 'Desktop',
  display: 'Large',
  ultrawide: 'Wide',
})

const CENTER_IDS = [
  'bookmarks', 'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'quote',
] as const
const PERSONAL_IDS = ['ics', 'monthCal', 'habits', 'sun', 'moon'] as const
const WORK_IDS = ['status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto'] as const

const CENTER_Y: Readonly<Record<string, number>> = Object.freeze({
  bookmarks: 4,
  clock: 24,
  greeting: 37,
  worldClocks: 43,
  countdown: 48,
  search: 54,
  focus: 62,
  links: 71,
  quote: 87,
})

const SMALL_ORDER = [
  'bookmarks', 'timer', 'weather', 'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'ics', 'monthCal', 'habits', 'sun', 'moon',
  'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto',
  'quote', 'notes', 'tasks',
] as const

function preferredSize(entry: WidgetRegistryEntry, profile: CanvasProfileKey): CanvasSize {
  const target: CanvasSize = profile === 'compact'
    ? 'compact'
    : profile === 'standard'
      ? entry.id === 'clock' ? 'full' : 'standard'
      : 'full'
  if (entry.canvasSizes.includes(target)) return target
  if (target === 'full' && entry.canvasSizes.includes('standard')) return 'standard'
  return entry.canvasSizes[0] ?? 'compact'
}

function spread(index: number, count: number, start: number, end: number): number {
  if (count <= 1) return (start + end) / 2
  return start + (end - start) * index / (count - 1)
}

function edgePosition(
  profile: Exclude<CanvasProfileKey, 'compact'>,
  side: 'left' | 'right',
  index: number,
  count: number,
): Pick<CanvasPlacement, 'x' | 'y'> {
  if (profile === 'standard') {
    return { x: side === 'left' ? 13 : 87, y: spread(index, count, 23, 78) }
  }
  const columns = 2
  const column = index % columns
  const row = Math.floor(index / columns)
  const rows = Math.ceil(count / columns)
  const xs = profile === 'display'
    ? side === 'left' ? [9, 23] : [91, 77]
    : side === 'left' ? [6, 17] : [94, 83]
  return { x: xs[column], y: spread(row, rows, 22, 78) }
}

function desktopPosition(
  id: WidgetRegistryEntry['id'],
  profile: Exclude<CanvasProfileKey, 'compact'>,
  personal: readonly WidgetRegistryEntry[],
  work: readonly WidgetRegistryEntry[],
): Pick<CanvasPlacement, 'x' | 'y'> {
  if (id === 'timer') return { x: profile === 'ultrawide' ? 4 : 7, y: 13 }
  if (id === 'weather') return { x: profile === 'ultrawide' ? 96 : 93, y: 13 }
  if (id === 'notes') return { x: profile === 'ultrawide' ? 4 : 7, y: 91 }
  if (id === 'tasks') return { x: profile === 'ultrawide' ? 96 : 93, y: 91 }
  if ((CENTER_IDS as readonly string[]).includes(id)) return { x: 50, y: CENTER_Y[id] ?? 50 }
  const personalIndex = personal.findIndex((entry) => entry.id === id)
  if (personalIndex >= 0) return edgePosition(profile, 'left', personalIndex, personal.length)
  const workIndex = work.findIndex((entry) => entry.id === id)
  if (workIndex >= 0) return edgePosition(profile, 'right', workIndex, work.length)
  return { x: 50, y: 50 }
}

export function canvasDefaults(
  profile: CanvasProfileKey,
  entries: readonly WidgetRegistryEntry[],
): CanvasProfile {
  const placements: CanvasProfile['placements'] = {}
  const personal = entries.filter((entry) => (PERSONAL_IDS as readonly string[]).includes(entry.id))
  const work = entries.filter((entry) => (WORK_IDS as readonly string[]).includes(entry.id))
  const smallOrder = new Map(SMALL_ORDER.map((id, index) => [id, index]))
  const orderedSmall = [...entries].sort((a, b) => (
    (smallOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (smallOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.sourceOrder - b.sourceOrder
  ))
  const smallIndex = new Map(orderedSmall.map((entry, index) => [entry.id, index]))

  for (const entry of entries) {
    const position = profile === 'compact'
      ? { x: 50, y: spread(smallIndex.get(entry.id) ?? 0, orderedSmall.length, 3, 97) }
      : desktopPosition(entry.id, profile, personal, work)
    placements[entry.id] = {
      kind: 'canvas',
      ...position,
      size: preferredSize(entry, profile),
      layer: entry.sourceOrder,
    }
  }
  return { mode: 'derived', placements }
}

export function resolveCanvasProfile(
  profile: CanvasProfileKey,
  entries: readonly WidgetRegistryEntry[],
  saved?: CanvasProfile,
): CanvasProfile {
  const defaults = canvasDefaults(profile, entries)
  const placements: CanvasProfile['placements'] = {}
  for (const entry of entries) {
    placements[entry.id] = saved?.placements[entry.id] ?? defaults.placements[entry.id]
  }
  return { mode: saved?.mode ?? 'derived', placements }
}
