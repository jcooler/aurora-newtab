import { describe, expect, it } from 'vitest'
import type { CanvasProfile } from '../../lib/layout/canvasTypes'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import {
  bringCanvasItemForward,
  copyCanvasProfileIntoDraft,
  createCanvasDraft,
  moveCanvasItem,
  moveCanvasItemToBottomBar,
  normalizeCanvasDraft,
  overlappingCanvasIds,
  resetCanvasDraft,
  resizeCanvasItem,
  selectCanvasItem,
  sendCanvasItemBackward,
  setCanvasItemVisibility,
  setDesktopEverywhere,
  undoCanvasDraft,
} from './canvasDraft'

const PROFILE: CanvasProfile = {
  mode: 'custom',
  placements: {
    clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 4 },
    focus: { kind: 'canvas', x: 50, y: 40, size: 'standard', layer: 8 },
    notes: { kind: 'canvas', x: 12, y: 88, size: 'compact', layer: 12 },
    weather: { kind: 'canvas', x: 88, y: 14, size: 'standard', layer: 16 },
  },
}
const DEFAULTS: CanvasProfile = {
  mode: 'derived',
  placements: {
    clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 0 },
    focus: { kind: 'canvas', x: 50, y: 62, size: 'standard', layer: 1 },
    notes: { kind: 'canvas', x: 7, y: 91, size: 'compact', layer: 2 },
    weather: { kind: 'canvas', x: 93, y: 13, size: 'standard', layer: 3 },
  },
}

function draft() {
  return createCanvasDraft('standard', PROFILE, DEFAULTS, 'clock')
}

