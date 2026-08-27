import {
  BLOCK_IDS,
  LAYOUT_PROFILES,
  PRIORITIES,
  WIDGET_VARIANTS,
  ZONES,
  type BlockId,
  type BlockPos,
  type LayoutProfile,
  type LayoutV2,
  type LegacyLayout,
  type Placement,
  type Zone,
} from './types'

export const LEGACY_LAYOUT_VALIDATION_MESSAGE = 'Stored legacy layout data is invalid.' as const

export class LegacyLayoutValidationError extends Error {
  constructor() {
    super(LEGACY_LAYOUT_VALIDATION_MESSAGE)
    this.name = 'LegacyLayoutValidationError'
  }
}

export const PROFILE_ORDER = LAYOUT_PROFILES
export const ZONE_ORDER = ZONES
export const SEMANTIC_ZONE_ANCHORS: Readonly<Record<Zone, Readonly<BlockPos>>> = Object.freeze({
  day: Object.freeze({ x: 16.667, y: 50 }),
  now: Object.freeze({ x: 50, y: 50 }),
  pulse: Object.freeze({ x: 83.333, y: 50 }),
  dock: Object.freeze({ x: 50, y: 91.667 }),
})

const PROFILE_SET = new Set<string>(LAYOUT_PROFILES)
const ZONE_SET = new Set<string>(ZONES)
const VARIANT_SET = new Set<string>(WIDGET_VARIANTS)
const PRIORITY_SET = new Set<string>(PRIORITIES)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function binaryCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function clonePlacement(value: Placement): Placement {
  return value.locked === undefined ? { ...value } : { ...value, locked: value.locked }
}

function cloneProfile(profile: Partial<Record<BlockId, Placement>> | undefined): Partial<Record<BlockId, Placement>> {
  const result: Partial<Record<BlockId, Placement>> = {}
  if (!profile) return result
  for (const id of BLOCK_IDS) {
    const value = profile[id]
    if (value) result[id] = clonePlacement(value)
  }
  return result
}

function cloneProfiles(layout: LayoutV2): LayoutV2['profiles'] {
  const profiles: LayoutV2['profiles'] = {}
  for (const profile of LAYOUT_PROFILES) {
    if (layout.profiles[profile]) profiles[profile] = cloneProfile(layout.profiles[profile])
  }
  return profiles
}

export function emptyLayoutV2(): LayoutV2 {
  return { version: 2, profiles: {} }
}

export function isValidPlacement(value: unknown): value is Placement {
  if (!isPlainRecord(value)) return false
  return typeof value.zone === 'string' && ZONE_SET.has(value.zone) &&
    Number.isInteger(value.order) && (value.order as number) >= 0 &&
    Number.isInteger(value.colSpan) && (value.colSpan as number) > 0 &&
    Number.isInteger(value.rowSpan) && (value.rowSpan as number) > 0 &&
    typeof value.variant === 'string' && VARIANT_SET.has(value.variant) &&
    typeof value.priority === 'string' && PRIORITY_SET.has(value.priority) &&
    (value.locked === undefined || typeof value.locked === 'boolean')
}

export function validateLegacyLayout(value: unknown): LegacyLayout {
  if (!isPlainRecord(value)) throw new LegacyLayoutValidationError()
  const result: LegacyLayout = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, id)) continue
    const row = value[id]
    if (!isPlainRecord(row) || typeof row.x !== 'number' || !Number.isFinite(row.x) ||
      typeof row.y !== 'number' || !Number.isFinite(row.y)) {
      throw new LegacyLayoutValidationError()
    }
    result[id] = { x: row.x, y: row.y }
  }
  return result
}

function nearestZone(pos: BlockPos): Zone {
  const x = clampPercent(pos.x)
  const y = clampPercent(pos.y)
  let selected: Zone = ZONES[0]
  let distance = Number.POSITIVE_INFINITY
  for (const zone of ZONES) {
    const anchor = SEMANTIC_ZONE_ANCHORS[zone]
    const candidate = (x - anchor.x) ** 2 + (y - anchor.y) ** 2
    if (candidate < distance) {
      selected = zone
      distance = candidate
    }
  }
  return selected
}

function migratedPlacement(zone: Zone, order: number): Placement {
  return { zone, order, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' }
}

function mappedProfile(legacy: LegacyLayout): Partial<Record<BlockId, Placement>> {
  const rows = BLOCK_IDS.flatMap((id) => {
    const pos = legacy[id]
    return pos ? [{ id, pos, zone: nearestZone(pos) }] : []
  })
  rows.sort((a, b) => {
    const zone = ZONES.indexOf(a.zone) - ZONES.indexOf(b.zone)
    if (zone !== 0) return zone
    const y = clampPercent(a.pos.y) - clampPercent(b.pos.y)
    if (y !== 0) return y
    const x = clampPercent(a.pos.x) - clampPercent(b.pos.x)
    return x !== 0 ? x : binaryCompare(a.id, b.id)
  })
  const orders = new Map<Zone, number>()
  const result: Partial<Record<BlockId, Placement>> = {}
  for (const row of rows) {
    const order = orders.get(row.zone) ?? 0
    result[row.id] = migratedPlacement(row.zone, order)
    orders.set(row.zone, order + 1)
  }
  return result
}

export function layoutV2FromLegacy(value: unknown): LayoutV2 {
  const legacy = validateLegacyLayout(value)
  const profiles: LayoutV2['profiles'] = {}
  for (const profile of LAYOUT_PROFILES) profiles[profile] = mappedProfile(legacy)
  return { version: 2, profiles, legacy }
}

function normalizeZones(
  profile: Partial<Record<BlockId, Placement>>,
  zones: ReadonlySet<Zone>,
): Partial<Record<BlockId, Placement>> {
  const result = cloneProfile(profile)
  for (const zone of ZONES) {
    if (!zones.has(zone)) continue
    const rows = BLOCK_IDS.flatMap((id) => {
      const value = result[id]
      return value?.zone === zone ? [{ id, value }] : []
    }).sort((a, b) => a.value.order - b.value.order || binaryCompare(a.id, b.id))
    rows.forEach(({ id, value }, order) => { result[id] = { ...value, order } })
  }
  return result
}

export function normalizeProfilePlacements(
  profile: Partial<Record<BlockId, Placement>>,
): Partial<Record<BlockId, Placement>> {
  return normalizeZones(profile, new Set(ZONES))
}

/** Replace one semantic profile without materializing source defaults or
 * touching another profile/legacy provenance. W3-P3 Save uses this inside
 * the existing storage authority. */
export function withProfileOverrides(
  layout: LayoutV2,
  profile: LayoutProfile,
  overrides: Partial<Record<BlockId, Placement>>,
): LayoutV2 {
  const profiles = cloneProfiles(layout)
  const normalized = normalizeProfilePlacements(overrides)
  if (Object.keys(normalized).length > 0) profiles[profile] = normalized
  else delete profiles[profile]
  return {
    version: 2,
    profiles,
    ...(layout.legacy ? { legacy: validateLegacyLayout(layout.legacy) } : {}),
  }
}

export function isLayoutProfile(value: string): value is LayoutProfile {
  return PROFILE_SET.has(value)
}
