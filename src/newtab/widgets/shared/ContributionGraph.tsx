// Square contribution cells with a palette independent of connector fetch settings.
// Every displayed range uses its own days, total, and streak.
import type { Contributions } from '../../../services/connectors/types'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { buildContributionGrid } from './contributionGrid'
import { GRAPH_PALETTES, type GraphColor } from '../../../lib/widgetAppearance'

// Fixed maximum cell sizes keep seven rows inside every supported frame.
export const CONTRIBUTION_GRAPH_GEOMETRY = Object.freeze({
  compact: Object.freeze({ columnWidth: 7, rowHeight: 7, gap: 2 }),
  standard: Object.freeze({ columnWidth: 9, rowHeight: 9, gap: 2 }),
  full: Object.freeze({ columnWidth: 6, rowHeight: 6, gap: 2 }),
}) satisfies Readonly<Record<CanvasSize, Readonly<{
  columnWidth: number
  rowHeight: number
  gap: number
}>>>

export default function ContributionGraph({
  contributions,
  tier,
  showMonthTicks = true,
  showSummary = true,
  trailingDays,
  fitWidth = false,
  color = 'blue',
}: {
  contributions: Contributions
  tier: CanvasSize
  showMonthTicks?: boolean
  showSummary?: boolean
  trailingDays?: number
  fitWidth?: boolean
  color?: GraphColor
}) {
  const { columnWidth, rowHeight, gap } = CONTRIBUTION_GRAPH_GEOMETRY[tier]
  const days = trailingDays ? contributions.days.slice(-trailingDays) : contributions.days
  const total = trailingDays ? days.reduce((sum, day) => sum + day.count, 0) : contributions.total
  const { cells, columns, monthTicks, streak } = buildContributionGrid(days, fitWidth ? trailingDays : undefined)
  const width = columns * columnWidth + (columns - 1) * gap
  const pitch = columnWidth + gap
  const dayCount = cells.filter(cell => cell && !cell.unavailable).length
  const unavailable = cells.some(cell => cell?.unavailable)
  const visibleMonthTicks = fitWidth ? monthTicks.filter((m) => m.col <= columns - 4).reduce<typeof monthTicks>((visible, tick) => {
    if (visible.length === 0 || tick.col - visible[visible.length - 1].col >= 4) visible.push(tick)
    return visible
  }, []) : monthTicks

  return (
    <div data-contribution-composition data-contribution-tier={tier} data-contribution-color={color} data-contribution-fit={fitWidth || undefined} className={fitWidth ? 'w-full min-w-0' : 'mx-auto w-fit max-w-full'} style={{ maxWidth: fitWidth ? undefined : width }}>
      <div
        role="img"
        aria-label={`Contribution activity over the last ${unavailable ? trailingDays : dayCount} days${unavailable ? `; ${dayCount} days available` : ''}`}
        className="grid grid-flow-col"
        style={{
          width: fitWidth ? '100%' : width,
          maxWidth: fitWidth && tier !== 'compact' ? undefined : width,
          marginInline: 'auto',
          gridTemplateRows: fitWidth ? 'repeat(7, auto)' : `repeat(7, ${rowHeight}px)`,
          gridAutoColumns: fitWidth ? undefined : `${columnWidth}px`,
          gridTemplateColumns: fitWidth ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
          gap: `${gap}px`,
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            title={c ? c.unavailable ? `No activity data available · ${c.date}` : `${c.count} contribution${c.count === 1 ? '' : 's'} · ${c.date}` : undefined}
            data-contribution-unknown={c?.unavailable || undefined}
            className="rounded-[1px]"
            style={{
              width: fitWidth ? '100%' : columnWidth,
              height: fitWidth ? undefined : rowHeight,
              aspectRatio: '1 / 1',
              background: c && !c.unavailable ? c.level === 0 ? 'var(--control-bg)' : `color-mix(in srgb, var(--graph-palette-${color}, ${GRAPH_PALETTES[color]}) ${[0, 25, 45, 70, 100][c.level]}%, transparent)` : 'transparent',
              // Inset hairline on filled cells — the board's quiet edge that keeps
              // the darkest levels legible against the panel.
              boxShadow: c ? c.unavailable ? 'inset 0 0 0 1px var(--control-bg)' : 'inset 0 0 0 1px rgba(245,245,244,0.04)' : undefined,
            }}
          />
        ))}
      </div>

      {/* Quiet mono month ticks, absolutely positioned at each labelled column. */}
      {showMonthTicks && (
        <div data-contribution-months className="relative mt-1.5" style={{ width: fitWidth ? '100%' : width, height: 12 }} aria-hidden>
          {visibleMonthTicks.map((m) => (
            <span
              key={m.col}
              className="absolute font-mono text-[11px] uppercase tracking-wide text-fg-muted/55"
              style={{ left: fitWidth ? `${m.col / columns * 100}%` : m.col * pitch }}
            >
              {m.text}
            </span>
          ))}
        </div>
      )}

      {/* Stat line: bright tabular total, accent tabular streak — the card's one
          accent point. "contributions", not the board's "commits". */}
      {showSummary ? (
        <p data-contribution-summary className="mt-2 text-xs text-fg-muted">
          <span className="font-semibold tabular-nums text-fg">{total}</span> contributions
          <span aria-hidden className="mx-1.5 text-fg-muted/40">
            ·
          </span>
          <span className="font-semibold tabular-nums text-accent">{streak}</span>
          <span> day streak</span>
        </p>
      ) : null}
    </div>
  )
}
