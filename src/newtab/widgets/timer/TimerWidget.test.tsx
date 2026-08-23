// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type TimerSession } from '../../../lib/storage/schema'
import { anchorPanel } from '../../../lib/layout/anchor'
import { useDialogEscape } from '../../../lib/dialogStack'
import TimerWidget, { TIMER_PANEL_SIZE } from './TimerWidget'
import { TimerSessionProvider } from './TimerSessionProvider'
import type { UtilityTrayBridge } from '../../components/utilityTrayBridge'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'

async function renderWidget({
  onOpenChange,
  canvasSize = 'compact',
  docked = false,
}: { onOpenChange?: (open: boolean) => void; canvasSize?: CanvasSize; docked?: boolean } = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, timer: true },
  })
  const view = render(
    <StorageProvider storage={storage}>
      <TimerSessionProvider>
        <TimerWidget onOpenChange={onOpenChange} canvasSize={canvasSize} docked={docked} />
      </TimerSessionProvider>
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

describe('TimerWidget', () => {
  it('renders the countdown and direct action in the exact Compact ready TierFrame', async () => {
    await renderWidget({ canvasSize: 'compact' })
    const frame = await screen.findByRole('region', { name: 'Focus timer card' })
    expect(frame.getAttribute('data-tier-frame')).toBe('compact')
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.classList.contains('tier-frame--compact')).toBe(true)
    expect(frame.className).not.toContain('overflow-y')
    expect(frame.querySelector('[class*="overflow-y"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Focus timer/ })).toBeTruthy()
    expect(screen.getByTestId('timer-value').textContent).toMatch(/^\d{2}:\d{2}$/)
    expect(screen.getByText(/Open timer/)).toBeTruthy()
  })

  it('keeps Docked timer content-tight instead of mounting the Compact frame', async () => {
    await renderWidget({ docked: true })
    expect(screen.queryByRole('region', { name: 'Focus timer card' })).toBeNull()
    expect(screen.getByRole('button', { name: /Focus timer/ }).classList.contains('rounded-panel')).toBe(true)
  })

  it('keeps one running timer represented after its Tray detail closes', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, timer: true },
    })
    const host = document.createElement('div')
    document.body.append(host)
    const baseBridge = {
      host,
      requestTool: vi.fn(),
      close: vi.fn(),
      registerCloseGuard: vi.fn(),
    } satisfies Omit<UtilityTrayBridge, 'activeTool'>
    const view = render(
      <StorageProvider storage={storage}>
        <TimerSessionProvider>
          <TimerWidget utilityTray={{ ...baseBridge, activeTool: 'timer' }} />
        </TimerSessionProvider>
      </StorageProvider>,
    )
    await act(async () => {})

    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: /Focus timer: .* running/ })).toBeTruthy()

    view.rerender(
      <StorageProvider storage={storage}>
        <TimerSessionProvider>
          <TimerWidget utilityTray={{ ...baseBridge, activeTool: null }} />
        </TimerSessionProvider>
      </StorageProvider>,
    )
    expect(screen.queryByRole('region', { name: 'Focus timer' })).toBeNull()
    expect(screen.getByRole('button', { name: /Focus timer: .* running/ })).toBeTruthy()
    host.remove()
  })

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

  it('uses the shared 8px viewport fit, vertical overflow only when required, and 36px shared action targets', async () => {
    await renderWidget()
    fireEvent.click(await screen.findByRole('button', { name: /Focus timer/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Focus timer' })
    expect(dialog.classList.contains('w-[min(16rem,calc(100vw-1rem))]')).toBe(true)
    expect(dialog.classList.contains('max-h-[calc(100dvh-1rem)]')).toBe(true)
    expect(dialog.classList.contains('overflow-y-auto')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close focus timer' }).classList.contains('max-[420px]:size-9')).toBe(true)
    for (const button of [
      screen.getByRole('button', { name: 'Start' }),
      screen.getByRole('button', { name: 'Reset' }),
    ]) expect(button.classList.contains('min-h-9')).toBe(true)
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input.classList.contains('min-h-9')).toBe(true)
    }
  })

  it('caps the open panel above the live Signal Dock boundary', async () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(450)
    const dock = document.createElement('div')
    dock.dataset.stageZoneContainer = 'dock'
    document.body.appendChild(dock)

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === dock) {
          return {
            left: 0, top: 242, right: 800, bottom: 450,
            width: 800, height: 208, x: 0, y: 242, toJSON() {},
          } as DOMRect
        }
        return {
          left: 16, top: 16, right: 92, bottom: 54,
          width: 76, height: 38, x: 16, y: 16, toJSON() {},
        } as DOMRect
      })

    try {
      await renderWidget()
      fireEvent.click(await screen.findByRole('button', { name: /Focus timer/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Focus timer' })
      expect(dialog.style.maxHeight).toBe('226px')
    } finally {
      rectSpy.mockRestore()
      widthSpy.mockRestore()
      heightSpy.mockRestore()
      dock.remove()
    }
  })

  it('activates the focus trap only when the asynchronously anchored panel is mounted', async () => {
    const prior = document.createElement('button')
    document.body.appendChild(prior)
    prior.focus()
    const { view } = await renderWidget()

    fireEvent.click(await screen.findByRole('button', { name: /Focus timer/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Focus timer' })
    await act(async () => {})
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)

    view.unmount()
    expect(document.activeElement).toBe(prior)
    prior.remove()
  })

  it('catches a running timer up immediately when a sleeping tab regains focus', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-26T12:00:00Z'))
      await renderWidget()
      fireEvent.click(screen.getByRole('button', { name: /Focus timer/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      await act(async () => {})
      expect(screen.getAllByText('25:00')).toHaveLength(2)

      vi.setSystemTime(new Date('2026-07-26T12:01:01Z'))
      act(() => window.dispatchEvent(new Event('focus')))
      expect(screen.getAllByText('23:59')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['paused', { mode: 'work', running: false, endsAt: null, remainingMs: 10 * 60_000, cycles: 2, flow: false }],
    ['running', { mode: 'work', running: true, endsAt: Date.parse('2026-07-26T12:20:00Z'), remainingMs: 25 * 60_000, cycles: 1, flow: false }],
  ] satisfies Array<[string, TimerSession]>)('restores a persisted %s session instead of resetting on mount', async (_label, timerSession) => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-26T12:00:00Z'))
      const storage = createStorage(memoryDriver())
      await storage.init()
      await storage.set('settings', {
        ...defaults().settings,
        widgets: { ...defaults().settings.widgets, timer: true },
      })
      await storage.set('timerSession', timerSession)
      render(
        <StorageProvider storage={storage}>
          <TimerSessionProvider><TimerWidget /></TimerSessionProvider>
        </StorageProvider>,
      )
      await act(async () => {})

      const expected = timerSession.running ? '20:00' : '10:00'
      expect(screen.getByRole('button', { name: new RegExp(`${expected} remaining`) })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes Start, Pause, and Reset through the persisted timerSession authority', async () => {
    const { storage } = await renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /Focus timer/ }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start' })) })
    expect((await storage.get('timerSession'))?.running).toBe(true)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    expect((await storage.get('timerSession'))?.running).toBe(false)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reset' })) })
    expect(await storage.get('timerSession')).toBeNull()
  })

  it('starts Flow atomically after closing the timer panel', async () => {
    const { storage } = await renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /Focus timer/ }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start flow' })) })

    expect(screen.queryByRole('dialog', { name: 'Focus timer' })).toBeNull()
    expect(await storage.get('timerSession')).toMatchObject({ running: true, flow: true })
  })

  it('does not enter Flow when another persistence-backed dialog vetoes closing', async () => {
    function Veto() {
      useDialogEscape(() => false)
      return null
    }
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, timer: true },
    })
    render(
      <StorageProvider storage={storage}>
        <TimerSessionProvider>
          <Veto />
          <TimerWidget />
        </TimerSessionProvider>
      </StorageProvider>,
    )
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /Focus timer/ }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start flow' })) })

    expect(await storage.get('timerSession')).toBeNull()
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
