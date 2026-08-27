// @vitest-environment jsdom
import { StrictMode, useCallback, useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PanelPlacement } from '../layout/anchor'
import { useViewportPanelAnchor } from './useViewportPanelAnchor'

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number }

const pillTop: Rect = { left: 16, top: 16, right: 92, bottom: 54, width: 76, height: 38 }
const pillBottom: Rect = { left: 1478, top: 846, right: 1536, bottom: 884, width: 58, height: 38 }

function Harness({
  open,
  pillRect,
  panelRect,
  preferredSize,
  mapInvokerRect,
  boundaryTop,
}: {
  open: boolean
  pillRect: Rect
  panelRect: Rect
  preferredSize: { w: number; h: number }
  mapInvokerRect?: (rect: DOMRectReadOnly, viewportWidth: number) => DOMRectReadOnly
  boundaryTop?: number
}) {
  const invokerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const getBottomBoundaryElement = useCallback(() => boundaryRef.current, [])
  const anchor = useViewportPanelAnchor({
    open,
    invokerRef,
    panelRef,
    preferredSize,
    mapInvokerRect,
    getBottomBoundaryElement: boundaryTop === undefined ? undefined : getBottomBoundaryElement,
  })
  return (
    <>
      <button
        ref={invokerRef}
        data-testid="invoker"
        data-rect={JSON.stringify(pillRect)}
      >
        Open
      </button>
      {boundaryTop !== undefined && (
        <div
          ref={boundaryRef}
          data-testid="bottom-boundary"
          data-rect={JSON.stringify({ left: 0, top: boundaryTop, right: 800, bottom: 450, width: 800, height: 450 - boundaryTop })}
        />
      )}
      {open && anchor && (
        <div
          ref={panelRef}
          data-testid="panel"
          data-rect={JSON.stringify(panelRect)}
          data-anchor={JSON.stringify(anchor)}
        >
          <button type="button">Keep focus</button>
        </div>
      )}
    </>
  )
}

function anchorOf(): PanelPlacement {
  return JSON.parse(screen.getByTestId('panel').getAttribute('data-anchor') ?? 'null')
}

