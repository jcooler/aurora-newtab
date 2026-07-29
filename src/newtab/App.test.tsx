// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import App from './App'

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
})
