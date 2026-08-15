import { describe, expect, it } from 'vitest'
import {
  LAYOUT_PROFILES,
  PRIORITIES,
  WIDGET_VARIANTS,
  ZONES,
  type LayoutV2,
  type Placement,
} from './types'
import {
  LEGACY_LAYOUT_VALIDATION_MESSAGE,
  LegacyLayoutValidationError,
  emptyLayoutV2,
  isValidPlacement,
  layoutV2FromLegacy,
  legacyLayoutOf,
  normalizeProfilePlacements,
  validateLegacyLayout,
  withLegacyBlockPosition,
} from './v2'

const placement = (overrides: Partial<Placement> = {}): Placement => ({
  zone: 'day',
  order: 0,
  colSpan: 1,
  rowSpan: 1,
  variant: 'standard',
  priority: 'pinned',
  ...overrides,
})

describe('Layout V2 domains and defaults', () => {
  it('freezes the exact semantic domains and persists no product defaults', () => {
    expect(LAYOUT_PROFILES).toEqual(['compact', 'standard', 'display', 'ultrawide'])
    expect(WIDGET_VARIANTS).toEqual(['compact', 'standard', 'expanded'])
    expect(ZONES).toEqual(['day', 'now', 'pulse', 'dock'])
    expect(PRIORITIES).toEqual(['pinned', 'automatic', 'dock'])
    expect(emptyLayoutV2()).toEqual({ version: 2, profiles: {} })
    expect(emptyLayoutV2()).not.toBe(emptyLayoutV2())
  })

  it('accepts only complete valid placements without inventing span maxima', () => {
    expect(isValidPlacement(placement({ colSpan: 999, rowSpan: 123, locked: true }))).toBe(true)
    expect(isValidPlacement(placement({ locked: false }))).toBe(true)
    expect(isValidPlacement(placement())).toBe(true)
    for (const bad of [
      null, [], {},
      placement({ zone: 'unknown' as Placement['zone'] }),
      placement({ variant: 'unknown' as Placement['variant'] }),
      placement({ priority: 'unknown' as Placement['priority'] }),
      placement({ order: -1 }), placement({ order: 0.5 }),
      placement({ colSpan: 0 }), placement({ colSpan: 1.5 }),
      placement({ rowSpan: 0 }), placement({ rowSpan: 1.5 }),
      placement({ locked: 'yes' as unknown as boolean }),
    ]) expect(isValidPlacement(bad)).toBe(false)
  })
})

describe('legacy validation and compatibility', () => {
  it('returns an exact immutable known-block copy, including the empty map', () => {
    const legacy = { clock: { x: 12.5, y: 87.25 }, unknown: { x: 1, y: 2 } }
    const copy = validateLegacyLayout(legacy)
    expect(copy).toEqual({ clock: { x: 12.5, y: 87.25 } })
    expect(copy).not.toBe(legacy)
    expect(copy.clock).not.toBe(legacy.clock)
    expect(validateLegacyLayout({})).toEqual({})
    expect(legacy).toEqual({ clock: { x: 12.5, y: 87.25 }, unknown: { x: 1, y: 2 } })
    expect(legacyLayoutOf({ version: 2, profiles: {} })).toEqual({})
  })

  it('raises one typed fixed safe error for malformed containers and known rows', () => {
    for (const value of [null, [], 'layout', 1, { clock: null }, { clock: [] },
      { clock: { x: 1 } }, { clock: { x: 1, y: Number.NaN } },
      { clock: { x: Number.POSITIVE_INFINITY, y: 1 } }]) {
      expect(() => validateLegacyLayout(value)).toThrowError(LegacyLayoutValidationError)
      expect(() => validateLegacyLayout(value)).toThrowError(LEGACY_LAYOUT_VALIDATION_MESSAGE)
    }
  })

  it('drops valid or malformed unknown rows only after every known row validates', () => {
    expect(validateLegacyLayout({ unknown: null, removed: { x: 'bad' } })).toEqual({})
    expect(() => validateLegacyLayout({ unknown: null, clock: { x: 1, y: Number.NaN } }))
      .toThrowError(LegacyLayoutValidationError)
  })
})

