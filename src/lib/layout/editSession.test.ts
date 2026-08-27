import { describe, expect, it } from 'vitest'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  createStackFromDrop,
  detachSelectedStackMember,
  dockOrder,
  dockSelected,
  dockSelectedLive,
  hideSelected,
  moveSelected,
  moveSelectedLive,
  nudgeSelected,
  resetSession,
  removeSelectedStackMember,
  reorderSelectedStackMember,
  restoreHiddenWidget,
  restoreSelectedDefaults,
  selectWidget,
  selectStack,
  setSelectedStackFacing,
  setSelectedTier,
  stepSelectedLayer,
  undo,
  undockSelected,
  undockSelectedLive,
} from './editSession'
import { pointFromFreePlacement, type FreeWidgetPlacement, type LayoutsDocument } from './namedLayouts'

const DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'a',
  layouts: [{
    id: 'a',
    name: 'Desktop',
    widgets: {
      clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -26, tier: 'full', layer: 0 },
      weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 },
      bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
    },
  }],
}

const ENABLED = ['clock', 'weather', 'bookmarks', 'notes'] as const

function fresh() {
  return beginEditSession(structuredClone(DOC), [...ENABLED])
}

const STACK_DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'a',
  layouts: [{
    id: 'a',
    name: 'Desktop',
    widgets: {
      monthCal: { kind: 'free', anchor: 'left', offsetX: 9, offsetY: 0, tier: 'standard', layer: 1 },
      quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -12, tier: 'compact', layer: 3 },
    },
    stacks: [{
      id: 'stack-day',
      members: ['weather', 'clock', 'notes'],
      facing: 'notes',
      anchor: 'top-right',
      offsetX: -7,
      offsetY: 13,
      tier: 'standard',
      layer: 2,
    }],
  }],
}

function stackFresh() {
  return beginEditSession(structuredClone(STACK_DOC), ['weather', 'clock', 'notes', 'monthCal', 'quote'])
}

describe('beginEditSession', () => {
  it('materializes enabled-but-absent widgets into the baseline draft without dirtying', () => {
    // The baseline is the initial MATERIALIZED draft — what the user sees on
    // entry is the reset/undo reference. Cancel needs no stored bytes at all
    // (the session is simply discarded; nothing was written).
    const session = fresh()
    expect(session.dirty).toBe(false)
    expect(session.draft).toEqual(session.baseline)
    const notes = activeDraftLayout(session).widgets.notes as FreeWidgetPlacement
    expect(pointFromFreePlacement(notes)).toEqual({ x: 7, y: 91 })
    expect(notes.layer).toBe(1 + 1 + 11) // maxLayer(1) + 1 + BLOCK_IDS.indexOf('notes')
    // The stored widgets survive byte-exactly in the baseline.
    expect(session.baseline.layouts[0].widgets.clock).toEqual(DOC.layouts[0].widgets.clock)
    expect(session.baseline.layouts[0].widgets.bookmarks).toEqual(DOC.layouts[0].widgets.bookmarks)
  })

  it('does not materialize widget entries for identities already owned by a stack', () => {
    const session = stackFresh()
    const layout = activeDraftLayout(session)
    expect(layout.widgets.weather).toBeUndefined()
    expect(layout.widgets.clock).toBeUndefined()
    expect(layout.widgets.notes).toBeUndefined()
    expect(layout.stacks?.[0].members).toEqual(['weather', 'clock', 'notes'])
    expect(session.selection).toBeNull()
  })
})