describe('Canvas Arrange draft', () => {
  it('selects and moves a Canvas item immutably with one undo frame', () => {
    const original = draft()
    const selected = selectCanvasItem(original, 'focus')
    const moved = moveCanvasItem(selected, 'focus', { x: 44, y: 58 })

    expect(original.selectedId).toBe('clock')
    expect(selected.selectedId).toBe('focus')
    expect(moved.placements.focus).toMatchObject({ x: 44, y: 58 })
    expect(moved.history).toHaveLength(1)
    expect(undoCanvasDraft(moved).placements).toEqual(selected.placements)
    expect(original.placements.focus).toEqual(PROFILE.placements.focus)
  })

  it('resizes only to a supported Canvas size and never resizes a Bottom bar item', () => {
    const compact = resizeCanvasItem(draft(), WIDGET_REGISTRY_BY_ID.clock, 'compact')
    expect(compact.placements.clock).toMatchObject({ size: 'compact' })
    expect(resizeCanvasItem(compact, WIDGET_REGISTRY_BY_ID.clock, 'compact')).toBe(compact)
    expect(resizeCanvasItem(compact, WIDGET_REGISTRY_BY_ID.clock, 'not-a-size' as never)).toBe(compact)

    const bottom = moveCanvasItemToBottomBar(compact, 'notes')
    expect(bottom.placements.notes).toEqual({ kind: 'bottom-bar', order: 0, size: 'compact' })
    expect(resizeCanvasItem(bottom, WIDGET_REGISTRY_BY_ID.notes, 'compact')).toBe(bottom)
  })

  it('clamps a resized item so the larger box remains inside the safe Canvas', () => {
    const atEdge = moveCanvasItem(resizeCanvasItem(draft(), WIDGET_REGISTRY_BY_ID.clock, 'compact'), 'clock', { x: 99, y: 99 })
    const enlarged = resizeCanvasItem(atEdge, WIDGET_REGISTRY_BY_ID.clock, 'full', { width: 1000, height: 800, inset: 8 })
    expect(enlarged.placements.clock).toMatchObject({ x: 76.8, y: 86, size: 'full' })
    expect(undoCanvasDraft(enlarged).placements.clock).toEqual(atEdge.placements.clock)
  })

  it('detects overlaps, allows them, and changes layers only while overlap makes layering relevant', () => {
    const current = draft()
    expect(overlappingCanvasIds(current, { width: 1600, height: 900 }, 'clock')).toEqual(['focus'])

    const forward = bringCanvasItemForward(current, 'clock', { width: 1600, height: 900 })
    expect(forward.placements.clock).toMatchObject({ layer: 9 })
    const backward = sendCanvasItemBackward(forward, 'clock', { width: 1600, height: 900 })
    expect(backward.placements.clock).toMatchObject({ layer: 7 })

    const isolated = moveCanvasItem(current, 'clock', { x: 20, y: 20 })
    expect(bringCanvasItemForward(isolated, 'clock', { width: 1600, height: 900 })).toBe(isolated)
    expect(sendCanvasItemBackward(isolated, 'clock', { width: 1600, height: 900 })).toBe(isolated)
  })

  it('moves launchers into the optional Bottom bar in stable order without dropping siblings', () => {
    const first = moveCanvasItemToBottomBar(draft(), 'notes')
    const second = moveCanvasItemToBottomBar(first, 'weather')
    expect(first.placements.notes).toEqual({ kind: 'bottom-bar', order: 0, size: 'compact' })
    expect(second.placements.weather).toEqual({ kind: 'bottom-bar', order: 1, size: 'compact' })
    expect(second.placements.clock).toEqual(PROFILE.placements.clock)
  })

  it('resets only active identities to source defaults and preserves hidden saved placements', () => {
    const current = draft()
    const reset = resetCanvasDraft(current, ['clock', 'focus', 'notes'], DEFAULTS)
    expect(reset.placements.clock).toEqual(DEFAULTS.placements.clock)
    expect(reset.placements.focus).toEqual(DEFAULTS.placements.focus)
    expect(reset.placements.notes).toEqual(DEFAULTS.placements.notes)
    expect(reset.placements.weather).toEqual(PROFILE.placements.weather)
    expect(undoCanvasDraft(reset).placements).toEqual(current.placements)
  })

  it('copies a profile into active identities, remains undoable, and preserves hidden positions', () => {
    const source: CanvasProfile = {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 51, y: 26, size: 'compact', layer: 2 },
        focus: { kind: 'canvas', x: 52, y: 64, size: 'compact', layer: 3 },
      },
    }
    const current = draft()
    const copied = copyCanvasProfileIntoDraft(current, ['clock', 'focus'], source)
    expect(copied.placements.clock).toEqual(source.placements.clock)
    expect(copied.placements.focus).toEqual(source.placements.focus)
    expect(copied.placements.weather).toEqual(current.placements.weather)
    expect(undoCanvasDraft(copied).placements).toEqual(current.placements)
  })

  it('toggles Use Desktop layout everywhere as preview state with Undo support', () => {
    const current = draft()
    const shared = setDesktopEverywhere(current, true)
    expect(shared.useDesktopLayoutEverywhere).toBe(true)
    expect(undoCanvasDraft(shared).useDesktopLayoutEverywhere).toBe(false)
    expect(setDesktopEverywhere(shared, true)).toBe(shared)
  })

  it('keeps visibility in the same undoable draft and Reset restores active items', () => {
    const current = draft()
    const hidden = setCanvasItemVisibility(current, 'weather', false)
    expect(hidden.hiddenIds).toEqual(['weather'])
    expect(undoCanvasDraft(hidden).hiddenIds).toEqual([])

    const reset = resetCanvasDraft(hidden, ['clock', 'focus', 'notes', 'weather'], DEFAULTS)
    expect(reset.hiddenIds).toEqual([])
    expect(undoCanvasDraft(reset).hiddenIds).toEqual(['weather'])
  })

  it('normalizes finite layers and Bottom bar order without mutating the draft', () => {
    const current = draft()
    const before = JSON.stringify(current)
    const normalized = normalizeCanvasDraft(current)
    const canvasLayers = Object.values(normalized.placements)
      .filter((placement) => placement?.kind === 'canvas')
      .map((placement) => placement.kind === 'canvas' ? placement.layer : -1)
    expect(canvasLayers).toEqual([0, 1, 2, 3])
    expect(normalized.mode).toBe('custom')
    expect(JSON.stringify(current)).toBe(before)
  })
})
