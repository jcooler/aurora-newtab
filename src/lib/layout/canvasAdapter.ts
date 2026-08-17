import {
  BLOCK_IDS,
  LAYOUT_PROFILES,
  type BlockId,
  type LayoutV2,
  type Placement,
} from './types'
import { emptyLayoutV2, layoutV2FromLegacy } from './v2'
import {
  cleanCanvasProfile,
  cleanStoredLayout,
  type BottomBarPlacement,
  type CanvasBlockPlacement,
  type CanvasPlacement,
  type CanvasProfile,
  type CanvasProfileKey,
  type CanvasSize,
  type LayoutV3,
  type StoredLayout,
} from './canvasTypes'

const ZONE_ANCHORS = {
  day: { x: 16.667, y: 50 },
  now: { x: 50, y: 50 },
  pulse: { x: 83.333, y: 50 },
} as const

function variantSize(variant: Placement['variant']): CanvasSize {
  if (variant === 'expanded') return 'full'
  return variant
}

function cloneExact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneExact(item)) as T
  if (value && typeof value === 'object') {
    const cloned: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      cloned[key] = cloneExact((value as Record<string, unknown>)[key])
    }
    return cloned as T
  }
  return value
}

function cloneRecovery(recovery: LayoutV3['recovery']): LayoutV3['recovery'] {
  if (!recovery) return undefined
  if (recovery.semanticV2) cleanStoredLayout(recovery.semanticV2)
  if (recovery.legacyV1) cleanStoredLayout(recovery.legacyV1)
  return {
    ...(recovery.semanticV2
      ? { semanticV2: cloneExact(recovery.semanticV2) }
      : {}),
    ...(recovery.legacyV1
      ? { legacyV1: cloneExact(recovery.legacyV1) }
      : {}),
  }
}

function legacyProfile(layout: StoredLayout & { version?: never }): CanvasProfile {
  const placements: CanvasProfile['placements'] = {}
  let layer = 0
  for (const id of BLOCK_IDS) {
    const position = layout[id]
    if (!position) continue
    placements[id] = {
      kind: 'canvas',
      x: position.x,
      y: position.y,
      size: 'standard',
      layer,
    }
    layer += 1
  }
  return { mode: 'custom', placements }
}

function semanticProfile(profile: NonNullable<LayoutV2['profiles'][CanvasProfileKey]>): CanvasProfile {
  const placements: CanvasProfile['placements'] = {}
  let layer = 0
  for (const id of BLOCK_IDS) {
    const placement = profile[id]
    if (!placement) continue
    if (placement.zone === 'dock') {
      placements[id] = { kind: 'bottom-bar', order: placement.order, size: 'compact' }
      continue
    }
    const anchor = ZONE_ANCHORS[placement.zone]
    placements[id] = {
      kind: 'canvas',
      x: anchor.x,
      y: anchor.y + placement.order * 6,
      size: variantSize(placement.variant),
      layer,
    }
    layer += 1
  }
  return { mode: 'custom', placements }
}

export function adaptStoredLayout(value: unknown): LayoutV3 {
  const stored = cleanStoredLayout(value, { invalidPlacement: 'drop' })
  if ('version' in stored && stored.version === 3) return stored
  const profiles: LayoutV3['profiles'] = {}
  if ('version' in stored && stored.version === 2) {
    for (const profile of LAYOUT_PROFILES) {
      const source = stored.profiles[profile]
      if (source) profiles[profile] = semanticProfile(source)
    }
  } else {
    for (const profile of LAYOUT_PROFILES) profiles[profile] = legacyProfile(stored)
  }
  return { version: 3, profiles }
}

export function semanticLayoutV2(value: StoredLayout): LayoutV2 {
  const stored = cleanStoredLayout(value, { invalidPlacement: 'drop' })
  if ('version' in stored && stored.version === 2) return stored
  if ('version' in stored && stored.version === 3) {
    if (stored.recovery?.semanticV2) return stored.recovery.semanticV2
    if (stored.recovery?.legacyV1) return layoutV2FromLegacy(stored.recovery.legacyV1)
    return emptyLayoutV2()
  }
  return layoutV2FromLegacy(stored)
}

function normalizeProfile(value: CanvasProfile): CanvasProfile {
  const cleaned = cleanCanvasProfile(value)
  const canvasRows: Array<{ id: BlockId; placement: CanvasPlacement }> = []
  const bottomRows: Array<{ id: BlockId; placement: BottomBarPlacement }> = []
  for (const id of BLOCK_IDS) {
    const placement = cleaned.placements[id]
    if (!placement) continue
    if (placement.kind === 'canvas') canvasRows.push({ id, placement })
    else bottomRows.push({ id, placement })
  }
  const blockOrder = (id: BlockId) => BLOCK_IDS.indexOf(id)
  canvasRows.sort((a, b) => a.placement.layer - b.placement.layer || blockOrder(a.id) - blockOrder(b.id))
  bottomRows.sort((a, b) => a.placement.order - b.placement.order || blockOrder(a.id) - blockOrder(b.id))
  const normalized = new Map<BlockId, CanvasBlockPlacement>()
  canvasRows.forEach(({ id, placement }, layer) => normalized.set(id, { ...placement, layer }))
  bottomRows.forEach(({ id, placement }, order) => normalized.set(id, { ...placement, order }))
  const placements: CanvasProfile['placements'] = {}
  for (const id of BLOCK_IDS) {
    const placement = normalized.get(id)
    if (placement) placements[id] = placement
  }
  return {
    mode: cleaned.mode,
    ...(cleaned.coordinateHeight === undefined ? {} : { coordinateHeight: cleaned.coordinateHeight }),
    placements,
  }
}

export function saveCanvasProfile(
  current: StoredLayout,
  profile: CanvasProfileKey,
  draft: CanvasProfile,
): LayoutV3 {
  const currentIsV3 = 'version' in current && current.version === 3
  const stored = cleanStoredLayout(current, {
    invalidPlacement: currentIsV3 ? 'drop' : 'reject',
  })
  const profiles: LayoutV3['profiles'] = {}
  let recovery: LayoutV3['recovery']
  if ('version' in stored && stored.version === 3) {
    for (const key of LAYOUT_PROFILES) {
      const existing = stored.profiles[key]
      if (existing) profiles[key] = cleanCanvasProfile(existing)
    }
    recovery = cloneRecovery('version' in current && current.version === 3 ? current.recovery : undefined)
  } else if ('version' in stored && stored.version === 2) {
    recovery = { semanticV2: cloneExact(current as LayoutV2) }
  } else {
    recovery = { legacyV1: cloneExact(current as NonNullable<LayoutV3['recovery']>['legacyV1']) }
  }
  profiles[profile] = normalizeProfile(draft)
  return {
    version: 3,
    profiles,
    ...(recovery ? { recovery } : {}),
  }
}

export function restorePreviousLayout(current: StoredLayout): StoredLayout | null {
  if (!('version' in current) || current.version !== 3 || !current.recovery) return null
  if (current.recovery.semanticV2) {
    try {
      cleanStoredLayout(current.recovery.semanticV2)
      return cloneExact(current.recovery.semanticV2)
    } catch {
      // Try the legacy recovery member when the semantic copy is corrupt.
    }
  }
  if (current.recovery.legacyV1) {
    try {
      cleanStoredLayout(current.recovery.legacyV1)
      return cloneExact(current.recovery.legacyV1)
    } catch {
      return null
    }
  }
  return null
}
