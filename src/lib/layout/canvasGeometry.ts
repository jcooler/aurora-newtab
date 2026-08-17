import { BLOCK_IDS, type BlockId } from './types'
import type {
  BottomBarPlacement,
  CanvasPlacement,
  CanvasProfile,
  CanvasProfileKey,
  CanvasSize,
} from './canvasTypes'

export interface CanvasBounds {
  width: number
  height: number
  inset?: number
}

export interface CanvasBox {
  width: number
  height: number
}

export interface FittedCanvasPlacement extends CanvasPlacement, CanvasBox {
  left: number
  top: number
}

export type FittedCanvasBlockPlacement = FittedCanvasPlacement | BottomBarPlacement

export interface FittedCanvasProfile {
  mode: CanvasProfile['mode']
  placements: Partial<Record<BlockId, FittedCanvasBlockPlacement>>
}

const BASE_BOXES: Readonly<Record<CanvasSize, CanvasBox>> = Object.freeze({
  compact: { width: 176, height: 64 },
  standard: { width: 304, height: 184 },
  full: { width: 448, height: 288 },
})

const ITEM_BOXES: Readonly<Partial<Record<BlockId, Partial<Record<CanvasSize, CanvasBox>>>>> = Object.freeze({
  weather: { compact: { width: 224, height: 96 } },
  ics: { compact: { width: 240, height: 104 } },
  monthCal: { compact: { width: 240, height: 144 } },
  sun: { compact: { width: 192, height: 72 } },
  moon: { compact: { width: 192, height: 72 } },
  quote: { compact: { width: 240, height: 88 }, standard: { width: 560, height: 120 } },
  bookmarks: { compact: { width: 320, height: 48 }, standard: { width: 880, height: 56 } },
  clock: { compact: { width: 264, height: 112 }, standard: { width: 344, height: 152 }, full: { width: 448, height: 208 } },
  greeting: { compact: { width: 300, height: 48 }, standard: { width: 480, height: 64 }, full: { width: 600, height: 80 } },
  worldClocks: { compact: { width: 280, height: 48 }, standard: { width: 400, height: 56 }, full: { width: 520, height: 72 } },
  countdown: { compact: { width: 240, height: 48 }, standard: { width: 360, height: 56 } },
  search: { compact: { width: 280, height: 52 }, standard: { width: 352, height: 56 } },
  focus: { compact: { width: 288, height: 72 }, standard: { width: 360, height: 80 } },
  links: { compact: { width: 300, height: 88 }, standard: { width: 520, height: 112 } },
  habits: { compact: { width: 224, height: 64 } },
  status: { compact: { width: 224, height: 96 } },
  github: { compact: { width: 240, height: 128 } },
  gitlab: { compact: { width: 240, height: 128 } },
  jira: { compact: { width: 240, height: 128 } },
  vercel: { compact: { width: 240, height: 120 } },
  homeassistant: { compact: { width: 240, height: 144 } },
  rss: { compact: { width: 240, height: 112 } },
  crypto: { compact: { width: 240, height: 80 } },
  timer: { compact: { width: 112, height: 48 } },
  tasks: { compact: { width: 112, height: 48 } },
  notes: { compact: { width: 112, height: 48 } },
})

const WORK_IDS: ReadonlySet<BlockId> = new Set(['status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto'])
const PERSONAL_IDS: ReadonlySet<BlockId> = new Set(['ics', 'monthCal', 'habits', 'sun', 'moon'])
const SIZE_SET: ReadonlySet<string> = new Set(['compact', 'standard', 'full'])

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return (minimum + maximum) / 2
  return Math.min(maximum, Math.max(minimum, value))
}

export function canvasBoxFor(id: BlockId, size: CanvasSize, bounds?: Pick<CanvasBounds, 'width' | 'height' | 'inset'>): CanvasBox {
  const source = ITEM_BOXES[id]?.[size] ?? BASE_BOXES[size]
  if (!bounds) return { ...source }
  const inset = finite(bounds.inset) ? Math.max(0, bounds.inset) : 8
  return {
    width: Math.min(source.width, Math.max(1, bounds.width - inset * 2)),
    height: Math.min(source.height, Math.max(1, bounds.height - inset * 2)),
  }
}

export function canvasMinimumHeight(
  profile: CanvasProfileKey,
  canvas: CanvasProfile,
  viewportHeight: number,
): number {
  const base = finite(viewportHeight) ? Math.max(1, viewportHeight) : 1
  const rows = BLOCK_IDS.flatMap((id) => {
    const placement = canvas.placements[id]
    return placement?.kind === 'canvas' ? [{ id, placement }] : []
  })
  if (profile === 'compact') {
    const content = rows.reduce((height, { id, placement }) => height + canvasBoxFor(id, placement.size).height + 32, 16)
    return Math.max(base, content)
  }
  if (canvas.mode !== 'derived') return base
  const sideColumns = profile === 'standard' ? 1 : 2
  const workRows = Math.ceil(rows.filter(({ id }) => WORK_IDS.has(id)).length / sideColumns)
  const personalRows = Math.ceil(rows.filter(({ id }) => PERSONAL_IDS.has(id)).length / sideColumns)
  return Math.max(base, 240 + Math.max(workRows, personalRows) * 220)
}

export function fitCanvasProfile(canvas: CanvasProfile, bounds: CanvasBounds): FittedCanvasProfile {
  const width = finite(bounds.width) ? Math.max(1, bounds.width) : 1
  const height = finite(bounds.height) ? Math.max(1, bounds.height) : 1
  const inset = finite(bounds.inset) ? Math.max(0, bounds.inset) : 8
  const placements: FittedCanvasProfile['placements'] = {}

  for (const id of BLOCK_IDS) {
    const placement = canvas.placements[id]
    if (!placement) continue
    if (placement.kind === 'bottom-bar') {
      if (Number.isInteger(placement.order) && placement.order >= 0 && placement.size === 'compact') {
        placements[id] = { ...placement }
      }
      continue
    }
    if (!finite(placement.x) || !finite(placement.y) || !finite(placement.layer)
      || typeof placement.size !== 'string' || !SIZE_SET.has(placement.size)) continue
    const box = canvasBoxFor(id, placement.size, { width, height, inset })
    const requestedLeft = width * placement.x / 100
    const requestedTop = height * placement.y / 100
    placements[id] = {
      ...placement,
      left: clamp(requestedLeft, inset + box.width / 2, width - inset - box.width / 2),
      top: clamp(requestedTop, inset + box.height / 2, height - inset - box.height / 2),
      ...box,
    }
  }
  return { mode: canvas.mode, placements }
}
