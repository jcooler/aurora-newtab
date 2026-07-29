import type { Size } from './clamp'

// px. A panel that opens DOWNWARD (pill in the top half) anchors via `top` —
// unchanged. A panel that opens UPWARD (pill in the bottom half) anchors via
// `bottom` instead of `top` (review fix I1): every peripheral panel's real
// height is content-driven (Notes is the one exception, fixed at h-64), not
// the static `panel: Size` this module is fed — a `top`-anchored panel grows
// DOWNWARD as content is added, so its own footer controls (e.g. TodoPanel's
// add-task form + Clear-done row) march further down and off-screen past
// ~5 tasks even though the ANCHOR math never moved. Anchoring the upward
// case via `bottom` pins the panel's bottom edge (and therefore its footer)
// at a fixed distance from the pill, so it grows up into free space above
// instead — restoring the pre-anchorPanel `bottom-16`-class behavior. Panel
// components must branch on which key is present (`'top' in anchor`) rather
// than assuming one shape.
export type PanelPlacement = { left: number; top: number } | { left: number; bottom: number }
export interface HugRect { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** Shift a pill rect horizontally toward whichever screen edge it's actually
 *  nearer to, by `hugPx` — reproduces a design's tighter gap between a
 *  pill's own inset and its panel's corner inset (see NOTES_CORNER_HUG_PX /
 *  TODO_CORNER_HUG_PX). Direction follows the SAME left/right half-test
 *  `anchorPanel` itself applies to the shifted rect it's given (pill center
 *  vs. viewport center) — not a hardcoded per-widget sign — so a pill
 *  dragged across the vertical centerline still hugs the corner it's
 *  actually nearest to, instead of the corner its widget started in.
 *  Vertical fields pass through unchanged: today's hug is horizontal-only. */
export function hugHorizontal(rect: HugRect, hugPx: number, viewportW: number): HugRect {
  const centerX = (rect.left + rect.right) / 2
  const shift = centerX < viewportW / 2 ? -hugPx : hugPx
  return {
    left: rect.left + shift,
    right: rect.right + shift,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

/** Place a panel adjacent to its pill: opens toward screen center — below the
 *  pill when the pill is in the top half (anchored via `top`, growing DOWN),
 *  above it when the pill is in the bottom half (anchored via `bottom`,
 *  growing UP — review fix I1, see the `PanelPlacement` doc above) —
 *  left-aligned when the pill is in the left half (else right-aligned), 8px
 *  gap, clamped to >= 8px from every edge.
 *
 *  The vertical clamp bounds (`margin` .. `viewport.h - panel.h - margin`)
 *  are the SAME numeric range for both branches: `top` and `bottom` are just
 *  opposite-edge measurements of the same axis, so a panel clamped to
 *  `margin` from its own leading edge and `viewport.h - panel.h - margin`
 *  from its own trailing edge lands in an identical on-screen box either
 *  way. */
export function anchorPanel(
  pillRect: DOMRectReadOnly | { left: number; top: number; right: number; bottom: number; width: number; height: number },
  panel: Size,
  viewport: Size,
): PanelPlacement {
  const gap = 8
  const margin = 8

  const pillCenterX = (pillRect.left + pillRect.right) / 2
  const pillCenterY = (pillRect.top + pillRect.bottom) / 2

  const topHalf = pillCenterY < viewport.h / 2
  const leftHalf = pillCenterX < viewport.w / 2

  const rawLeft = leftHalf ? pillRect.left : pillRect.right - panel.w
  const minLeft = margin
  const maxLeft = viewport.w - panel.w - margin
  const left = Math.min(Math.max(rawLeft, minLeft), maxLeft)

  const minOffset = margin
  const maxOffset = viewport.h - panel.h - margin

  if (topHalf) {
    const rawTop = pillRect.bottom + gap
    return { left, top: Math.min(Math.max(rawTop, minOffset), maxOffset) }
  }
  const rawBottom = viewport.h - pillRect.top + gap
  return { left, bottom: Math.min(Math.max(rawBottom, minOffset), maxOffset) }
}
