import {
  LAYOUT_PROFILES,
  type BlockId,
  type LayoutDensityPreference,
  type LayoutProfile,
  type Placement,
  type Priority,
  type ResolvedLayoutDensity,
  type WidgetVariant,
  type Zone,
} from './types'

export type Density = ResolvedLayoutDensity
export type StageSublayout = 'compact-wide' | 'compact-narrow' | Exclude<LayoutProfile, 'compact'>
export interface ViewportSize { width: number; height: number; devicePixelRatio?: number }
export interface Span { colSpan: number; rowSpan: number }
export interface ZoneCapacity { day: readonly [number, number]; now: readonly [number, number]; pulse: readonly [number, number] }

export const DENSITY_TOKENS: Readonly<Record<Density, Readonly<{
  gap: number
  inset: number
  minimumTrack: number
  targetControl: number
  maximumAutomaticVariant: WidgetVariant
}>>> = Object.freeze({
  compact: Object.freeze({ gap: 12, inset: 12, minimumTrack: 64, targetControl: 36, maximumAutomaticVariant: 'compact' }),
  balanced: Object.freeze({ gap: 16, inset: 16, minimumTrack: 80, targetControl: 36, maximumAutomaticVariant: 'standard' }),
  spacious: Object.freeze({ gap: 24, inset: 24, minimumTrack: 96, targetControl: 44, maximumAutomaticVariant: 'expanded' }),
})

const capacity = (day: readonly [number, number], now: readonly [number, number], pulse: readonly [number, number]): ZoneCapacity =>
  Object.freeze({ day, now, pulse })

export const STAGE_CAPACITIES: Readonly<Record<StageSublayout, Readonly<Record<Density, ZoneCapacity>>>> = Object.freeze({
  'compact-wide': Object.freeze({
    compact: capacity([2, 2], [2, 3], [2, 2]),
    balanced: capacity([2, 1], [2, 3], [2, 1]),
    spacious: capacity([1, 1], [2, 2], [1, 1]),
  }),
  'compact-narrow': Object.freeze({
    compact: capacity([1, 2], [2, 2], [1, 2]),
    balanced: capacity([1, 1], [2, 2], [1, 1]),
    spacious: capacity([1, 1], [2, 1], [1, 1]),
  }),
  standard: Object.freeze({
    compact: capacity([3, 6], [4, 5], [3, 6]),
    balanced: capacity([2, 5], [4, 4], [2, 5]),
    spacious: capacity([2, 4], [4, 4], [2, 4]),
  }),
  display: Object.freeze({
    compact: capacity([4, 7], [6, 6], [4, 7]),
    balanced: capacity([4, 6], [6, 5], [4, 6]),
    spacious: capacity([3, 5], [6, 5], [3, 5]),
  }),
  ultrawide: Object.freeze({
    compact: capacity([5, 6], [6, 6], [5, 6]),
    balanced: capacity([4, 6], [6, 5], [4, 6]),
    spacious: capacity([4, 5], [6, 5], [4, 5]),
  }),
})

const DENSITY_ORDER: readonly Density[] = ['spacious', 'balanced', 'compact']
const VARIANT_ORDER: readonly WidgetVariant[] = ['compact', 'standard', 'expanded']
const FINITE_ZONES: readonly Exclude<Zone, 'dock'>[] = ['day', 'now', 'pulse']
const OUTER_TRACK_WEIGHTS = Object.freeze({
  'compact-wide': [1, 1, 1],
  standard: [2, 4, 2],
  display: [3, 6, 3],
  ultrawide: [4, 6, 4],
} satisfies Readonly<Record<Exclude<StageSublayout, 'compact-narrow'>, readonly [number, number, number]>>)

export interface AdaptiveStageEntry {
  id: BlockId
  sourceOrder: number
  eligibleZones: readonly Zone[]
  allowedVariants: readonly WidgetVariant[]
  footprints: Readonly<Partial<Record<WidgetVariant, Readonly<Span>>>>
  defaultPlacements: Readonly<Record<LayoutProfile, Placement>>
  protectedClock?: boolean
}

