// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { StorageProvider } from '../../../lib/storage/context'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import PaletteHost from './PaletteHost'

async function renderHost(arranging = false) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <PaletteHost onOpenSettings={vi.fn()} arranging={arranging} />
    </StorageProvider>,
  )
}

// Binding carry from Task 36's re-review: PaletteHost's Ctrl/Cmd+K listener
// is registered on `window`, which ignores `inert` entirely (inert only
// blocks pointer reach and Tab focus traversal on the elements it's applied
// to) — so without an explicit gate, arrange mode's own inert wrapper would
// NOT stop the hotkey from opening a palette the user can no longer reach or
// dismiss except via Escape/Ctrl+K, stacked dead underneath the arrange
// overlay.
describe('PaletteHost', () => {
  it('Ctrl+K opens the command palette when not arranging', async () => {
    await renderHost(false)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('Cmd+K (metaKey) also opens it when not arranging', async () => {
    await renderHost(false)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('Ctrl+K does nothing while arranging is true', async () => {
    await renderHost(true)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })

  it('arranging flipping back to false lets a later Ctrl+K open it again', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    function Wrapper({ arranging }: { arranging: boolean }) {
      return (
        <StorageProvider storage={storage}>
          <PaletteHost onOpenSettings={vi.fn()} arranging={arranging} />
        </StorageProvider>
      )
    }
    const { rerender } = render(<Wrapper arranging={true} />)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()

    rerender(<Wrapper arranging={false} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })
})