describe('move, nudge, tier, layer', () => {
  it('moveSelected re-anchors to the dropped point exactly and marks dirty with one undo step', () => {
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 12.5, yPct: 80 })
    const clock = activeDraftLayout(session).widgets.clock as FreeWidgetPlacement
    expect(pointFromFreePlacement(clock)).toEqual({ x: 12.5, y: 80 })
    expect(clock.tier).toBe('full')
    expect(session.dirty).toBe(true)
    expect(session.past).toHaveLength(1)
    expect(undo(session).dirty).toBe(false)
  })

  it('moveSelectedLive streams a drag through ONE undo entry', () => {
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 30, yPct: 30 })   // drag start: pushes
    session = moveSelectedLive(session, { xPct: 31, yPct: 31 })
    session = moveSelectedLive(session, { xPct: 40, yPct: 55 })
    expect(session.past).toHaveLength(1)
    const clock = activeDraftLayout(session).widgets.clock as FreeWidgetPlacement
    expect(pointFromFreePlacement(clock)).toEqual({ x: 40, y: 55 })
    const undone = undo(session)
    expect(undone.dirty).toBe(false)
  })

  it('nudgeSelected moves by percent deltas and is identity without a selection', () => {
    let session = selectWidget(fresh(), 'weather')
    session = nudgeSelected(session, { xPct: -1, yPct: 2 })
    const weather = activeDraftLayout(session).widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 92, y: 15 })
    expect(nudgeSelected(fresh(), { xPct: 5, yPct: 5 })).toEqual(fresh())
  })

  it('setSelectedTier sizes the selected placement wherever it lives — free tier or docked size', () => {
    let session = selectWidget(fresh(), 'weather')
    session = setSelectedTier(session, 'full')
    expect((activeDraftLayout(session).widgets.weather as FreeWidgetPlacement).tier).toBe('full')
    // Docked members size too (owner-confirmed 2026-08-18): the placement
    // keeps its dock and order and gains the chosen tier.
    const docked = setSelectedTier(selectWidget(fresh(), 'bookmarks'), 'compact')
    expect(activeDraftLayout(docked).widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0, tier: 'compact' })
  })

  it('stepSelectedLayer swaps with the nearest free sibling and continues upward', () => {
    let session = selectWidget(fresh(), 'clock')
    session = stepSelectedLayer(session, 'forward')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).layer).toBe(1)
    expect((activeDraftLayout(session).widgets.weather as FreeWidgetPlacement).layer).toBe(0)
    const notesLayer = (activeDraftLayout(session).widgets.notes as FreeWidgetPlacement).layer
    const top = stepSelectedLayer(session, 'forward')
    expect((activeDraftLayout(top).widgets.clock as FreeWidgetPlacement).layer).toBe(notesLayer)
  })

  it('stepSelectedLayer is identity at the extreme', () => {
    let session = selectWidget(fresh(), 'clock')
    session = stepSelectedLayer(session, 'backward')
    session = stepSelectedLayer(session, 'backward')
    const bottom = stepSelectedLayer(session, 'backward')
    expect(activeDraftLayout(bottom)).toEqual(activeDraftLayout(session))
  })
})

