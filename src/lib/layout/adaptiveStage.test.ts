import { describe, expect, it } from 'vitest'
import type { BlockId, LayoutProfile, Placement, WidgetVariant, Zone } from './types'
import {
  DENSITY_TOKENS,
  STAGE_CAPACITIES,
  effectiveStageEntries,
  measureStageGeometry,
  planAdaptiveStage,
  resolveStageDensity,
  selectStageProfile,
  type AdaptiveStageEntry,
  type Density,
} from './adaptiveStage'

const variants: readonly WidgetVariant[] = ['compact', 'standard', 'expanded']
const footprint = {
  compact: { colSpan: 1, rowSpan: 1 },
  standard: { colSpan: 2, rowSpan: 1 },
  expanded: { colSpan: 3, rowSpan: 2 },
}

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    zone: 'day', order: 0, colSpan: 1, rowSpan: 1,
    variant: 'standard', priority: 'automatic', ...overrides,
  }
}

function entry(
  id: BlockId,
  overrides: Partial<AdaptiveStageEntry> = {},
): AdaptiveStageEntry {
  const defaults = Object.fromEntries(
    (['compact', 'standard', 'display', 'ultrawide'] as const).map((profile) => [profile, placement()]),
  ) as Record<LayoutProfile, Placement>
  return {
    id,
    sourceOrder: 0,
    eligibleZones: ['day', 'dock'],
    allowedVariants: variants,
    footprints: footprint,
    defaultPlacements: defaults,
    ...overrides,
  }
}

function plan(
  entries: readonly AdaptiveStageEntry[],
  overrides: Partial<Record<BlockId, Placement>> = {},
  profile: LayoutProfile = 'standard',
  density: Density = 'balanced',
) {
  return planAdaptiveStage({ entries, overrides, profile, density })
}

describe('profile selection fenceposts and precedence', () => {
  it.each([
    [899, 700, 'compact'], [900, 699, 'compact'], [900, 700, 'standard'],
    [1599, 700, 'standard'], [1600, 762, 'standard'], [1600, 1600 / 2.1, 'ultrawide'],
    [2199, 1100, 'standard'], [2200, 1099, 'standard'], [2200, 1100, 'display'],
    [2310, 1100, 'ultrawide'], [2560, 1440, 'display'],
  ] satisfies ReadonlyArray<readonly [number, number, LayoutProfile]>)('%sx%s selects %s', (width, height, expected) => {
    expect(selectStageProfile({ width, height })).toBe(expected)
  })

  it('uses CSS pixels only and gives Compact then Ultrawide precedence', () => {
    expect(selectStageProfile({ width: 3840, height: 600, devicePixelRatio: 4 })).toBe('compact')
    expect(selectStageProfile({ width: 2560, height: 1200, devicePixelRatio: 0.5 })).toBe('ultrawide')
  })
})

