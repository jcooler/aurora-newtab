// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import type { BarModel } from '../../../services/bookmarks'
import { hasBookmarksPermission, loadBarModel } from '../../../services/bookmarks'
import BookmarksBar from './BookmarksBar'

// loadBarModel and hasBookmarksPermission are the only chrome.* touches
// (chrome.bookmarks.getTree and chrome.permissions.contains respectively);
// mock both so the widget never needs a real chrome.* API in jsdom.
vi.mock('../../../services/bookmarks', () => ({
  loadBarModel: vi.fn(),
  hasBookmarksPermission: vi.fn(),
}))

// faviconUrl touches chrome.runtime.getURL, unavailable in jsdom — mock the
// whole module, same pattern as SettingsPanel.test.tsx mocking '../lib/idb'.
vi.mock('../links/linksLogic', () => ({ faviconUrl: (url: string) => `favicon:${url}` }))

const nestedModel: BarModel = {
  folders: [
    {
      id: 'f1',
      title: 'Work',
      items: [{ id: 'i1', title: 'Dashboard', url: 'https://dash.example' }],
      folders: [
        {
          id: 'f2',
          title: 'Projects',
          items: [{ id: 'i2', title: 'Repo', url: 'https://repo.example' }],
          folders: [],
        },
      ],
    },
  ],
  loose: [{ id: 'i3', title: 'Docs', url: 'https://docs.example' }],
}

async function renderBar(model: BarModel, onPopoverOpenChange?: (open: boolean) => void) {
  vi.mocked(hasBookmarksPermission).mockResolvedValue(true)
  vi.mocked(loadBarModel).mockResolvedValue(model)
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, bookmarks: true },
  })
  const result = render(
    <StorageProvider storage={storage}>
      <BookmarksBar onPopoverOpenChange={onPopoverOpenChange} />
    </StorageProvider>,
  )
  return result
}

