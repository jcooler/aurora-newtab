// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { defaults } from '../lib/storage/schema'
import type { StoredLocation, WeatherSnapshot } from '../lib/storage/schema'
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
/** The Settings drawer is tabbed (Task 40) and mounts only the ACTIVE tab's
 *  sections, so the Layout section's two buttons ("Arrange layout", "Reset
 *  layout") are reached by clicking the Widgets tab first. Purely mechanical:
 *  nothing else about either test below changed. */
async function openSettingsTab(name: string) {
  const tab = await screen.findByRole('tab', { name })
  await act(async () => {
    fireEvent.click(tab)
  })
}

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
    await openSettingsTab('Widgets')

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
    await openSettingsTab('Widgets')

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
    const cryptoBlock = document.querySelector('[data-block-id="crypto"]')
    const bottomZone = document.querySelector('aside[data-zone="bottom"]')
    expect(bookmarksBlock).toBeTruthy()
    expect(quoteBlock).toBeTruthy()
    expect(cryptoBlock).toBeTruthy()
    expect(bottomZone).toBeTruthy()

    // The quote/crypto wrappers (now flowing in the bottom band) and the band
    // aside itself must all stay transform-free — a translate/transform on any
    // of them both traps a fixed descendant AND atomically paints it as one
    // stacking-context unit (the landmine this whole fix family is about).
    for (const block of [bookmarksBlock, quoteBlock, cryptoBlock, bottomZone]) {
      const classes = [...block!.classList]
      expect(classes.some((c) => c.includes('translate'))).toBe(false)
      expect(classes.some((c) => c.includes('transform'))).toBe(false)
    }

    // Transform-free centering still needs to actually center: `inset-x-0`
    // (both left-0 and right-0) plus `mx-auto` plus a specified `width`
    // (here `w-fit`) on the SAME element. The bookmarks bar centers itself;
    // the bottom band's centering + bottom anchor now live on the ASIDE (the
    // quote's old single-element responsibility, moved up a level), and the
    // quote flows at the band's bottom with no centering class of its own.
    for (const block of [bookmarksBlock, bottomZone]) {
      const classes = block!.className
      expect(classes).toContain('inset-x-0')
      expect(classes).toContain('mx-auto')
      expect(classes).toContain('w-fit')
    }
    expect(quoteBlock!.className).not.toContain('inset-x-0')
    expect(quoteBlock!.className).not.toContain('w-fit')
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

