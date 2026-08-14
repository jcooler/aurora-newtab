// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import { anchorPanel } from '../../../lib/layout/anchor'
import TimerWidget, { TIMER_PANEL_SIZE } from './TimerWidget'

async function renderWidget({
  onOpenChange,
}: { onOpenChange?: (open: boolean) => void } = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, timer: true },
  })
  const view = render(
    <StorageProvider storage={storage}>
      <TimerWidget onOpenChange={onOpenChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

describe('TimerWidget', () => {
  it('does not mount its ticking clock while disabled', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const intervalSpy = vi.spyOn(window, 'setInterval')
    const { container } = render(<StorageProvider storage={storage}><TimerWidget /></StorageProvider>)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
    expect(intervalSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
  })

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
    if (!('top' in expected)) throw new Error('expected a top-anchored result — this pill is in the top half')

    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    // Timer's default pill sits in the top half — anchorPanel opens the
    // panel DOWNWARD from there, still anchored via `top` (review fix I1
    // only changes the UPWARD-opening case; see anchor.ts's PanelPlacement
    // doc).
    expect(dialog.style.top).toBe(`${expected.top}px`)
    expect(dialog.style.bottom).toBe('')

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })

  it('catches a running timer up immediately when a sleeping tab regains focus', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-26T12:00:00Z'))
      await renderWidget()
      fireEvent.click(screen.getByRole('button', { name: /Focus timer/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      expect(screen.getAllByText('25:00')).toHaveLength(2)

      vi.setSystemTime(new Date('2026-07-26T12:01:01Z'))
      act(() => window.dispatchEvent(new Event('focus')))
      expect(screen.getAllByText('23:59')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

// Final-review fix wave, Fix 1 — mirrors WeatherWidget.test.tsx's own
// onExpandedChange describe block exactly (same idiom, same reason): jsdom
// can't verify real stacking/paint order (that's scripts/preview.mjs's own
// panel-vs-connector probe's job — it's what caught the Focus-timer panel
// painting under Calendar's card in the first place), but it CAN verify the
// mechanism App.tsx's conditional `z-30` depends on: the callback fires
// true on open, false on close, and false again on unmount, never a stale
// value.
describe('TimerWidget onOpenChange (final-review fix wave, Fix 1)', () => {
  it('calls onOpenChange(true) on open and onOpenChange(false) on close', async () => {
    const onOpenChange = vi.fn()
    await renderWidget({ onOpenChange })

    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    onOpenChange.mockClear()

    const pill = await screen.findByRole('button', { name: /Focus timer/ })
    await act(async () => {
      fireEvent.click(pill)
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close focus timer' }))
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  // Same rationale as WeatherWidget's own unmount-cleanup test: without
  // this, App's mirrored `timerOpen` state would stick at `true` forever if
  // TimerWidget ever unmounts while open (e.g. the widget toggle is
  // switched off mid-session), permanently outranking every connector
  // card's own z-index:auto wrapper.
  it('calls onOpenChange(false) on unmount, even while open', async () => {
    const onOpenChange = vi.fn()
    const { view } = await renderWidget({ onOpenChange })
    const pill = await screen.findByRole('button', { name: /Focus timer/ })
    await act(async () => {
      fireEvent.click(pill)
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    onOpenChange.mockClear()
    view.unmount()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
