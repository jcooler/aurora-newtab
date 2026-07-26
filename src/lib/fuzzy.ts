/** Case-insensitive subsequence match. Returns null when needle isn't a
 *  subsequence; otherwise a score where consecutive runs (+3) and word-start
 *  hits (+2) beat scattered matches (+1 each). */
export function fuzzyScore(needle: string, haystack: string): number | null {
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (n.length === 0) return 0
  let score = 0
  let hi = 0
  let prevHit = -2
  for (const ch of n) {
    const found = h.indexOf(ch, hi)
    if (found === -1) return null
    score += 1
    if (found === prevHit + 1) score += 3
    if (found === 0 || h[found - 1] === ' ') score += 2
    prevHit = found
    hi = found + 1
  }
  return score
}
