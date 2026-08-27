import { describe, expect, it } from 'vitest'
import {
  enforceDockEligibility,
  NARROW_FLOOR_WIDTH,
  planLayoutRender,
  resolveRenderTier,
  type AnchoredRenderItem,
  type DockedRenderItem,
  type StackedRenderItem,
} from './renderLayout'
import type { NamedLayout } from './namedLayouts'
import type { BlockId } from './types'

const LAYOUT: NamedLayout = {
  id: 'my-layout',
  name: 'My layout',
  widgets: {
    clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -30, tier: 'full', layer: 2 },
    weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 },
    quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -13, tier: 'standard', layer: 0 },
    bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
    timer: { kind: 'docked', dock: 'top', order: 1 },
    tasks: { kind: 'docked', dock: 'top', order: 0 },
  },
}

const ENABLED: readonly BlockId[] = ['clock', 'weather', 'quote', 'bookmarks', 'timer', 'tasks', 'notes']

describe('planLayoutRender (anchored)', () => {
  const plan = planLayoutRender(LAYOUT, ENABLED, 1408)

  it('positions free placements at anchor point plus offset, in percent', () => {
    expect(plan.narrow).toBe(false)
    const clock = plan.items.find((item) => item.id === 'clock') as AnchoredRenderItem
    expect(clock).toMatchObject({ mode: 'anchored', leftPct: 50, topPct: 20, tier: 'full', layer: 2 })
    const weather = plan.items.find((item) => item.id === 'weather') as AnchoredRenderItem
    expect(weather).toMatchObject({ leftPct: 93, topPct: 13 })
    const quote = plan.items.find((item) => item.id === 'quote') as AnchoredRenderItem
    expect(quote).toMatchObject({ leftPct: 50, topPct: 87 })
  })

  it('clamps degenerate offsets onto the plane without re-flowing anything', () => {
    const wild: NamedLayout = {
      ...LAYOUT,
      widgets: { clock: { kind: 'free', anchor: 'top-left', offsetX: -40, offsetY: 250, tier: 'compact', layer: 0 } },
    }
    const item = planLayoutRender(wild, ['clock'], 1408).items[0] as AnchoredRenderItem
    expect(item.leftPct).toBe(0)
    expect(item.topPct).toBe(100)
  })

  it('keeps docked placements as dock items with their edge and exact strip position', () => {
    // Legacy placements (no x, no align) render centered; a stored x passes
    // through exactly; a legacy section resolves to its equivalent x.
    expect(plan.items.find((item) => item.id === 'bookmarks')).toEqual({
      id: 'bookmarks', mode: 'docked', dock: 'bottom', order: 0, xPct: 50,
    })
    expect(plan.items.find((item) => item.id === 'timer')).toEqual({
      id: 'timer', mode: 'docked', dock: 'top', order: 1, xPct: 50,
    })
    const positioned: NamedLayout = {
      ...LAYOUT,
      widgets: {
        ...LAYOUT.widgets,
        tasks: { kind: 'docked', dock: 'top', order: 0, x: 13.5 },
        notes: { kind: 'docked', dock: 'top', order: 2, align: 'end' },
      },
    }
    const items = planLayoutRender(positioned, ENABLED, 1408).items
    expect(items.find((item) => item.id === 'tasks')).toEqual({
      id: 'tasks', mode: 'docked', dock: 'top', order: 0, xPct: 13.5,
    })
    expect(items.find((item) => item.id === 'notes')).toEqual({
      id: 'notes', mode: 'docked', dock: 'top', order: 2, xPct: 92,
    })
  })

  it('emits explicit dock y without inventing one for legacy placements', () => {
    const positioned: NamedLayout = {
      ...LAYOUT,
      widgets: {
        ...LAYOUT.widgets,
        tasks: { kind: 'docked', dock: 'top', order: 0, x: 13.5, y: 77.25 },
      },
    }
    const explicit = planLayoutRender(positioned, ENABLED, 1408).items
      .find((item) => item.id === 'tasks') as DockedRenderItem
    const legacy = planLayoutRender(positioned, ENABLED, 1408).items
      .find((item) => item.id === 'timer') as DockedRenderItem
    expect(explicit).toMatchObject({ xPct: 13.5, yPct: 77.25 })
    expect(legacy).not.toHaveProperty('yPct')
  })

  it('gives an enabled widget missing from the layout its designed static default slot above every stored layer, and never renders a disabled one', () => {
    const notes = plan.items.find((item) => item.id === 'notes') as AnchoredRenderItem
    // Identity-stable default layer: maxStoredLayer(2) + 1 + BLOCK_IDS index
    // of notes (11) = 14, unaffected by which other widgets are enabled.
    expect(notes).toMatchObject({ mode: 'anchored', leftPct: 7, topPct: 91, tier: 'standard', layer: 14 })
    expect(plan.items.some((item) => item.id === 'search')).toBe(false)
    const disabled = planLayoutRender(LAYOUT, ['clock'], 1408)
    expect(disabled.items.map((item) => item.id)).toEqual(['clock'])
  })
})