// Top-band pass. Jon: the top of the page belongs to the bookmarks bar
// ALONE — the timer pill and weather chip move below it as new DEFAULTS.
// jsdom has no layout engine, so the real measurement (bar bottom vs.
// timer/weather top, at every matrix viewport) lives in scripts/preview.mjs;
// what CAN be pinned here is the contract those measurements depend on:
// which classes each default-placement wrapper carries, and — the part most
// at risk of an accidental revert — that neither peripheral shares the bar's
// own `top-4` any more.
describe('App — the bookmarks bar owns the top band; timer/weather default below it', () => {
  it('bookmarks sits at the top of the band; timer and weather default below it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    // Both offsets come from the SAME pair of index.css tokens: the bar's
    // own `top` is the band's gap, and the band is that gap + one chip row +
    // that gap again, so the air above and below the bar is equal by
    // construction (and compresses together on short viewports).
    const bookmarks = document.querySelector('[data-block-id="bookmarks"]')!
    expect(bookmarks.classList.contains('top-[var(--top-band-gap)]')).toBe(true)

    for (const id of ['timer', 'weather']) {
      const block = document.querySelector(`[data-block-id="${id}"]`)!
      expect(block.classList.contains('top-[var(--top-band)]')).toBe(true)
      // The regression that matters: sharing the bar's own top offset again.
      expect(block.classList.contains('top-[var(--top-band-gap)]')).toBe(false)
      expect(block.classList.contains('top-4')).toBe(false)
    }

    // Horizontal anchors are unchanged — the row below the bar is bookended
    // by the same two corners the peripherals always occupied.
    expect(document.querySelector('[data-block-id="timer"]')!.classList.contains('left-4')).toBe(true)
    expect(document.querySelector('[data-block-id="weather"]')!.classList.contains('right-4')).toBe(true)
  })

  // The whole point of a DEFAULT-only change: a stored arrange-mode layout
  // is the user's, and PositionedBlock drops the default className entirely
  // on that branch. If the new offset ever leaked into the positioned
  // branch it would fight the stored coordinates.
  it('a stored layout still wins — the new default offset never reaches a positioned block', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { timer: { x: 80, y: 60 }, weather: { x: 20, y: 40 } })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    for (const [id, pos] of [
      ['timer', { x: 80, y: 60 }],
      ['weather', { x: 20, y: 40 }],
    ] as const) {
      const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
      expect(block.className).toBe('')
      expect(block.style.position).toBe('fixed')
      // jsdom measures 0x0, so these stay the raw percent center with no
      // calc() offset — see PositionedBlock.test.tsx.
      expect(block.style.left).toBe(`${pos.x}%`)
      expect(block.style.top).toBe(`${pos.y}%`)
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

// Task 55 (combined-defaults gate) — same structural pair as the bookmarks
// wrapper z-50 test above: WeatherWidget.test.tsx already proves the
// onExpandedChange CALLBACK fires correctly in isolation; this proves the
// INTEGRATION, that App.tsx actually wires it into a 'z-30' class on
// weather's own wrapper. Real stacking/paint order is jsdom-unverifiable
// (that's scripts/preview.mjs's own combined-defaults gate — it caught the
// real defect this fix addresses: an expanded weather panel that
// geometrically covers github's connector card painted BELOW it, because
// every connector PositionedBlock mounts later in App.tsx than weather's
// own and both are `fixed` (independent stacking contexts), so DOM order
// decided the paint order with neither side's z-index in play until this).
describe('App — weather wrapper z-index elevation while the panel is expanded (Task 55)', () => {
  const NEW_YORK: StoredLocation = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }
  const SNAPSHOT: WeatherSnapshot = {
    current: { tempC: 21, feelsLikeC: 19, code: 2, windKmh: 14, humidity: 55, isDay: true },
    hourly: Array.from({ length: 12 }, (_, i) => ({
      time: `2026-08-06T${String(9 + i).padStart(2, '0')}:00`,
      tempC: 20 + i,
      precipProb: 10,
      code: 2,
      isDay: true,
    })),
    fetchedAt: Date.now(), // fresh — useWeather's SWR check must not refetch
    locationLabel: 'New York',
    sunriseISO: '2026-08-06T06:12',
    sunsetISO: '2026-08-06T19:58',
  }

  it('the weather wrapper gains z-30 only while the panel is expanded', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', NEW_YORK)
    await storage.set('weatherCache', SNAPSHOT)
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    // Notes/Tasks (their own collapsed pills) ALSO carry aria-expanded=false,
    // so the query is scoped through the weather region specifically —
    // `expanded` alone isn't a unique-enough filter across the whole page.
    const weatherRegion = await screen.findByRole('region', { name: 'Weather' })
    const toggle = within(weatherRegion).getByRole('button', { expanded: false })
    const wrapper = document.querySelector('[data-block-id="weather"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('z-30')).toBe(false)

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(true)

    await act(async () => {
      fireEvent.click(within(weatherRegion).getByRole('button', { expanded: true }))
    })
    expect(wrapper!.classList.contains('z-30')).toBe(false)
  })
})

// Final-review fix wave, Fix 1 — same structural pair as the weather/
// bookmarks wrapper z-index tests above: WeatherWidget.test.tsx's own
// pattern (this file's own onOpenChange describe blocks in NotesWidget/
// TodoWidget/TimerWidget.test.tsx) already proves the onOpenChange CALLBACK
// fires correctly in isolation; this proves the INTEGRATION, that App.tsx
// actually wires each into a 'z-30' class on that widget's own wrapper.
// Real stacking/paint order is jsdom-unverifiable (that's
// scripts/preview.mjs's own panel-vs-connector probe's job — it's what
// caught the real defect this fix addresses: open Notes/Tasks/Focus-timer
// panels painted BELOW the connector card(s) they geometrically covered,
// because every connector PositionedBlock mounts later in App.tsx than
// notes/tasks/timer's own and all are `fixed` (independent stacking
// contexts), so DOM order decided the paint order with neither side's
// z-index in play until this).
describe('App — notes/tasks/timer wrapper z-index elevation while their panels are open (final-review fix wave, Fix 1)', () => {
  it('the notes wrapper gains z-30 only while the panel is open', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const pill = await screen.findByRole('button', { name: 'Notes' })
    const wrapper = document.querySelector('[data-block-id="notes"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('z-30')).toBe(false)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(true)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(false)
  })

  it('the tasks wrapper gains z-30 only while the panel is open', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const pill = await screen.findByRole('button', { name: 'Tasks' })
    const wrapper = document.querySelector('[data-block-id="tasks"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('z-30')).toBe(false)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(true)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(false)
  })

  it('the timer wrapper gains z-30 only while the panel is open', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, timer: true },
    })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )

    const pill = await screen.findByRole('button', { name: /Focus timer/ })
    const wrapper = document.querySelector('[data-block-id="timer"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('z-30')).toBe(false)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(wrapper!.classList.contains('z-30')).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close focus timer' }))
    })
    expect(wrapper!.classList.contains('z-30')).toBe(false)
  })
})

