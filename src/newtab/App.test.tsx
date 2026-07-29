// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { defaults } from '../lib/storage/schema'
import { hasBookmarksPermission, loadBarModel } from '../services/bookmarks'
import App from './App'

// loadBarModel/hasBookmarksPermission (chrome.bookmarks.getTree,
// chrome.permissions.contains) and faviconUrl (chrome.runtime.getURL) are
// unavailable in jsdom — same two mocks BookmarksBar.test.tsx uses, needed
// here only for the bookmarks-wrapper z-index test below. Every OTHER test
// in this file never turns settings.widgets.bookmarks on, so BookmarksBar
// gates itself out before touching either mocked module — these mocks are a
// no-op for them.
vi.mock('../services/bookmarks', () => ({
  loadBarModel: vi.fn(),
  hasBookmarksPermission: vi.fn(),
}))
vi.mock('./widgets/links/linksLogic', () => ({ faviconUrl: (url: string) => `favicon:${url}` }))

// First App-level test file (Task 37 review fix — IMPORTANT 3): the
// exit-focus restore in App.tsx (settingsButtonRef + the wasArrangingRef
// effect) had zero automated coverage — only a throwaway, deleted Playwright
// probe. Kept deliberately minimal: this is the one behavior that can only
// be verified through the REAL App composition (ArrangeController and the
// settings gear are siblings owned by App, not something a narrower
// component test can exercise), not a general App test suite.
describe('App — arrange-mode focus management (Task 37 review fix)', () => {
  beforeEach(() => {
    // jsdom never computes real layout — every element's getBoundingClientRect()
    // is 0x0 unless mocked, and ArrangeController's own measureAll() SKIPS any
    // 0x0 rect (same "nothing to outline" rule PositionedBlock's clamp
    // correction already uses), so without this NO outline buttons would ever
    // render and the entry-focus effect would have nothing to find.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const size = this.hasAttribute('data-block-id') ? { width: 200, height: 100 } : { width: 0, height: 0 }
      return {
        left: 700,
        top: 400,
        right: 700 + size.width,
        bottom: 400 + size.height,
        width: size.width,
        height: size.height,
        x: 700,
        y: 400,
        toJSON() {
          return {}
        },
      } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Settings "Arrange layout" enters arrange mode; exiting restores focus to the settings gear', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const gear = await screen.findByRole('button', { name: 'Open settings' })
    await act(async () => {
      fireEvent.click(gear)
    })
    await screen.findByRole('dialog', { name: 'Settings' })

    const arrangeButton = await screen.findByRole('button', { name: 'Arrange layout' })
    await act(async () => {
      fireEvent.click(arrangeButton)
    })

    // Drawer closes, arrange overlay comes up with the first Move button
    // (clock — first in BLOCK_IDS order) focused.
    const doneButton = await screen.findByRole('button', { name: 'Done' })
    const moveButton = await screen.findByRole('button', { name: 'Move Clock' })
    expect(document.activeElement).toBe(moveButton)

    await act(async () => {
      fireEvent.click(doneButton)
    })

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(document.activeElement).toBe(gear)
  })

  it('Settings\' Reset layout confirm dialog: a first Escape cancels the dialog only; a second Escape then closes the drawer (dialog-stack ordering)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 10, y: 10 } })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const gear = await screen.findByRole('button', { name: 'Open settings' })
    await act(async () => {
      fireEvent.click(gear)
    })
    const drawerPanel = await screen.findByRole('dialog', { name: 'Settings' })

    const resetButton = await screen.findByRole('button', { name: 'Reset layout' })
    await act(async () => {
      fireEvent.click(resetButton)
    })
    const confirmDialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    expect(confirmDialog).toBeTruthy()
    expect(drawerPanel.getAttribute('inert')).toBeNull() // drawer itself still fully open, underneath

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' }) // the confirm dialog is the NEWER stack entry — closes first
    })
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    expect(drawerPanel.getAttribute('inert')).toBeNull() // drawer untouched by this first Escape
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } }) // Escape-cancel never writes

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' }) // now the drawer's own stack entry is on top
    })
    expect(drawerPanel.getAttribute('inert')).toBe('')
  })
})

// Review fix I3: the quote block's wrapper used to carry `pointer-events-none`
// (a Task 35 patch for a different bug — see App.tsx's comment on the quote
// PositionedBlock) so long-press passed straight through it in a REAL
// browser, violating "long-press any widget". jsdom's synthetic
// `fireEvent.pointerDown` dispatches directly on the target element
// regardless of CSS `pointer-events` (it doesn't do real hit-testing), so it
// can't reproduce the pass-through itself — that's covered by
// scripts/preview.mjs's real-browser drag probe instead. What IS verifiable
// here, and is the actual code-level fix: the class is gone, and long-press
// dispatched on the quote element still engages the mode (fixture-level).
describe('App — quote block long-press (review fix I3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const size = this.hasAttribute('data-block-id') ? { width: 200, height: 100 } : { width: 0, height: 0 }
      return {
        left: 700,
        top: 400,
        right: 700 + size.width,
        bottom: 400 + size.height,
        width: size.width,
        height: size.height,
        x: 700,
        y: 400,
        toJSON() {
          return {}
        },
      } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("the quote wrapper no longer carries pointer-events-none, and a long-press dispatched on it engages arrange mode", async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    const quoteBlock = document.querySelector('[data-block-id="quote"]')
    expect(quoteBlock).toBeTruthy()
    expect(quoteBlock!.classList.contains('pointer-events-none')).toBe(false)

    fireEvent.pointerDown(quoteBlock!, { pointerId: 1, clientX: 800, clientY: 800 })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // Synchronous queries (not findBy*'s setTimeout-polled waitFor, which
    // never resolves under fake timers, per the same caveat NotesPanel.test.tsx
    // and others document): the state update from advanceTimersByTime above
    // already flushed synchronously inside `act`.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Quote' })).toBeTruthy()
  })
})

