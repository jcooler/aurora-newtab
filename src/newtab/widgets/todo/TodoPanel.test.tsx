// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('traps focus in the panel once loaded, and restores focus to whatever was previously focused when it closes', async () => {
    // Stand-in for "the pill" that had focus before the panel opened — a
    // real click on TodoWidget's actual pill button isn't reproducible via
    // fireEvent.click in jsdom (unlike a real browser, it doesn't move
    // focus), so this asserts the same mechanism useFocusTrap actually keys
    // off: whatever `document.activeElement` was immediately before mount.
    const pillStandIn = document.createElement('button')
    document.body.appendChild(pillStandIn)
    pillStandIn.focus()
    expect(document.activeElement).toBe(pillStandIn)

    // `todoLists` resolves asynchronously (same as real chrome.storage), so
    // the panel's very first render has no ref-bearing dialog div yet — this
    // proves useFocusTrap's effect correctly re-fires once it appears,
    // rather than silently no-op'ing the way it would if `active` were
    // hardcoded `true` from that first, ref-less render (see the comment in
    // TodoPanel.tsx above the `useFocusTrap` call).
    const { unmount } = await renderPanel()
    const closeButton = await screen.findByRole('button', { name: 'Close tasks' })
    expect(document.activeElement).toBe(closeButton)

    unmount()
    expect(document.activeElement).toBe(pillStandIn)

    document.body.removeChild(pillStandIn)
  })
})
