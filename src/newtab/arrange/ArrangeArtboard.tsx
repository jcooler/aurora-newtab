import type { ReactNode } from 'react'
import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'
import {
  arrangeArtboardSize,
  arrangeViewportMode,
  arrangeWorkspaceSize,
  fitArrangeArtboard,
} from './arrangeViewport'

interface ArrangeArtboardProps {
  profile: CanvasProfileKey
  physicalViewport: { width: number; height: number }
  inspectorOpen: boolean
  children: ReactNode
}

export default function ArrangeArtboard({
  profile,
  physicalViewport,
  inspectorOpen,
  children,
}: ArrangeArtboardProps) {
  const viewportMode = arrangeViewportMode(physicalViewport.width)
  const logical = arrangeArtboardSize(profile)
  const workspace = arrangeWorkspaceSize(physicalViewport, viewportMode, inspectorOpen)
  const fitted = fitArrangeArtboard(logical, workspace)

  return (
    <div
      data-testid="arrange-artboard"
      data-arrange-artboard=""
      data-arrange-profile={profile}
      data-arrange-viewport-mode={viewportMode}
      data-arrange-inspector-open={inspectorOpen ? 'true' : 'false'}
      className="arrange-artboard-workspace"
    >
      <div
        data-arrange-artboard-viewport=""
        className="arrange-artboard-viewport"
        style={{ width: `${fitted.width}px`, height: `${fitted.height}px` }}
      >
        <div
          data-testid="arrange-artboard-logical"
          data-arrange-artboard-logical=""
          data-arrange-scale={fitted.scale}
          className="arrange-artboard-logical"
          inert
          style={{
            width: `${logical.width}px`,
            height: `${logical.height}px`,
            transform: `scale(${fitted.scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
