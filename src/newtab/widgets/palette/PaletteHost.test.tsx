// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { StorageProvider } from '../../../lib/storage/context'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import PaletteHost from './PaletteHost'

// The arrange-mode hotkey gate was deleted with the Arrange artboard
// (NL-P2, named-layouts spec §3): there is no arrange overlay left for the
// palette to stack underneath. NL-P3's live edit session owns any future
// window-level hotkey gating it needs.
async function renderHost() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <PaletteHost onOpenSettings={vi.fn()} />
    </StorageProvider>,
  )
}

describe('PaletteHost', () => {
  it('Ctrl+K opens the command palette', async () => {
    await renderHost()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('Cmd+K (metaKey) also opens it', async () => {
    await renderHost()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('a second Ctrl+K closes the palette again', async () => {
    await renderHost()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })
})
