import { isPlainObject } from '../object'
import {
  BLOCK_IDS,
  LAYOUT_PROFILES,
  type BlockId,
  type LayoutProfile,
  type LayoutV2,
  type LegacyLayout,
  type Placement,
} from './types'
import { isValidPlacement } from './v2'

export const CANVAS_PROFILE_KEYS = LAYOUT_PROFILES
export type CanvasProfileKey = LayoutProfile

export const CANVAS_MODES = ['derived', 'custom'] as const
export type CanvasMode = (typeof CANVAS_MODES)[number]

export const CANVAS_SIZES = ['compact', 'standard', 'full'] as const
export type CanvasSize = (typeof CANVAS_SIZES)[number]

export interface CanvasPlacement {
  kind: 'canvas'
  x: number
  y: number
  size: CanvasSize
  layer: number
}

export interface BottomBarPlacement {
  kind: 'bottom-bar'
  order: number
  size: 'compact'
}

export type CanvasBlockPlacement = CanvasPlacement | BottomBarPlacement

export interface CanvasProfile {
  mode: CanvasMode
  placements: Partial<Record<BlockId, CanvasBlockPlacement>>
}

export interface LayoutV3 {
  version: 3
  profiles: Partial<Record<CanvasProfileKey, CanvasProfile>>
  recovery?: {
    semanticV2?: LayoutV2
    legacyV1?: LegacyLayout
  }
}

export type StoredLayout = LegacyLayout | LayoutV2 | LayoutV3

export const CANVAS_LAYOUT_VALIDATION_MESSAGE = 'Canvas layout data is invalid.' as const

export class CanvasLayoutValidationError extends Error {
  constructor() {
    super(CANVAS_LAYOUT_VALIDATION_MESSAGE)
    this.name = 'CanvasLayoutValidationError'
  }
}

export interface CleanStoredLayoutOptions {
  invalidPlacement?: 'reject' | 'drop'
}

const BLOCK_ID_SET: ReadonlySet<string> = new Set(BLOCK_IDS)
const PROFILE_SET: ReadonlySet<string> = new Set(CANVAS_PROFILE_KEYS)
const MODE_SET: ReadonlySet<string> = new Set(CANVAS_MODES)
const SIZE_SET: ReadonlySet<string> = new Set(CANVAS_SIZES)

function invalid(): never {
  throw new CanvasLayoutValidationError()
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCanvasPlacement(value: unknown): value is CanvasPlacement {
  return isPlainObject(value)
    && value.kind === 'canvas'
    && finite(value.x)
    && finite(value.y)
    && typeof value.size === 'string'
    && SIZE_SET.has(value.size)
    && finite(value.layer)
}

function isBottomBarPlacement(value: unknown): value is BottomBarPlacement {
  return isPlainObject(value)
    && value.kind === 'bottom-bar'
    && Number.isInteger(value.order)
    && (value.order as number) >= 0
    && value.size === 'compact'
}

function cloneBlockPlacement(value: CanvasBlockPlacement): CanvasBlockPlacement {
  return { ...value }
}

function cleanLegacyLayout(value: unknown, invalidPlacement: 'reject' | 'drop'): LegacyLayout {
  if (!isPlainObject(value)) invalid()
  const result: LegacyLayout = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, id)) continue
    const row = value[id]
    if (!isPlainObject(row) || !finite(row.x) || !finite(row.y)) {
      if (invalidPlacement === 'reject') invalid()
      continue
    }
    result[id] = { x: row.x, y: row.y }
  }
  return result
}

function cleanSemanticProfile(value: unknown, invalidPlacement: 'reject' | 'drop'):
Partial<Record<BlockId, Placement>> {
  if (!isPlainObject(value)) {
    if (invalidPlacement === 'reject') invalid()
    return {}
  }
  const result: Partial<Record<BlockId, Placement>> = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, id)) continue
    const placement = value[id]
    if (!isValidPlacement(placement)) {
      if (invalidPlacement === 'reject') invalid()
      continue
    }
    result[id] = { ...placement }
  }
  return result
}