export interface EffectiveStageEntry extends AdaptiveStageEntry {
  placement: Placement
  hasOverride: boolean
  preferredZones: readonly Zone[]
}

export interface StageRect extends Span {
  colStart: number
  rowStart: number
}

export type DockReason = 'pinned-dock' | 'priority-dock' | 'override-dock' | 'eligible-dock' | 'overflow-dock'

export interface StageAllocation extends Span {
  id: BlockId
  zone: Zone
  order: number
  variant: WidgetVariant
  priority: Priority
  locked?: boolean
  rect: StageRect | null
  dockReason?: DockReason
}

export type StageDiagnostic =
  | { kind: 'variant-constrained'; id: BlockId; requested: WidgetVariant; resolved: WidgetVariant }
  | { kind: 'ineligible-zone'; id: BlockId; requested: Zone; resolved: Zone }
  | { kind: 'eligible-dock' | 'overflow-dock'; id: BlockId; attemptedZones: readonly Zone[]; attemptedVariants: readonly WidgetVariant[]; variant: WidgetVariant; colSpan: number; rowSpan: 1 }
  | { kind: 'clock-reservation-unavailable'; id: 'clock' }
  | { kind: 'density-viewport-overflow'; profile: LayoutProfile; width: number; height: number }

export interface ClockReservation extends StageRect {
  kind: 'clock' | 'reservation'
  zone: 'now'
}

export function selectStageProfile(viewport: ViewportSize): LayoutProfile {
  const { width, height } = viewport
  if (width < 900 || height < 700) return 'compact'
  if (width >= 1600 && width / height >= 2.1) return 'ultrawide'
  if (width >= 2200 && height >= 1100) return 'display'
  return 'standard'
}

export function selectStageSublayout(profile: LayoutProfile, width: number): StageSublayout {
  return profile === 'compact' ? (width < 600 ? 'compact-narrow' : 'compact-wide') : profile
}

function trackSize(tracks: number, density: Density): number {
  const { minimumTrack, gap } = DENSITY_TOKENS[density]
  return tracks * minimumTrack + Math.max(0, tracks - 1) * gap
}

export interface StageGeometry {
  sublayout: StageSublayout
  capacities: ZoneCapacity
  requiredWidth: number
  requiredHeight: number
  fits: boolean
}

export function measureStageGeometry(input: {
  profile: LayoutProfile
  density: Density
  viewport: Pick<ViewportSize, 'width' | 'height'>
  implicitRows?: Partial<Record<Exclude<Zone, 'dock'>, number>>
}): StageGeometry {
  const { profile, density, viewport } = input
  const sublayout = selectStageSublayout(profile, viewport.width)
  const capacities = STAGE_CAPACITIES[sublayout][density]
  const token = DENSITY_TOKENS[density]
  const dimensions = FINITE_ZONES.map((zone) => {
    const [columns, rows] = capacities[zone]
    return {
      width: trackSize(columns, density),
      height: trackSize(Math.max(rows, input.implicitRows?.[zone] ?? rows), density),
    }
  })
  let boardWidth: number
  let boardHeight: number
  if (sublayout === 'compact-narrow') {
    boardWidth = Math.max(dimensions[1].width, dimensions[0].width + token.gap + dimensions[2].width)
    boardHeight = dimensions[1].height + token.gap + Math.max(dimensions[0].height, dimensions[2].height)
  } else {
    const weights = OUTER_TRACK_WEIGHTS[sublayout]
    boardWidth = Math.max(...dimensions.map((row, index) => row.width / weights[index])) *
      weights.reduce((sum, weight) => sum + weight, 0) + token.gap * 2
    boardHeight = Math.max(...dimensions.map((row) => row.height))
  }
  const contentWidth = boardWidth + token.inset * 2
  const requiredWidth = sublayout === 'compact-wide' ? Math.max(600, contentWidth) : contentWidth
  const requiredHeight = boardHeight + trackSize(1, density) + token.gap + token.inset * 2
  return {
    sublayout,
    capacities,
    requiredWidth,
    requiredHeight,
    fits: viewport.width >= requiredWidth && viewport.height >= requiredHeight,
  }
}

function binaryCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function variantRank(variant: WidgetVariant): number {
  return VARIANT_ORDER.indexOf(variant)
}

function capAutomaticVariant(entry: AdaptiveStageEntry, requested: WidgetVariant, density: Density): WidgetVariant {
  const maximum = variantRank(DENSITY_TOKENS[density].maximumAutomaticVariant)
  const requestedRank = Math.min(variantRank(requested), maximum)
  const candidates = entry.allowedVariants.filter((variant) => variantRank(variant) <= requestedRank)
  return [...candidates].sort((a, b) => variantRank(b) - variantRank(a))[0] ??
    [...entry.allowedVariants].sort((a, b) => variantRank(a) - variantRank(b))[0]
}

function constrainedAutomaticVariant(entry: AdaptiveStageEntry, requested: WidgetVariant): WidgetVariant {
  if (entry.allowedVariants.includes(requested)) return requested
  const candidates = entry.allowedVariants.filter((variant) => variantRank(variant) <= variantRank(requested))
  return [...candidates].sort((a, b) => variantRank(b) - variantRank(a))[0] ??
    [...entry.allowedVariants].sort((a, b) => variantRank(a) - variantRank(b))[0]
}

function clonePlacement(value: Placement): Placement {
  return value.locked === undefined ? { ...value } : { ...value, locked: value.locked }
}

function capacityFor(profile: LayoutProfile, density: Density, width: number, zone: Exclude<Zone, 'dock'>): readonly [number, number] {
  return STAGE_CAPACITIES[selectStageSublayout(profile, width)][density][zone]
}

export function effectiveStageEntries(input: {
  entries: readonly AdaptiveStageEntry[]
  profile: LayoutProfile
  overrides?: Partial<Record<BlockId, Placement>>
  density?: Density
  viewportWidth?: number
}): { entries: EffectiveStageEntry[]; diagnostics: StageDiagnostic[] } {
  const density = input.density ?? 'balanced'
  const viewportWidth = input.viewportWidth ?? (input.profile === 'compact' ? 800 : 1600)
  const diagnostics: StageDiagnostic[] = []
  const entries = input.entries.map((entry) => {
    const source = entry.defaultPlacements[input.profile]
    const stored = input.overrides?.[entry.id]
    const placement = clonePlacement(stored ?? source)
    const hasOverride = stored !== undefined
    const sourceDockOnly = source.priority === 'dock' ||
      (entry.eligibleZones.length > 0 && entry.eligibleZones.every((zone) => zone === 'dock'))
    if (sourceDockOnly) placement.zone = 'dock'
    if (placement.priority === 'automatic') {
      const variant = constrainedAutomaticVariant(entry, placement.variant)
      if (variant !== placement.variant) {
        diagnostics.push({ kind: 'variant-constrained', id: entry.id, requested: placement.variant, resolved: variant })
        placement.variant = variant
      }
      if (placement.zone !== 'dock' && !entry.eligibleZones.includes(placement.zone)) {
        const resolved = entry.eligibleZones.find((zone) => zone !== 'dock') ?? entry.eligibleZones[0]
        diagnostics.push({ kind: 'ineligible-zone', id: entry.id, requested: placement.zone, resolved })
        placement.zone = resolved
      }
    }
    // Legacy free-position migration can preserve a pinned Clock's requested
    // zone/order, but its generic 1x1 mapping is not a readable Clock
    // footprint. Only the protected Clock receives this floor: keep any
    // larger stored span, while preventing an override from shrinking below
    // the active profile's source-variant footprint before capacity clamping.
    if (entry.protectedClock && hasOverride && placement.zone !== 'dock') {
      const safe = spanFor(entry, source.variant, { colSpan: source.colSpan, rowSpan: source.rowSpan })
      placement.colSpan = Math.max(placement.colSpan, safe.colSpan)
      placement.rowSpan = Math.max(placement.rowSpan, safe.rowSpan)
    }
    if (placement.zone !== 'dock') {
      const [columns, rows] = capacityFor(input.profile, density, viewportWidth, placement.zone)
      placement.colSpan = Math.max(1, Math.min(columns, Math.trunc(placement.colSpan)))
      placement.rowSpan = Math.max(1, Math.min(rows, Math.trunc(placement.rowSpan)))
    }
    const preferredZones = placement.priority === 'automatic' && hasOverride
      ? [placement.zone, ...entry.eligibleZones.filter((zone) => zone !== placement.zone)]
      : [...entry.eligibleZones]
    return { ...entry, placement, hasOverride, preferredZones }
  }).sort((a, b) => a.placement.order - b.placement.order || binaryCompare(a.id, b.id))
  return { entries, diagnostics }
}

