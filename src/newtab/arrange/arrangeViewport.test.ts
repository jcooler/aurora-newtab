import { describe, expect, it } from 'vitest'
import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'
import {
  ARRANGE_ARTBOARD_SIZES,
  arrangeArtboardSize,
  arrangeViewportMode,
  clientToLogicalPoint,
  fitArrangeArtboard,
} from './arrangeViewport'

const PROFILES: readonly CanvasProfileKey[] = ['compact', 'standard', 'display', 'ultrawide']

describe('Arrange physical viewport and logical artboards', () => {
  it.each(PROFILES)('uses a sheet below 1100px for %s without consulting the logical profile', () => {
    expect(arrangeViewportMode(1099)).toBe('sheet')
  })

  it.each(PROFILES)('uses a side inspector at 1100px for %s without consulting the logical profile', () => {
    expect(arrangeViewportMode(1100)).toBe('side')
  })

  it('defines the four truthful logical Canvas sizes exactly', () => {
    expect(ARRANGE_ARTBOARD_SIZES).toEqual({
      compact: { width: 390, height: 844 },
      standard: { width: 1440, height: 900 },
      display: { width: 2560, height: 1440 },
      ultrawide: { width: 3440, height: 1440 },
    })
    for (const profile of PROFILES) expect(arrangeArtboardSize(profile)).toEqual(ARRANGE_ARTBOARD_SIZES[profile])
  })

  it('uniformly fits without enlarging the logical artboard', () => {
    expect(fitArrangeArtboard({ width: 1440, height: 900 }, { width: 720, height: 800 })).toEqual({
      scale: 0.5,
      width: 720,
      height: 450,
    })
    expect(fitArrangeArtboard({ width: 390, height: 844 }, { width: 1200, height: 1000 })).toEqual({
      scale: 1,
      width: 390,
      height: 844,
    })
  })

  it('maps client coordinates back into logical artboard coordinates', () => {
    expect(clientToLogicalPoint({ x: 245, y: 492 }, { left: 50, top: 70 }, 0.5)).toEqual({ x: 390, y: 844 })
  })
})
