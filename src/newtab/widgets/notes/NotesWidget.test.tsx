// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { anchorPanel, hugHorizontal } from '../../../lib/layout/anchor'
import NotesWidget, { NOTES_CORNER_HUG_PX, NOTES_PANEL_SIZE } from './NotesWidget'

async function renderWidget() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <NotesWidget />
    </StorageProvider>,
  )
  await act(async () => {})
}

describe('NotesWidget', () => {
  it('renders the pill with no fixed-position class of its own (placement now lives on the App-level PositionedBlock wrapper)', async () => {
    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })
    expect(pill.classList.contains('fixed')).toBe(false)
  })

  it("measures the pill's rect on open and positions the panel exactly at anchorPanel's output for that rect (corner-hug adjusted)", async () => {
    // Pin to the real 1600x900 viewport the pixel-parity check was verified
    // against — jsdom's default 1024x768 is narrow enough that anchorPanel's
    // 8px-margin clamp swallows any x delta a wrong offset would introduce,
    // which would let this test pass even with a broken hug adjustment.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })

    const pillRect = {
      left: 64,
      top: 846,
      right: 127,
      bottom: 884,
      width: 63,
      height: 38,
      x: 64,
      y: 846,
      toJSON() {},
    }
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(pillRect as DOMRect)

    await act(async () => {
      fireEvent.click(pill)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Notes' })

    // Same adjustment NotesWidget applies internally: the pill sits 48px
    // further from the corner than the panel did in the pre-anchorPanel
    // fixed layout, so the rect fed to anchorPanel is shifted to compensate.
    const hugged = hugHorizontal(pillRect, NOTES_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, NOTES_PANEL_SIZE, {
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

  it('hugs the corner it is ACTUALLY nearest to, not a corner hardcoded to Notes’ own default (left) placement — the position-agnostic requirement a dragged pill relies on', async () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })

    // Notes' pill dragged across the vertical centerline into the RIGHT
    // half (mirrors TodoWidget's default-quadrant rect) — today's Notes
    // hardcoded a permanent -48 shift, which would misplace this by 96px.
    const pillRect = {
      left: 1478,
      top: 846,
      right: 1541,
      bottom: 884,
      width: 63,
      height: 38,
      x: 1478,
      y: 846,
      toJSON() {},
    }
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(pillRect as DOMRect)

    await act(async () => {
      fireEvent.click(pill)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Notes' })

    const hugged = hugHorizontal(pillRect, NOTES_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, NOTES_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    expect(dialog.style.left).toBe(`${expected.left}px`)
    expect(dialog.style.top).toBe(`${expected.top}px`)

    // Prove this ISN'T today's hardcoded "-48" sign: that would have shifted
    // the rect further LEFT (away from the corner it's actually nearest to),
    // landing at a different spot than the dynamically-hugged one above.
    const oldHardcodedHug = {
      ...pillRect,
      left: pillRect.left - NOTES_CORNER_HUG_PX,
      right: pillRect.right - NOTES_CORNER_HUG_PX,
    }
    const oldExpected = anchorPanel(oldHardcodedHug, NOTES_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    expect(dialog.style.left).not.toBe(`${oldExpected.left}px`)

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })
})