// Task 64 (responsive rails) — the default-placement data widgets stopped being
// individually `fixed`-pinned and became two FLOWING rails: a `fixed`
// <aside data-zone="left|right"> per edge, cards stacked by flex flow so the
// board reflows at every window size. jsdom has no layout or container queries,
// so the pixel reflow AND the ~1593px col-2 boundary live in scripts/preview.mjs
// (Task 65); what IS verifiable here is the WIRING the rails depend on: the
// zones exist, each moved widget's DEFAULT wrapper is STATIC (flows — no
// `fixed`/inline position of its own), the mid-left column carries the
// `.rail-col2` container-query marker (NOT the old max-[1593px]:hidden /
// left-[23rem] / w-[200px] pins), the height-tier hides are per-widget, and an
// ARRANGED widget still LEAVES the rail (renders position:fixed with its
// className dropped — so no width/height class can hide it, and it is never
// double-rendered).
describe('App — responsive rails: flowing default placement, arranged widgets leave the rail', () => {
  async function renderApp() {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})
  }

  it('renders both rail zones as labelled complementary landmarks', async () => {
    await renderApp()
    const left = document.querySelector('aside[data-zone="left"]')
    const right = document.querySelector('aside[data-zone="right"]')
    expect(left).toBeTruthy()
    expect(right).toBeTruthy()
    // The two <aside> landmarks were previously unlabelled; a screen reader
    // announces each rail by name now (final-review fix wave).
    expect(left!.getAttribute('aria-label')).toBe('Left widget rail')
    expect(right!.getAttribute('aria-label')).toBe('Right widget rail')
  })

  it('the PRIMARY columns carry the .rail-primary width-hide marker; col2 (rail-col2) does not', async () => {
    await renderApp()
    const has = (id: string, cls: string) =>
      document.querySelector(`[data-block-id="${id}"]`)!.classList.contains(cls)
    // Left col1 (ics/rss/vercel) + the whole right column (github/gitlab/jira)
    // carry `.rail-primary` — the container-query marker (index.css) that hides
    // the whole primary column when `--rail-w` can't hold the widest card (w-80)
    // + 16px clearance, i.e. below 100vw=1193, so a fixed-width card never
    // overflows toward the centred clock. jsdom has no container queries, so the
    // pixel boundary lives in scripts/preview.mjs's width fencepost; the WIRING
    // (the marker reaches the right wrappers, and only those) is what's checked.
    for (const id of ['ics', 'rss', 'vercel', 'github', 'gitlab', 'jira']) {
      expect(has(id, 'rail-primary')).toBe(true)
    }
    // col2 is governed by its OWN container query (`.rail-col2`), never the
    // primary width-hide — it must not carry `.rail-primary`.
    for (const id of ['monthCal', 'habits']) {
      expect(has(id, 'rail-primary')).toBe(false)
      expect(has(id, 'rail-col2')).toBe(true)
    }
  })

  it('the moved data widgets default to STATIC wrappers inside a rail zone (they flow — no fixed/inline position of their own)', async () => {
    await renderApp()
    for (const id of ['ics', 'rss', 'vercel', 'monthCal', 'habits', 'github', 'gitlab', 'jira']) {
      const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
      expect(block).toBeTruthy()
      // The default branch never sets an inline style and carries no `fixed`
      // class of its own — the zone positions it, flex flow stacks it.
      expect(block.getAttribute('style')).toBeNull()
      expect(block.classList.contains('fixed')).toBe(false)
      expect(block.closest('aside[data-zone]')).toBeTruthy()
    }
  })

  it('the mid-left column carries the .rail-col2 container-query marker, not the old 1593/pinned-placement classes', async () => {
    await renderApp()
    for (const id of ['monthCal', 'habits']) {
      const block = document.querySelector(`[data-block-id="${id}"]`)!
      // The structural replacement for `max-[1593px]:hidden` — a per-block
      // marker (index.css `.rail-col2`) driven by the left zone's container
      // query, so the ~1593 boundary emerges from the token math, not a
      // hardcoded number.
      expect(block.classList.contains('rail-col2')).toBe(true)
      // The retired pinned-placement classes must all be gone.
      expect(block.classList.contains('max-[1593px]:hidden')).toBe(false)
      expect(block.classList.contains('left-[23rem]')).toBe(false)
      expect(block.classList.contains('w-[200px]')).toBe(false)
      expect(block.classList.contains('fixed')).toBe(false)
      // It sits in the LEFT zone — the container the .rail-col2 query reads.
      expect(block.closest('aside[data-zone="left"]')).toBeTruthy()
    }
  })

  it('height-tier hides are per-widget on the default wrapper (measured at each tier INTERIOR worst case): calendar always stays; headlines trims on mid+short (row-level, in RssWidget) + drops on xshort; deploys drops on mid+short; the right rail keeps github on mid but drops gitlab+jira, and empties on short', async () => {
    await renderApp()
    const has = (id: string, cls: string) =>
      document.querySelector(`[data-block-id="${id}"]`)!.classList.contains(cls)
    // Left col1: calendar always stays (worst ~78px, clears the Notes pill even
    // at 451h). Headlines' WRAPPER carries only xshort:hidden — on mid/short it
    // stays (trimmed inside RssWidget to RSS_MID_ROWS / RSS_SHORT_ROWS so the
    // card can't grow over the Notes pill at either tier's floor). Deploys drops
    // on mid AND short (Task 65: vercel's 758 bottom laps the Notes pill below
    // 810h and can't be trimmed clear, so it whole-hides across the mid band).
    expect(has('ics', 'mid:hidden')).toBe(false)
    expect(has('ics', 'short:hidden')).toBe(false)
    expect(has('ics', 'xshort:hidden')).toBe(false)
    expect(has('rss', 'mid:hidden')).toBe(false)
    expect(has('rss', 'short:hidden')).toBe(false)
    expect(has('rss', 'xshort:hidden')).toBe(true)
    expect(has('vercel', 'mid:hidden')).toBe(true)
    expect(has('vercel', 'short:hidden')).toBe(true)
    expect(has('vercel', 'xshort:hidden')).toBe(true)
    // Right rail: on `mid` (601-864) github STAYS (bottom 415 clears the Tasks
    // pill's highest top, 547 at the 601px floor, by 132px) while gitlab+jira
    // whole-hide (their 605/795 bottoms lap the pill across the band). On short
    // (451-600) the column has only 217px above the 397 pill — even github's
    // 235px overruns it — so ALL THREE drop, and the right rail is empty.
    expect(has('github', 'mid:hidden')).toBe(false)
    expect(has('github', 'short:hidden')).toBe(true)
    expect(has('github', 'xshort:hidden')).toBe(true)
    expect(has('gitlab', 'mid:hidden')).toBe(true)
    expect(has('gitlab', 'short:hidden')).toBe(true)
    expect(has('gitlab', 'xshort:hidden')).toBe(true)
    expect(has('jira', 'mid:hidden')).toBe(true)
    expect(has('jira', 'short:hidden')).toBe(true)
    expect(has('jira', 'xshort:hidden')).toBe(true)
  })

  it('an ARRANGED rail widget leaves the rail: rendered once, position:fixed, className (any hide/marker) dropped — an arranged user owns their layout at every width', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { monthCal: { x: 30, y: 20 }, vercel: { x: 70, y: 80 } })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    for (const [id, pos] of [
      ['monthCal', { x: 30, y: 20 }],
      ['vercel', { x: 70, y: 80 }],
    ] as const) {
      const blocks = document.querySelectorAll(`[data-block-id="${id}"]`)
      // Exactly ONE node — never double-rendered (a rail slot AND an arranged copy).
      expect(blocks.length).toBe(1)
      const block = blocks[0] as HTMLElement
      // PositionedBlock drops the default className entirely on the positioned
      // branch, so no rail-col2 / short:hidden can reach an arranged block.
      expect(block.className).toBe('')
      expect(block.style.position).toBe('fixed')
      // jsdom measures 0x0, so these stay the raw percent center (no calc()).
      expect(block.style.left).toBe(`${pos.x}%`)
      expect(block.style.top).toBe(`${pos.y}%`)
    }
  })
})