function overlaps(a: StageRect, b: StageRect): boolean {
  return a.colStart < b.colStart + b.colSpan && a.colStart + a.colSpan > b.colStart &&
    a.rowStart < b.rowStart + b.rowSpan && a.rowStart + a.rowSpan > b.rowStart
}

function firstFree(columns: number, rows: number, span: Span, occupied: readonly StageRect[], allowImplicit: boolean): StageRect | null {
  const maxRowStart = allowImplicit ? Math.max(rows, occupied.reduce((max, row) => Math.max(max, row.rowStart + row.rowSpan), rows)) + 1 : rows
  for (let rowStart = 1; rowStart <= maxRowStart; rowStart += 1) {
    if (!allowImplicit && rowStart + span.rowSpan - 1 > rows) break
    for (let colStart = 1; colStart + span.colSpan - 1 <= columns; colStart += 1) {
      const candidate = { colStart, rowStart, ...span }
      if (!occupied.some((row) => overlaps(row, candidate))) return candidate
    }
  }
  return null
}

function spanFor(entry: AdaptiveStageEntry, variant: WidgetVariant, fallback: Span): Span {
  return { ...(entry.footprints[variant] ?? fallback) }
}

function dockSpan(variant: WidgetVariant): Span {
  return { colSpan: variant === 'compact' ? 1 : variant === 'standard' ? 2 : 3, rowSpan: 1 }
}

function allocation(entry: EffectiveStageEntry, zone: Zone, variant: WidgetVariant, span: Span, rect: StageRect | null, dockReason?: DockReason): StageAllocation {
  return {
    id: entry.id, zone, order: entry.placement.order, variant, priority: entry.placement.priority,
    ...(entry.placement.locked === undefined ? {} : { locked: entry.placement.locked }),
    ...span, rect, ...(dockReason ? { dockReason } : {}),
  }
}

export interface AdaptiveStagePlan {
  allocations: StageAllocation[]
  diagnostics: StageDiagnostic[]
  clockReservation: ClockReservation | null
  implicitRows: Record<Exclude<Zone, 'dock'>, number>
}