describe('frozen density tokens, capacities, and exact geometry', () => {
  it('publishes every exact density token', () => {
    expect(DENSITY_TOKENS).toEqual({
      compact: { gap: 12, inset: 12, minimumTrack: 64, targetControl: 36, maximumAutomaticVariant: 'compact' },
      balanced: { gap: 16, inset: 16, minimumTrack: 80, targetControl: 36, maximumAutomaticVariant: 'standard' },
      spacious: { gap: 24, inset: 24, minimumTrack: 96, targetControl: 44, maximumAutomaticVariant: 'expanded' },
    })
  })

  it('publishes all profile, sublayout, and density capacities exactly', () => {
    expect(STAGE_CAPACITIES).toEqual({
      'compact-wide': {
        compact: { day: [2, 2], now: [2, 3], pulse: [2, 2] },
        balanced: { day: [2, 1], now: [2, 3], pulse: [2, 1] },
        spacious: { day: [1, 1], now: [2, 2], pulse: [1, 1] },
      },
      'compact-narrow': {
        compact: { day: [1, 2], now: [2, 2], pulse: [1, 2] },
        balanced: { day: [1, 1], now: [2, 2], pulse: [1, 1] },
        spacious: { day: [1, 1], now: [2, 1], pulse: [1, 1] },
      },
      standard: {
        compact: { day: [3, 6], now: [4, 5], pulse: [3, 6] },
        balanced: { day: [2, 5], now: [4, 4], pulse: [2, 5] },
        spacious: { day: [2, 4], now: [4, 4], pulse: [2, 4] },
      },
      display: {
        compact: { day: [4, 7], now: [6, 6], pulse: [4, 7] },
        balanced: { day: [4, 6], now: [6, 5], pulse: [4, 6] },
        spacious: { day: [3, 5], now: [6, 5], pulse: [3, 5] },
      },
      ultrawide: {
        compact: { day: [5, 6], now: [6, 6], pulse: [5, 6] },
        balanced: { day: [4, 6], now: [6, 5], pulse: [4, 6] },
        spacious: { day: [4, 5], now: [6, 5], pulse: [4, 5] },
      },
    })
  })

  it.each([
    ['compact', 600, 'compact', 600, 316],
    ['compact', 600, 'balanced', 600, 400],
    ['compact', 744, 'spacious', 744, 384],
    ['compact', 599, 'compact', 164, 392],
    ['compact', 599, 'balanced', 208, 400],
    ['compact', 599, 'spacious', 264, 384],
    ['standard', 912, 'compact', 912, 544],
    ['standard', 900, 'balanced', 800, 592],
    ['standard', 1600, 'spacious', 1008, 624],
    ['display', 2560, 'compact', 1216, 620],
    ['display', 2560, 'balanced', 1536, 688],
    ['display', 2560, 'spacious', 1488, 744],
    ['ultrawide', 1600, 'compact', 1336, 544],
    ['ultrawide', 1600, 'balanced', 1370.6666666666665, 688],
    ['ultrawide', 1800, 'spacious', 1720, 744],
  ] satisfies ReadonlyArray<readonly [LayoutProfile, number, Density, number, number]>)
  ('measures %s at width %s/%s as an exact pixel rectangle', (profile, width, density, requiredWidth, requiredHeight) => {
    const exact = measureStageGeometry({ profile, density, viewport: { width, height: requiredHeight } })
    expect(exact).toMatchObject({ requiredWidth, requiredHeight, fits: true })
    if (profile !== 'compact' || width < 600 || requiredWidth > 600) {
      expect(measureStageGeometry({ profile, density, viewport: { width: requiredWidth - 1, height: requiredHeight } }).fits).toBe(false)
    }
    expect(measureStageGeometry({ profile, density, viewport: { width, height: requiredHeight - 1 } }).fits).toBe(false)
  })

  it('proves the Standard 900x700 and Ultrawide 1600x700 density witnesses', () => {
    expect(measureStageGeometry({ profile: 'standard', density: 'spacious', viewport: { width: 900, height: 700 } }).fits).toBe(false)
    expect(measureStageGeometry({ profile: 'standard', density: 'balanced', viewport: { width: 900, height: 700 } }).fits).toBe(true)
    expect(measureStageGeometry({ profile: 'ultrawide', density: 'spacious', viewport: { width: 1600, height: 700 } }).fits).toBe(false)
    expect(measureStageGeometry({ profile: 'ultrawide', density: 'balanced', viewport: { width: 1600, height: 700 } }).fits).toBe(true)
  })
})

