import { describe, expect, it } from 'vitest'
import { edgeClampOffset, EDGE_CLAMP_INSET } from './edgeClamp'

// NL-P6 finding F6: the DRAG path clamps to safe margins (spec 2.5) but the
// RENDER path did not, so a placement that was safe in the window where it
// was made rendered half off-screen in a narrower one — "saved on the big
// monitor, opened on the laptop", plus hand-authored and backup-restored
// documents. This is a SAFETY clamp: it never writes storage, never moves a
// neighbour, and never resizes anything.
describe('edgeClampOffset', () => {
  const surface = { width: 1000, height: 600 }

  it('leaves a fully visible item exactly where the user put it', () => {
    expect(edgeClampOffset({ left: 300, right: 700, top: 100, bottom: 300 }, surface))
      .toEqual({ dx: 0, dy: 0 })
  })

  it('slides an item whose right edge escapes back inside, by the exact overflow', () => {
    // right 1040 overflows by 40 past the 1000 surface, plus the 8px inset.
    expect(edgeClampOffset({ left: 640, right: 1040, top: 10, bottom: 100 }, surface))
      .toEqual({ dx: -(40 + EDGE_CLAMP_INSET), dy: 0 })
  })

  it('slides an item whose left edge escapes back inside', () => {
    expect(edgeClampOffset({ left: -30, right: 200, top: 10, bottom: 100 }, surface))
      .toEqual({ dx: 30 + EDGE_CLAMP_INSET, dy: 0 })
  })

  it('clamps the vertical axis the same way, independently', () => {
    expect(edgeClampOffset({ left: 10, right: 200, top: 560, bottom: 640 }, surface))
      .toEqual({ dx: 0, dy: -(40 + EDGE_CLAMP_INSET) })
  })

  it('an item WIDER than the surface aligns to the start so its content begins on-screen', () => {
    // Pulling such an item fully inside is impossible; showing the START of
    // the content beats showing its middle.
    expect(edgeClampOffset({ left: -200, right: 1300, top: 10, bottom: 100 }, surface))
      .toEqual({ dx: 200 + EDGE_CLAMP_INSET, dy: 0 })
  })

  it('a taller-than-surface item aligns to the top for the same reason', () => {
    expect(edgeClampOffset({ left: 10, right: 100, top: -50, bottom: 900 }, surface))
      .toEqual({ dx: 0, dy: 50 + EDGE_CLAMP_INSET })
  })

  it('is idempotent: clamping an already-clamped box asks for no further move', () => {
    const box = { left: 640, right: 1040, top: 10, bottom: 100 }
    const first = edgeClampOffset(box, surface)
    const moved = { ...box, left: box.left + first.dx, right: box.right + first.dx }
    expect(edgeClampOffset(moved, surface)).toEqual({ dx: 0, dy: 0 })
  })

  it('a degenerate surface never produces a NaN offset', () => {
    expect(edgeClampOffset({ left: 0, right: 10, top: 0, bottom: 10 }, { width: 0, height: 0 }))
      .toEqual({ dx: 0, dy: 0 })
  })
})
