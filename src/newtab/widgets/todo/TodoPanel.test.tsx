// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import TodoPanel from './TodoPanel'

async function renderPanel() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const utils = render(
    <StorageProvider storage={storage}>
      <TodoPanel onClose={vi.fn()} />
    </StorageProvider>,
  )
  return { storage, unmount: utils.unmount }
}

describe('TodoPanel', () => {
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
