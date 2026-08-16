import { describe, expect, it } from 'vitest'
import type { LayoutV2 } from '../../lib/layout/types'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import {
  applyArrangeEdit,
  copyProfileDraft,
  createProfileDraft,
  effectiveEditablePlacement,
  resetProfileDraft,
  undoArrangeEdit,
} from './profileEditor'

const byId = Object.fromEntries(WIDGET_REGISTRY.map((entry) => [entry.id, entry]))

describe('semantic Arrange profile drafts', () => {
  it('falls back to the selected profile source default without materializing it', () => {
    const draft = createProfileDraft({ version: 2, profiles: {} }, 'standard')
    expect(draft).toEqual({ overrides: {}, history: [] })
    expect(effectiveEditablePlacement('standard', byId.weather, draft.overrides)).toEqual(
      byId.weather.defaultPlacements.standard,
    )
  })

  it('moves only through eligible zones and records one undo snapshot', () => {
    const draft = createProfileDraft({ version: 2, profiles: {} }, 'standard')
    const moved = applyArrangeEdit(draft, 'standard', WIDGET_REGISTRY, {
      kind: 'set-zone', id: 'habits', zone: 'day',
    })

    expect(moved.history).toHaveLength(1)
    expect(moved.overrides.habits?.zone).toBe('day')
    expect(moved.overrides.habits?.order).toBeGreaterThan(byId.quote.defaultPlacements.standard.order)
    expect(applyArrangeEdit(moved, 'standard', WIDGET_REGISTRY, {
      kind: 'set-zone', id: 'habits', zone: 'pulse',
    })).toBe(moved)
    expect(undoArrangeEdit(moved)).toEqual(draft)
  })

  it('reorders deterministically and persists the affected pair only', () => {
    const draft = createProfileDraft({ version: 2, profiles: {} }, 'standard')
    const moved = applyArrangeEdit(draft, 'standard', WIDGET_REGISTRY, {
      kind: 'move-order', id: 'monthCal', delta: -1,
    })

    expect(moved.overrides.monthCal?.order).toBe(1)
    expect(moved.overrides.ics?.order).toBe(2)
    expect(Object.keys(moved.overrides).sort()).toEqual(['ics', 'monthCal'])
  })

  it('changes only allowed variants and adopts the registry footprint', () => {
    const draft = createProfileDraft({ version: 2, profiles: {} }, 'display')
    const compact = applyArrangeEdit(draft, 'display', WIDGET_REGISTRY, {
      kind: 'set-variant', id: 'weather', variant: 'compact',
    })
    expect(compact.overrides.weather).toMatchObject({ variant: 'compact', colSpan: 1, rowSpan: 1 })
    expect(applyArrangeEdit(compact, 'display', WIDGET_REGISTRY, {
      kind: 'set-variant', id: 'sun', variant: 'expanded',
    })).toBe(compact)
  })

  it('supports priority, finite spans, and lock ownership without mutating inputs', () => {
    const layout: LayoutV2 = { version: 2, profiles: { standard: {
      habits: { zone: 'now', order: 7, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'automatic' },
    } } }
    const original = structuredClone(layout)
    const draft = createProfileDraft(layout, 'standard')
    const docked = applyArrangeEdit(draft, 'standard', WIDGET_REGISTRY, {
      kind: 'set-priority', id: 'habits', priority: 'dock',
    })
    expect(docked.overrides.habits).toMatchObject({ zone: 'dock', priority: 'dock' })
    const resized = applyArrangeEdit(docked, 'standard', WIDGET_REGISTRY, {
      kind: 'resize', id: 'habits', colSpan: 3, rowSpan: 1,
    })
    expect(resized.overrides.habits).toMatchObject({ colSpan: 3, rowSpan: 1 })
    const locked = applyArrangeEdit(resized, 'standard', WIDGET_REGISTRY, {
      kind: 'set-locked', id: 'habits', locked: true,
    })
    expect(locked.overrides.habits?.locked).toBe(true)
    expect(applyArrangeEdit(locked, 'standard', WIDGET_REGISTRY, {
      kind: 'set-zone', id: 'habits', zone: 'day',
    })).toBe(locked)
    const unlocked = applyArrangeEdit(locked, 'standard', WIDGET_REGISTRY, {
      kind: 'set-locked', id: 'habits', locked: false,
    })
    expect(unlocked.overrides.habits?.locked).toBe(false)
    expect(layout).toEqual(original)
  })

  it('resets one draft and copies another profile as explicit starting placements', () => {
    const layout: LayoutV2 = { version: 2, profiles: { display: {
      weather: { zone: 'day', order: 9, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
    }, standard: {
      focus: { zone: 'now', order: 2, colSpan: 2, rowSpan: 1, variant: 'standard', priority: 'automatic' },
    } }, legacy: { focus: { x: 45, y: 55 } } }
    const draft = createProfileDraft(layout, 'standard')
    const copied = copyProfileDraft(draft, layout, 'display', WIDGET_REGISTRY)
    expect(copied.overrides.weather).toEqual(layout.profiles.display?.weather)
    expect(copied.overrides.clock).toEqual(byId.clock.defaultPlacements.display)
    expect(copied.history).toHaveLength(1)

    const reset = resetProfileDraft(copied)
    expect(reset.overrides).toEqual({})
    expect(reset.history).toHaveLength(2)
    expect(undoArrangeEdit(reset)).toEqual(copied)
  })
})
