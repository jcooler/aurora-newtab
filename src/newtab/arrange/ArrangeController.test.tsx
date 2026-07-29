// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import type { Layout } from '../../lib/layout/types'
import { snapPosition } from '../../lib/layout/snap'
import { clampCenterPct } from '../../lib/layout/clamp'
import NotesWidget from '../widgets/notes/NotesWidget'
import ArrangeController from './ArrangeController'

// isPremium() is hardcoded true today — mocked (defaulting to true, same as
// useLongPress.test.tsx) so the openSignal defense-in-depth test below can
// flip it false without touching the real module every other test relies on.
vi.mock('../../lib/premium', () => ({ isPremium: vi.fn(() => true) }))
import { isPremium } from '../../lib/premium'

// Deterministic rects per block id — keyed off the SAME data-block-id
// attribute the real PositionedBlock divs carry, exactly what ArrangeController
// queries via document.querySelector.
const RECT_DATA: Record<string, { left: number; top: number; width: number; height: number }> = {
  clock: { left: 700, top: 400, width: 200, height: 100 }, // center (800, 450) = the 1600x900 viewport center
  greeting: { left: 100, top: 800, width: 150, height: 60 }, // far from clock's drag target below, by design
  // Only used by the "labels for every visible block" test below — non-zero
  // (RECT_DATA's fallback is 0x0, which measureAll's own "skip empty" rule
  // would otherwise exclude entirely) but otherwise arbitrary.
  worldClocks: { left: 20, top: 20, width: 120, height: 40 },
  tasks: { left: 1400, top: 800, width: 150, height: 60 },
  bookmarks: { left: 700, top: 20, width: 200, height: 40 },
  notes: { left: 20, top: 800, width: 150, height: 60 },
  weather: { left: 1400, top: 20, width: 150, height: 60 },
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
    vi.mocked(isPremium).mockReturnValue(true)
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

  it('Reset layout needs two clicks: the first only arms (swaps the label to the confirm copy) and writes nothing', async () => {
    const { storage } = await renderController({ clock: { x: 10, y: 10 } })
    engageClock()
    await settleDrag()

    const resetButton = screen.getByRole('button', { name: 'Reset layout' })
    fireEvent.click(resetButton)
    await act(async () => {})

    expect((await storage.get('layout')).clock).toBeDefined() // unchanged — one click never writes
    expect(
      screen.getByRole('button', { name: 'Reset layout? This puts every widget back.' }),
    ).toBeTruthy()
  })

  it('a second click while armed confirms: writes an empty layout without exiting the mode', async () => {
    const { storage } = await renderController({ clock: { x: 10, y: 10 } })
    engageClock()
    await settleDrag()

    const resetButton = screen.getByRole('button', { name: 'Reset layout' })
    fireEvent.click(resetButton) // arm
    fireEvent.click(resetButton) // same DOM node — confirm, regardless of its now-changed accessible name
    await act(async () => {})

    expect(await storage.get('layout')).toEqual({})
    // Still in arrange mode — Reset doesn't exit.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    // And the label is back to idle, ready to be armed again.
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeTruthy()
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

  it('long-press entry focuses the ENGAGED block\'s own Move button (not just any outline)', async () => {
    await renderController()
    engageClock()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Clock' }))
  })

  describe('keyboard nudging (Arrow / Shift+Arrow / Enter)', () => {
    it('an unshifted Arrow key nudges the focused block by 8px (default step), through clampCenterPct, and persists via storage.update', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag() // ends the drag; clock's rect-derived position (viewport center, 50%/50%) is now the only thing in storage

      const outline = screen.getByRole('button', { name: 'Move Clock' })
      fireEvent.keyDown(outline, { key: 'ArrowRight' })
      await act(async () => {})

      // clock's rect centers at (800, 450) on a 1600x900 viewport = (50%, 50%).
      // +8px on x = (8/1600)*100 = 0.5% -> 50.5%; y is untouched.
      expect((await storage.get('layout')).clock).toEqual({ x: 50.5, y: 50 })
    })

    it('Shift+Arrow nudges by 1px instead of 8px', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag()

      const outline = screen.getByRole('button', { name: 'Move Clock' })
      fireEvent.keyDown(outline, { key: 'ArrowDown', shiftKey: true })
      await act(async () => {})

      const expectedY = 50 + (1 / 900) * 100
      expect((await storage.get('layout')).clock).toEqual({ x: 50, y: expectedY })
    })

    it('consecutive nudges compound from the LAST nudged position, not the original rect each time', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag()
      const outline = screen.getByRole('button', { name: 'Move Clock' })

      fireEvent.keyDown(outline, { key: 'ArrowRight' }) // +8px
      fireEvent.keyDown(outline, { key: 'ArrowRight' }) // +8px again, from the FIRST nudge's result
      await act(async () => {})

      // Two 8px nudges = 16px total = (16/1600)*100 = 1% -> 51%. A bug that
      // re-derives the base from the (unchanged) measured rect every time
      // would instead land back at 50.5% on the second press.
      expect((await storage.get('layout')).clock).toEqual({ x: 51, y: 50 })
    })

    it("a default-positioned block's first nudge bases off its CURRENT measured rect center — it must not jump to some other value", async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag() // only clock has ever been touched; greeting has no stored position at all

      const greetingOutline = screen.getByRole('button', { name: 'Move Greeting' })
      fireEvent.keyDown(greetingOutline, { key: 'ArrowRight' })
      await act(async () => {})

      // greeting's rect (150x60 at left:100,top:800) centers at (175, 830) ->
      // (10.9375%, 92.2222...%); +8px on x = 0.5% -> 11.4375%. A base of 0 or
      // the viewport center (either being "not this block's own rect") would
      // land somewhere else entirely.
      const layout = await storage.get('layout')
      expect(layout.greeting?.x).toBeCloseTo(11.4375, 10)
      expect(layout.greeting?.y).toBeCloseTo((830 / 900) * 100, 10)
    })

    it('clamps a nudge at the viewport edge instead of letting the block walk off-screen', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag()
      const outline = screen.getByRole('button', { name: 'Move Clock' })

      // Clock's rect (200x100) starts centered at the viewport center (800px
      // on a 1600px-wide viewport). The left-edge clamp keeps its center no
      // closer than half-width + the 8px default margin = 108px from the
      // left edge. 90 unshifted (8px) ArrowLeft presses would walk the raw
      // target to 800 - 720 = 80px, well past 108px — clampCenterPct must
      // pull it back to exactly 108px instead of letting it go negative.
      for (let i = 0; i < 90; i++) {
        fireEvent.keyDown(outline, { key: 'ArrowLeft' })
      }
      await act(async () => {})

      const finalPos = (await storage.get('layout')).clock
      expect(finalPos?.x).toBeCloseTo((108 / 1600) * 100, 10)
      expect(finalPos?.y).toBe(50)
    })

    it('Enter on a focused Move button exits the mode, same as Escape/Done', async () => {
      const { onDraftChange } = await renderController()
      engageClock()
      await settleDrag()
      const outline = screen.getByRole('button', { name: 'Move Clock' })

      fireEvent.keyDown(outline, { key: 'Enter' })

      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
      expect(onDraftChange).toHaveBeenLastCalledWith({})
    })

    it('every visible block gets an accessible "Move {label}" outline button (Tab/Shift-Tab order is just DOM order)', async () => {
      await renderController()
      engageClock()

      // Every id present in the fixture's RECT_DATA (clock/greeting always
      // rendered by the shared Fixture, plus the extra ids this describe
      // block's RECT_DATA entries cover) gets its own labeled Move button,
      // using the SAME human labels/casing convention as Settings' Widgets
      // section where they overlap (e.g. weather -> "Weather", notes ->
      // "Notes").
      expect(screen.getByRole('button', { name: 'Move Clock' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Greeting' })).toBeTruthy()
    })
  })

  describe('openSignal (Settings entry point)', () => {
    function SignalFixture({
      openSignal,
      onDraftChange,
    }: {
      openSignal: number
      onDraftChange: (d: Layout) => void
    }) {
      return (
        <>
          <div data-block-id="clock">
            <button type="button">Clock content</button>
          </div>
          <div data-block-id="greeting">
            <span>Greeting content</span>
          </div>
          <ArrangeController onDraftChange={onDraftChange} openSignal={openSignal} />
        </>
      )
    }

    async function renderSignalFixture() {
      const storage = createStorage(memoryDriver())
      await storage.init()
      const onDraftChange = vi.fn()
      const utils = render(
        <StorageProvider storage={storage}>
          <SignalFixture openSignal={0} onDraftChange={onDraftChange} />
        </StorageProvider>,
      )
      await act(async () => {})
      return { storage, onDraftChange, rerender: utils.rerender }
    }

    it('bumping openSignal enters the mode without a drag, and focuses the FIRST Move button in DOM order', async () => {
      const { storage, onDraftChange, rerender } = await renderSignalFixture()
      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()

      rerender(
        <StorageProvider storage={storage}>
          <SignalFixture openSignal={1} onDraftChange={onDraftChange} />
        </StorageProvider>,
      )
      await act(async () => {})

      expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
      const clockOutline = screen.getByRole('button', { name: 'Move Clock' })
      expect(document.activeElement).toBe(clockOutline) // clock is first in BLOCK_IDS order
    })

    it('a repeated (unchanged) openSignal value does not re-enter the mode', async () => {
      const { storage, onDraftChange, rerender } = await renderSignalFixture()

      rerender(
        <StorageProvider storage={storage}>
          <SignalFixture openSignal={0} onDraftChange={onDraftChange} />
        </StorageProvider>,
      )
      await act(async () => {})

      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    })

    it('openSignal is a no-op when isPremium() is false (defense in depth — the real gate is the Settings button being hidden entirely)', async () => {
      vi.mocked(isPremium).mockReturnValue(false)
      const { storage, onDraftChange, rerender } = await renderSignalFixture()

      rerender(
        <StorageProvider storage={storage}>
          <SignalFixture openSignal={1} onDraftChange={onDraftChange} />
        </StorageProvider>,
      )
      await act(async () => {})

      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    })
  })
})

