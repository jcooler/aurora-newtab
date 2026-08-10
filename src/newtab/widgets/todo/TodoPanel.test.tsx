// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { PanelPlacement } from '../../../lib/layout/anchor'
import TodoPanel from './TodoPanel'

async function renderPanel(anchor: PanelPlacement = { left: 1264, top: 619 }) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const utils = render(
    <StorageProvider storage={storage}>
      <TodoPanel anchor={anchor} onClose={vi.fn()} />
    </StorageProvider>,
  )
  return { storage, unmount: utils.unmount }
}

describe('TodoPanel', () => {
  it('positions itself at the anchor prop via inline position:fixed (no fixed-position class of its own)', async () => {
    await renderPanel()
    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe('1264px')
    expect(dialog.style.top).toBe('619px')
    expect(dialog.classList.contains('fixed')).toBe(false)
  })

  it('uses the themed bg-panel-solid utility, not a hardcoded hex (folders-widget theming bug — the same fix applies to every floating panel)', async () => {
    await renderPanel()
    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    expect(dialog.classList.contains('bg-panel-solid')).toBe(true)
    expect(dialog.classList.contains('bg-[#17171c]/95')).toBe(false)
  })

  it("anchors via `bottom` (grow-up) instead of `top` when given a bottom-anchored placement — review fix I1, the panel that actually reaches this shape at Todo's default (bottom-half) pill position", async () => {
    await renderPanel({ left: 1264, bottom: 64 })
    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe('1264px')
    expect(dialog.style.bottom).toBe('64px')
    // No `top` at all — a stray `top: undefined` would previously have
    // clipped the add-task form + Clear-done row off-screen as the list
    // grows, since a top-anchored panel grows DOWNWARD from a fixed point.
    expect(dialog.style.top).toBe('')
  })

  it('keeps focus INSIDE the panel after the active-list defaulting effect settles AND after a list switch — the header eyebrows must never remount the focused button (and restores focus on close)', async () => {
    // Stand-in for "the pill" that had focus before the panel opened — a
    // real click on TodoWidget's actual pill button isn't reproducible via
    // fireEvent.click in jsdom (unlike a real browser, it doesn't move
    // focus), so this asserts the same mechanism useFocusTrap actually keys
    // off: whatever `document.activeElement` was immediately before mount.
    const pillStandIn = document.createElement('button')
    document.body.appendChild(pillStandIn)
    pillStandIn.focus()
    expect(document.activeElement).toBe(pillStandIn)

    // TWO lists, seeded up front, so the header switcher is exercised and the
    // async `activeId` defaulting effect actually has something to settle
    // onto. `todoLists` resolves asynchronously (same as real chrome.storage),
    // so the panel's very first render has no ref-bearing dialog div yet —
    // useFocusTrap's effect must re-fire once it appears (rather than silently
    // no-op'ing the way it would if `active` were hardcoded `true`).
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [
      { id: 'today', name: 'Today', items: [] },
      { id: 'week', name: 'This week', items: [] },
    ])
    const { unmount } = render(
      <StorageProvider storage={storage}>
        <TodoPanel anchor={{ left: 1264, top: 619 }} onClose={vi.fn()} />
      </StorageProvider>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })

    // WAIT for the defaulting effect to settle (activeId null -> first list).
    // This is the exact window the CRITICAL bug lived in: when the active list
    // rendered from a SEPARATE ternary slot than the other lists' `.map`, the
    // moment activeId settled the newly-active button MOVED between slots,
    // React unmounted/remounted it, and `document.activeElement` ejected to
    // <body> — killing the trap on essentially every real open. A pre-settle
    // assertion passed by timing luck; asserting AFTER the round-trip is what
    // falsifies it. All list names now render from ONE keyed `.map`, so the
    // focused button keeps its identity and focus rides through the restyle.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBe(
        'true',
      ),
    )
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)

    // Switching lists must likewise preserve the focused button. Focus the
    // "This week" eyebrow (jsdom's click doesn't move focus, so do it
    // explicitly — a real browser focuses a clicked button), switch to it, and
    // assert focus is STILL inside after the re-render. The two-slot render
    // remounted both buttons on switch; the single keyed `.map` does not.
    const weekBtn = screen.getByRole('button', { name: 'This week' })
    weekBtn.focus()
    expect(document.activeElement).toBe(weekBtn)
    fireEvent.click(weekBtn)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-current')).toBe(
        'true',
      ),
    )
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)

    unmount()
    expect(document.activeElement).toBe(pillStandIn)

    document.body.removeChild(pillStandIn)
  })

  it("keeps the round check reachable by its task label — getByLabelText(item.text) resolves to the checkbox (guards the sr-only <input> + dual-<label> wiring the styling introduced)", async () => {
    // The task check is now a styled round span with the real checkbox sr-only
    // underneath, wrapped in its own (text-less) <label> AND still targeted by
    // the task-text <label htmlFor>. If that association ever broke, the
    // control would be unreachable by its accessible name — this asserts it
    // resolves straight to the checkbox, which is what keeps clicking the task
    // text (and any getByLabelText query) toggling the item.
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [
      { id: 'list-1', name: 'Today', items: [{ id: 'item-1', text: 'Water the plants', done: false }] },
    ])
    render(
      <StorageProvider storage={storage}>
        <TodoPanel anchor={{ left: 1264, top: 619 }} onClose={vi.fn()} />
      </StorageProvider>,
    )
    const check = (await screen.findByLabelText('Water the plants')) as HTMLInputElement
    expect(check.getAttribute('type')).toBe('checkbox')
    expect(check.checked).toBe(false)
  })
})