describe('hide, restore, bulk, reset', () => {
  it('hideSelected records the hidden kind and clears the selection', () => {
    const session = hideSelected(selectWidget(fresh(), 'weather'))
    expect(activeDraftLayout(session).widgets.weather).toEqual({ kind: 'hidden' })
    expect(session.selection).toBeNull()
  })

  it('restoreHiddenWidget un-hides to the designed slot and is identity for non-hidden entries (review fix I2)', () => {
    let session = hideSelected(selectWidget(fresh(), 'weather'))
    session = restoreHiddenWidget(session, 'weather')
    const weather = activeDraftLayout(session).widgets.weather as FreeWidgetPlacement
    expect(weather.kind).toBe('free')
    expect(pointFromFreePlacement(weather)).toEqual({ x: 93, y: 13 })
    expect(restoreHiddenWidget(fresh(), 'clock')).toEqual(fresh())
  })

  it('restoreSelectedDefaults returns the designed slot', () => {
    let session = selectWidget(fresh(), 'weather')
    session = moveSelected(session, { xPct: 10, yPct: 10 })
    session = restoreSelectedDefaults(session)
    const weather = activeDraftLayout(session).widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 93, y: 13 })
  })

  it('applyBulkTier sets every free tier, records bulkTier, and leaves docked/hidden untouched (AC9)', () => {
    let session = hideSelected(selectWidget(fresh(), 'notes'))
    session = applyBulkTier(session, 'compact')
    const layout = activeDraftLayout(session)
    expect((layout.widgets.clock as FreeWidgetPlacement).tier).toBe('compact')
    expect((layout.widgets.weather as FreeWidgetPlacement).tier).toBe('compact')
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
    expect(layout.widgets.notes).toEqual({ kind: 'hidden' })
    expect(layout.bulkTier).toBe('compact')
    // a later per-widget tier survives until bulk re-baselines (AC9)
    session = setSelectedTier(selectWidget(session, 'clock'), 'full')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).tier).toBe('full')
    session = applyBulkTier(session, 'standard')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).tier).toBe('standard')
  })

  it('dockSelected stores the exact strip position and derives orders left-to-right (owner-refined 2026-08-18)', () => {
    // DOC already has bookmarks docked bottom (legacy, no x → renders 50).
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', { xPct: 12, yPct: 81 })
    const layout = activeDraftLayout(session)
    expect(layout.widgets.clock).toEqual({
      kind: 'docked', dock: 'bottom', order: 0, x: 12, y: 81, returnTier: 'full',
    })
    expect(layout.widgets.bookmarks).toMatchObject({ kind: 'docked', dock: 'bottom', order: 1 })
    expect(dockOrder(layout, 'bottom')).toEqual(['clock', 'bookmarks'])
    expect(session.dirty).toBe(true)
  })

  it('dockSelected repositions an already-docked widget and orders follow position', () => {
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', { xPct: 12, yPct: 20 })
    session = selectWidget(session, 'clock')
    session = dockSelected(session, 'bottom', { xPct: 88, yPct: 70 })
    const layout = activeDraftLayout(session)
    expect(layout.widgets.clock).toEqual({
      kind: 'docked', dock: 'bottom', order: 1, x: 88, y: 70, returnTier: 'full',
    })
    expect(dockOrder(layout, 'bottom')).toEqual(['bookmarks', 'clock'])
  })

  it('dockSelected can create the top dock and clamps a wild position onto the strip', () => {
    let session = selectWidget(fresh(), 'weather')
    session = dockSelected(session, 'top', { xPct: 250, yPct: -10 })
    expect(activeDraftLayout(session).widgets.weather).toEqual({
      kind: 'docked', dock: 'top', order: 0, x: 100, y: 0, returnTier: 'standard',
    })
  })

  it('a zone-drag gesture costs ONE undo entry: move pushes, dockSelectedLive completes (review fix I2)', () => {
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 50, yPct: 96 })   // the drag's first move
    session = dockSelectedLive(session, 'bottom', { xPct: 30, yPct: 60 }) // the drop
    expect(session.past).toHaveLength(1)
    expect(activeDraftLayout(session).widgets.clock).toEqual({
      kind: 'docked', dock: 'bottom', order: 0, x: 30, y: 60, returnTier: 'full',
    })
    const undone = undo(session)
    expect(undone.dirty).toBe(false)
    expect(activeDraftLayout(undone).widgets.clock).toEqual(activeDraftLayout(fresh()).widgets.clock)
  })

  it('a gesture crossing OUT of and back INTO a dock band stays ONE undo entry (owner-reported 2026-08-18)', () => {
    let session = selectWidget(fresh(), 'bookmarks')
    session = dockSelected(session, 'bottom', { xPct: 20, yPct: 30 }) // first move: in-band reposition pushes
    session = undockSelectedLive(session, { xPct: 40, yPct: 50 }) // pointer leaves the band
    session = dockSelectedLive(session, 'bottom', { xPct: 75, yPct: 80 }) // pointer re-enters, re-docks live
    expect(session.past).toHaveLength(1)
    const undone = undo(session)
    expect(activeDraftLayout(undone).widgets.bookmarks).toEqual(activeDraftLayout(fresh()).widgets.bookmarks)
  })

  it('setSelectedTier sizes a DOCKED member and repositioning preserves the choice (owner-confirmed 2026-08-18)', () => {
    let session = selectWidget(fresh(), 'bookmarks')
    session = setSelectedTier(session, 'compact')
    expect(activeDraftLayout(session).widgets.bookmarks).toEqual({
      kind: 'docked', dock: 'bottom', order: 0, tier: 'compact',
    })
    // A later reposition must not discard the stored size.
    session = dockSelected(session, 'bottom', { xPct: 5, yPct: 50 })
    expect(activeDraftLayout(session).widgets.bookmarks).toEqual({
      kind: 'docked', dock: 'bottom', order: 0, x: 5, y: 50, tier: 'compact',
    })
  })

  it('keeps prior order for equal x, then BLOCK_IDS identity as the final tie without reading y', () => {
    const equalX: LayoutsDocument = {
      version: 1,
      activeLayoutId: 'a',
      layouts: [{
        id: 'a',
        name: 'Equal X',
        widgets: {
          weather: { kind: 'docked', dock: 'top', order: 1, x: 40, y: 10 },
          bookmarks: { kind: 'docked', dock: 'top', order: 0, x: 40, y: 20 },
          tasks: { kind: 'docked', dock: 'top', order: 0, x: 40, y: 90 },
        },
      }],
    }
    let session = beginEditSession(equalX, ['weather', 'bookmarks', 'tasks'])
    session = selectWidget(session, 'weather')
    session = dockSelected(session, 'top', { xPct: 40, yPct: 99 })

    expect(dockOrder(activeDraftLayout(session), 'top')).toEqual(['tasks', 'bookmarks', 'weather'])
    expect(activeDraftLayout(session).widgets.weather).toMatchObject({ order: 2, x: 40, y: 99 })
  })

  it('restores returnTier and falls back to Standard only when the field is absent', () => {
    const explicit: LayoutsDocument = {
      version: 1,
      activeLayoutId: 'a',
      layouts: [{
        id: 'a', name: 'Return tier', widgets: {
          bookmarks: { kind: 'docked', dock: 'bottom', order: 0, returnTier: 'compact' },
        },
      }],
    }
    const restored = undockSelected(
      selectWidget(beginEditSession(explicit, ['bookmarks']), 'bookmarks'),
      { xPct: 30, yPct: 60 },
    )
    expect((activeDraftLayout(restored).widgets.bookmarks as FreeWidgetPlacement).tier).toBe('compact')

    const legacy = undockSelected(selectWidget(fresh(), 'bookmarks'), { xPct: 30, yPct: 60 })
    expect((activeDraftLayout(legacy).widgets.bookmarks as FreeWidgetPlacement).tier).toBe('standard')
  })

  it('top to bottom to canvas to top remains one undo entry and retains gesture memory', () => {
    const before = fresh()
    let session = selectWidget(before, 'clock')
    const memory = { dockTier: 'compact' as const, returnTier: 'full' as const }
    session = dockSelected(session, 'top', { xPct: 20, yPct: 25 }, memory)
    session = dockSelectedLive(session, 'bottom', { xPct: 70, yPct: 75 }, memory)
    session = undockSelectedLive(session, { xPct: 45, yPct: 55 })
    session = dockSelectedLive(session, 'top', { xPct: 82, yPct: 18 }, memory)

    expect(session.past).toHaveLength(1)
    expect(activeDraftLayout(session).widgets.clock).toEqual({
      kind: 'docked', dock: 'top', order: 0, x: 82, y: 18,
      tier: 'compact', returnTier: 'full',
    })
    expect(undo(session).draft).toEqual(before.draft)
  })

  it('undockSelected returns a docked widget to a free anchor at the drop point', () => {
    let session = selectWidget(fresh(), 'bookmarks')
    session = undockSelected(session, { xPct: 30, yPct: 60 })
    const bookmarks = activeDraftLayout(session).widgets.bookmarks as FreeWidgetPlacement
    expect(bookmarks.kind).toBe('free')
    expect(pointFromFreePlacement(bookmarks)).toEqual({ x: 30, y: 60 })
    expect(bookmarks.tier).toBe('standard')
    expect(undockSelected(selectWidget(fresh(), 'clock'), { xPct: 10, yPct: 10 }))
      .toEqual(selectWidget(fresh(), 'clock'))
  })

  it('resetSession restores the baseline as one undoable step and never mutates inputs', () => {
    const original = structuredClone(DOC)
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 20, yPct: 20 })
    session = resetSession(session)
    // Reset returns to the materialized entry state (the baseline draft).
    expect(session.draft).toEqual(session.baseline)
    expect(session.dirty).toBe(false)
    expect(undo(session).dirty).toBe(true)
    expect(DOC).toEqual(original)
  })
})

