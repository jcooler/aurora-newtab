import { describe, expect, it } from 'vitest'
import { BUNDLED, bundledLqip, bundledUrl } from './index'

describe('bundled photo manifest', () => {
  it('ships an inline LQIP placeholder for every bundled photo', () => {
    expect(BUNDLED.length).toBeGreaterThan(0)
    const missing = BUNDLED.filter((p) => !p.lqip).map((p) => p.id)
    expect(missing).toEqual([])
  })

  it('encodes each LQIP as a self-contained data URI (no extra fetch at paint time)', () => {
    const notInline = BUNDLED.filter((p) => !p.lqip.startsWith('data:image/')).map((p) => p.id)
    expect(notInline).toEqual([])
  })

  it('keeps the whole LQIP set small enough to sit in the bundle', () => {
    const total = BUNDLED.reduce((sum, p) => sum + p.lqip.length, 0)
    expect(total).toBeLessThan(200 * 1024)
  })

  it('bundledLqip returns the placeholder paired with the same index bundledUrl serves', () => {
    for (let i = 0; i < BUNDLED.length; i++) {
      expect(bundledLqip(i)).toBe(BUNDLED[i]!.lqip)
      expect(bundledUrl(i, '2560x1600')).toContain(BUNDLED[i]!.id)
    }
  })
})