describe('effective placement reconciliation', () => {
  it('uses active-profile field values, preserves locked, and ignores inactive profiles', () => {
    const source = entry('weather', {
      defaultPlacements: {
        compact: placement({ order: 1 }), standard: placement({ order: 2 }),
        display: placement({ order: 3 }), ultrawide: placement({ order: 4 }),
      },
    })
    const active = placement({ zone: 'pulse', order: 9, colSpan: 99, rowSpan: 99, variant: 'expanded', priority: 'pinned', locked: false })
    const result = effectiveStageEntries({ entries: [source], profile: 'standard', overrides: { weather: active } })
    expect(result.entries[0].placement).toEqual({ ...active, colSpan: 2, rowSpan: 5 })
    expect(result.entries[0].placement.locked).toBe(false)
  })

  it('preserves pinned legacy zone/variant but constrains automatic zone and variant', () => {
    const compactOnly = entry('sun', { eligibleZones: ['day'], allowedVariants: ['compact'], footprints: { compact: footprint.compact } })
    const pinned = plan([compactOnly], { sun: placement({ zone: 'pulse', variant: 'standard', priority: 'pinned' }) })
    expect(pinned.allocations[0]).toMatchObject({ zone: 'pulse', variant: 'standard' })
    const automatic = plan([compactOnly], { sun: placement({ zone: 'pulse', variant: 'expanded', priority: 'automatic' }) })
    expect(automatic.allocations[0]).toMatchObject({ zone: 'day', variant: 'compact' })
    expect(automatic.diagnostics.map((row) => row.kind)).toEqual(expect.arrayContaining(['ineligible-zone', 'variant-constrained']))
  })

  it('preserves locked as metadata with no allocation effect', () => {
    const item = entry('weather')
    const unlocked = plan([item], { weather: placement({ locked: false }) })
    const locked = plan([item], { weather: placement({ locked: true }) })
    expect(locked.allocations.map(({ locked: _locked, ...row }) => row))
      .toEqual(unlocked.allocations.map(({ locked: _locked, ...row }) => row))
    expect(locked.allocations[0].locked).toBe(true)
  })

  it('keeps a source priority-Dock entry terminally Docked under a pinned board override', () => {
    const dockOnly = entry('timer', {
      eligibleZones: ['day', 'dock'],
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((profile) =>
        [profile, placement({ zone: 'dock', order: 1, variant: 'compact', priority: 'dock' })])) as Record<LayoutProfile, Placement>,
    })
    const result = plan([dockOnly], {
      timer: placement({ zone: 'day', order: 7, colSpan: 3, rowSpan: 2, variant: 'expanded', priority: 'pinned', locked: false }),
    })
    expect(result.allocations).toEqual([{
      id: 'timer', zone: 'dock', order: 7, colSpan: 3, rowSpan: 1,
      variant: 'expanded', priority: 'pinned', locked: false, rect: null, dockReason: 'pinned-dock',
    }])
    expect(result.diagnostics).toEqual([])
  })

  it('keeps a source Dock-only entry terminally Docked under an automatic board override', () => {
    const dockOnly = entry('tasks', {
      eligibleZones: ['dock'],
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((profile) =>
        [profile, placement({ zone: 'dock', order: 1, variant: 'compact', priority: 'dock' })])) as Record<LayoutProfile, Placement>,
    })
    const result = plan([dockOnly], {
      tasks: placement({ zone: 'pulse', order: 8, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'automatic', locked: true }),
    })
    expect(result.allocations).toEqual([{
      id: 'tasks', zone: 'dock', order: 8, colSpan: 2, rowSpan: 1,
      variant: 'standard', priority: 'automatic', locked: true, rect: null, dockReason: 'override-dock',
    }])
    expect(result.diagnostics).toEqual([])
  })
})

