import type { Size } from './clamp'

export interface PanelPlacement { left: number; top: number } // px

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