describe('BookmarksBar', () => {
  it('renders nothing while settings.widgets.bookmarks is off', async () => {
    vi.mocked(loadBarModel).mockResolvedValue(nestedModel)
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { container } = render(
      <StorageProvider storage={storage}>
        <BookmarksBar />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the widget is on but the bookmarks permission is absent (e.g. revoked via chrome://extensions)', async () => {
    vi.mocked(hasBookmarksPermission).mockResolvedValue(false)
    vi.mocked(loadBarModel).mockResolvedValue(nestedModel)
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, bookmarks: true },
    })
    const { container } = render(
      <StorageProvider storage={storage}>
        <BookmarksBar />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(container.firstChild).toBeNull()
    // The whole point of checking permission first: never even attempt the
    // chrome.bookmarks.getTree() call that would throw without it.
    expect(loadBarModel).not.toHaveBeenCalled()
  })

  it('renders nothing for an empty bookmarks bar (no empty-state chrome)', async () => {
    const { container } = await renderBar({ folders: [], loose: [] })
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('renders a folder chip and a loose-bookmark chip', async () => {
    await renderBar(nestedModel)
    expect(await screen.findByRole('button', { name: 'Work' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy()
  })

  // Top-band pass: the bar owns the top row alone (the timer pill and
  // weather chip default BELOW it now — see App.tsx and index.css's
  // `--top-band`), so its width is bounded by the VIEWPORT rather than by
  // the share the peripherals beside it used to need. The old pair of caps
  // — `max-w-[52vw] tight:max-w-[24vw]`, sized against WeatherWidget's own
  // `tight:max-w-[30vw]` to hold a horizontal gap — is gone with the premise
  // that produced it. Lean className checks, not rendered-layout ones: jsdom
  // has no layout engine, so the real single-row/no-overflow measurement is
  // the preview harness's job (scripts/preview.mjs).
  it('caps its width against the viewport, not against the peripherals that used to share the row', async () => {
    await renderBar(nestedModel)
    const nav = await screen.findByRole('navigation', { name: 'Bookmarks bar' })
    expect(nav.className).toContain('max-w-[min(72rem,calc(100vw_-_2rem))]')
    expect(nav.className).not.toContain('max-w-[52vw]')
    expect(nav.className).not.toContain('tight:max-w-[24vw]')
  })

  // The other half of "shrink, not wrap": with nothing left to wrap into,
  // the row must compress instead. `flex-wrap` on the nav is what let three
  // chips become two rows at 800x450 — a bar that grows DOWNWARD eats into
  // the band the timer/weather row below now depends on.
  it('never wraps to a second row: the nav is flex-nowrap and every chip can be squeezed', async () => {
    await renderBar(nestedModel)
    const nav = await screen.findByRole('navigation', { name: 'Bookmarks bar' })
    expect(nav.classList.contains('flex-nowrap')).toBe(true)
    expect(nav.classList.contains('flex-wrap')).toBe(false)

    // A folder chip's flex item is its `relative` wrapper div (the popover's
    // positioning context); a loose bookmark's is the anchor itself. Both
    // need `min-w-0`, or `truncate`'s own `white-space: nowrap` makes each
    // chip's min-content its whole title and the row overflows.
    const folderChip = screen.getByRole('button', { name: 'Work' })
    const looseChip = screen.getByRole('link', { name: 'Docs' })
    for (const item of [folderChip.parentElement!, looseChip]) {
      expect(item.classList.contains('min-w-0')).toBe(true)
    }
    // …and the button inside a folder's wrapper has to follow it down
    // rather than spilling out of it.
    expect(folderChip.classList.contains('max-w-full')).toBe(true)
  })

  // Review finding. flex-shrink is proportional to each item's width, but a
  // chip's icon/padding/border can't shrink — the whole reduction lands on
  // the label, so a SHORT title loses most of itself (measured at 800x450
  // with a full bar: "Dev" and "News" came out as "D…" and "N…"). The first
  // fix exempted short TITLES from shrinking, which was width-blind: six
  // uppercase Latin characters ("GITHUB") or four full-width CJK glyphs
  // render ~90px, so eight "short" titles could exceed the row's cap with
  // nothing left able to shrink — and a centred row that never clips or
  // scrolls then spills off BOTH viewport edges, the exact failure this
  // whole pass exists to prevent. The floor belongs on the LABEL instead,
  // in font-relative units, where it bounds width rather than guessing it.
  // (The real fit measurement is scripts/preview.mjs's worst-case probe:
  // eight short-but-wide titles at 800x450. jsdom has no layout engine.)
  it('every chip shrinks — the legibility floor is on the label, not an exemption keyed to title length', async () => {
    const mixedModel: BarModel = {
      folders: [
        { id: 'f1', title: 'Dev', items: [], folders: [] },
        { id: 'f2', title: 'Design system', items: [], folders: [] },
      ],
      loose: [
        { id: 'i1', title: 'GITHUB', url: 'https://gh.example' }, // wide, but 6 chars
        { id: 'i2', title: 'Engineering docs', url: 'https://docs.example' },
      ],
    }
    await renderBar(mixedModel)
    await screen.findByRole('button', { name: 'Dev' })

    const slotOf = (el: HTMLElement) => (el.tagName === 'BUTTON' ? el.parentElement! : el)
    const chips = [
      screen.getByRole('button', { name: 'Dev' }),
      screen.getByRole('button', { name: 'Design system' }),
      screen.getByRole('link', { name: 'GITHUB' }),
      screen.getByRole('link', { name: 'Engineering docs' }),
    ]
    for (const el of chips) {
      // No title-length branch: short and long, folder and bookmark, all
      // give ground, which is what keeps the row's fit an invariant.
      expect(slotOf(el).classList.contains('shrink')).toBe(true)
      expect(slotOf(el).classList.contains('shrink-0')).toBe(false)
      // …and every label carries the same font-relative floor, so shrinking
      // can never take one down to a bare ellipsis.
      const label = el.querySelector('span')!
      expect(label.classList.contains('min-w-[4ch]')).toBe(true)
      expect(label.classList.contains('truncate')).toBe(true)
    }
  })

  // Review finding: `--bookmarks-chip-h` used to be a hand-transcribed copy
  // of the chip's type metrics in index.css, guarded only by the preview
  // harness — and silently wrong at runtime under Chrome's minimum-font-size
  // accessibility setting, which grows a line-box-sized chip straight
  // through the band below it. The chip is now sized BY the token, so the
  // bar and the band it reserves are the same number by construction.
  it('the chip is sized by the same token the top band is built from', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })
    expect(folderChip.classList.contains('h-[var(--bookmarks-chip-h)]')).toBe(true)
    // The text block is pinned to what that height budgets for it (30px less
    // the 1px borders and `py-1`), so the label stays inside its box.
    expect(folderChip.classList.contains('leading-5')).toBe(true)
    expect(screen.getByRole('link', { name: 'Docs' }).classList.contains('h-[var(--bookmarks-chip-h)]')).toBe(true)
  })

  // The overflow chip is exempt whatever its (nonexistent) title would say:
  // a single glyph with nothing to truncate, and the ONLY way to reach the
  // bookmarks it stands for.
  it('the "»" overflow chip is exempt from shrinking', async () => {
    const nineLooseModel: BarModel = {
      folders: [],
      loose: Array.from({ length: 9 }, (_, i) => ({
        id: `i${i}`,
        title: `Bookmark ${i}`,
        url: `https://example.com/${i}`,
      })),
    }
    await renderBar(nineLooseModel)
    const overflowChip = await screen.findByRole('button', { name: 'More bookmarks' })
    const slot = overflowChip.parentElement!
    expect(slot.classList.contains('shrink-0')).toBe(true)
    expect(slot.classList.contains('shrink')).toBe(false)
  })

  it('uses the themed bg-panel-solid utility, not a hardcoded hex, so the popover actually re-themes (folders-widget theming bug)', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })
    await act(async () => {
      fireEvent.click(folderChip)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(dialog.classList.contains('bg-panel-solid')).toBe(true)
    expect(dialog.classList.contains('bg-[#17171c]/95')).toBe(false)
  })

  it('elevates above TodoPanel/TimerWidget (z-30) only while a popover is open, not permanently', async () => {
    await renderBar(nestedModel)
    const nav = await screen.findByRole('navigation', { name: 'Bookmarks bar' })
    const folderChip = screen.getByRole('button', { name: 'Work' })

    // Idle: below the z-30 panels TodoPanel/TimerWidget use, same as before
    // FolderPopover's backdrop existed.
    expect(nav.classList.contains('z-20')).toBe(true)
    expect(nav.classList.contains('z-50')).toBe(false)

    await act(async () => {
      fireEvent.click(folderChip)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })

    // Open: level with the popover's own panel, above its backdrop, so a
    // DIFFERENT chip stays clickable through the dimmed page.
    expect(nav.classList.contains('z-50')).toBe(true)
    expect(nav.classList.contains('z-20')).toBe(false)

    await act(async () => {
      fireEvent.click(folderChip) // toggle the same chip closed
    })

    // Closed again: back down, so the bar no longer outranks TodoPanel/
    // TimerWidget when no popover is open.
    expect(nav.classList.contains('z-20')).toBe(true)
    expect(nav.classList.contains('z-50')).toBe(false)
  })

  // Bookmarks-stacking bug fix, part 2: `relative` + z-20/z-50 on the nav
  // (tested above) only wins LOCAL stacking comparisons — `position: fixed`
  // on the App.tsx wrapper unconditionally creates a stacking context, so
  // the WRAPPER also needs an elevated z-index while a popover is open, and
  // App.tsx can only know to apply it via this callback (see App.tsx's
  // `bookmarksPopoverOpen` state and the bookmarks PositionedBlock's
  // comment for the full writeup). This is the contract App.tsx depends on.
  it('calls onPopoverOpenChange(true) on open and onPopoverOpenChange(false) on close', async () => {
    const onPopoverOpenChange = vi.fn()
    await renderBar(nestedModel, onPopoverOpenChange)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    expect(onPopoverOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(folderChip)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.click(folderChip) // toggle closed
    })
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('switching directly from one open popover to a different chip stays "open" throughout (no spurious close blip)', async () => {
    const twoFolderModel: BarModel = {
      folders: [
        { id: 'f1', title: 'Work', items: [], folders: [] },
        { id: 'f2', title: 'Personal', items: [], folders: [] },
      ],
      loose: [],
    }
    const onPopoverOpenChange = vi.fn()
    await renderBar(twoFolderModel, onPopoverOpenChange)
    const work = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(work)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(true)

    onPopoverOpenChange.mockClear()
    const personal = screen.getByRole('button', { name: 'Personal' })
    await act(async () => {
      fireEvent.click(personal)
    })
    await screen.findByRole('dialog', { name: 'Personal bookmarks' })
    expect(onPopoverOpenChange).toHaveBeenCalledTimes(1)
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(true)
  })

  // Review fix (bookmarks-stacking bug fix, part 3): settings.widgets
  // .bookmarks lives in shared chrome.storage, so a DIFFERENT new-tab page
  // can flip it off while a popover is open HERE — the outer BookmarksBar
  // gate then returns null, unmounting BookmarksBarInner (popover and all)
  // with no onClose ever firing. Without the unmount-cleanup effect in
  // BookmarksBarInner, App.tsx's mirrored bookmarksPopoverOpen would stick
  // `true` forever. Simulated here via storage.set on the SAME storage
  // instance the render subscribes to — the same mechanism a real
  // cross-tab chrome.storage.onChanged event drives through useStoredKey.
  it('reports the popover closed if the bar unmounts while one is open (settings.widgets.bookmarks flipped off from another tab)', async () => {
    vi.mocked(hasBookmarksPermission).mockResolvedValue(true)
    vi.mocked(loadBarModel).mockResolvedValue(nestedModel)
    const onPopoverOpenChange = vi.fn()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, bookmarks: true },
    })
    render(
      <StorageProvider storage={storage}>
        <BookmarksBar onPopoverOpenChange={onPopoverOpenChange} />
      </StorageProvider>,
    )
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(folderChip)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(true)

    onPopoverOpenChange.mockClear()
    await act(async () => {
      await storage.set('settings', {
        ...defaults().settings,
        widgets: { ...defaults().settings.widgets, bookmarks: false },
      })
    })

    // The bar (and its still-open popover) is gone — the outer gate's
    // `settings?.widgets.bookmarks` check returned null.
    expect(screen.queryByRole('navigation', { name: 'Bookmarks bar' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Work bookmarks' })).toBeNull()
    // And the unmount told App.tsx the popover closed — exactly once, not
    // stuck at the stale `true` from the click above.
    expect(onPopoverOpenChange).toHaveBeenCalledTimes(1)
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('opens the folder popover, drills into a subfolder, and returns via "‹ Back"', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(folderChip)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Work bookmarks' })
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy()
    const subfolder = screen.getByRole('button', { name: 'Projects' })
    expect(screen.queryByRole('button', { name: '‹ Back' })).toBeNull()

    await act(async () => {
      fireEvent.click(subfolder)
    })

    // Drilled in: subfolder's own item shows, the back row appears, and the
    // dialog's accessible name now reflects the subfolder.
    expect(await screen.findByRole('dialog', { name: 'Projects bookmarks' })).toBe(dialog)
    expect(screen.getByRole('link', { name: 'Repo' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
    const back = screen.getByRole('button', { name: '‹ Back' })

    await act(async () => {
      fireEvent.click(back)
    })

    // Back at the top level: Work's own item is visible again, the back row
    // is gone, and the subfolder row reappears.
    expect(await screen.findByRole('dialog', { name: 'Work bookmarks' })).toBe(dialog)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '‹ Back' })).toBeNull()
  })

  it('Escape (via the shared dialog stack) closes the open popover', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(folderChip)
    })
    await screen.findByRole('dialog', { name: 'Work bookmarks' })

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('only one popover is open at a time', async () => {
    const twoFolderModel: BarModel = {
      folders: [
        { id: 'f1', title: 'Work', items: [], folders: [] },
        { id: 'f2', title: 'Personal', items: [], folders: [] },
      ],
      loose: [],
    }
    await renderBar(twoFolderModel)
    const work = await screen.findByRole('button', { name: 'Work' })
    const personal = screen.getByRole('button', { name: 'Personal' })

    await act(async () => {
      fireEvent.click(work)
    })
    expect(await screen.findByRole('dialog', { name: 'Work bookmarks' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(personal)
    })
    expect(screen.queryByRole('dialog', { name: 'Work bookmarks' })).toBeNull()
    expect(await screen.findByRole('dialog', { name: 'Personal bookmarks' })).toBeTruthy()
  })

  it('nudges the popover left when it would overflow the right edge of the viewport (edge-clamp)', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    // jsdom has no real layout engine (getBoundingClientRect() always
    // returns an all-zero rect, which FolderPopover's clamp effect treats as
    // "not really laid out yet" and ignores) — simulate a panel that would
    // overflow the right edge: window.innerWidth defaults to 1024 in jsdom,
    // and this rect (width 256px, matching the w-64 panel) sits far enough
    // right that its right edge (1156) overflows by 140px once the 8px
    // margin is accounted for.
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 900,
      right: 1156,
      top: 0,
      bottom: 0,
      width: 256,
      height: 0,
      x: 900,
      y: 0,
      toJSON() {},
    })

    await act(async () => {
      fireEvent.click(folderChip)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Work bookmarks' })

    // Nudged left by exactly the overflow amount, on top of the default
    // -50% centering (Tailwind v4 compiles -translate-x-1/2 to the CSS
    // `translate` property, not `transform` — see the comment in
    // FolderPopover.tsx on why the inline style targets `translate`).
    expect(dialog.style.translate).toBe('calc(-50% - 140px) 0')

    rectSpy.mockRestore()
  })

  it('renders no fixed-position element inside the bar; backdrop portals to <body>', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(folderChip)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Work bookmarks' })
    const nav = screen.getByRole('navigation', { name: 'Bookmarks bar' })

    // If the bar (or its App.tsx wrapper) ever regains a `translate`/
    // `transform` class, it becomes the CONTAINING BLOCK for any
    // position:fixed descendant: a "fixed inset-0" backdrop rendered inside
    // it would shrink to the bar's own box and, being z-40 inside that new
    // stacking context, paint ABOVE the sibling chips — every chip click
    // then lands on the backdrop (= close) instead of the chip. So: nothing
    // inside the nav may be position-fixed, ever.
    expect(nav.querySelector('.fixed')).toBeNull()

    // The popover panel anchors to its chip wrapper (absolute), not the
    // viewport (fixed) — that's what pins it visually under the clicked chip.
    expect(dialog.classList.contains('absolute')).toBe(true)
    expect(dialog.classList.contains('fixed')).toBe(false)

    // The click-outside catcher escapes the bar's subtree via a portal to
    // <body>, where fixed inset-0 really means the whole viewport.
    const bodyBackdrop = [...document.body.children].find(
      (el) => el.matches('div[aria-hidden="true"]') && el.classList.contains('fixed'),
    )
    expect(bodyBackdrop).toBeTruthy()

    // And it still closes the popover.
    await act(async () => {
      fireEvent.click(bodyBackdrop!)
    })
    expect(screen.queryByRole('dialog', { name: 'Work bookmarks' })).toBeNull()
  })

  // Bookmarks-stacking bug fix (bug: popovers opened but nothing inside was
  // clickable — see App.tsx's comment on the bookmarks PositionedBlock for
  // the full root-cause writeup). The nav lost `position: fixed` when its
  // placement classes moved out to the App.tsx wrapper (commit 1125413),
  // leaving its conditional z-20/z-50 classes sitting on a `position:
  // static` element, where z-index has no effect at all — chips would stay
  // under FolderPopover's z-40 body-portaled catcher even once the wrapper
  // itself stopped being a transform-created stacking context. `relative`
  // (no visual offset, just a `position` value) is what makes those
  // z-index classes apply again.
  it('the nav carries `relative` so its z-20/z-50 classes actually apply (bookmarks-stacking bug fix)', async () => {
    await renderBar(nestedModel)
    const nav = await screen.findByRole('navigation', { name: 'Bookmarks bar' })
    expect(nav.classList.contains('relative')).toBe(true)
  })

  it('beyond 8 chips, the rest collapse into a "»" chip whose popover lists them', async () => {
    const nineLooseModel: BarModel = {
      folders: [],
      loose: Array.from({ length: 9 }, (_, i) => ({
        id: `i${i}`,
        title: `Bookmark ${i}`,
        url: `https://example.com/${i}`,
      })),
    }
    await renderBar(nineLooseModel)

    // Only the first 8 render as their own chip; the 9th is folded into overflow.
    for (let i = 0; i < 8; i++) {
      expect(await screen.findByRole('link', { name: `Bookmark ${i}` })).toBeTruthy()
    }
    expect(screen.queryByRole('link', { name: 'Bookmark 8' })).toBeNull()

    const overflowChip = screen.getByRole('button', { name: 'More bookmarks' })
    await act(async () => {
      fireEvent.click(overflowChip)
    })

    expect(await screen.findByRole('dialog', { name: 'More bookmarks' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Bookmark 8' })).toBeTruthy()
  })
})