export function planAdaptiveStage(input: {
  entries: readonly AdaptiveStageEntry[]
  overrides?: Partial<Record<BlockId, Placement>>
  profile: LayoutProfile
  density: Density
  viewportWidth?: number
}): AdaptiveStagePlan {
  const viewportWidth = input.viewportWidth ?? (input.profile === 'compact' ? 800 : 1600)
  const capacities = STAGE_CAPACITIES[selectStageSublayout(input.profile, viewportWidth)][input.density]
  const effective = effectiveStageEntries({ ...input, viewportWidth })
  const diagnostics = [...effective.diagnostics]
  const occupied: Record<Exclude<Zone, 'dock'>, StageRect[]> = { day: [], now: [], pulse: [] }
  const allocations: StageAllocation[] = []
  const dock: StageAllocation[] = []

  const pinned = effective.entries.filter((row) => row.placement.priority === 'pinned')
    .sort((a, b) => {
      const zone = ['day', 'now', 'pulse', 'dock'].indexOf(a.placement.zone) - ['day', 'now', 'pulse', 'dock'].indexOf(b.placement.zone)
      return zone || a.placement.order - b.placement.order || binaryCompare(a.id, b.id)
    })
  for (const row of pinned) {
    if (row.placement.zone === 'dock') {
      dock.push(allocation(row, 'dock', row.placement.variant, dockSpan(row.placement.variant), null, 'pinned-dock'))
      continue
    }
    const [columns, rows] = capacities[row.placement.zone]
    const span = {
      colSpan: Math.max(1, Math.min(columns, row.placement.colSpan)),
      rowSpan: Math.max(1, Math.min(rows, row.placement.rowSpan)),
    }
    const rect = firstFree(columns, rows, span, occupied[row.placement.zone], true)!
    occupied[row.placement.zone].push(rect)
    allocations.push(allocation(row, row.placement.zone, row.placement.variant, span, rect))
  }

  const clock = effective.entries.find((row) => row.protectedClock || row.id === 'clock')
  let clockReservation: ClockReservation | null = null
  if (clock) {
    const clockAllocation = allocations.find((row) => row.id === clock.id && row.zone === 'now')
    const source = clock.defaultPlacements[input.profile]
    const [columns, rows] = capacities.now
    const sourceSpan = spanFor(clock, source.variant, { colSpan: source.colSpan, rowSpan: source.rowSpan })
    const span = { colSpan: Math.min(columns, sourceSpan.colSpan), rowSpan: Math.min(rows, sourceSpan.rowSpan) }
    if (clockAllocation?.rect) {
      clockReservation = { kind: 'clock', zone: 'now', ...clockAllocation.rect }
    } else {
      const canonical: StageRect = {
        colStart: Math.floor((columns - span.colSpan) / 2) + 1,
        rowStart: 1,
        ...span,
      }
      const rect = occupied.now.some((row) => overlaps(row, canonical))
        ? firstFree(columns, rows, span, occupied.now, false)
        : canonical
      if (rect) {
        occupied.now.push(rect)
        clockReservation = { kind: 'reservation', zone: 'now', ...rect }
      } else {
        diagnostics.push({ kind: 'clock-reservation-unavailable', id: 'clock' })
      }
    }
  }

  const automatic = effective.entries.filter((row) => row.placement.priority === 'automatic')
  for (const row of automatic) {
    const capped = capAutomaticVariant(row, row.placement.variant, input.density)
    if (row.hasOverride && row.placement.zone === 'dock') {
      dock.push(allocation(row, 'dock', capped, dockSpan(capped), null, 'override-dock'))
      continue
    }
    if (clockReservation?.kind === 'reservation' && clock?.id === row.id) {
      const rect: StageRect = {
        colStart: clockReservation.colStart, rowStart: clockReservation.rowStart,
        colSpan: clockReservation.colSpan, rowSpan: clockReservation.rowSpan,
      }
      allocations.push(allocation(row, 'now', capped, { colSpan: rect.colSpan, rowSpan: rect.rowSpan }, rect))
      clockReservation = { ...clockReservation, kind: 'clock' }
      continue
    }
    const allowed = row.allowedVariants
      .filter((variant) => variantRank(variant) <= variantRank(capped))
      .sort((a, b) => variantRank(b) - variantRank(a))
    const attemptedZones = row.preferredZones.filter((zone): zone is Exclude<Zone, 'dock'> => zone !== 'dock')
    let placed = false
    for (const zone of attemptedZones) {
      const [columns, rows] = capacities[zone]
      for (const variant of allowed) {
        const sourceSpan = row.hasOverride && variant === capped
          ? { colSpan: row.placement.colSpan, rowSpan: row.placement.rowSpan }
          : spanFor(row, variant, row.placement)
        // Registry footprints are exact. Only W3-P1-validated stored spans are
        // normalized at the live capacity boundary; shrinking a registry
        // footprint here would manufacture fit instead of downgrading.
        if (sourceSpan.colSpan > columns || sourceSpan.rowSpan > rows) continue
        const span = { colSpan: sourceSpan.colSpan, rowSpan: sourceSpan.rowSpan }
        const rect = firstFree(columns, rows, span, occupied[zone], false)
        if (!rect) continue
        occupied[zone].push(rect)
        allocations.push(allocation(row, zone, variant, span, rect))
        placed = true
        break
      }
      if (placed) break
    }
    if (placed) continue
    const finalVariant = [...row.allowedVariants].sort((a, b) => variantRank(a) - variantRank(b))[0]
    const reason: DockReason = row.eligibleZones.includes('dock') ? 'eligible-dock' : 'overflow-dock'
    const span = dockSpan(finalVariant)
    dock.push(allocation(row, 'dock', finalVariant, span, null, reason))
    diagnostics.push({
      kind: reason, id: row.id, attemptedZones, attemptedVariants: allowed,
      variant: finalVariant, colSpan: span.colSpan, rowSpan: 1,
    })
  }

  for (const row of effective.entries.filter((entry) => entry.placement.priority === 'dock')) {
    const source = row.defaultPlacements[input.profile]
    const variant = source.priority === 'dock' ? source.variant : row.placement.variant
    dock.push(allocation(row, 'dock', variant, dockSpan(variant), null, 'priority-dock'))
  }
  dock.sort((a, b) => a.order - b.order || binaryCompare(a.id, b.id))
  const implicitRows = Object.fromEntries(FINITE_ZONES.map((zone) => [zone,
    occupied[zone].reduce((max, row) => Math.max(max, row.rowStart + row.rowSpan - 1), 0),
  ])) as Record<Exclude<Zone, 'dock'>, number>
  return { allocations: [...allocations, ...dock], diagnostics, clockReservation, implicitRows }
}

