import { describe, expect, it } from 'vitest'
import { placeAttentionPanel } from './attentionPanelPlacement'

describe('attention panel placement', () => {
  it('chooses a collision-free candidate instead of covering a nearby widget', () => {
    const placed = placeAttentionPanel({
      viewport: { width: 1600, height: 900 },
      trigger: { left: 246, top: 396, right: 584, bottom: 422, width: 338, height: 26 },
      panel: { width: 352, height: 190 },
      obstacles: [
        { left: 213, top: 334, right: 588, bottom: 422, width: 375, height: 88 },
        { left: 128, top: 548, right: 448, bottom: 748, width: 320, height: 200 },
      ],
    })

    expect(placed.left).toBeGreaterThanOrEqual(592)
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

  it('keeps a context panel outside its owner before minimizing other widget overlap', () => {
    const owner = { left: 27.5, top: 16, right: 347.5, bottom: 216, width: 320, height: 200 }
    const placed = placeAttentionPanel({
      viewport: { width: 375, height: 812 },
      trigger: owner,
      avoid: owner,
      panel: { width: 288, height: 114 },
      obstacles: [
        { left: 0, top: 216, right: 375, bottom: 520, width: 375, height: 304 },
      ],
    })

    expect(placed.top).toBeGreaterThanOrEqual(224)
  })
})
