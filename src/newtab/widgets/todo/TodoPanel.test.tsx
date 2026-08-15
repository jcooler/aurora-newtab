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

  it('uses the shared 8px viewport fit, one body scroll owner, and narrow 36px tool targets', async () => {
    await renderPanel()
    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    expect(dialog.classList.contains('w-[min(24rem,calc(100vw-1rem))]')).toBe(true)
    expect(dialog.classList.contains('max-h-[calc(100dvh-1rem)]')).toBe(true)
    expect(dialog.querySelectorAll('.overflow-y-auto')).toHaveLength(1)
    expect((await screen.findByRole('button', { name: 'Today' })).classList.contains('max-[420px]:min-h-9')).toBe(true)
    const newList = screen.getByRole('button', { name: 'New list' })
    expect(newList.classList.contains('max-[420px]:min-h-9')).toBe(true)
    expect(newList.classList.contains('max-[420px]:min-w-9')).toBe(true)
    expect((await screen.findByRole('button', { name: 'More actions' })).classList.contains('max-[420px]:size-9')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close tasks' }).classList.contains('max-[420px]:size-9')).toBe(true)
    expect((await screen.findByRole('textbox', { name: 'Add a task' })).classList.contains('max-[420px]:min-h-9')).toBe(true)
    expect(screen.getByRole('button', { name: 'Add task' }).classList.contains('max-[420px]:min-h-9')).toBe(true)
  })

  it('keeps its nested overflow actions inside the bounded Tasks surface with their own viewport ceiling', async () => {
    await renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    const menu = screen.getByLabelText('Task list actions')
    expect(menu.parentElement?.classList.contains('relative')).toBe(false)
    expect(menu.classList.contains('max-h-[calc(100dvh-1rem)]')).toBe(true)
    expect(menu.classList.contains('overflow-y-auto')).toBe(true)
    for (const action of screen.getAllByRole('button').filter((button) => menu.contains(button))) {
      expect(action.classList.contains('max-[420px]:min-h-9')).toBe(true)
    }
  })

  it('portals the Tasks owner above its body catcher so pointer-hit actions execute, close, and restore trigger focus', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [
      {
        id: 'today',
        name: 'Today',
        items: [{ id: 'done-item', text: 'Already done', done: true }],
      },
    ])
    render(
      <StorageProvider storage={storage}>
        <TodoPanel anchor={{ left: 8, top: 8 }} onClose={vi.fn()} />
      </StorageProvider>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    const trigger = await screen.findByRole('button', { name: 'More actions' })
    trigger.focus()
    fireEvent.click(trigger)

    const action = screen.getByRole('button', { name: 'Clear done' })
    const menu = screen.getByLabelText('Task list actions')
    const catcher = Array.from(document.body.children).find(
      (element) =>
        element.getAttribute('aria-hidden') === 'true' && element.classList.contains('fixed'),
    )
    expect(catcher).toBeTruthy()

    const zIndex = (element: Element) => {
      const token = Array.from(element.classList).find((className) => /^z-\d+$/.test(className))
      return token ? Number(token.slice(2)) : 0
    }
    // The menu and catcher must participate in the same root stacking
    // comparison: catcher above every outside control, menu above catcher.
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog.contains(menu)).toBe(true)
    expect(zIndex(dialog)).toBeGreaterThan(zIndex(catcher!))
    expect(zIndex(menu)).toBeGreaterThan(zIndex(catcher!))

    fireEvent.pointerDown(action)
    fireEvent.click(action)

    await waitFor(() => expect(screen.queryByLabelText('Task list actions')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    await waitFor(async () =>
      expect((await storage.get('todoLists'))[0]?.items).toHaveLength(0),
    )
  })

  it('consumes an outside pointer click over a Tasks control, closing only the menu', async () => {
    const onClose = vi.fn()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [{ id: 'today', name: 'Today', items: [] }])
    render(
      <StorageProvider storage={storage}>
        <TodoPanel anchor={{ left: 8, top: 8 }} onClose={onClose} />
      </StorageProvider>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    const trigger = await screen.findByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    expect(screen.getByLabelText('Task list actions')).toBeTruthy()

    const underlyingControl = screen.getByRole('button', { name: 'Close tasks' })
    const catcher = Array.from(document.body.children).find(
      (element) =>
        element.getAttribute('aria-hidden') === 'true' && element.classList.contains('fixed'),
    )!
    const zIndex = (element: Element) => {
      const token = Array.from(element.classList).find((className) => /^z-\d+$/.test(className))
      return token ? Number(token.slice(2)) : 0
    }
    // Model the browser's root-layer hit test at the Close-tasks coordinates.
    // The current z-20 regression selects the underlying control; the correct
    // root-level owner selects the catcher and consumes the entire click.
    const hitTarget = zIndex(catcher) > zIndex(dialog) ? catcher : underlyingControl
    fireEvent.pointerDown(hitTarget)
    fireEvent.click(hitTarget)

    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByLabelText('Task list actions')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Tasks' })).toBe(dialog)
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps open overflow actions inside the Tasks dialog keyboard owner and its parent Tab trap', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [{ id: 'today', name: 'Today', items: [] }])
    render(
      <StorageProvider storage={storage}>
        <TodoPanel anchor={{ left: 8, top: 8 }} onClose={vi.fn()} />
      </StorageProvider>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    const menu = screen.getByLabelText('Task list actions')
    const firstAction = screen.getByRole('button', { name: 'Delete list' })

    expect(document.activeElement).toBe(firstAction)
    expect(dialog.contains(firstAction)).toBe(true)
    expect(dialog.contains(menu)).toBe(true)

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    )
    expect(focusables).toContain(firstAction)
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
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
    const textTarget = document.querySelector('label[for="todo-item-item-1"]')
    expect(textTarget?.classList.contains('max-[420px]:min-h-9')).toBe(true)
  })
})
