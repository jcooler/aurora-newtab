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

const DOCK_COMPAT_INLINE_FLOORS: Readonly<Partial<Record<WidgetRegistryEntry['id'], string>>> = {
  search: '20rem',
  bookmarks: '19.375rem',
  sun: '12.5rem',
  moon: '12.5rem',
  habits: '12.5rem',
  monthCal: '12.5rem',
  greeting: '12rem',
  rss: '18rem',
  // Canonical five-coin standard content paints 557.33px wide at the 14px
  // legibility floor; 35rem (560px) is the smallest rounded source contract
  // that contains it without hiding, clipping, or truncating a numeric cell.
  crypto: '35rem',
  ics: '18rem',
  github: '20rem',
  gitlab: '20rem',
  jira: '20rem',
  homeassistant: '20rem',
  focus: '15rem',
  links: '5rem',
}

function dockInlineSize(colSpan: number, id: WidgetRegistryEntry['id']): string {
  // W4-P4 owns condensed Dock renderers. Until then, the current one-track
  // content has a few measured compatibility floors, so publish only those
  // explicitly instead of asking size-contained descendants to contribute an
  // impossible max-content size or multiplying one renderer's floor per track.
  const minimumTerms = [
    ...Array.from({ length: colSpan }, () => 'var(--stage-track-min)'),
    ...Array.from({ length: Math.max(0, colSpan - 1) }, () => 'var(--stage-gap)'),
  ]
  const finiteMinimum = minimumTerms.length === 1 ? minimumTerms[0] : `calc(${minimumTerms.join(' + ')})`
  const compatibilityFloor = DOCK_COMPAT_INLINE_FLOORS[id]
  return compatibilityFloor ? `max(${finiteMinimum}, ${compatibilityFloor})` : finiteMinimum
}

export default function BoardItem({
  entry,
  allocation,
  profile,
  className = '',
  children,
}: BoardItemProps) {
  const colSpan = finiteSpan(allocation.colSpan)
  const rowSpan = finiteSpan(allocation.rowSpan)
  const style: BoardItemStyle = {
    '--board-col-span': String(colSpan),
    '--board-row-span': String(rowSpan),
    containerType: 'inline-size',
    // Inline-size containment intentionally removes descendant max-content
    // contribution. Give Dock wrappers the finite geometry already chosen by
    // the planner so their container queries, paint, and focus scroll range
    // remain deterministic without ancestor clipping or root scaling.
    ...(allocation.zone === 'dock' ? { inlineSize: dockInlineSize(colSpan, entry.id) } : {}),
    ...(allocation.rect ? {
      gridColumn: `${finiteSpan(allocation.rect.colStart)} / span ${colSpan}`,
      gridRow: `${finiteSpan(allocation.rect.rowStart)} / span ${rowSpan}`,
    } : {
      gridColumn: `span ${colSpan}`,
      gridRow: `span ${rowSpan}`,
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
