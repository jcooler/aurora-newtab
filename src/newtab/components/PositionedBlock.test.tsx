// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PositionedBlock from './PositionedBlock'

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
    expect(el.style.left).toBe('50%')
    expect(el.style.top).toBe('50%')
    expect(el.style.translate).toBe('-50% -50%')
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
      // -> clampCenterPct's degenerate case pins the x axis to center.
      expect(el.style.left).toBe('50%')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect
    }
  })
})
