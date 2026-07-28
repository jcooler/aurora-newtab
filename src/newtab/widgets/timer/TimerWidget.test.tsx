// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import { anchorPanel } from '../../../lib/layout/anchor'
import TimerWidget, { TIMER_PANEL_SIZE } from './TimerWidget'

async function renderWidget() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, timer: true },
  })
  render(
    <StorageProvider storage={storage}>
      <TimerWidget />
    </StorageProvider>,
  )
  await act(async () => {})
}

describe('TimerWidget', () => {
  it('renders the pill with no fixed-position class of its own (placement now lives on the App-level PositionedBlock wrapper)', async () => {
    await renderWidget()
    const pill = await screen.findByRole('button', { name: /Focus timer/ })
    expect(pill.classList.contains('fixed')).toBe(false)
  })

  it("measures the pill's rect on open and positions the panel exactly at anchorPanel's output for that rect", async () => {
    // Pin to the real 1600x900 viewport the pixel-parity check was verified
    // against (see TodoWidget.test.tsx for why this matters even here).
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = await screen.findByRole('button', { name: /Focus timer/ })

    const pillRect = {
      left: 16,
      top: 16,
      right: 92,
      bottom: 54,
      width: 76,
      height: 38,
      x: 16,
      y: 16,
      toJSON() {},
    }
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(pillRect as DOMRect)

    await act(async () => {
      fireEvent.click(pill)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Focus timer' })

    const expected = anchorPanel(pillRect, TIMER_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })

    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    expect(dialog.style.top).toBe(`${expected.top}px`)

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })
})
