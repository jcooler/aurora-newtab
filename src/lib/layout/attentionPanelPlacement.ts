export interface AttentionRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface PlacementInput {
  viewport: { width: number; height: number }
  trigger: AttentionRect
  panel: { width: number; height: number }
  obstacles: readonly AttentionRect[]
  /** Optional owner that the panel must avoid before balancing other
   *  collisions. Useful when a small trigger sits inside a whole widget. */
  avoid?: AttentionRect
}

const MARGIN = 8
const GAP = 8

function overlapArea(left: number, top: number, width: number, height: number, obstacle: AttentionRect): number {
  const overlapWidth = Math.max(0, Math.min(left + width, obstacle.right) - Math.max(left, obstacle.left))
  const overlapHeight = Math.max(0, Math.min(top + height, obstacle.bottom) - Math.max(top, obstacle.top))
  return overlapWidth * overlapHeight
}

export function placeAttentionPanel({ viewport, trigger, panel, obstacles, avoid }: PlacementInput): { left: number; top: number } {
  const maxLeft = Math.max(MARGIN, viewport.width - panel.width - MARGIN)
  const maxTop = Math.max(MARGIN, viewport.height - panel.height - MARGIN)
  const clamp = (left: number, top: number) => ({
    left: Math.min(maxLeft, Math.max(MARGIN, left)),
    top: Math.min(maxTop, Math.max(MARGIN, top)),
  })
  const centeredLeft = trigger.left + trigger.width / 2 - panel.width / 2
  const centeredTop = trigger.top + trigger.height / 2 - panel.height / 2
  const candidates = [
    clamp(centeredLeft, trigger.bottom + GAP),
    clamp(centeredLeft, trigger.top - panel.height - GAP),
    clamp(trigger.right + GAP, centeredTop),
    clamp(trigger.left - panel.width - GAP, centeredTop),
    clamp(trigger.left, trigger.bottom + GAP),
    clamp(trigger.right - panel.width, trigger.bottom + GAP),
    clamp(trigger.left, trigger.top - panel.height - GAP),
    clamp(trigger.right - panel.width, trigger.top - panel.height - GAP),
  ]
  return candidates
    .map((candidate, order) => ({
      ...candidate,
      order,
      avoidOverlap: avoid ? overlapArea(candidate.left, candidate.top, panel.width, panel.height, avoid) : 0,
      overlap: obstacles.reduce(
        (total, obstacle) => total + overlapArea(candidate.left, candidate.top, panel.width, panel.height, obstacle),
        0,
      ),
    }))
    .sort((left, right) => left.avoidOverlap - right.avoidOverlap || left.overlap - right.overlap || left.order - right.order)[0]!
}