describe('phased deterministic allocation', () => {
  it('places a later pinned item before a lower-order automatic item', () => {
    const auto = entry('weather', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ order: 0, colSpan: 2, rowSpan: 1 })]),
    ) as Record<LayoutProfile, Placement> })
    const pinned = entry('quote', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ order: 99, colSpan: 2, rowSpan: 1, priority: 'pinned' })]),
    ) as Record<LayoutProfile, Placement> })
    const result = plan([auto, pinned])
    expect(result.allocations.find((row) => row.id === 'quote')?.rect).toEqual({ colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1 })
    expect(result.allocations.find((row) => row.id === 'weather')?.rect).toEqual({ colStart: 1, rowStart: 2, colSpan: 2, rowSpan: 1 })
  })

  it('uses exact-fit rectangles, downgrade, eligible Dock, and overflow Dock once', () => {
    const exactFit = entry('weather', { footprints: { ...footprint, standard: { colSpan: 2, rowSpan: 5 } } })
    const downgraded = entry('quote', {
      footprints: { compact: { colSpan: 1, rowSpan: 1 }, standard: { colSpan: 3, rowSpan: 1 }, expanded: footprint.expanded },
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((p) =>
        [p, placement({ order: 1 })])) as Record<LayoutProfile, Placement>,
    })
    const result = plan([exactFit, downgraded])
    expect(result.allocations.find((row) => row.id === 'weather')).toMatchObject({ zone: 'day', variant: 'standard', rect: { colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 5 } })
    expect(result.allocations.find((row) => row.id === 'quote')).toMatchObject({ zone: 'dock', dockReason: 'eligible-dock', variant: 'compact', colSpan: 1, rowSpan: 1 })
    const blocker = entry('weather', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) =>
        [p, placement({ colSpan: 2, rowSpan: 2, priority: 'pinned' })])) as Record<LayoutProfile, Placement>,
    })
    const overflow = plan([blocker, entry('search', { eligibleZones: ['day'] })], {}, 'compact', 'compact')
    expect(overflow.allocations).toHaveLength(2)
    expect(overflow.allocations.find((row) => row.id === 'search')).toMatchObject({ zone: 'dock', dockReason: 'overflow-dock' })
  })

  it('never shrinks an exact registry footprint to manufacture fit', () => {
    const item = entry('weather', {
      footprints: {
        compact: { colSpan: 1, rowSpan: 1 },
        standard: { colSpan: 3, rowSpan: 1 },
        expanded: { colSpan: 3, rowSpan: 2 },
      },
    })
    const result = plan([item])
    expect(result.allocations[0]).toMatchObject({ zone: 'day', variant: 'compact', colSpan: 1, rowSpan: 1 })
  })

  it('classifies and globally sorts every intentional Dock reason', () => {
    const pinnedDock = entry('notes')
    const priorityDock = entry('timer', { allowedVariants: ['compact'], footprints: { compact: footprint.compact } })
    const overrideDock = entry('links', { eligibleZones: ['now', 'dock'] })
    const result = plan([pinnedDock, priorityDock, overrideDock], {
      notes: placement({ zone: 'dock', order: 3, colSpan: 999, rowSpan: 999, variant: 'standard', priority: 'pinned' }),
      timer: placement({ zone: 'dock', order: 1, variant: 'compact', priority: 'dock' }),
      links: placement({ zone: 'dock', order: 2, variant: 'standard', priority: 'automatic' }),
    })
    expect(result.allocations.map(({ id, dockReason, colSpan, rowSpan }) => ({ id, dockReason, colSpan, rowSpan }))).toEqual([
      { id: 'timer', dockReason: 'priority-dock', colSpan: 1, rowSpan: 1 },
      { id: 'links', dockReason: 'override-dock', colSpan: 2, rowSpan: 1 },
      { id: 'notes', dockReason: 'pinned-dock', colSpan: 2, rowSpan: 1 },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('keeps pinned overflow in implicit rows and reports its geometry', () => {
    const rows = Array.from({ length: 7 }, (_, index) => entry((['weather', 'ics', 'monthCal', 'sun', 'moon', 'quote', 'github'] as BlockId[])[index], {
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((p) =>
        [p, placement({ order: index, priority: 'pinned', colSpan: 2, rowSpan: 1 })])) as Record<LayoutProfile, Placement>,
    }))
    const result = plan(rows)
    expect(result.allocations).toHaveLength(7)
    expect(result.allocations.at(-1)?.rect?.rowStart).toBe(7)
    expect(result.implicitRows.day).toBe(7)
    expect(result.allocations.some((row) => row.zone === 'dock')).toBe(false)
  })

  it('clamps very large spans and is invariant to object and entry enumeration order', () => {
    const a = entry('weather')
    const b = entry('quote')
    const overrides = {
      weather: placement({ order: 0, colSpan: 999, rowSpan: 999, priority: 'pinned' }),
      quote: placement({ order: 1, priority: 'pinned' }),
    }
    const forward = plan([a, b], overrides)
    const reverse = plan([b, a], Object.fromEntries(Object.entries(overrides).reverse()))
    expect(forward).toEqual(reverse)
    expect(forward.allocations.find((row) => row.id === 'weather')?.rect).toMatchObject({ colSpan: 2, rowSpan: 5 })
  })

  it('keeps earlier non-colliding allocations stable when a later item is inserted', () => {
    const first = entry('weather')
    const later = entry('quote', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ order: 10 })]),
    ) as Record<LayoutProfile, Placement> })
    const before = plan([first]).allocations.find((row) => row.id === 'weather')
    const after = plan([later, first]).allocations.find((row) => row.id === 'weather')
    expect(after).toEqual(before)
  })
})