describe('deterministic legacy mapping', () => {
  it('maps the same exact overrides into all four profiles without mutating input', () => {
    const legacy = { clock: { x: 50, y: 50 }, weather: { x: 16.667, y: 50 } }
    const before = structuredClone(legacy)
    const result = layoutV2FromLegacy(legacy)
    expect(result.legacy).toEqual(legacy)
    expect(result.legacy).not.toBe(legacy)
    expect(result.profiles.compact).toEqual(result.profiles.standard)
    expect(result.profiles.display).toEqual(result.profiles.standard)
    expect(result.profiles.ultrawide).toEqual(result.profiles.standard)
    expect(Object.keys(result.profiles)).toEqual([...LAYOUT_PROFILES])
    expect(legacy).toEqual(before)
  })

  it('uses nearest anchors, fixed-zone ties, and calculation-only clamping', () => {
    const legacy = {
      weather: { x: 16.667, y: 50 },
      clock: { x: 50, y: 50 },
      github: { x: 83.333, y: 50 },
      notes: { x: 50, y: 91.667 },
      greeting: { x: 33.3335, y: 50 },
      focus: { x: -25, y: 140 },
    }
    const result = layoutV2FromLegacy(legacy)
    const profile = result.profiles.standard!
    expect(profile.weather?.zone).toBe('day')
    expect(profile.clock?.zone).toBe('now')
    expect(profile.github?.zone).toBe('pulse')
    expect(profile.notes?.zone).toBe('dock')
    expect(profile.greeting?.zone).toBe('day')
    expect(profile.focus?.zone).toBe('dock')
    expect(result.legacy?.focus).toEqual({ x: -25, y: 140 })
    expect(legacy.focus).toEqual({ x: -25, y: 140 })
  })

  it('orders each zone by clamped y, clamped x, then binary block id independent of insertion', () => {
    const first = {
      search: { x: 50, y: 50 },
      clock: { x: 50, y: 50 },
      greeting: { x: 49, y: 50 },
      countdown: { x: 50, y: 45 },
    }
    const second = Object.fromEntries(Object.entries(first).reverse())
    const a = layoutV2FromLegacy(first).profiles.standard!
    const b = layoutV2FromLegacy(second).profiles.standard!
    expect(a).toEqual(b)
    expect(a.countdown?.order).toBe(0)
    expect(a.greeting?.order).toBe(1)
    expect(a.clock?.order).toBe(2)
    expect(a.search?.order).toBe(3)
  })

  it('emits exact default migrated placement fields', () => {
    expect(layoutV2FromLegacy({ clock: { x: 50, y: 50 } }).profiles.standard?.clock).toEqual({
      zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned',
    })
  })
})

describe('collision normalization and compatibility moves', () => {
  it('normalizes duplicate/sparse orders by zone, configured order, and binary id', () => {
    const profile = {
      search: placement({ zone: 'now', order: 9 }),
      clock: placement({ zone: 'now', order: 2 }),
      greeting: placement({ zone: 'now', order: 2 }),
      weather: placement({ zone: 'day', order: 8 }),
    }
    const reversed = Object.fromEntries(Object.entries(profile).reverse())
    const result = normalizeProfilePlacements(profile)
    expect(result).toEqual(normalizeProfilePlacements(reversed))
    expect(result.weather?.order).toBe(0)
    expect(result.clock?.order).toBe(0)
    expect(result.greeting?.order).toBe(1)
    expect(result.search?.order).toBe(2)
    expect(profile.search.order).toBe(9)
  })

  it('adds a moved block to all profiles while preserving profile-only overrides', () => {
    const source: LayoutV2 = {
      version: 2,
      profiles: {
        standard: { weather: placement({ zone: 'pulse', order: 7, variant: 'expanded', priority: 'automatic' }) },
      },
    }
    const before = structuredClone(source)
    const result = withLegacyBlockPosition(source, 'clock', { x: 50, y: 50 })
    expect(source).toEqual(before)
    expect(result.legacy).toEqual({ clock: { x: 50, y: 50 } })
    for (const profile of LAYOUT_PROFILES) {
      expect(result.profiles[profile]?.clock).toEqual({
        zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned',
      })
    }
    expect(result.profiles.standard?.weather).toEqual(source.profiles.standard?.weather)
  })

  it('preserves untouched semantic overrides and normalizes only old/new affected zones', () => {
    const pulseWeather = placement({ zone: 'pulse', order: 12, variant: 'expanded', priority: 'automatic' })
    const dockNotes = placement({ zone: 'dock', order: 8, locked: true })
    const source: LayoutV2 = {
      version: 2,
      legacy: { clock: { x: 50, y: 50 }, greeting: { x: 50, y: 50 } },
      profiles: Object.fromEntries(LAYOUT_PROFILES.map((profile) => [profile, {
        clock: placement({ zone: 'now', order: 4 }),
        greeting: placement({ zone: 'now', order: 4 }),
        weather: pulseWeather,
        notes: dockNotes,
      }])) as LayoutV2['profiles'],
    }
    const result = withLegacyBlockPosition(source, 'clock', { x: 16.667, y: 50 })
    expect(result.legacy).toEqual({ clock: { x: 16.667, y: 50 }, greeting: { x: 50, y: 50 } })
    for (const profile of LAYOUT_PROFILES) {
      expect(result.profiles[profile]?.clock?.zone).toBe('day')
      expect(result.profiles[profile]?.clock?.order).toBe(0)
      expect(result.profiles[profile]?.greeting?.order).toBe(0)
      expect(result.profiles[profile]?.weather).toEqual(pulseWeather)
      expect(result.profiles[profile]?.notes).toEqual(dockNotes)
    }
  })

  it('derives the moved block order from the complete updated legacy map', () => {
    const source = layoutV2FromLegacy({
      weather: { x: 16.667, y: 40 },
      clock: { x: 16.667, y: 60 },
    })
    const pulseGreeting = placement({ zone: 'pulse', order: 7, variant: 'expanded', priority: 'automatic' })
    const dockNotes = placement({ zone: 'dock', order: 9, locked: true })
    source.profiles.standard = {
      ...source.profiles.standard,
      greeting: pulseGreeting,
      notes: dockNotes,
    }

    const result = withLegacyBlockPosition(source, 'clock', { x: 16.667, y: 70 })

    expect(result.profiles.standard?.weather?.order).toBe(0)
    expect(result.profiles.standard?.clock?.order).toBe(1)
    expect(result.profiles.standard?.greeting).toEqual(pulseGreeting)
    expect(result.profiles.standard?.notes).toEqual(dockNotes)
  })
})
