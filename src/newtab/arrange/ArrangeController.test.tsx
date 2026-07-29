// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import type { Layout } from '../../lib/layout/types'
import { snapPosition } from '../../lib/layout/snap'
import { clampCenterPct } from '../../lib/layout/clamp'
import ArrangeController from './ArrangeController'

// Deterministic rects per block id — keyed off the SAME data-block-id
// attribute the real PositionedBlock divs carry, exactly what ArrangeController
// queries via document.querySelector.
const RECT_DATA: Record<string, { left: number; top: number; width: number; height: number }> = {
  clock: { left: 700, top: 400, width: 200, height: 100 }, // center (800, 450) = the 1600x900 viewport center
  greeting: { left: 100, top: 800, width: 150, height: 60 }, // far from clock's drag target below, by design
}

function domRect(r: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    x: r.left,
    y: r.top,
    toJSON() {
      return {}
    },
  } as DOMRect
}

function Fixture({ onDraftChange }: { onDraftChange: (d: Layout) => void }) {
  return (
    <>
      <div data-block-id="clock">
        <button type="button">Clock content</button>
      </div>
      <div data-block-id="greeting">
        <span>Greeting content</span>
      </div>
      <ArrangeController onDraftChange={onDraftChange} />
    </>
  )
}

async function renderController(seedLayout?: Layout) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  if (seedLayout) await storage.set('layout', seedLayout)
  const onDraftChange = vi.fn()
  render(
    <StorageProvider storage={storage}>
      <Fixture onDraftChange={onDraftChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, onDraftChange }
}

/** Long-press the clock fixture (500ms hold, no movement) — engages arrange
 *  mode and immediately begins dragging clock, per the brief. */
function engageClock() {
  const clockButton = screen.getByText('Clock content')
  fireEvent.pointerDown(clockButton, { pointerId: 1, clientX: 800, clientY: 450 })
  act(() => {
    vi.advanceTimersByTime(500)
  })
}

/** Ends whatever drag is in flight (typically the one `engageClock` started)
 *  with no movement — settles into "mode on, no active drag" without
 *  writing anything but the block's own (unchanged) current position.
 *  `storage.update` is async even against the in-memory driver (real await
 *  points inside it), so this flushes microtasks afterward before the
 *  caller reads storage back.
 *
 *  Also fires the `click` a real browser synthesizes after a pointerup —
 *  useLongPress's one-shot suppressor is armed at engage specifically to eat
 *  that click (so a long-press-then-drag never also activates whatever's
 *  under the pointer); firing it here both exercises that and consumes the
 *  suppressor, so it doesn't stick around to (correctly, but confusingly for
 *  a test) swallow an unrelated later click, e.g. this file's own Done/Reset
 *  clicks. */
async function settleDrag(pointerId = 1) {
  const outline = screen.getByRole('button', { name: 'Move Clock' })
  fireEvent.pointerUp(outline, { pointerId })
  fireEvent.click(outline)
  await act(async () => {})
}