describe('protected Clock reservation', () => {
  const clock = (zone: Zone, priority: Placement['priority'] = 'pinned') => entry('clock', {
    protectedClock: true,
    defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((p) =>
      [p, placement({ zone, order: 50, colSpan: 2, rowSpan: 2, variant: 'expanded', priority })])) as Record<LayoutProfile, Placement>,
  })

  it('uses an active pinned Now Clock rectangle as the protection without a ghost', () => {
    const result = plan([clock('now')])
    expect(result.clockReservation).toEqual({ kind: 'clock', zone: 'now', colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2 })
    expect(result.allocations[0].rect).toEqual({ colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2 })
  })

  it('reserves canonical cells when Clock is elsewhere before automatic placement', () => {
    const automatic = entry('greeting', { eligibleZones: ['now'], defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ zone: 'now', order: 0, colSpan: 2, rowSpan: 2 })]),
    ) as Record<LayoutProfile, Placement> })
    const result = plan([automatic, clock('day')])
    expect(result.clockReservation).toEqual({ kind: 'reservation', zone: 'now', colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2 })
    expect(result.allocations.find((row) => row.id === 'greeting')?.rect).toEqual({ colStart: 1, rowStart: 3, colSpan: 2, rowSpan: 1 })
  })

  it('relocates a covered canonical reservation and diagnoses no-fit without eviction', () => {
    const blocker = entry('weather', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ zone: 'now', order: 0, colSpan: 3, rowSpan: 2, priority: 'pinned' })]),
    ) as Record<LayoutProfile, Placement>, eligibleZones: ['now'] })
    const relocated = plan([blocker, clock('day')])
    expect(relocated.clockReservation).toEqual({ kind: 'reservation', zone: 'now', colStart: 1, rowStart: 3, colSpan: 3, rowSpan: 2 })
    const full = entry('weather', { defaultPlacements: Object.fromEntries(
      (['compact', 'standard', 'display', 'ultrawide'] as const).map((p) => [p, placement({ zone: 'now', colSpan: 4, rowSpan: 4, priority: 'pinned' })]),
    ) as Record<LayoutProfile, Placement>, eligibleZones: ['now'] })
    const noFit = plan([full, clock('day')])
    expect(noFit.clockReservation).toBeNull()
    expect(noFit.diagnostics.map((row) => row.kind)).toContain('clock-reservation-unavailable')
    expect(noFit.allocations.find((row) => row.id === 'weather')?.rect).toMatchObject({ colSpan: 4, rowSpan: 4 })
  })

  it('creates no reservation when Clock is absent', () => {
    expect(plan([entry('greeting', { eligibleZones: ['now'] })]).clockReservation).toBeNull()
  })

  it('lets an automatic Clock claim its protected canonical rectangle exactly once', () => {
    const result = plan([clock('now', 'automatic')])
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0]).toMatchObject({ id: 'clock', zone: 'now', rect: { colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2 } })
    expect(result.clockReservation).toEqual({ kind: 'clock', zone: 'now', colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2 })
  })

  it('terminally Docks an automatic Clock override before it can claim the reservation', () => {
    const result = plan([clock('now', 'automatic')], {
      clock: placement({ zone: 'dock', order: 4, variant: 'standard', priority: 'automatic', locked: true }),
    })
    expect(result.allocations).toEqual([{
      id: 'clock', zone: 'dock', order: 4, colSpan: 2, rowSpan: 1,
      variant: 'standard', priority: 'automatic', locked: true, rect: null, dockReason: 'override-dock',
    }])
    expect(result.clockReservation).toEqual({
      kind: 'reservation', zone: 'now', colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2,
    })
    expect(result.diagnostics).toEqual([])
  })
})