// Bottom band (the last piece of the retired pinned-coordinate layout) — the
// crypto strip and the quote stopped being three fighting coordinate systems
// (the flowing links row, a vh-pinned crypto, a bottom-anchored quote) and
// became ONE bottom flow zone, the rails idiom applied to the bottom: a
// `fixed`, bottom-anchored <aside data-zone="bottom"> holding (top-to-bottom)
// crypto then the quote by flex flow, gap-4 apart. jsdom has no layout or media
// queries, so the pixel reflow + the crypto `taller` / quote `mid` height tiers
// live in scripts/preview.mjs (fenceposts + all-pairs sweep); what IS verifiable
// here is the WIRING: the zone exists as a labelled landmark, both blocks flow
// inside it as STATIC wrappers carrying only their height-tier hide class, and
// an ARRANGED crypto/quote still LEAVES the band (position:fixed, className
// dropped — so no tier class can hide it, and it is never double-rendered).
describe('App — bottom band: flowing crypto + quote, arranged widgets leave the band', () => {
  async function renderApp() {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})
  }

  it('renders the bottom zone as a labelled complementary landmark centered + bottom-anchored', async () => {
    await renderApp()
    const zone = document.querySelector('aside[data-zone="bottom"]')
    expect(zone).toBeTruthy()
    expect(zone!.getAttribute('aria-label')).toBe('Bottom widget band')
    const cls = zone!.className
    // Transform-free centering + the quote's OLD bottom offsets (moved up here),
    // stacked as a flex column with the gap-4 that keeps crypto off the quote.
    for (const c of ['fixed', 'inset-x-0', 'bottom-6', 'short:bottom-2', 'xshort:bottom-1', 'mx-auto', 'w-fit', 'flex', 'flex-col', 'items-center', 'gap-4']) {
      expect(cls).toContain(c)
    }
  })

  it('crypto and quote flow inside the bottom zone as STATIC wrappers with only their height-tier hide class', async () => {
    await renderApp()
    const crypto = document.querySelector('[data-block-id="crypto"]') as HTMLElement
    const quote = document.querySelector('[data-block-id="quote"]') as HTMLElement
    for (const block of [crypto, quote]) {
      expect(block).toBeTruthy()
      // No inline style and no `fixed` of its own — the zone positions it, flex
      // flow stacks it (the same default-static contract the rails use).
      expect(block.getAttribute('style')).toBeNull()
      expect(block.classList.contains('fixed')).toBe(false)
      expect(block.closest('aside[data-zone="bottom"]')).toBeTruthy()
    }
    // crypto is hidden by default and revealed only on tall viewports (>=922h);
    // the quote hides across the mid band (601-864) where the column laps it.
    expect(crypto.className).toBe('hidden taller:block')
    expect(quote.className).toBe('mid:hidden')
  })

  it('an ARRANGED crypto/quote leaves the band: rendered once, position:fixed, className (the tier hide) dropped', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { crypto: { x: 40, y: 90 }, quote: { x: 55, y: 85 } })
    render(
      <StorageProvider storage={storage}>
        <App />
      </StorageProvider>,
    )
    await act(async () => {})

    for (const [id, pos] of [
      ['crypto', { x: 40, y: 90 }],
      ['quote', { x: 55, y: 85 }],
    ] as const) {
      const blocks = document.querySelectorAll(`[data-block-id="${id}"]`)
      expect(blocks.length).toBe(1) // never double-rendered
      const block = blocks[0] as HTMLElement
      // The tier hide class (`hidden taller:block` / `mid:hidden`) is dropped on
      // the arranged branch, so an arranged crypto/quote is never height-hidden.
      expect(block.className).toBe('')
      expect(block.style.position).toBe('fixed')
      expect(block.style.left).toBe(`${pos.x}%`)
      expect(block.style.top).toBe(`${pos.y}%`)
    }
  })
})
