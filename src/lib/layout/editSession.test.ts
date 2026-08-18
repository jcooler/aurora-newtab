import { describe, expect, it } from 'vitest'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  dockOrder,
  dockSelected,
  hideSelected,
  moveSelected,
  moveSelectedLive,
  nudgeSelected,
  resetSession,
  restoreHiddenWidget,
  restoreSelectedDefaults,
  selectWidget,
  setSelectedTier,
  stepSelectedLayer,
  undo,
  undockSelected,
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

  it('setSelectedTier changes only the selected free tier; docked selection is identity', () => {
    let session = selectWidget(fresh(), 'weather')
    session = setSelectedTier(session, 'full')
    expect((activeDraftLayout(session).widgets.weather as FreeWidgetPlacement).tier).toBe('full')
    const docked = setSelectedTier(selectWidget(fresh(), 'bookmarks'), 'full')
    expect(activeDraftLayout(docked).widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
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
    expect(session.selectedId).toBeNull()
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

  it('dockSelected inserts at the index and renumbers compactly', () => {
    // DOC already has bookmarks docked bottom order 0.
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', 0)
    const layout = activeDraftLayout(session)
    expect(layout.widgets.clock).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 1 })
    expect(dockOrder(layout, 'bottom')).toEqual(['clock', 'bookmarks'])
    expect(session.dirty).toBe(true)
  })

  it('dockSelected moves an already-docked widget to a new index (reorder)', () => {
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', 0)
    session = selectWidget(session, 'clock')
    session = dockSelected(session, 'bottom', 2)
    expect(dockOrder(activeDraftLayout(session), 'bottom')).toEqual(['bookmarks', 'clock'])
  })

  it('dockSelected can create the top dock and clamps a wild index', () => {
    let session = selectWidget(fresh(), 'weather')
    session = dockSelected(session, 'top', 99)
    expect(activeDraftLayout(session).widgets.weather).toEqual({ kind: 'docked', dock: 'top', order: 0 })
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
