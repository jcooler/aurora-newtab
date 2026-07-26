import { describe, expect, it } from 'vitest'
import { fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('gh', 'GitHub')).not.toBeNull()
    expect(fuzzyScore('xyz', 'GitHub')).toBeNull()
  })
  it('prefers consecutive and word-start matches', () => {
    const consecutive = fuzzyScore('git', 'GitHub')!
    const scattered = fuzzyScore('gtb', 'GitHub')!
    expect(consecutive).toBeGreaterThan(scattered)
    const wordStart = fuzzyScore('nt', 'New Tab')!
    const midWord = fuzzyScore('et', 'New Tab')!
    expect(wordStart).toBeGreaterThan(midWord)
  })
  it('empty needle matches with zero score', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})