describe('planLayoutRender (narrow floor)', () => {
  it('below the floor renders one mechanical stack: docks first (top then bottom, by order), then free items in layer order', () => {
    const input = structuredClone(LAYOUT)
    input.widgets.tasks = { kind: 'docked', dock: 'top', order: 0, x: 95, y: 92 }
    const before = structuredClone(input)
    const plan = planLayoutRender(input, ENABLED, NARROW_FLOOR_WIDTH - 1)
    expect(plan.narrow).toBe(true)
    const ids = plan.items.map((item) => item.id)
    expect(ids).toEqual(['tasks', 'timer', 'bookmarks', 'quote', 'weather', 'clock', 'notes'])
    expect(plan.items.every((item) => item.mode === 'stacked')).toBe(true)
    expect((plan.items as StackedRenderItem[]).map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(plan.items.find((item) => item.id === 'tasks')).not.toHaveProperty('xPct')
    expect(plan.items.find((item) => item.id === 'tasks')).not.toHaveProperty('yPct')
    expect(input).toEqual(before)
  })

  it('exactly at the floor width stays anchored', () => {
    expect(planLayoutRender(LAYOUT, ENABLED, NARROW_FLOOR_WIDTH).narrow).toBe(false)
  })
})

describe('hidden placements', () => {
  it('renders nothing for a hidden widget — and never re-adds it through the default slot', () => {
    const withHidden: NamedLayout = {
      ...LAYOUT,
      widgets: { ...LAYOUT.widgets, notes: { kind: 'hidden' } },
    }
    const plan = planLayoutRender(withHidden, [...ENABLED], 1408)
    expect(plan.items.some((item) => item.id === 'notes')).toBe(false)
    const narrow = planLayoutRender(withHidden, [...ENABLED], 599)
    expect(narrow.items.some((item) => item.id === 'notes')).toBe(false)
  })
})

describe('widget stacks', () => {
  const stackedLayout: NamedLayout = {
    id: 'stack-layout',
    name: 'Stacks',
    widgets: {
      quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -10, tier: 'standard', layer: 0 },
    },
    stacks: [{
      id: 'stack-day',
      members: ['weather', 'clock', 'notes'],
      facing: 'clock',
      anchor: 'top-right',
      offsetX: -8,
      offsetY: 13,
      tier: 'full',
      layer: 4,
    }],
  }
  const stackEnabled: readonly BlockId[] = ['weather', 'clock', 'notes', 'quote']

  it('emits one stable item at the stack geometry and never emits or defaults a member separately', () => {
    const plan = planLayoutRender(stackedLayout, stackEnabled, 1408)
    expect(plan.items).toHaveLength(2)
    const stack = plan.items.find((item) => 'stack' in item)
    expect(stack).toEqual({
      id: 'clock',
      mode: 'anchored',
      leftPct: 92,
      topPct: 13,
      tier: 'full',
      layer: 4,
      stack: {
        id: 'stack-day',
        members: ['weather', 'clock', 'notes'],
        facing: 'clock',
      },
    })
    expect(plan.items.filter((item) => ['weather', 'clock', 'notes'].includes(item.id))).toHaveLength(1)
  })

  it('keeps the stored face unchanged across widths and reload-shaped calls, including one narrow item', () => {
    const first = planLayoutRender(structuredClone(stackedLayout), stackEnabled, 1600)
    const second = planLayoutRender(structuredClone(stackedLayout), stackEnabled, 800)
    const narrow = planLayoutRender(structuredClone(stackedLayout), stackEnabled, 599)
    expect(first.items.find((item) => 'stack' in item)?.id).toBe('clock')
    expect(second.items.find((item) => 'stack' in item)?.id).toBe('clock')
    const narrowStack = narrow.items.find((item) => 'stack' in item)
    expect(narrowStack).toMatchObject({ id: 'clock', mode: 'stacked', tier: 'full' })
    expect(narrow.items.filter((item) => ['weather', 'clock', 'notes'].includes(item.id))).toHaveLength(1)
  })

  it('suppresses the whole stack when its stored face is disabled and never guesses another face', () => {
    const plan = planLayoutRender(stackedLayout, ['weather', 'notes', 'quote'], 1408)
    expect(plan.items.map((item) => item.id)).toEqual(['quote'])
  })
})

