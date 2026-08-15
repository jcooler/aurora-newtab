// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../lib/storage/index'
import { memoryDriver, type StorageDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import type { Layout, LayoutV2, Placement } from '../../lib/layout/types'
import { emptyLayoutV2, layoutV2FromLegacy, legacyLayoutOf, withLegacyBlockPosition } from '../../lib/layout/v2'
import { snapPosition } from '../../lib/layout/snap'
import { clampCenterPct } from '../../lib/layout/clamp'
import { pillAnchorRect } from '../../lib/layout/pillPlacement'
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
      {/* A bare non-interactive element — matches the real Clock widget
          (a `<time>` with no interactive children) and, post interactive-
          exclusion fix, is what makes engageClock()'s press actually arm
          useLongPress's timer; a `<button>` here would not (see
          useLongPress.ts's doc comment / useLongPress.test.tsx's
          "interactive elements never arm the timer" coverage). */}
      <div data-block-id="clock">
        <span>Clock content</span>
      </div>
      <div data-block-id="greeting">
        <span>Greeting content</span>
      </div>
      <ArrangeController onDraftChange={onDraftChange} />
    </>
  )
}

async function renderController(seedLayout?: Layout | LayoutV2) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  if (seedLayout) {
    await storage.set('layout', 'version' in seedLayout ? seedLayout : layoutV2FromLegacy(seedLayout))
  }
  const onDraftChange = vi.fn()
  render(
    <StorageProvider storage={storage}>
      <Fixture onDraftChange={onDraftChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, onDraftChange }
}

async function readLegacy(storage: AuroraStorage): Promise<Layout> {
  return legacyLayoutOf(await storage.get('layout'))
}

/** Long-press the clock fixture (500ms hold, no movement) — engages arrange
 *  mode and immediately begins dragging clock, per the brief. */
