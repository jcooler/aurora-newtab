import { describe, expect, it } from 'vitest'
import { placeAttentionPanel } from './attentionPanelPlacement'

describe('attention panel placement', () => {
  it('chooses a collision-free candidate instead of covering a nearby widget', () => {
    const placed = placeAttentionPanel({
      viewport: { width: 1600, height: 900 },
      trigger: { left: 350, top: 400, right: 450, bottom: 430, width: 100, height: 30 },
      panel: { width: 352, height: 190 },
      obstacles: [{ left: 128, top: 548, right: 448, bottom: 748, width: 320, height: 200 }],
    })

    expect(placed.top).toBeLessThan(400)
  })

  it('keeps the panel inside a narrow viewport', () => {
    const placed = placeAttentionPanel({
      viewport: { width: 360, height: 640 },
      trigger: { left: 4, top: 240, right: 80, bottom: 270, width: 76, height: 30 },
      panel: { width: 352, height: 280 },
      obstacles: [],
    })

    expect(placed.left).toBe(8)
    expect(placed.top).toBeGreaterThanOrEqual(8)
  })
})