describe('dock eligibility safety (owner-reported 2026-08-18: docked Month)', () => {
  // A stored docked placement for a widget that declares NO Docked tier is
  // invalid contract data (a month grid has no honest strip form). The safety
  // half of the law: it renders FREE at the widget's designed static default
  // slot — deterministic, never guessed, never written back.
  const withDockedMonth: NamedLayout = {
    ...LAYOUT,
    widgets: { ...LAYOUT.widgets, monthCal: { kind: 'docked', dock: 'bottom', order: 1 } },
  }
  const dockable = new Set<BlockId>(['bookmarks', 'timer', 'tasks', 'notes'])

  it('renders a docked placement for a non-dockable widget free at its static default slot', () => {
    const plan = planLayoutRender(withDockedMonth, [...ENABLED, 'monthCal'], 1408, dockable)
    const month = plan.items.find((item) => item.id === 'monthCal') as AnchoredRenderItem
    // defaultFreePlacement('monthCal'): the identity's designed point, above
    // every stored layer (maxStoredLayer 2 + 1 + BLOCK_IDS index).
    expect(month.mode).toBe('anchored')
    expect(month.layer).toBeGreaterThan(2)
    expect(plan.items.filter((item) => item.mode === 'docked').map((item) => item.id).sort())
      .toEqual(['bookmarks', 'tasks', 'timer'])
  })

  it('keeps legitimate docked placements docked and stays exact without the eligibility set', () => {
    const gated = planLayoutRender(withDockedMonth, [...ENABLED, 'monthCal'], 1408, dockable)
    expect(gated.items.find((item) => item.id === 'bookmarks')?.mode).toBe('docked')
    const ungated = planLayoutRender(withDockedMonth, [...ENABLED, 'monthCal'], 1408)
    expect(ungated.items.find((item) => item.id === 'monthCal')?.mode).toBe('docked')
  })
})

describe('enforceDockEligibility', () => {
  const dockable = new Set<BlockId>(['bookmarks', 'timer', 'tasks'])
  const document = {
    version: 1 as const,
    activeLayoutId: 'a',
    layouts: [{
      ...LAYOUT,
      id: 'a',
      widgets: { ...LAYOUT.widgets, monthCal: { kind: 'docked' as const, dock: 'bottom' as const, order: 1 } },
    }],
  }

  it('converts an invalid docked placement to the free default slot so edit sessions see the truth', () => {
    const normalized = enforceDockEligibility(document, dockable)
    const month = normalized.layouts[0].widgets.monthCal
    expect(month?.kind).toBe('free')
    // Legitimate docked members and every free placement stay identical.
    expect(normalized.layouts[0].widgets.bookmarks).toBe(document.layouts[0].widgets.bookmarks)
    expect(normalized.layouts[0].widgets.clock).toBe(document.layouts[0].widgets.clock)
    expect(document.layouts[0].widgets.monthCal?.kind).toBe('docked') // input untouched
  })

  it('returns the document IDENTITY when nothing needs correcting', () => {
    const clean = { ...document, layouts: [{ ...LAYOUT, id: 'a' }] }
    expect(enforceDockEligibility(clean, dockable)).toBe(clean)
  })
})

describe('resolveRenderTier', () => {
  it('returns the tier when supported and the nearest supported tier otherwise, ties toward smaller', () => {
    expect(resolveRenderTier(['compact', 'standard', 'full'], 'standard')).toBe('standard')
    expect(resolveRenderTier(['compact'], 'full')).toBe('compact')
    expect(resolveRenderTier(['compact', 'full'], 'standard')).toBe('compact')
    expect(resolveRenderTier([], 'standard')).toBe('standard')
  })
})
