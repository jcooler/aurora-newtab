import type { CSSProperties, ReactNode } from 'react'
import type { StageAllocation } from '../../lib/layout/adaptiveStage'
import type { LayoutProfile } from '../../lib/layout/types'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from './WidgetBoundary'

interface BoardItemProps {
  entry: WidgetRegistryEntry
  allocation: StageAllocation
  profile: LayoutProfile
  className?: string
  children: ReactNode
}

type BoardItemStyle = CSSProperties & {
  '--board-col-span': string
  '--board-row-span': string
}

function finiteSpan(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1
}

export default function BoardItem({
  entry,
  allocation,
  profile,
  className = '',
  children,
}: BoardItemProps) {
  const style: BoardItemStyle = {
    '--board-col-span': String(finiteSpan(allocation.colSpan)),
    '--board-row-span': String(finiteSpan(allocation.rowSpan)),
    // Dock columns are intrinsically sized. Inline-size containment would
    // remove their contents from that calculation and collapse link-only
    // launchers to zero; finite Stage zones keep container-query ownership.
    containerType: allocation.zone === 'dock' ? 'normal' : 'inline-size',
    ...(allocation.rect ? {
      gridColumn: `${finiteSpan(allocation.rect.colStart)} / span ${finiteSpan(allocation.colSpan)}`,
      gridRow: `${finiteSpan(allocation.rect.rowStart)} / span ${finiteSpan(allocation.rowSpan)}`,
    } : {
      gridColumn: `span ${finiteSpan(allocation.colSpan)}`,
      gridRow: `span ${finiteSpan(allocation.rowSpan)}`,
    }),
  }

  return (
    <div
      data-block-id={entry.id}
      data-stage-profile={profile}
      data-stage-zone={allocation.zone}
      data-stage-variant={allocation.variant}
      data-stage-priority={allocation.priority}
      data-stage-dock-reason={allocation.dockReason}
      className={`board-item board-item--${allocation.zone}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
    </div>
  )
}
