// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import PositionedBlock from './PositionedBlock'
import { DraftLayoutContext } from '../arrange/draftLayout'

afterEach(() => {
  cleanup()
})

describe('PositionedBlock', () => {
  it('without pos renders children with the given className and no inline position', () => {
    const { container } = render(
      <PositionedBlock id="search" pos={undefined} className="mt-8">
        <span>content</span>
      </PositionedBlock>,
    )
    const el = container.querySelector('[data-block-id="search"]')
    expect(el).not.toBeNull()
    expect(el?.className).toBe('mt-8')
    expect(el?.getAttribute('style')).toBeNull()
    expect(el?.textContent).toBe('content')
  })

  it('the rail (default) branch passes width/visibility classes through verbatim and adds NO position of its own', () => {
    // Task 64: rail widgets pass flow-only classes — a `short:hidden` height
    // tier and/or the `.rail-col2` container-query marker — and rely on their
    // zone (a `fixed` ancestor) to position them. PositionedBlock must render
    // them as a STATIC div: the class string verbatim, and no inline
    // position/fixed of its own, so flex flow lays them out.
    const { container } = render(
      <PositionedBlock id="monthCal" pos={undefined} className="rail-col2 short:hidden">
        <span>content</span>
      </PositionedBlock>,
    )
    const el = container.querySelector('[data-block-id="monthCal"]') as HTMLElement
    expect(el.className).toBe('rail-col2 short:hidden')
    expect(el.getAttribute('style')).toBeNull()
    expect(el.classList.contains('fixed')).toBe(false)
  })

  it('with pos sets position: fixed, left/top from the percent center, and drops className', () => {
    const { container } = render(
      <PositionedBlock id="search" pos={{ x: 50, y: 50 }} className="mt-8">
        <span>content</span>
      </PositionedBlock>,
    )
    const el = container.querySelector('[data-block-id="search"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.className).toBe('')
    expect(el.style.position).toBe('fixed')
    // jsdom reports 0x0 (no layout engine) — unmeasured, so left/top are the
    // raw percent with no calc() offset yet (see the measured-size test below
    // for the calc() form).
    expect(el.style.left).toBe('50%')
    expect(el.style.top).toBe('50%')
  })

  it('never sets transform/translate on the positioned branch — must not become a containing block for position:fixed descendants (e.g. a dragged pill\'s popup panel)', () => {
    const { container } = render(
      <PositionedBlock id="notes" pos={{ x: 30, y: 70 }}>
        <span>content</span>
      </PositionedBlock>,
    )
    const el = container.querySelector('[data-block-id="notes"]') as HTMLElement
    expect(el.style.translate).toBe('')
    expect(el.style.transform).toBe('')
  })

  it('a non-finite x or y falls back to the default (unpositioned) placement', () => {
    const { container } = render(
      <PositionedBlock id="search" pos={{ x: NaN, y: 50 }} className="mt-8">
        <span>content</span>
      </PositionedBlock>,
    )
    const el = container.querySelector('[data-block-id="search"]') as HTMLElement
    expect(el.className).toBe('mt-8')
    expect(el.getAttribute('style')).toBeNull()
  })

  it('always renders data-block-id, in both default and positioned placement', () => {
    const { container: c1 } = render(
      <PositionedBlock id="clock" pos={undefined}>
        <span />
      </PositionedBlock>,
    )
    expect(c1.querySelector('[data-block-id="clock"]')).not.toBeNull()

    const { container: c2 } = render(
      <PositionedBlock id="clock" pos={{ x: 10, y: 10 }}>
        <span />
      </PositionedBlock>,
    )
    expect(c2.querySelector('[data-block-id="clock"]')).not.toBeNull()
  })

  it('clamps using the div measured size on mount when getBoundingClientRect reports a real size', () => {
    // jsdom reports 0x0 by default (the "skip clamping" case exercised by the
    // other tests above); stub a real size here to exercise the clamp path.
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: 2000,
        height: 100,
        top: 0,
        left: 0,
        right: 2000,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      } as DOMRect
    }
    try {
      const { container } = render(
        <PositionedBlock id="search" pos={{ x: 1, y: 50 }}>
          <span>content</span>
        </PositionedBlock>,
      )
      const el = container.querySelector('[data-block-id="search"]') as HTMLElement
      // Block (2000px) wider than jsdom's default window.innerWidth (1024px)
      // -> clampCenterPct's degenerate case pins the x axis to center. Once a
      // real (non-zero) size is measured, left/top switch to the calc() form
      // — percent center minus half the measured px size — which is what
      // replaces the old `translate: -50% -50%` centering.
      expect(el.style.left).toBe('calc(50% - 1000px)')
      expect(el.style.top).toBe('calc(50% - 50px)')
      expect(el.style.translate).toBe('')
      expect(el.style.transform).toBe('')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect
    }
  })

  it('recovers via ResizeObserver when the initial synchronous measurement races a real 0x0 box (e.g. a child still hydrating on a fresh page load)', () => {
    // Reproduces a real bug found via a Playwright reload probe: on a fresh
    // mount, a child can render nothing on its OWN first pass (e.g. Clock's
    // own independent useStoredKey('settings') resolves a tick behind App's
    // already-resolved settings gating this whole tree) — the SYNCHRONOUS
    // getBoundingClientRect() in useLayoutEffect genuinely measures 0x0 at
    // that instant, and `resize` never fires for a purely content-driven
    // size change. Without a ResizeObserver picking up the size once the
    // child actually renders, `size` stays permanently unset and the block
    // renders top-left-anchored forever instead of centered. jsdom has no
    // ResizeObserver, so this test provides a minimal fake one and fires
    // its callback manually, standing in for the real browser doing so.
    let capturedCallback: (() => void) | undefined
    let observeCalls = 0
    let disconnectCalls = 0
    class FakeResizeObserver {
      constructor(cb: () => void) {
        capturedCallback = cb
      }
      observe() {
        observeCalls++
      }
      disconnect() {
        disconnectCalls++
      }
      unobserve() {}
    }
    const globalWithRO = globalThis as { ResizeObserver?: unknown }
    const originalRO = globalWithRO.ResizeObserver
    globalWithRO.ResizeObserver = FakeResizeObserver

    const originalRect = HTMLElement.prototype.getBoundingClientRect
    let width = 0 // starts at 0 — the "racing child" hasn't rendered content yet
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width,
        height: width ? 96 : 0,
        top: 0,
        left: 0,
        right: width,
        bottom: width ? 96 : 0,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      } as DOMRect
    }

    try {
      const { container, unmount } = render(
        <PositionedBlock id="clock" pos={{ x: 25, y: 50 }}>
          <span>content</span>
        </PositionedBlock>,
      )
      const el = container.querySelector('[data-block-id="clock"]') as HTMLElement
      // Still unmeasured at mount — no calc() offset yet, matching the
      // pre-existing "jsdom 0x0" tests above.
      expect(el.style.left).toBe('25%')
      expect(observeCalls).toBe(1)

      // The child "hydrates": its box now has a real size, and the browser
      // fires the ResizeObserver callback — simulated here since jsdom can't.
      width = 160
      act(() => {
        capturedCallback?.()
      })

      expect(el.style.left).toBe('calc(25% - 80px)')
      expect(el.style.top).toBe('calc(50% - 48px)')

      unmount()
      expect(disconnectCalls).toBe(1) // cleaned up, not leaked
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect
      if (originalRO === undefined) delete globalWithRO.ResizeObserver
      else globalWithRO.ResizeObserver = originalRO
    }
  })

  it('a DraftLayoutContext entry for this block overrides the pos prop (arrange-mode live drag), and falls back to pos once the entry is gone', () => {
    const { container, rerender } = render(
      <DraftLayoutContext.Provider value={{ search: { x: 20, y: 20 } }}>
        <PositionedBlock id="search" pos={{ x: 50, y: 50 }} className="mt-8">
          <span>content</span>
        </PositionedBlock>
      </DraftLayoutContext.Provider>,
    )
    const el = container.querySelector('[data-block-id="search"]') as HTMLElement
    expect(el.style.left).toBe('20%')
    expect(el.style.top).toBe('20%')

    rerender(
      <DraftLayoutContext.Provider value={{}}>
        <PositionedBlock id="search" pos={{ x: 50, y: 50 }} className="mt-8">
          <span>content</span>
        </PositionedBlock>
      </DraftLayoutContext.Provider>,
    )
    const el2 = container.querySelector('[data-block-id="search"]') as HTMLElement
    expect(el2.style.left).toBe('50%')
    expect(el2.style.top).toBe('50%')
  })
})
