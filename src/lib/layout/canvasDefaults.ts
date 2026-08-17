import type { WidgetRegistryEntry } from '../../newtab/widgetRegistry'
import { canvasBoxFor, type CanvasBounds, type CanvasBox } from './canvasGeometry'
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
  'bookmarks', 'weather', 'clock', 'greeting', 'search', 'focus', 'links', 'quote', 'timer', 'tasks', 'notes',
  'worldClocks', 'countdown', 'ics', 'monthCal', 'habits', 'sun', 'moon',
  'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto',
] as const

export const SMALL_CANVAS_COORDINATE_HEIGHT = 3200
const SMALL_SLOT_GAP = 12
const SMALL_SLOT_CENTERS = (() => {
  const centers = new Map<WidgetRegistryEntry['id'], number>()
  let cursor = 16
  for (const id of SMALL_ORDER) {
    const box = canvasBoxFor(id, 'compact', { width: 390, height: SMALL_CANVAS_COORDINATE_HEIGHT, inset: 8 })
    centers.set(id, cursor + box.height / 2)
    cursor += box.height + SMALL_SLOT_GAP
  }
  if (cursor > SMALL_CANVAS_COORDINATE_HEIGHT) throw new Error('Small Canvas source slots exceed the coordinate plane')
  return centers
})()

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
): Pick<CanvasPlacement, 'x' | 'y'> {
  if (id === 'timer') return { x: profile === 'ultrawide' ? 4 : 7, y: 13 }
  if (id === 'weather') return { x: profile === 'ultrawide' ? 96 : 93, y: 13 }
  if (id === 'notes') return { x: profile === 'ultrawide' ? 4 : 7, y: 91 }
  if (id === 'tasks') return { x: profile === 'ultrawide' ? 96 : 93, y: 91 }
  if ((CENTER_IDS as readonly string[]).includes(id)) return { x: 50, y: CENTER_Y[id] ?? 50 }
  const personalIndex = (PERSONAL_IDS as readonly string[]).indexOf(id)
  if (personalIndex >= 0) return edgePosition(profile, 'left', personalIndex, PERSONAL_IDS.length)
  const workIndex = (WORK_IDS as readonly string[]).indexOf(id)
  if (workIndex >= 0) return edgePosition(profile, 'right', workIndex, WORK_IDS.length)
  return { x: 50, y: 50 }
}

export function canvasDefaults(
  profile: CanvasProfileKey,
  entries: readonly WidgetRegistryEntry[],
): CanvasProfile {
  const placements: CanvasProfile['placements'] = {}
  for (const entry of entries) {
    const position = profile === 'compact'
      ? { x: 50, y: (SMALL_SLOT_CENTERS.get(entry.id) ?? 16) / SMALL_CANVAS_COORDINATE_HEIGHT * 100 }
      : desktopPosition(entry.id, profile)
    placements[entry.id] = {
      kind: 'canvas',
      ...position,
      size: preferredSize(entry, profile),
      layer: entry.sourceOrder,
    }
  }
  return {
    mode: 'derived',
    ...(profile === 'compact' ? { coordinateHeight: SMALL_CANVAS_COORDINATE_HEIGHT } : {}),
    placements,
  }
}

const PROFILE_BOUNDS: Readonly<Record<CanvasProfileKey, Readonly<CanvasBounds>>> = Object.freeze({
  compact: Object.freeze({ width: 390, height: SMALL_CANVAS_COORDINATE_HEIGHT, inset: 8 }),
  standard: Object.freeze({ width: 1600, height: 900, inset: 8 }),
  display: Object.freeze({ width: 2560, height: 1440, inset: 8 }),
  ultrawide: Object.freeze({ width: 1800, height: 700, inset: 8 }),
})

interface PixelRect {
  left: number
  top: number
  right: number
  bottom: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

function pixelRect(
  placement: Extract<CanvasPlacement, { kind: 'canvas' }>,
  box: CanvasBox,
  bounds: CanvasBounds,
): PixelRect {
  const inset = bounds.inset ?? 8
  const left = clamp(bounds.width * placement.x / 100 - box.width / 2, inset, bounds.width - inset - box.width)
  const top = clamp(bounds.height * placement.y / 100 - box.height / 2, inset, bounds.height - inset - box.height)
  return { left, top, right: left + box.width, bottom: top + box.height }
}

function overlaps(left: PixelRect, right: PixelRect): boolean {
  const gap = 8
  return left.left < right.right + gap
    && left.right + gap > right.left
    && left.top < right.bottom + gap
    && left.bottom + gap > right.top
}

function nearestSafePlacement(
  id: WidgetRegistryEntry['id'],
  placement: Extract<CanvasPlacement, { kind: 'canvas' }>,
  occupied: readonly PixelRect[],
  bounds: CanvasBounds,
): Extract<CanvasPlacement, { kind: 'canvas' }> {
  const inset = bounds.inset ?? 8
  const box = canvasBoxFor(id, placement.size, bounds)
  const preferred = pixelRect(placement, box, bounds)
  if (!occupied.some((rect) => overlaps(preferred, rect))) return placement

  const maxColumn = Math.max(0, Math.floor((bounds.width - inset * 2 - box.width) / 8))
  const maxRow = Math.max(0, Math.floor((bounds.height - inset * 2 - box.height) / 8))
  let best: { rect: PixelRect; distance: number } | null = null
  for (let row = 0; row <= maxRow; row += 1) {
    const top = inset + row * 8
    for (let column = 0; column <= maxColumn; column += 1) {
      const left = inset + column * 8
      const rect = { left, top, right: left + box.width, bottom: top + box.height }
      if (occupied.some((candidate) => overlaps(rect, candidate))) continue
      const distance = (left - preferred.left) ** 2 + (top - preferred.top) ** 2
      if (!best || distance < best.distance) best = { rect, distance }
    }
  }
  if (!best) return placement
  return {
    ...placement,
    x: (best.rect.left + box.width / 2) / bounds.width * 100,
    y: (best.rect.top + box.height / 2) / bounds.height * 100,
  }
}

export function resolveCanvasProfile(
  profile: CanvasProfileKey,
  entries: readonly WidgetRegistryEntry[],
  saved?: CanvasProfile,
  bounds: CanvasBounds = PROFILE_BOUNDS[profile],
): CanvasProfile {
  const defaults = canvasDefaults(profile, entries)
  const placements: CanvasProfile['placements'] = {}
  const occupied: PixelRect[] = entries.flatMap((entry) => {
    const existing = saved?.placements[entry.id]
    return existing?.kind === 'canvas'
      ? [pixelRect(existing, canvasBoxFor(entry.id, existing.size, bounds), bounds)]
      : []
  })
  for (const entry of entries) {
    const existing = saved?.placements[entry.id]
    if (existing) {
      placements[entry.id] = existing
      continue
    }
    const fallback = defaults.placements[entry.id]
    if (!fallback) continue
    const placed = saved?.mode === 'custom' && fallback.kind === 'canvas'
      ? nearestSafePlacement(entry.id, fallback, occupied, bounds)
      : fallback
    placements[entry.id] = placed
    if (placed.kind === 'canvas') {
      occupied.push(pixelRect(placed, canvasBoxFor(entry.id, placed.size, bounds), bounds))
    }
  }
  const coordinateHeight = saved?.coordinateHeight
    ?? (saved?.mode === 'custom' ? undefined : defaults.coordinateHeight)
  return {
    mode: saved?.mode ?? 'derived',
    ...(coordinateHeight === undefined ? {} : { coordinateHeight }),
    placements,
  }
}