// Bookmarks-stacking bug fix: bookmark folder popovers opened but nothing
// inside them was clickable in a real browser. Root cause (see App.tsx's
// comment on the bookmarks PositionedBlock for the full writeup): the
// bookmarks wrapper's `-translate-x-1/2` class made it a new CSS containing
// block AND stacking context, so the wrapper (with its z-50 panel inside)
// painted as one atomic unit BELOW FolderPopover's body-portaled z-40
// click-outside catcher. The quote wrapper carried the identical
// `-translate-x-1/2` class — inert today only because it happens to have no
// fixed/z-indexed descendants, but the same landmine. Both were converted to
// transform-free centering (`inset-x-0 mx-auto w-fit`). jsdom can't render
// real layout or verify real hit-testing (that's scripts/preview.mjs's job,
// against a real Chromium build), but it CAN assert the regression can't
// silently come back: neither wrapper's className may ever contain a
// `translate`/`transform` utility again.
describe('App — default-placement wrapper classNames carry no transform (bookmarks-stacking bug fix)', () => {
  it('the bookmarks and quote PositionedBlock wrappers have no translate/transform class', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    const bookmarksBlock = document.querySelector('[data-block-id="bookmarks"]')
    const quoteBlock = document.querySelector('[data-block-id="quote"]')
    expect(bookmarksBlock).toBeTruthy()
    expect(quoteBlock).toBeTruthy()

    for (const block of [bookmarksBlock, quoteBlock]) {
      const classes = [...block!.classList]
      expect(classes.some((c) => c.includes('translate'))).toBe(false)
      expect(classes.some((c) => c.includes('transform'))).toBe(false)
    }

    // Transform-free centering still needs to actually center: `inset-x-0`
    // (both left-0 and right-0) plus `mx-auto` plus a specified `width`
    // (here `w-fit`) on the SAME element.
    for (const block of [bookmarksBlock, quoteBlock]) {
      const classes = block!.className
      expect(classes).toContain('inset-x-0')
      expect(classes).toContain('mx-auto')
      expect(classes).toContain('w-fit')
    }
  })

  // Every OTHER default-placement wrapper in App.tsx (audited: weather,
  // timer, notes, tasks — the 4 remaining `fixed`-with-className
  // PositionedBlocks besides bookmarks/quote above; clock/greeting/
  // worldClocks/countdown/search/focus/links pass no className at all,
  // rendering inside the centered flex column with no fixed positioning)
  // must stay transform-free too — this is a structural guard against the
  // same landmine (any `translate`/`transform` class on a PositionedBlock
  // wrapper both traps `position: fixed` descendants inside a new
  // containing block AND, independently, atomically paints the whole
  // wrapper as one stacking-context unit) reappearing anywhere else.
  it('no other default-placement wrapper (weather/timer/notes/tasks) carries a translate/transform class', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    for (const id of ['weather', 'timer', 'notes', 'tasks']) {
      const block = document.querySelector(`[data-block-id="${id}"]`)
      expect(block).toBeTruthy()
      const classes = [...block!.classList]
      expect(classes.some((c) => c.includes('translate'))).toBe(false)
      expect(classes.some((c) => c.includes('transform'))).toBe(false)
    }
  })
})

// Bookmarks-stacking bug fix, PART 2 — found only after Fix 1 (transform-
// free centering + `relative` on the nav) shipped and the real-Chromium
// preview probe still failed: `position: fixed` unconditionally creates a
// stacking context (independent of `transform`), so the bookmarks
// PositionedBlock wrapper — still `fixed`, since that's what keeps the bar
// viewport-anchored — traps every z-index inside it (including the nav's
// own z-20/z-50) in a LOCAL comparison that never reaches FolderPopover's
// body-portaled z-40 click-outside catcher. The wrapper itself needs a
// matching elevated z-index while a popover is open — see the bookmarks
// PositionedBlock's comment in App.tsx for the full writeup and the
// minimal-repro measurements. jsdom can't verify real stacking/paint order
// (that's the real-Chromium preview probe's job), but it CAN verify the
// mechanism this fix depends on: BookmarksBar's onPopoverOpenChange
// actually flows into a 'z-50' class on the wrapper while open, and back
// off again on close.
describe('App — bookmarks wrapper z-index elevation while a popover is open (bookmarks-stacking bug fix, part 2)', () => {
  beforeEach(() => {
    vi.mocked(hasBookmarksPermission).mockResolvedValue(true)
    vi.mocked(loadBarModel).mockResolvedValue({
      folders: [{ id: 'f1', title: 'Work', items: [], folders: [] }],
      loose: [],
    })
  })

  afterEach(() => {
    vi.mocked(hasBookmarksPermission).mockReset()
    vi.mocked(loadBarModel).mockReset()
  })

  it('the bookmarks wrapper gains z-50 only while a popover is open', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, bookmarks: true },
    })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const folderChip = await screen.findByRole('button', { name: 'Work' })
    const wrapper = document.querySelector('[data-block-id="bookmarks"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('z-50')).toBe(false)

    await act(async () => {
      fireEvent.click(folderChip)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(wrapper!.classList.contains('z-50')).toBe(true)

    await act(async () => {
      fireEvent.click(folderChip) // toggle the same chip closed
    })
    expect(wrapper!.classList.contains('z-50')).toBe(false)
  })
})