describe('ArrangeController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.getAttribute('data-block-id')
      const data = id ? RECT_DATA[id] : undefined
      return domRect(data ?? { left: 0, top: 0, width: 0, height: 0 })
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('engage renders the overlay outlines and the pill (Done, Reset layout by role)', async () => {
    await renderController()
    engageClock()

    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Clock' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Greeting' })).toBeTruthy()
  })

  it('Escape exits the mode and clears the draft override', async () => {
    const { onDraftChange } = await renderController()
    engageClock()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(onDraftChange).toHaveBeenLastCalledWith({})
  })

  it('a drag sequence (pointerdown via long-press -> move -> up) writes the snapped/clamped position via storage.update, and never touches storage before the drop', async () => {
    const { storage, onDraftChange } = await renderController()
    engageClock()

    const outline = screen.getByRole('button', { name: 'Move Clock' })

    // (1000, 304) is deliberately grid-aligned (both multiples of 8) and far
    // from any snap candidate (viewport center 800/450; greeting's center
    // and edges near left=100/right=250/top=800/bottom=860) — the drop lands
    // exactly on this raw point, letting the expected value be computed
    // independently via the real snap/clamp functions instead of a
    // hand-picked literal.
    fireEvent.pointerMove(outline, { pointerId: 1, clientX: 1000, clientY: 304 })

    // Drafts never hit storage mid-drag: still nothing written after the move.
    expect((await storage.get('layout')).clock).toBeUndefined()
    expect(onDraftChange).toHaveBeenCalled()

    fireEvent.pointerUp(outline, { pointerId: 1 })
    await act(async () => {})

    const rawPct = { x: (1000 / 1600) * 100, y: (304 / 900) * 100 }
    const others = [{ cxPx: 175, cyPx: 830, w: 150, h: 60 }] // greeting's measured center/size
    const expectedSnap = snapPosition(rawPct, { w: 200, h: 100 }, others, { w: 1600, h: 900 })
    const expectedPos = clampCenterPct(expectedSnap.pos, { w: 200, h: 100 }, { w: 1600, h: 900 })

    expect((await storage.get('layout')).clock).toEqual(expectedPos)
    // The draft is cleared once the real position is persisted.
    expect(onDraftChange).toHaveBeenLastCalledWith({})
  })

  it("the dragged block's own outline tracks the live drag position (not its stale entry-measured rect), while other blocks' outlines stay put", async () => {
    await renderController()
    engageClock()

    const clockOutline = screen.getByRole('button', { name: 'Move Clock' })
    // Entry-measured: clock's outline starts at its default rect (center 800,450).
    expect(clockOutline.style.left).toBe(`${700}px`) // 800 - width/2 (200/2)

    fireEvent.pointerMove(clockOutline, { pointerId: 1, clientX: 1000, clientY: 304 })

    const clockOutlineAfterMove = screen.getByRole('button', { name: 'Move Clock' })
    // The outline itself must have moved with the drag, not stayed at (700, 400).
    expect(clockOutlineAfterMove.style.left).not.toBe('700px')
    expect(clockOutlineAfterMove.style.width).toBe('200px')
    expect(clockOutlineAfterMove.style.height).toBe('100px')

    // Greeting never moved — its outline stays exactly at its entry-measured rect.
    const greetingOutline = screen.getByRole('button', { name: 'Move Greeting' })
    expect(greetingOutline.style.left).toBe('100px')
    expect(greetingOutline.style.top).toBe('800px')
  })

  it('pointercancel aborts the drag without writing to storage', async () => {
    const { storage, onDraftChange } = await renderController()
    engageClock()
    const outline = screen.getByRole('button', { name: 'Move Clock' })

    fireEvent.pointerMove(outline, { pointerId: 1, clientX: 1000, clientY: 304 })
    fireEvent.pointerCancel(outline, { pointerId: 1 })

    expect((await storage.get('layout')).clock).toBeUndefined()
    expect(onDraftChange).toHaveBeenLastCalledWith({})
    // Mode itself stays on — only the in-flight drag is aborted.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  it('Done exits the mode, leaving whatever was already dropped persisted', async () => {
    const { storage } = await renderController()
    engageClock()
    await settleDrag() // commits clock's (unchanged) current position

    const beforeDone = await storage.get('layout')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(await storage.get('layout')).toEqual(beforeDone)
    expect(beforeDone.clock).toBeDefined()
  })

  it('Reset layout writes an empty layout via storage.update without exiting the mode', async () => {
    const { storage } = await renderController({ clock: { x: 10, y: 10 } })
    engageClock()
    await settleDrag()

    expect((await storage.get('layout')).clock).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    await act(async () => {})

    expect(await storage.get('layout')).toEqual({})
    // Still in arrange mode — Reset doesn't exit.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  it('a second, concurrent pointer pressing a different outline mid-drag is ignored', async () => {
    const { storage } = await renderController()
    engageClock()
    const clockOutline = screen.getByRole('button', { name: 'Move Clock' })
    const greetingOutline = screen.getByRole('button', { name: 'Move Greeting' })

    fireEvent.pointerDown(greetingOutline, { pointerId: 2, clientX: 175, clientY: 830 })
    fireEvent.pointerMove(greetingOutline, { pointerId: 2, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(greetingOutline, { pointerId: 2 })
    await act(async () => {})

    // The second pointer's gesture must not have written anything.
    expect((await storage.get('layout')).greeting).toBeUndefined()

    // The original (pointerId 1) drag is still live and completes normally.
    fireEvent.pointerMove(clockOutline, { pointerId: 1, clientX: 1000, clientY: 304 })
    fireEvent.pointerUp(clockOutline, { pointerId: 1 })
    await act(async () => {})
    expect((await storage.get('layout')).clock).toBeDefined()
  })
})