describe('useViewportPanelAnchor', () => {
  let frames: Array<FrameRequestCallback | undefined>
  let resizeCallbacks: Array<ResizeObserverCallback>
  let disconnects: number
  let originalResizeObserver: typeof ResizeObserver | undefined
  let originalRect: typeof HTMLElement.prototype.getBoundingClientRect

  beforeEach(() => {
    frames = []
    resizeCallbacks = []
    disconnects = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames[id - 1] = undefined
    })
    originalResizeObserver = globalThis.ResizeObserver
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() { disconnects += 1 }
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
    originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const value = this.getAttribute('data-rect')
      if (!value) return originalRect.call(this)
      const rect = JSON.parse(value) as Rect
      return { ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect
    }
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
  })

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect
    if (originalResizeObserver === undefined) delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    else globalThis.ResizeObserver = originalResizeObserver
    vi.restoreAllMocks()
  })

  const flushFrames = () => act(() => {
    const pending = frames.splice(0)
    pending.forEach((callback) => callback?.(0))
  })

  it('owns listeners, observer, and one coalesced frame only while open, and fences stale owners after close/reopen', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { rerender, unmount } = render(
      <Harness open={false} pillRect={pillTop} panelRect={{ left: 0, top: 0, right: 256, bottom: 218, width: 256, height: 218 }} preferredSize={{ w: 256, h: 218 }} />,
    )
    expect(add.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(0)

    rerender(<Harness open pillRect={pillTop} panelRect={{ left: 0, top: 0, right: 256, bottom: 218, width: 256, height: 218 }} preferredSize={{ w: 256, h: 218 }} />)
    flushFrames()
    expect(anchorOf()).toEqual({ left: 16, top: 62 })
    expect(add.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1)
    expect(resizeCallbacks).toHaveLength(1)

    act(() => {
      fireEvent(window, new Event('resize'))
      fireEvent(window, new Event('resize'))
      resizeCallbacks[0]?.([], {} as ResizeObserver)
    })
    expect(frames.filter(Boolean)).toHaveLength(1)
    const staleResize = resizeCallbacks[0]!

    rerender(<Harness open={false} pillRect={pillTop} panelRect={{ left: 0, top: 0, right: 256, bottom: 218, width: 256, height: 218 }} preferredSize={{ w: 256, h: 218 }} />)
    expect(remove.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1)
    expect(disconnects).toBe(1)

    rerender(<Harness open pillRect={pillBottom} panelRect={{ left: 0, top: 0, right: 384, bottom: 484, width: 384, height: 484 }} preferredSize={{ w: 384, h: 484 }} />)
    flushFrames()
    expect(anchorOf()).toEqual({ left: 1152, bottom: 62 })
    act(() => staleResize([], {} as ResizeObserver))
    flushFrames()
    expect(anchorOf()).toEqual({ left: 1152, bottom: 62 })

    unmount()
    expect(disconnects).toBe(2)
  })

  it('remeasures current invoker and rendered panel growth/shrink in both anchor directions without replacing the focused panel', () => {
    const preferredSize = { w: 256, h: 120 }
    render(<Harness open pillRect={pillTop} panelRect={{ left: 0, top: 0, right: 256, bottom: 120, width: 256, height: 120 }} preferredSize={preferredSize} />)
    flushFrames()
    const panel = screen.getByTestId('panel')
    const invoker = screen.getByTestId('invoker')
    const focused = screen.getByRole('button', { name: 'Keep focus' })
    focused.focus()

    invoker.setAttribute('data-rect', JSON.stringify({ ...pillTop, top: 400, bottom: 438 }))
    panel.setAttribute('data-rect', JSON.stringify({ left: 0, top: 0, right: 256, bottom: 500, width: 256, height: 500 }))
    act(() => resizeCallbacks.at(-1)?.([], {} as ResizeObserver))
    flushFrames()
    expect(anchorOf()).toEqual({ left: 16, top: 392 })
    expect(screen.getByTestId('panel')).toBe(panel)
    expect(document.activeElement).toBe(focused)

    panel.setAttribute('data-rect', JSON.stringify({ left: 0, top: 0, right: 256, bottom: 120, width: 256, height: 120 }))
    act(() => resizeCallbacks.at(-1)?.([], {} as ResizeObserver))
    flushFrames()
    expect(anchorOf()).toEqual({ left: 16, top: 446 })
    expect(screen.getByTestId('panel')).toBe(panel)
    expect(document.activeElement).toBe(focused)

    invoker.setAttribute('data-rect', JSON.stringify({ ...pillBottom, top: 460, bottom: 498 }))
    panel.setAttribute('data-rect', JSON.stringify({ left: 0, top: 0, right: 256, bottom: 500, width: 256, height: 500 }))
    act(() => resizeCallbacks.at(-1)?.([], {} as ResizeObserver))
    flushFrames()
    expect(anchorOf()).toEqual({ left: 1280, bottom: 392 })
    expect(screen.getByTestId('panel')).toBe(panel)
    expect(document.activeElement).toBe(focused)

    panel.setAttribute('data-rect', JSON.stringify({ left: 0, top: 0, right: 256, bottom: 120, width: 256, height: 120 }))
    act(() => resizeCallbacks.at(-1)?.([], {} as ResizeObserver))
    flushFrames()
    expect(anchorOf()).toEqual({ left: 1280, bottom: 448 })
    expect(screen.getByTestId('panel')).toBe(panel)
    expect(document.activeElement).toBe(focused)
  })

  it('cleans strict-mode remount ownership and applies the invoker mapping before every measurement', () => {
    const mapInvokerRect = vi.fn((rect: DOMRectReadOnly) => ({ ...rect, left: rect.left - 48, right: rect.right - 48 }))
    const view = render(
      <StrictMode>
        <Harness open pillRect={pillBottom} panelRect={{ left: 0, top: 0, right: 320, bottom: 256, width: 320, height: 256 }} preferredSize={{ w: 320, h: 256 }} mapInvokerRect={mapInvokerRect} />
      </StrictMode>,
    )
    flushFrames()
    expect(anchorOf()).toEqual({ left: 1168, bottom: 62 })
    expect(mapInvokerRect).toHaveBeenCalled()
    expect(disconnects).toBeGreaterThanOrEqual(1)
    view.unmount()
    expect(disconnects).toBeGreaterThanOrEqual(2)
  })

  it('observes an exact bottom boundary and returns a reachable max-height above it', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(450)
    render(
      <Harness
        open
        pillRect={{ left: 680, top: 260, right: 752, bottom: 298, width: 72, height: 38 }}
        panelRect={{ left: 368, top: 8, right: 752, bottom: 332, width: 384, height: 324 }}
        preferredSize={{ w: 384, h: 184 }}
        boundaryTop={242}
      />,
    )
    flushFrames()

    expect(anchorOf()).toEqual({ left: 368, bottom: 216, maxHeight: 226 })
    expect(resizeCallbacks).toHaveLength(1)
  })
})