describe('Auto Fit two-condition resolution and diagnostics', () => {
  it('tries spacious then balanced then compact and rejects a candidate that newly docks automatic work', () => {
    const roomy = resolveStageDensity({
      preference: 'auto', viewport: { width: 1600, height: 900 }, profile: 'standard', entries: [entry('weather')], overrides: {},
    })
    expect(roomy.density).toBe('spacious')
    const large = entry('weather', { footprints: { compact: { colSpan: 1, rowSpan: 1 }, standard: { colSpan: 2, rowSpan: 5 }, expanded: { colSpan: 2, rowSpan: 4 } } })
    const constrained = resolveStageDensity({
      preference: 'auto', viewport: { width: 900, height: 700 }, profile: 'standard', entries: [large], overrides: {},
    })
    expect(constrained.density).toBe('balanced')
    expect(constrained.attempts.map(({ density, geometryFits, automaticDockCount }) => ({ density, geometryFits, automaticDockCount }))).toEqual([
      { density: 'spacious', geometryFits: false, automaticDockCount: 0 },
      { density: 'balanced', geometryFits: true, automaticDockCount: 0 },
    ])
  })

  it('rejects a geometry-fit candidate when its allocation newly Docks automatic work', () => {
    const item = entry('weather', {
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((profile) =>
        [profile, placement({ variant: 'expanded' })])) as Record<LayoutProfile, Placement>,
      footprints: {
        compact: { colSpan: 1, rowSpan: 5 },
        standard: { colSpan: 2, rowSpan: 5 },
        expanded: { colSpan: 2, rowSpan: 5 },
      },
    })
    const result = resolveStageDensity({
      preference: 'auto', viewport: { width: 1600, height: 900 }, profile: 'standard', entries: [item], overrides: {},
    })
    expect(result.density).toBe('balanced')
    expect(result.attempts).toEqual([
      { density: 'spacious', geometryFits: true, automaticDockCount: 1 },
      { density: 'balanced', geometryFits: true, automaticDockCount: 0 },
    ])
  })

  it('does not count intentional Dock or pinned implicit rows as automatic Dock condition', () => {
    const dock = entry('timer', { allowedVariants: ['compact'], footprints: { compact: footprint.compact } })
    const result = resolveStageDensity({
      preference: 'auto', viewport: { width: 1600, height: 900 }, profile: 'standard', entries: [dock],
      overrides: { timer: placement({ zone: 'dock', priority: 'dock', variant: 'compact' }) },
    })
    expect(result.density).toBe('spacious')
    expect(result.attempts[0].automaticDockCount).toBe(0)
  })

  it('rejects pinned implicit-row overflow on geometry while counting zero automatic Dock work', () => {
    const ids = ['weather', 'ics', 'monthCal', 'sun', 'moon', 'quote', 'github'] as const
    const entries = ids.map((id, order) => entry(id, {
      defaultPlacements: Object.fromEntries((['compact', 'standard', 'display', 'ultrawide'] as const).map((profile) =>
        [profile, placement({ order, colSpan: 2, rowSpan: 1, priority: 'pinned' })])) as Record<LayoutProfile, Placement>,
    }))
    const result = resolveStageDensity({
      preference: 'auto', viewport: { width: 900, height: 700 }, profile: 'standard', entries, overrides: {},
    })
    expect(result.density).toBe('compact')
    expect(result.attempts).toEqual([
      { density: 'spacious', geometryFits: false, automaticDockCount: 0 },
      { density: 'balanced', geometryFits: false, automaticDockCount: 0 },
      { density: 'compact', geometryFits: false, automaticDockCount: 0 },
    ])
    expect(result.diagnostics).toEqual([{
      kind: 'density-viewport-overflow', profile: 'standard', width: 900, height: 700,
    }])
  })

  it('falls back to Compact with one typed diagnostic when no candidate fits', () => {
    const result = resolveStageDensity({
      preference: 'auto', viewport: { width: 100, height: 100 }, profile: 'compact', entries: [entry('weather')], overrides: {},
    })
    expect(result.density).toBe('compact')
    expect(result.diagnostics).toEqual([{ kind: 'density-viewport-overflow', profile: 'compact', width: 100, height: 100 }])
    expect(result.attempts).toHaveLength(3)
  })

  it('returns every active ID exactly once across board and Dock', () => {
    const entries = [entry('weather'), entry('quote'), entry('notes')]
    const result = plan(entries, { notes: placement({ zone: 'dock', priority: 'dock' }) }, 'compact', 'compact')
    expect(result.allocations.map((row) => row.id).sort()).toEqual(['notes', 'quote', 'weather'])
    expect(new Set(result.allocations.map((row) => row.id)).size).toBe(entries.length)
  })
})