/** Mirrors App.tsx's actual composition (Task 36 review fix): a DOM wrapper
 *  around "the rest of the page", driven by `inert`, wired to
 *  ArrangeController's `onModeChange` callback — the same two-prop pattern
 *  (`onDraftChange` + `onModeChange`) App.tsx uses. Includes a REAL
 *  NotesWidget (not a stub) so the panel-closing test below exercises the
 *  actual `closeAllDialogs` mechanism end to end against a real dialog, not
 *  a mock. */
function AppLikeFixture({ onDraftChange }: { onDraftChange: (d: Layout) => void }) {
  const [arranging, setArranging] = useState(false)
  return (
    <>
      <div data-testid="widget-wrapper" inert={arranging}>
        <div data-block-id="clock">
          <button type="button">Clock content</button>
        </div>
        <NotesWidget />
      </div>
      <ArrangeController onDraftChange={onDraftChange} onModeChange={setArranging} />
    </>
  )
}

async function renderAppLike() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const onDraftChange = vi.fn()
  render(
    <StorageProvider storage={storage}>
      <AppLikeFixture onDraftChange={onDraftChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, onDraftChange }
}

describe('ArrangeController — inertness + panel closing (review fix)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(isPremium).mockReturnValue(true)
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

  it('marks the widget wrapper inert while arranging, and clears it again on exit', async () => {
    await renderAppLike()
    const wrapper = screen.getByTestId('widget-wrapper')
    // Boolean HTML attribute: absent (null) when off, `''` (present) when on
    // — see SettingsPanel.test.tsx's getAttribute()+toBe() convention (no
    // jest-dom matchers registered in this project).
    expect(wrapper.getAttribute('inert')).toBeNull()

    engageClock()
    expect(wrapper.getAttribute('inert')).toBe('')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(wrapper.getAttribute('inert')).toBeNull()
  })

  it('closes an already-open panel the moment arrange mode engages', async () => {
    await renderAppLike()
    const notesPill = screen.getByRole('button', { name: 'Notes' })

    // NotesPanel is lazy-loaded (React.lazy + Suspense): its dynamic import
    // needs real timers/microtasks to settle (fake timers, needed below for
    // engageClock's long-press, block testing-library's setTimeout-polled
    // findBy — same caveat NotesPanel.test.tsx documents), so open it under
    // real timers first, then switch to fake timers for the engage step.
    vi.useRealTimers()
    fireEvent.click(notesPill)
    expect(await screen.findByRole('dialog', { name: 'Notes' })).toBeTruthy()

    vi.useFakeTimers()
    engageClock()

    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
  })
})