export interface DensityResolution {
  density: Density
  plan: AdaptiveStagePlan
  geometry: StageGeometry
  attempts: Array<{ density: Density; geometryFits: boolean; automaticDockCount: number }>
  diagnostics: StageDiagnostic[]
}

export function resolveStageDensity(input: {
  preference: LayoutDensityPreference
  viewport: Pick<ViewportSize, 'width' | 'height'>
  profile: LayoutProfile
  entries: readonly AdaptiveStageEntry[]
  overrides?: Partial<Record<BlockId, Placement>>
}): DensityResolution {
  const candidates: readonly Density[] = input.preference === 'auto' ? DENSITY_ORDER : [input.preference]
  const attempts: DensityResolution['attempts'] = []
  let fallback: Omit<DensityResolution, 'attempts' | 'diagnostics'> | null = null
  for (const density of candidates) {
    const plan = planAdaptiveStage({ ...input, density, viewportWidth: input.viewport.width })
    const geometry = measureStageGeometry({
      profile: input.profile, density, viewport: input.viewport, implicitRows: plan.implicitRows,
    })
    const automaticDockCount = plan.allocations.filter((row) =>
      row.dockReason === 'eligible-dock' || row.dockReason === 'overflow-dock').length
    attempts.push({ density, geometryFits: geometry.fits, automaticDockCount })
    fallback = { density, plan, geometry }
    if (input.preference !== 'auto' || (geometry.fits && automaticDockCount === 0)) {
      return { density, plan, geometry, attempts, diagnostics: [] }
    }
  }
  const compact = fallback!
  const diagnostic: StageDiagnostic = {
    kind: 'density-viewport-overflow', profile: input.profile,
    width: input.viewport.width, height: input.viewport.height,
  }
  return { ...compact, attempts, diagnostics: [diagnostic] }
}

export const ADAPTIVE_STAGE_PROFILES = LAYOUT_PROFILES
