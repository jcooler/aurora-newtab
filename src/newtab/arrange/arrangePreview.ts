import type { CanvasGuide } from './canvasSnap'
import type { CanvasProfile, CanvasProfileKey } from '../../lib/layout/canvasTypes'
import type { BlockId } from '../../lib/layout/types'
import type { ArrangeSize, ArrangeViewportMode } from './arrangeViewport'

/** In-memory planner input for Arrange. It is never written until Save. */
export interface ArrangePreview {
  profile: CanvasProfileKey
  canvas: CanvasProfile
  inspectorOpen: boolean
  viewportMode: ArrangeViewportMode
  artboard: ArrangeSize
  guides: readonly CanvasGuide[]
  hiddenIds: readonly BlockId[]
  useDesktopLayoutEverywhere?: true
}
