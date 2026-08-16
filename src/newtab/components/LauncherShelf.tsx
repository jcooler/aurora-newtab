import type { CSSProperties, ReactNode } from 'react'
import type { StageAllocation, StageRect } from '../../lib/layout/adaptiveStage'

const LAUNCHER_IDS = new Set<StageAllocation['id']>(['links', 'bookmarks'])

export interface LauncherShelfLayout {
  zone: Exclude<StageAllocation['zone'], 'dock'>
  rect: StageRect
  allocations: [StageAllocation, StageAllocation]
}

function end(start: number, span: number): number {
  return start + span
}

function finiteRect(allocation: StageAllocation): allocation is StageAllocation & { rect: StageRect } {
  const rect = allocation.rect
  return allocation.zone !== 'dock' && rect !== null &&
    [rect.colStart, rect.rowStart, rect.colSpan, rect.rowSpan].every(Number.isFinite) &&
    rect.colStart >= 1 && rect.rowStart >= 1 && rect.colSpan >= 1 && rect.rowSpan >= 1
}

/** Resolve only a true shared shelf: both launcher allocations must occupy
 *  edge-adjacent planner rectangles. Separated, overlapping, or Dock items
 *  remain ordinary BoardItems rather than inventing a second layout authority. */
export function resolveLauncherShelf(allocations: readonly StageAllocation[]): LauncherShelfLayout | null {
  const launchers = allocations.filter((allocation) => LAUNCHER_IDS.has(allocation.id))
  if (launchers.length !== 2 || !launchers.every(finiteRect)) return null

  const [first, second] = launchers as [StageAllocation & { rect: StageRect }, StageAllocation & { rect: StageRect }]
  if (first.zone !== second.zone || first.zone === 'dock') return null

  const horizontal = first.rect.rowStart === second.rect.rowStart &&
    first.rect.rowSpan === second.rect.rowSpan &&
    (end(first.rect.colStart, first.rect.colSpan) === second.rect.colStart ||
      end(second.rect.colStart, second.rect.colSpan) === first.rect.colStart)
  const vertical = first.rect.colStart === second.rect.colStart &&
    first.rect.colSpan === second.rect.colSpan &&
    (end(first.rect.rowStart, first.rect.rowSpan) === second.rect.rowStart ||
      end(second.rect.rowStart, second.rect.rowSpan) === first.rect.rowStart)
  if (!horizontal && !vertical) return null

  const colStart = Math.min(first.rect.colStart, second.rect.colStart)
  const rowStart = Math.min(first.rect.rowStart, second.rect.rowStart)
  const colEnd = Math.max(end(first.rect.colStart, first.rect.colSpan), end(second.rect.colStart, second.rect.colSpan))
  const rowEnd = Math.max(end(first.rect.rowStart, first.rect.rowSpan), end(second.rect.rowStart, second.rect.rowSpan))
  const rebase = (allocation: StageAllocation & { rect: StageRect }): StageAllocation => ({
    ...allocation,
    rect: {
      ...allocation.rect,
      colStart: allocation.rect.colStart - colStart + 1,
      rowStart: allocation.rect.rowStart - rowStart + 1,
    },
  })

  return {
    zone: first.zone,
    rect: { colStart, rowStart, colSpan: colEnd - colStart, rowSpan: rowEnd - rowStart },
    allocations: [rebase(first), rebase(second)],
  }
}

type ShelfStyle = CSSProperties & {
  '--launcher-shelf-cols': string
  '--launcher-shelf-rows': string
}

export default function LauncherShelf({
  layout,
  children,
}: {
  layout: LauncherShelfLayout
  children: ReactNode
}) {
  const style: ShelfStyle = {
    '--launcher-shelf-cols': String(layout.rect.colSpan),
    '--launcher-shelf-rows': String(layout.rect.rowSpan),
    gridColumn: `${layout.rect.colStart} / span ${layout.rect.colSpan}`,
    gridRow: `${layout.rect.rowStart} / span ${layout.rect.rowSpan}`,
  }
  return (
    <div data-launcher-shelf="" role="group" aria-label="Launchers" style={style}>
      {children}
    </div>
  )
}
