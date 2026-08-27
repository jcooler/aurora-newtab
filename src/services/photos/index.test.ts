import { describe, expect, it } from 'vitest'
import { BUNDLED, bundledLqip, bundledPreviewUrl, bundledUrl } from './index'

describe('bundled photo manifest', () => {
  const addedOriginalIds = [
    'qNXhVgRfU0E',
    '0hU6r-vMtao',
    'P-wAARoptz8',
    'oYEGPZebzGw',
    'j3f1lwXBuAI',
    'V7EgUtCnvLY',
  ]

  it('removes the two rejected photos and includes all six approved originals', () => {
    const ids = BUNDLED.map((photo) => photo.id)
    expect(ids).not.toContain('23tpftFIAD0')
    expect(ids).not.toContain('commons-denali-aurora')
    expect(ids).toEqual(expect.arrayContaining(addedOriginalIds))
  })

  it('serves every newly approved photo from its untouched original file', () => {
    for (const id of addedOriginalIds) {
      const index = BUNDLED.findIndex((photo) => photo.id === id)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(bundledUrl(index, '2560x1600')).toMatch(/-original\.jpg$/)
      expect(bundledUrl(index, '3840x2400')).toBe(bundledUrl(index, '2560x1600'))
    }
  })

  it('ships an inline LQIP placeholder for every bundled photo', () => {
    expect(BUNDLED.length).toBeGreaterThan(0)
    const missing = BUNDLED.filter((p) => !p.lqip).map((p) => p.id)
    expect(missing).toEqual([])
  })

  it('ships a crisp local picker preview for every bundled photo', () => {
    for (let i = 0; i < BUNDLED.length; i++) {
      expect(bundledPreviewUrl(i)).toMatch(/^\/photos\/.*-preview\.webp$/)
    }
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