function engageClock() {
  const clockSurface = screen.getByText('Clock content')
  fireEvent.pointerDown(clockSurface, { pointerId: 1, clientX: 800, clientY: 450 })
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

  it('engage renders the overlay outlines and the pill (Done, Reset by role)', async () => {
    await renderController()
    engageClock()

    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Clock' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Greeting' })).toBeTruthy()
  })

  describe('pill dodge (never sits on top of a widget)', () => {
    it('the pill sits at the default bottom-center anchor when no block is anywhere near it', async () => {
      await renderController()
      engageClock()

      const pill = screen.getByRole('button', { name: 'Reset' }).parentElement!
      const expected = pillAnchorRect('bottom-center', { w: 0, h: 0 }, { w: 1600, h: 900 })
      expect(pill.style.left).toBe(`${expected.left}px`)
      expect(pill.style.top).toBe(`${expected.top}px`)
    })

    it('the pill dodges to the next clear candidate when a block covers the default bottom-center spot', async () => {
      // greeting's rect moved to straddle the pill's default bottom-center
      // spot (the fixture's own pill is measured 0x0 in this mocked
      // environment — see RECT_DATA's fallback — so its default box is
      // effectively the single point (800, 884)).
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const id = this.getAttribute('data-block-id')
        // Covers ONLY the default bottom-center point (800, 884), not the
        // above-bottom-center one 32px higher (800, 852) — a slim band so
        // the dodge lands on the very next candidate, not one further down
        // the list.
        if (id === 'greeting') return domRect({ left: 700, top: 870, width: 200, height: 40 })
        const data = id ? RECT_DATA[id] : undefined
        return domRect(data ?? { left: 0, top: 0, width: 0, height: 0 })
      })

      await renderController()
      engageClock()

      const pill = screen.getByRole('button', { name: 'Reset' }).parentElement!
      const expected = pillAnchorRect('above-bottom-center', { w: 0, h: 0 }, { w: 1600, h: 900 })
      expect(pill.style.left).toBe(`${expected.left}px`)
      expect(pill.style.top).toBe(`${expected.top}px`)
    })

    it('re-picks the anchor when rects change (self-heals) — a reset that clears the blocking block lets the pill fall back to bottom-center', async () => {
      let greetingBlocksPill = true
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const id = this.getAttribute('data-block-id')
        if (id === 'greeting') {
          return domRect(
            greetingBlocksPill
              ? { left: 700, top: 870, width: 200, height: 40 } // see the previous test's comment
              : RECT_DATA.greeting!,
          )
        }
        const data = id ? RECT_DATA[id] : undefined
        return domRect(data ?? { left: 0, top: 0, width: 0, height: 0 })
      })

      await renderController()
      engageClock()
      const pill = screen.getByRole('button', { name: 'Reset' }).parentElement!
      const dodged = pillAnchorRect('above-bottom-center', { w: 0, h: 0 }, { w: 1600, h: 900 })
      expect(pill.style.top).toBe(`${dodged.top}px`)

      greetingBlocksPill = false
      // Any resize re-measures every rect (including greeting's, now clear
      // of the pill) and feeds the fresh set back into the dodge decision.
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })

      const backToDefault = pillAnchorRect('bottom-center', { w: 0, h: 0 }, { w: 1600, h: 900 })
      expect(pill.style.top).toBe(`${backToDefault.top}px`)
    })
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
    expect((await readLegacy(storage)).clock).toBeUndefined()
    expect(onDraftChange).toHaveBeenCalled()

    fireEvent.pointerUp(outline, { pointerId: 1 })
    await act(async () => {})

    const rawPct = { x: (1000 / 1600) * 100, y: (304 / 900) * 100 }
    const others = [{ cxPx: 175, cyPx: 830, w: 150, h: 60 }] // greeting's measured center/size
    const expectedSnap = snapPosition(rawPct, { w: 200, h: 100 }, others, { w: 1600, h: 900 })
    const expectedPos = clampCenterPct(expectedSnap.pos, { w: 200, h: 100 }, { w: 1600, h: 900 })

    expect((await readLegacy(storage)).clock).toEqual(expectedPos)
    // Important review fix I2: the draft is NOT cleared on drop — it keeps
    // the dropped block's own committed position (matching what storage now
    // holds) instead of falling back to `{}`, which would have briefly
    // exposed PositionedBlock's still-stale `pos` prop (the OLD stored
    // position, before the async storage.update's echo lands) and flickered
    // the block back to its pre-drag spot for one real render.
    expect(onDraftChange).toHaveBeenLastCalledWith({ clock: expectedPos })
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

    expect((await readLegacy(storage)).clock).toBeUndefined()
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
    expect(legacyLayoutOf(beforeDone).clock).toBeDefined()
  })

  it('merges a moved block into every profile without erasing profile-only semantic overrides', async () => {
    const greeting: Placement = {
      zone: 'pulse', order: 7, colSpan: 2, rowSpan: 1,
      variant: 'expanded', priority: 'automatic', locked: true,
    }
    const imported: LayoutV2 = {
      version: 2,
      profiles: { standard: { greeting }, ultrawide: { greeting: { ...greeting, order: 2 } } },
    }
    const { storage } = await renderController(imported)

    engageClock()
    await settleDrag()

    const stored = await storage.get('layout')
    expect(stored.legacy).toEqual({ clock: { x: 50, y: 50 } })
    for (const profile of ['compact', 'standard', 'display', 'ultrawide'] as const) {
      expect(stored.profiles[profile]?.clock).toBeDefined()
    }
    expect(stored.profiles.standard?.greeting).toEqual(greeting)
    expect(stored.profiles.ultrawide?.greeting).toEqual({ ...greeting, order: 2 })
  })

  it('serializes concurrent moved-block updates without losing legacy or unrelated semantic state', async () => {
    const retained: Placement = {
      zone: 'day', order: 4, colSpan: 3, rowSpan: 2,
      variant: 'compact', priority: 'dock',
    }
    const migrated = layoutV2FromLegacy({ greeting: { x: 12, y: 88 }, clock: { x: 20, y: 20 } })
    const seed: LayoutV2 = {
      version: 2,
      profiles: {
        ultrawide: { notes: retained, ...migrated.profiles.ultrawide },
        standard: { notes: retained, ...migrated.profiles.standard },
        display: migrated.profiles.display,
        compact: migrated.profiles.compact,
      },
      legacy: { greeting: { x: 12, y: 88 }, clock: { x: 20, y: 20 } },
    }
    const { storage } = await renderController(seed)
    engageClock()
    await settleDrag()

    await act(async () => {
      await Promise.all([
        storage.update('layout', (current) => withLegacyBlockPosition(current, 'clock', { x: 51, y: 50 })),
        storage.update('layout', (current) => withLegacyBlockPosition(current, 'greeting', { x: 25, y: 75 })),
      ])
    })

    const stored = await storage.get('layout')
    expect(stored.legacy).toEqual({ clock: { x: 51, y: 50 }, greeting: { x: 25, y: 75 } })
    expect(stored.profiles.standard?.notes).toEqual({ ...retained, order: 1 })
    expect(stored.profiles.ultrawide?.notes).toEqual({ ...retained, order: 1 })
  })

  it('persists identical exact V2 output for equivalent inputs with reversed insertion order', async () => {
    const canonical = layoutV2FromLegacy({
      weather: { x: 16.667, y: 40 },
      clock: { x: 16.667, y: 60 },
    })
    const reversed: LayoutV2 = {
      version: 2,
      profiles: Object.fromEntries(Object.entries(canonical.profiles).reverse().map(([profile, blocks]) => [
        profile,
        Object.fromEntries(Object.entries(blocks ?? {}).reverse()),
      ])) as LayoutV2['profiles'],
      legacy: Object.fromEntries(Object.entries(canonical.legacy ?? {}).reverse()),
    }

    const first = await renderController(canonical)
    engageClock()
    await settleDrag()
    const firstStored = await first.storage.get('layout')

    cleanup()
    const second = await renderController(reversed)
    engageClock()
    await settleDrag()
    const secondStored = await second.storage.get('layout')

    const expected = withLegacyBlockPosition(canonical, 'clock', { x: 50, y: 50 })
    expect(firstStored).toEqual(expected)
    expect(secondStored).toEqual(expected)
    expect(JSON.stringify(secondStored)).toBe(JSON.stringify(firstStored))
  })

  describe('Reset opens a real confirm dialog (replaces the old two-click armed idiom)', () => {
    it('clicking the pill\'s Reset opens the dialog and writes nothing yet', async () => {
      const { storage } = await renderController({ clock: { x: 10, y: 10 } })
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})

      expect((await readLegacy(storage)).clock).toBeDefined() // unchanged — opening the dialog never writes
      const dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
      expect(dialog).toBeTruthy()
      expect(screen.getByText("Every widget returns to its default position. This can't be undone.")).toBeTruthy()
    })

    it('focus lands on Cancel — the safe default — the moment the dialog opens', async () => {
      await renderController()
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })

    it('Cancel closes the dialog and writes nothing', async () => {
      const { storage } = await renderController({ clock: { x: 10, y: 10 } })
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await act(async () => {})

      expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
      expect((await readLegacy(storage)).clock).toBeDefined() // still untouched
      // Still in arrange mode — Cancel doesn't exit arrange, only the dialog.
      expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    })

    it('confirming "Reset layout" inside the dialog writes {} once and closes the dialog, without exiting arrange mode', async () => {
      const { storage } = await renderController({ clock: { x: 10, y: 10 } })
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: 'Reset layout' })) // the dialog's own confirm button
      await act(async () => {})

      expect(await storage.get('layout')).toEqual(emptyLayoutV2())
      expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
      // Still in arrange mode — confirming Reset doesn't exit.
      expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    })

    it('a first Escape cancels the dialog only; a second Escape then exits arrange mode (stack ordering)', async () => {
      const { storage } = await renderController({ clock: { x: 10, y: 10 } })
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})
      expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

      fireEvent.keyDown(document, { key: 'Escape' }) // dialog is the newest stack entry — closes first
      expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy() // still arranging
      expect((await readLegacy(storage)).clock).toBeDefined() // Escape-cancel never writes

      fireEvent.keyDown(document, { key: 'Escape' }) // now arrange's own exit is the top entry
      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    })

    it('while the dialog is open, the overlay\'s own arrow-nudge keys on a Move button do not fire', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag() // clock's stored position is now its rect-derived (50%, 50%)
      const beforeDialog = await storage.get('layout')

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await act(async () => {})

      // Fire the arrow key directly on the (now unfocused, but still
      // present) outline button — belt-and-suspenders coverage for the
      // explicit dialog-open gate in handleOutlineKeyDown, independent of
      // whether the focus trap alone would have prevented this.
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move Clock' }), { key: 'ArrowRight' })
      await act(async () => {})

      expect(await storage.get('layout')).toEqual(beforeDialog) // unchanged — the nudge was gated
      expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy() // still open too
    })
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
    expect((await readLegacy(storage)).greeting).toBeUndefined()

    // The original (pointerId 1) drag is still live and completes normally.
    fireEvent.pointerMove(clockOutline, { pointerId: 1, clientX: 1000, clientY: 304 })
    fireEvent.pointerUp(clockOutline, { pointerId: 1 })
    await act(async () => {})
    expect((await readLegacy(storage)).clock).toBeDefined()
  })

  it('long-press entry focuses the ENGAGED block\'s own Move button (not just any outline)', async () => {
    await renderController()
    engageClock()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Clock' }))
  })

  describe('drag <-> nudge position reconciliation (review fix — CRITICAL)', () => {
    it('a real drag (with movement) then a keyboard nudge bases off the POST-drag position, not the stale pre-drag rect', async () => {
      const { storage } = await renderController()
      engageClock()

      const outline = screen.getByRole('button', { name: 'Move Clock' })
      // Actually move the pointer this time — `settleDrag()` (used by every
      // OTHER test in this file, including the pre-fix nudge tests) never
      // fires pointermove, which is exactly what masked this bug: a drag
      // that never moves also never reveals whether the post-drag position
      // got reconciled anywhere for a later nudge to read.
      fireEvent.pointerMove(outline, { pointerId: 1, clientX: 1000, clientY: 304 })
      fireEvent.pointerUp(outline, { pointerId: 1 })
      fireEvent.click(outline) // consumes useLongPress's post-engage click suppressor, same as settleDrag
      await act(async () => {})

      const rawPct = { x: (1000 / 1600) * 100, y: (304 / 900) * 100 }
      const others = [{ cxPx: 175, cyPx: 830, w: 150, h: 60 }] // greeting's measured center/size
      const snapped = snapPosition(rawPct, { w: 200, h: 100 }, others, { w: 1600, h: 900 })
      const draggedPos = clampCenterPct(snapped.pos, { w: 200, h: 100 }, { w: 1600, h: 900 })
      expect((await readLegacy(storage)).clock).toEqual(draggedPos)

      // Now nudge — this MUST base off draggedPos. clock's `rects` entry
      // (from mode-entry measureAll) still holds its ORIGINAL (700,400)
      // rect — center (50%, 50%) — since nothing re-measures after a drag
      // commits; before the fix, the nudge would base off that stale value
      // instead and visibly jump the block back toward its old spot.
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move Clock' }), { key: 'ArrowRight' })
      await act(async () => {})

      const expectedAfterNudge = clampCenterPct(
        { x: draggedPos.x + (8 / 1600) * 100, y: draggedPos.y },
        { w: 200, h: 100 },
        { w: 1600, h: 900 },
      )
      expect((await readLegacy(storage)).clock).toEqual(expectedAfterNudge)
    })

    it('a nudge then a NEW drag (grabbing the same outline again) starts from the post-nudge position, not a re-derived stale rect', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag() // ends the initial engage-drag with no movement; clock's position is now its rect-derived (50%, 50%)

      const outline = screen.getByRole('button', { name: 'Move Clock' })
      fireEvent.keyDown(outline, { key: 'ArrowRight' }) // +8px -> 50.5%
      await act(async () => {})
      expect((await readLegacy(storage)).clock).toEqual({ x: 50.5, y: 50 })

      // Press the SAME outline again to start a second drag — with NO
      // movement before release, whatever position beginDrag computes as
      // the drag's start is also exactly what gets committed.
      fireEvent.pointerDown(outline, { pointerId: 2, clientX: 808, clientY: 450 })
      fireEvent.pointerUp(outline, { pointerId: 2 })
      await act(async () => {})

      // Must still be the post-nudge (50.5, 50) — before the fix, beginDrag
      // always re-derived from the fresh (but stale-for-this-purpose)
      // measured rect, landing back at (50, 50) instead.
      expect((await readLegacy(storage)).clock).toEqual({ x: 50.5, y: 50 })
    })
  })

  describe('reset-while-arranging self-heals rects (review fix C1 — CRITICAL)', () => {
    it('a confirmed Reset re-measures outlines to the fresh (default) rect, and a subsequent arrow-nudge bases off THAT — not the pre-reset one (the resurrect-bug regression test)', async () => {
      // clock's rect as measured BEFORE the reset (its dragged/pre-reset
      // spot, center 50%/50% — same as RECT_DATA.clock everywhere else in
      // this file) vs. AFTER (where PositionedBlock actually re-renders it
      // once `pos` goes back to undefined — a DIFFERENT box, deliberately,
      // so a test reading a stale value is distinguishable from one reading
      // the fresh one). `postReset` flips mid-test to simulate the sibling
      // PositionedBlock committing the new DOM position between the confirm
      // click and this component's own re-measure — exactly the ordering a
      // real browser produces.
      const PRE_RESET_RECT = { left: 700, top: 400, width: 200, height: 100 }
      const DEFAULT_RECT = { left: 300, top: 100, width: 200, height: 100 }
      let postReset = false
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const id = this.getAttribute('data-block-id')
        if (id === 'clock') return domRect(postReset ? DEFAULT_RECT : PRE_RESET_RECT)
        const data = id ? RECT_DATA[id] : undefined
        return domRect(data ?? { left: 0, top: 0, width: 0, height: 0 })
      })

      const { storage } = await renderController({ clock: { x: 10, y: 10 } })
      engageClock()
      await settleDrag()

      fireEvent.click(screen.getByRole('button', { name: 'Reset' })) // opens the confirm dialog
      await act(async () => {})

      postReset = true
      fireEvent.click(screen.getByRole('button', { name: 'Reset layout' })) // the dialog's own confirm button — writes {} to layout, clears nudged
      await act(async () => {})

      expect(await storage.get('layout')).toEqual(emptyLayoutV2())

      // The self-heal effect schedules its re-measure via
      // requestAnimationFrame (real in this jsdom-via-vitest environment,
      // so fake timers must be advanced a frame to flush it — `act()` alone
      // only drains microtasks, not a pending animation frame).
      act(() => {
        vi.advanceTimersToNextFrame()
      })

      // The outline itself must have re-measured to the NEW (default) rect
      // — not stayed at the pre-reset one.
      const clockOutline = screen.getByRole('button', { name: 'Move Clock' })
      expect(clockOutline.style.left).toBe(`${DEFAULT_RECT.left}px`)
      expect(clockOutline.style.top).toBe(`${DEFAULT_RECT.top}px`)

      // The regression test: an arrow-nudge now must base off the DEFAULT
      // rect's center, NOT the pre-reset rect's — before the fix, `rects`
      // was never re-measured after Reset, so this nudge would silently
      // write the block back to roughly its pre-reset spot, undoing the
      // reset the user just confirmed.
      fireEvent.keyDown(clockOutline, { key: 'ArrowRight' })
      await act(async () => {})

      const defaultCenter = {
        x: ((DEFAULT_RECT.left + DEFAULT_RECT.width / 2) / 1600) * 100,
        y: ((DEFAULT_RECT.top + DEFAULT_RECT.height / 2) / 900) * 100,
      }
      const expected = clampCenterPct(
        { x: defaultCenter.x + (8 / 1600) * 100, y: defaultCenter.y },
        { w: 200, h: 100 },
        { w: 1600, h: 900 },
      )
      expect((await readLegacy(storage)).clock).toEqual(expected)
    })
  })

  describe('drop keeps its committed position in the draft (review fix I2 — drop flicker)', () => {
    it('a dropped block STAYS in the draft after pointerup — the whole nudged map, same shape the keyboard path already sends, not a clear to {}', async () => {
      const { storage, onDraftChange } = await renderController()
      engageClock()
      await settleDrag() // clock is now nudged-tracked at its rect-derived (50%, 50%)

      const greetingOutline = screen.getByRole('button', { name: 'Move Greeting' })
      fireEvent.keyDown(greetingOutline, { key: 'ArrowRight' }) // nudge greeting too — now both blocks are in `nudged`
      await act(async () => {})

      // Grab clock's outline again and drag it somewhere new.
      const clockOutline = screen.getByRole('button', { name: 'Move Clock' })
      fireEvent.pointerDown(clockOutline, { pointerId: 3, clientX: 800, clientY: 450 })
      fireEvent.pointerMove(clockOutline, { pointerId: 3, clientX: 1000, clientY: 304 })
      fireEvent.pointerUp(clockOutline, { pointerId: 3 })
      await act(async () => {})

      const finalLayout = await readLegacy(storage)
      // The LAST draft this drop sends must still contain greeting's earlier
      // nudge AND clock's own just-committed drop — not `{}`. Before the
      // fix, this called onDraftChange({}) here: PositionedBlock would then
      // fall back to its `pos` PROP, which is still the pre-drop stored
      // value until storage.update's async write echoes back through
      // useStoredKey — a real, if brief, visible jump back to the old spot.
      expect(onDraftChange).toHaveBeenLastCalledWith({
        clock: finalLayout.clock,
        greeting: finalLayout.greeting,
      })
    })
  })

  it('a still-open confirm dialog does not survive an arrange-mode exit forced while it is open (defense in depth), so re-entering shows it closed', async () => {
    await renderController()
    engageClock()
    await settleDrag()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' })) // open the dialog
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

    // Force an exit while the dialog is still open — Done is the ONLY way
    // to reach `exit()` without going through the dialog's own stack entry
    // first (a real Escape press would close the dialog, not arrange mode;
    // this exercises exit()'s own defensive `setResetDialogOpen(false)`
    // instead, same reasoning the old armed-Reset `disarm()` had).
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()

    engageClock() // re-enter
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
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
      expect((await readLegacy(storage)).clock).toEqual({ x: 50.5, y: 50 })
    })

    it('Shift+Arrow nudges by 1px instead of 8px', async () => {
      const { storage } = await renderController()
      engageClock()
      await settleDrag()

      const outline = screen.getByRole('button', { name: 'Move Clock' })
      fireEvent.keyDown(outline, { key: 'ArrowDown', shiftKey: true })
      await act(async () => {})

      const expectedY = 50 + (1 / 900) * 100
      expect((await readLegacy(storage)).clock).toEqual({ x: 50, y: expectedY })
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
      expect((await readLegacy(storage)).clock).toEqual({ x: 51, y: 50 })
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
      const layout = await readLegacy(storage)
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

      const finalPos = (await readLegacy(storage)).clock
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
      // A DEDICATED fixture (not the shared one, which only ever renders
      // clock+greeting) with a `data-block-id` div for every id RECT_DATA
      // defines a non-zero rect for — review fix: the previous version of
      // this test asserted against the shared Fixture, so worldClocks/
      // tasks/bookmarks/notes/weather were never actually IN THE DOM,
      // measureAll() found nothing for them, and the assertions below
      // (before this fix, only clock/greeting) were re-testing coverage the
      // very first test in this file already had — not the brief's
      // "labels for all visible blocks" requirement.
      const storage = createStorage(memoryDriver())
      await storage.init()
      const onDraftChange = vi.fn()
      const labeledIds = ['clock', 'greeting', 'worldClocks', 'tasks', 'bookmarks', 'notes', 'weather'] as const
      function LabelsFixture() {
        return (
          <>
            {labeledIds.map((id) => (
              <div key={id} data-block-id={id}>
                <span>{id} content</span>
              </div>
            ))}
            <ArrangeController onDraftChange={onDraftChange} />
          </>
        )
      }
      render(
        <StorageProvider storage={storage}>
          <LabelsFixture />
        </StorageProvider>,
      )
      await act(async () => {})

      // Long-press the clock block directly (this fixture's own content
      // text isn't "Clock content", so the shared engageClock() helper
      // doesn't apply here).
      const clockBlock = document.querySelector('[data-block-id="clock"]') as HTMLElement
      fireEvent.pointerDown(clockBlock, { pointerId: 1, clientX: 800, clientY: 450 })
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Using the SAME human labels/casing convention as Settings' Widgets
      // section where they overlap (e.g. weather -> "Weather", notes ->
      // "Notes") — every one of these buttons must actually be IN THE DOM.
      expect(screen.getByRole('button', { name: 'Move Clock' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Greeting' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move World clocks' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Tasks' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Bookmarks' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Notes' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Move Weather' })).toBeTruthy()
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
          {/* Non-interactive, matching the real Clock widget — see the
              comment on the shared Fixture above. openSignal is this
              fixture's own entry point, so no test here presses this
              element, but it stays accurate rather than stray. */}
          <div data-block-id="clock">
            <span>Clock content</span>
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
        {/* Non-interactive, matching the real Clock widget — see the
            comment on the shared Fixture above; this fixture's own
            engageClock() calls press this element. */}
        <div data-block-id="clock">
          <span>Clock content</span>
        </div>
        <NotesWidget />
      </div>
      <ArrangeController onDraftChange={onDraftChange} onModeChange={setArranging} />
    </>
  )
}

