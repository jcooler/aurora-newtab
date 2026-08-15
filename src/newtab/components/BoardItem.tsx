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
    containerType: 'inline-size',
  }

  return (
    <div
      data-block-id={entry.id}
      data-stage-profile={profile}
      data-stage-zone={allocation.zone}
      data-stage-variant={allocation.variant}
      data-stage-priority={allocation.priority}
      className={`board-item board-item--${allocation.zone}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
    </div>
  )
}
