import type { Size } from './clamp'

export interface PanelPlacement { left: number; top: number } // px
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
 *  pill when the pill is in the top half (else above), left-aligned when the
 *  pill is in the left half (else right-aligned), 8px gap, clamped to >= 8px
 *  from every edge. */
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

  const rawTop = topHalf ? pillRect.bottom + gap : pillRect.top - gap - panel.h
  const rawLeft = leftHalf ? pillRect.left : pillRect.right - panel.w

  const minLeft = margin
  const maxLeft = viewport.w - panel.w - margin
  const minTop = margin
  const maxTop = viewport.h - panel.h - margin

  return {
    left: Math.min(Math.max(rawLeft, minLeft), maxLeft),
    top: Math.min(Math.max(rawTop, minTop), maxTop),
  }
}