function cleanLayoutV2(value: Record<string, unknown>, invalidPlacement: 'reject' | 'drop'): LayoutV2 {
  if (!isPlainObject(value.profiles)) invalid()
  const profiles: LayoutV2['profiles'] = {}
  for (const profile of LAYOUT_PROFILES) {
    if (!Object.prototype.hasOwnProperty.call(value.profiles, profile)) continue
    profiles[profile] = cleanSemanticProfile(value.profiles[profile], invalidPlacement)
  }
  const result: LayoutV2 = { version: 2, profiles }
  if (Object.prototype.hasOwnProperty.call(value, 'legacy')) {
    result.legacy = cleanLegacyLayout(value.legacy, invalidPlacement)
  }
  return result
}

export function cleanCanvasProfile(
  value: unknown,
  options: CleanStoredLayoutOptions = {},
): CanvasProfile {
  const invalidPlacement = options.invalidPlacement ?? 'reject'
  if (!isPlainObject(value)
    || typeof value.mode !== 'string'
    || !MODE_SET.has(value.mode)
    || !isPlainObject(value.placements)) {
    invalid()
  }
  const placements: CanvasProfile['placements'] = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value.placements, id)) continue
    const placement = value.placements[id]
    if (!isCanvasPlacement(placement) && !isBottomBarPlacement(placement)) {
      if (invalidPlacement === 'reject') invalid()
      continue
    }
    placements[id] = cloneBlockPlacement(placement)
  }
  return { mode: value.mode as CanvasMode, placements }
}

function cleanLayoutV3(value: Record<string, unknown>, invalidPlacement: 'reject' | 'drop'): LayoutV3 {
  if (!isPlainObject(value.profiles)) invalid()
  const profiles: LayoutV3['profiles'] = {}
  for (const profile of CANVAS_PROFILE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value.profiles, profile)) continue
    const raw = value.profiles[profile]
    try {
      profiles[profile] = cleanCanvasProfile(raw, { invalidPlacement })
    } catch (error) {
      if (invalidPlacement === 'reject') throw error
    }
  }
  const result: LayoutV3 = { version: 3, profiles }
  if (Object.prototype.hasOwnProperty.call(value, 'recovery')) {
    if (!isPlainObject(value.recovery)) invalid()
    const recovery: NonNullable<LayoutV3['recovery']> = {}
    if (Object.prototype.hasOwnProperty.call(value.recovery, 'semanticV2')) {
      const semantic = value.recovery.semanticV2
      if (!isPlainObject(semantic) || semantic.version !== 2) invalid()
      recovery.semanticV2 = cleanLayoutV2(semantic, invalidPlacement)
    }
    if (Object.prototype.hasOwnProperty.call(value.recovery, 'legacyV1')) {
      recovery.legacyV1 = cleanLegacyLayout(value.recovery.legacyV1, invalidPlacement)
    }
    result.recovery = recovery
  }
  return result
}

export function cleanStoredLayout(
  value: unknown,
  options: CleanStoredLayoutOptions = {},
): StoredLayout {
  const invalidPlacement = options.invalidPlacement ?? 'reject'
  if (!isPlainObject(value)) invalid()
  if (!Object.prototype.hasOwnProperty.call(value, 'version')) {
    return cleanLegacyLayout(value, invalidPlacement)
  }
  if (value.version === 2) return cleanLayoutV2(value, invalidPlacement)
  if (value.version === 3) return cleanLayoutV3(value, invalidPlacement)
  invalid()
}

export function isStoredLayout(value: unknown): value is StoredLayout {
  try {
    cleanStoredLayout(value)
    return true
  } catch {
    return false
  }
}

export function emptyLayoutV3(): LayoutV3 {
  return { version: 3, profiles: {} }
}

export function isKnownBlockId(value: string): value is BlockId {
  return BLOCK_ID_SET.has(value)
}

export function isCanvasProfileKey(value: string): value is CanvasProfileKey {
  return PROFILE_SET.has(value)
}
