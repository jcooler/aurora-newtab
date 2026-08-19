/** The safe margin the drag path already honours (canvasSnap's own inset),
 *  mirrored here so a RENDERED item respects the same boundary the DRAG
 *  respects. */
export const EDGE_CLAMP_INSET = 8

export interface ClampBox {
  left: number
  right: number
  top: number
  bottom: number
}

/** The corrective offset that brings a rendered item back inside its
 *  surface (NL-P6 finding F6).
 *
 *  WHY this exists: dragging clamps to safe margins (spec 2.5), so a widget
 *  can never be *placed* off-screen — but placements are stored as PERCENT
 *  points while widgets have PIXEL widths, so the same document opened in a
 *  narrower window pushes edge-placed content off-screen ("saved on the big
 *  monitor, opened on the laptop"), as do hand-authored and backup-restored
 *  documents. Content the user cannot see is not placement, it is loss.
 *
 *  WHAT it deliberately is NOT: this is the spec's "system owns safety" half
 *  only. It writes nothing, moves no neighbour, resizes nothing, and never
 *  re-flows — it is a per-item visual correction recomputed from the live
 *  box, so restoring the roomy window restores the exact original picture.
 *
 *  An item LARGER than its surface cannot be brought fully inside; it aligns
 *  to the start of the axis, because the beginning of the content (a card's
 *  heading, a line's first fact) is what carries meaning. */
export function edgeClampOffset(
  box: ClampBox,
  surface: { width: number; height: number },
  inset: number = EDGE_CLAMP_INSET,
): { dx: number; dy: number } {
  return {
    dx: axisOffset(box.left, box.right, surface.width, inset),
    dy: axisOffset(box.top, box.bottom, surface.height, inset),
  }
}

function axisOffset(start: number, end: number, extent: number, inset: number): number {
  // A surface with no measured extent yet (first paint, jsdom) has no
  // boundary to enforce; asking for no move keeps this a no-op rather than
  // a NaN or a jump.
  if (!(extent > 0)) return 0
  const min = inset
  const max = extent - inset
  const size = end - start
  // Too large to fit: show the start of the content.
  if (size > max - min) return start < min ? min - start : 0
  if (start < min) return min - start
  if (end > max) return max - end
  return 0
}