describe('stack edit session operations', () => {
  it('moves, nudges, sizes, and layers a selected stack while bulk sizing remains free-widget-only', () => {
    let session = selectStack(stackFresh(), 'stack-day')
    expect(session.selection).toEqual({ kind: 'stack', id: 'stack-day' })
    session = moveSelected(session, { xPct: 20, yPct: 80 })
    expect(activeDraftLayout(session).stacks?.[0]).toMatchObject({
      anchor: 'bottom-left', offsetX: 20, offsetY: -20, tier: 'standard', layer: 2,
    })
    session = nudgeSelected(session, { xPct: 1, yPct: -2 })
    expect(activeDraftLayout(session).stacks?.[0]).toMatchObject({
      anchor: 'bottom-left', offsetX: 21, offsetY: -22,
    })
    session = setSelectedTier(session, 'full')
    expect(activeDraftLayout(session).stacks?.[0].tier).toBe('full')
    session = stepSelectedLayer(session, 'forward')
    expect(activeDraftLayout(session).stacks?.[0].layer).toBe(3)
    expect((activeDraftLayout(session).widgets.quote as FreeWidgetPlacement).layer).toBe(2)
    session = applyBulkTier(session, 'compact')
    expect(activeDraftLayout(session).stacks?.[0].tier).toBe('full')
  })

  it('creates a stack at drop as the drag gesture single undo entry', () => {
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 80, yPct: 20 })
    session = createStackFromDrop(session, 'clock', { kind: 'widget', id: 'weather' }, 'stack-new', false)
    expect(session.past).toHaveLength(1)
    expect(session.selection).toEqual({ kind: 'stack', id: 'stack-new' })
    expect(activeDraftLayout(session).stacks?.[0]).toMatchObject({
      id: 'stack-new', members: ['weather', 'clock'], facing: 'clock',
    })
    expect(undo(session).dirty).toBe(false)
  })

  it('pages, reorders, and removes with one undo entry per explicit operation', () => {
    let session = selectStack(stackFresh(), 'stack-day')
    session = setSelectedStackFacing(session, 'weather')
    expect(session.past).toHaveLength(1)
    expect(activeDraftLayout(session).stacks?.[0].facing).toBe('weather')

    session = { ...session, past: [] }
    session = reorderSelectedStackMember(session, 'notes', -1)
    expect(session.past).toHaveLength(1)
    expect(activeDraftLayout(session).stacks?.[0].members).toEqual(['weather', 'notes', 'clock'])

    session = { ...session, past: [] }
    session = removeSelectedStackMember(session, 'clock')
    expect(session.past).toHaveLength(1)
    expect(activeDraftLayout(session).stacks?.[0].members).toEqual(['weather', 'notes'])
    expect(activeDraftLayout(session).widgets.clock?.kind).toBe('free')
  })

  it('direct member detach selects the free member and dissolves a two-member stack', () => {
    let session = selectStack(stackFresh(), 'stack-day')
    session = removeSelectedStackMember(session, 'notes')
    session = { ...session, past: [] }
    session = detachSelectedStackMember(session, 'clock', { xPct: 22, yPct: 78 })
    expect(session.past).toHaveLength(1)
    expect(session.selection).toEqual({ kind: 'widget', id: 'clock' })
    expect(activeDraftLayout(session).stacks).toBeUndefined()
    expect(activeDraftLayout(session).widgets.weather).toMatchObject({
      kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13,
    })
    expect(activeDraftLayout(session).widgets.clock).toMatchObject({
      kind: 'free', anchor: 'bottom-left', offsetX: 22, offsetY: -22,
    })
  })

  it('hides a selected stack as one undoable operation and clears selection', () => {
    const session = hideSelected(selectStack(stackFresh(), 'stack-day'))
    expect(session.past).toHaveLength(1)
    expect(session.selection).toBeNull()
    expect(activeDraftLayout(session).stacks).toBeUndefined()
    expect(activeDraftLayout(session).widgets.weather).toEqual({ kind: 'hidden' })
    expect(activeDraftLayout(session).widgets.clock).toEqual({ kind: 'hidden' })
    expect(activeDraftLayout(session).widgets.notes).toEqual({ kind: 'hidden' })
  })
})
