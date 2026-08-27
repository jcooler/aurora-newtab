import assert from 'node:assert/strict'

export function requireExact(args) {
  assert(args.includes('--exact'), 'attention signals QA requires --exact')
}

export function assertBuildCommit(provenance, head) {
  assert.equal(provenance?.commit, head, 'dist provenance does not match HEAD')
  return head
}

export function assertViewportContained(rect, viewport, margin = 8) {
  assert(rect, 'attention panel viewport rectangle is missing')
  assert(rect.left >= margin - 0.5, 'attention panel escaped the viewport on the left')
  assert(rect.top >= margin - 0.5, 'attention panel escaped the viewport at the top')
  assert(rect.right <= viewport.width - margin + 0.5, 'attention panel escaped the viewport on the right')
  assert(rect.bottom <= viewport.height - margin + 0.5, 'attention panel escaped the viewport at the bottom')
  return rect
}

export function assertNoIntersection(left, right, label) {
  assert(left && right, `attention panel or ${label} rectangle is missing`)
  const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left)
  const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
  assert(
    overlapWidth <= 1 || overlapHeight <= 1,
    `attention panel overlaps ${label}: ${JSON.stringify({ overlapWidth, overlapHeight })}`,
  )
}
