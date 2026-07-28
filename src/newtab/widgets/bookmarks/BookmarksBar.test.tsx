// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import type { BarModel } from '../../../services/bookmarks'
import { loadBarModel } from '../../../services/bookmarks'
import BookmarksBar from './BookmarksBar'

// loadBarModel is the only chrome.bookmarks touch; mock it so the widget
// never needs a real chrome.bookmarks API in jsdom.
vi.mock('../../../services/bookmarks', () => ({ loadBarModel: vi.fn() }))

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

async function renderBar(model: BarModel) {
  vi.mocked(loadBarModel).mockResolvedValue(model)
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, bookmarks: true },
  })
  const result = render(
    <StorageProvider storage={storage}>
      <BookmarksBar />
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

  it('renders no fixed-position element inside the transformed bar; backdrop portals to <body>', async () => {
    await renderBar(nestedModel)
    const folderChip = await screen.findByRole('button', { name: 'Work' })

    await act(async () => {
      fireEvent.click(folderChip)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Work bookmarks' })
    const nav = screen.getByRole('navigation', { name: 'Bookmarks bar' })

    // The nav's -translate-x-1/2 transform makes it the CONTAINING BLOCK for
    // any position:fixed descendant: a "fixed inset-0" backdrop rendered
    // inside it shrinks to the bar's own box and, being z-40 inside the
    // nav's stacking context, paints ABOVE the sibling chips — every chip
    // click then lands on the backdrop (= close) instead of the chip. So:
    // nothing inside the nav may be position-fixed, ever.
    expect(nav.querySelector('.fixed')).toBeNull()

    // The popover panel anchors to its chip wrapper (absolute), not the
    // viewport (fixed) — that's what pins it visually under the clicked chip.
    expect(dialog.classList.contains('absolute')).toBe(true)
    expect(dialog.classList.contains('fixed')).toBe(false)

    // The click-outside catcher escapes the transformed subtree via a portal
    // to <body>, where fixed inset-0 really means the whole viewport.
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