async function renderAppLike(suppliedStorage?: ReturnType<typeof createStorage>) {
  const storage = suppliedStorage ?? createStorage(memoryDriver())
  if (!suppliedStorage) await storage.init()
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
    await act(async () => {
      engageClock()
      await Promise.resolve()
    })

    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
  })

  it('does not enter arrange or inert the page until a dirty Notes close fulfills', async () => {
    const base = memoryDriver()
    let deferNotes = false
    let release = () => {}
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      onChanged: (cb) => base.onChanged(cb),
      write: async (patch) => {
        if (!deferNotes || !Object.prototype.hasOwnProperty.call(patch, 'notes')) {
          await base.write(patch)
          return
        }
        deferNotes = false
        await new Promise<void>((resolve) => {
          release = async () => { await base.write(patch); resolve() }
        })
      },
    }
    const storage = createStorage(driver, base.authority)
    await storage.init()
    await renderAppLike(storage)
    const wrapper = screen.getByTestId('widget-wrapper')

    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Persist before arrange' } })
    deferNotes = true
    vi.useFakeTimers()
    engageClock()
    await act(async () => { await Promise.resolve() })

    expect(wrapper.getAttribute('inert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy()

    await act(async () => { release(); await Promise.resolve() })
    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
    expect(wrapper.getAttribute('inert')).toBe('')
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })
})
