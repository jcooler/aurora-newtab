import type { Size } from './clamp'

// The arrange-mode pill (src/newtab/arrange/ArrangeController.tsx) defaults
// to bottom-center — but blocks can end up ANYWHERE after arranging, so a
// single fixed spot eventually collides with whatever the user just dropped
// there (Jon: "The reset layout and done buttons are right on top of a
// widget"). This module is the pure decision logic for dodging that: given
// the pill's own size, every block's rect, and the viewport, pick the first
// candidate anchor (in a fixed, deterministic order) whose box doesn't
// intersect any block. No animation, no cursor-chasing — just a discrete
// jump to the next clear spot, recomputed whenever the caller's block rects
// change (ArrangeController already re-measures those on resize and after
// any layout change — see its `rects` state).
export type PillAnchor = 'bottom-center' | 'above-bottom-center' | 'top-center' | 'bottom-left'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

const MARGIN = 16 // px from a viewport edge — matches the pill's pre-dodge `bottom-4`/`left-4` offset
// px clearance between the two center-column candidates when stacked. Must
// clear 2x COLLISION_PAD: a block that only covers `bottom-center`'s own
// (unpadded) box would, once padded, still reach into `above-bottom-center`'s
// padded box if the two were any closer together — that's the opposite of
// what a second candidate is for.
const GAP = 32
const COLLISION_PAD = 12 // px padding added around each block rect before testing for intersection (per the brief)

// Tried in this order; the first one clear of every block wins.
const CANDIDATES: PillAnchor[] = ['bottom-center', 'above-bottom-center', 'top-center', 'bottom-left']

/** The pill's box at a given candidate anchor, for a pill of `size` in a
 *  `viewport` — pure geometry, no measurement. `above-bottom-center` is
 *  expressed relative to `bottom-center`'s own box (one pill-height plus
 *  `GAP` further up), so the two always stack cleanly regardless of pill
 *  size. */
export function pillAnchorRect(anchor: PillAnchor, size: Size, viewport: Size): Rect {
  switch (anchor) {
    case 'bottom-center': {
      const left = (viewport.w - size.w) / 2
      const bottom = viewport.h - MARGIN
      return { left, right: left + size.w, top: bottom - size.h, bottom }
    }
    case 'above-bottom-center': {
      const base = pillAnchorRect('bottom-center', size, viewport)
      const bottom = base.top - GAP
      return { left: base.left, right: base.right, top: bottom - size.h, bottom }
    }
    case 'top-center': {
      const left = (viewport.w - size.w) / 2
      const top = MARGIN
      return { left, right: left + size.w, top, bottom: top + size.h }
    }
    case 'bottom-left': {
      const left = MARGIN
      const bottom = viewport.h - MARGIN
      return { left, right: left + size.w, top: bottom - size.h, bottom }
    }
  }
}

function padRect(r: Rect, pad: number): Rect {
  return { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** Picks the first candidate anchor (see `CANDIDATES`) whose pill box
 *  doesn't intersect any block rect, each padded by `COLLISION_PAD` first so
 *  a near-miss still counts as a collision. Falls back to `bottom-center` —
 *  the default — if every candidate collides with something; deterministic
 *  for identical inputs. */
export function choosePillAnchor(pillSize: Size, blocks: Rect[], viewport: Size): PillAnchor {
  const paddedBlocks = blocks.map((b) => padRect(b, COLLISION_PAD))
  for (const anchor of CANDIDATES) {
    const rect = pillAnchorRect(anchor, pillSize, viewport)
    if (!paddedBlocks.some((b) => intersects(rect, b))) return anchor
  }
  return 'bottom-center'
}
