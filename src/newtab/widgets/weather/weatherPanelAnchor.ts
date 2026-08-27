export interface WeatherPanelAnchorInput {
  trigger: DOMRectReadOnly
  panel: { width: number; height: number }
  viewport: { width: number; height: number }
  safeMargin: number
  utilityExclusion?: DOMRectReadOnly
}

export interface WeatherPanelAnchor {
  left: number
  top: number
  maxHeight: number
  vertical: 'below' | 'above'
  horizontal: 'inward-left' | 'inward-right'
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

const PANEL_GAP = 8

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function overlaps(left: Rect, right: Rect): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top
}

export function weatherPanelAnchor(input: WeatherPanelAnchorInput): WeatherPanelAnchor {
  const { trigger, panel, viewport } = input
  const safeMargin = Math.max(0, input.safeMargin)
  const width = Math.min(panel.width, Math.max(0, viewport.width - safeMargin * 2))
  const maxHeight = Math.max(0, viewport.height - safeMargin * 2)
  const height = Math.min(panel.height, maxHeight)
  const spaceBelow = viewport.height - safeMargin - trigger.bottom - PANEL_GAP
  const spaceAbove = trigger.top - safeMargin - PANEL_GAP
  const vertical: WeatherPanelAnchor['vertical'] = panel.height <= spaceBelow || spaceBelow >= spaceAbove
    ? 'below'
    : 'above'
  const horizontal: WeatherPanelAnchor['horizontal'] = (trigger.left + trigger.right) / 2 >= viewport.width / 2
    ? 'inward-left'
    : 'inward-right'
  const maximumLeft = viewport.width - safeMargin - width
  const maximumTop = viewport.height - safeMargin - height
  let left = clamp(
    horizontal === 'inward-left' ? trigger.right - width : trigger.left,
    safeMargin,
    maximumLeft,
  )
  let top = clamp(
    vertical === 'below' ? trigger.bottom + PANEL_GAP : trigger.top - PANEL_GAP - height,
    safeMargin,
    maximumTop,
  )

  const exclusion = input.utilityExclusion
  const initial = { left, top, right: left + width, bottom: top + height }
  if (exclusion && overlaps(initial, exclusion)) {
    const candidates = [
      { left: exclusion.left - PANEL_GAP - width, top },
      { left: exclusion.right + PANEL_GAP, top },
      { left, top: exclusion.top - PANEL_GAP - height },
      { left, top: exclusion.bottom + PANEL_GAP },
    ].filter((candidate) => (
      candidate.left >= safeMargin
      && candidate.left <= maximumLeft
      && candidate.top >= safeMargin
      && candidate.top <= maximumTop
      && !overlaps(
        { ...candidate, right: candidate.left + width, bottom: candidate.top + height },
        exclusion,
      )
    )).sort((a, b) => (
      (a.left - left) ** 2 + (a.top - top) ** 2
      - ((b.left - left) ** 2 + (b.top - top) ** 2)
    ))
    if (candidates[0]) {
      left = candidates[0].left
      top = candidates[0].top
    }
  }

  return { left, top, maxHeight, vertical, horizontal }
}
