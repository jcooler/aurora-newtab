import { describe, expect, it } from 'vitest'
import { weatherPanelAnchor } from './weatherPanelAnchor'

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
  x: left,
  y: top,
  toJSON: () => ({}),
}) as DOMRectReadOnly

describe('weatherPanelAnchor', () => {
  it.each([
    ['top-left', rect(8, 8, 208, 88), { left: 8, top: 96, vertical: 'below', horizontal: 'inward-right' }],
    ['top-right', rect(792, 8, 992, 88), { left: 672, top: 96, vertical: 'below', horizontal: 'inward-left' }],
    ['bottom-left', rect(8, 700, 208, 780), { left: 8, top: 292, vertical: 'above', horizontal: 'inward-right' }],
    ['bottom-right', rect(792, 700, 992, 780), { left: 672, top: 292, vertical: 'above', horizontal: 'inward-left' }],
  ] as const)('places the %s trigger inward and within the safe viewport', (_name, trigger, expected) => {
    expect(weatherPanelAnchor({
      trigger,
      panel: { width: 320, height: 400 },
      viewport: { width: 1000, height: 800 },
      safeMargin: 8,
    })).toMatchObject({ ...expected, maxHeight: 784 })
  })

  it('keeps opening below when the complete panel fits there', () => {
    expect(weatherPanelAnchor({
      trigger: rect(792, 200, 992, 280),
      panel: { width: 320, height: 400 },
      viewport: { width: 1000, height: 800 },
      safeMargin: 8,
    })).toMatchObject({ top: 288, vertical: 'below' })
  })

  it('clamps an oversized panel to one finite narrow-viewport scrollport', () => {
    expect(weatherPanelAnchor({
      trigger: rect(112, 8, 312, 88),
      panel: { width: 360, height: 700 },
      viewport: { width: 320, height: 568 },
      safeMargin: 8,
    })).toEqual({
      left: 8,
      top: 8,
      maxHeight: 552,
      vertical: 'below',
      horizontal: 'inward-left',
    })
  })

  it('moves away from a fixed utility exclusion without crossing the safe margin', () => {
    const anchor = weatherPanelAnchor({
      trigger: rect(792, 500, 992, 580),
      panel: { width: 320, height: 200 },
      viewport: { width: 1000, height: 800 },
      safeMargin: 8,
      utilityExclusion: rect(900, 620, 992, 792),
    })

    expect(anchor).toMatchObject({ left: 572, top: 588, vertical: 'below', horizontal: 'inward-left' })
  })
})
