// src/newtab/widgets/shared/ContributionGraph.tsx — the contribution heatmap +
// month ticks + stat line, rendered from a Contributions slice. Adapts the
// design board's Heatmap/StatLine (house tokens, A-face geometry: cell 13, gap
// 3) with one pre-ruled content-accuracy deviation from the board — the word is
// "contributions", never "commits" (the data is GitHub's contribution calendar,
// not a commit count), in the stat line AND every cell's hover title. Lives in
// widgets/shared (Task 73) — github was the first connector to use it, but the
// component itself is connector-agnostic (any Contributions-shaped slice).
import type { Contributions } from '../../../services/connectors/types'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { buildContributionGrid } from './contributionGrid'

// Level → cell background. Pinned by the board: an rgba ramp over Aurora's
// sky-blue accent (rgb 125 211 252) so the card reads as Aurora's own sky, NOT
// GitHub green; level 0 is a faint fg-derived empty cell. These are literal
// style values (not house token classes) because the ramp itself is the spec —
// the render Jon picked is these exact alphas.
const ACCENT = '125,211,252'
const LEVEL_BG = [
  'rgba(245,245,244,0.05)',
  `rgba(${ACCENT},0.22)`,
  `rgba(${ACCENT},0.42)`,
  `rgba(${ACCENT},0.68)`,
  `rgba(${ACCENT},1)`,
]

export const CONTRIBUTION_GRAPH_GEOMETRY = Object.freeze({
  compact: Object.freeze({ columnWidth: 10, rowHeight: 7, gap: 1 }),
  standard: Object.freeze({ columnWidth: 16, rowHeight: 10, gap: 1 }),
  full: Object.freeze({ columnWidth: 23, rowHeight: 17, gap: 2 }),
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
}: {
  contributions: Contributions
  tier: CanvasSize
  showMonthTicks?: boolean
  showSummary?: boolean
  trailingDays?: number
  fitWidth?: boolean
}) {
  const { columnWidth, rowHeight: fixedRowHeight, gap: fixedGap } = CONTRIBUTION_GRAPH_GEOMETRY[tier]
  const rowHeight = fitWidth ? tier === 'compact' ? 7 : tier === 'standard' ? 6 : 8 : fixedRowHeight
  const gap = fitWidth ? 3 : fixedGap
  const days = trailingDays ? contributions.days.slice(-trailingDays) : contributions.days
  const total = trailingDays ? days.reduce((sum, day) => sum + day.count, 0) : contributions.total
  const { cells, columns, monthTicks, streak } = buildContributionGrid(days)
  const width = columns * columnWidth + (columns - 1) * gap
  const pitch = columnWidth + gap
  const dayCount = cells.filter(Boolean).length

  return (
    <div data-contribution-composition data-contribution-tier={tier} data-contribution-fit={fitWidth || undefined} className={fitWidth ? 'w-full min-w-0' : 'mx-auto w-fit max-w-full'}>
      <div
        role="img"
        aria-label={`Contribution activity over the last ${dayCount} days`}
        className="grid grid-flow-col"
        style={{
          width: fitWidth ? '100%' : width,
          gridTemplateRows: `repeat(7, ${rowHeight}px)`,
          gridAutoColumns: fitWidth ? undefined : `${columnWidth}px`,
          gridTemplateColumns: fitWidth ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
          gap: `${gap}px`,
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            title={c ? `${c.count} contribution${c.count === 1 ? '' : 's'} · ${c.date}` : undefined}
            className="rounded-[3px]"
            style={{
              width: fitWidth ? '100%' : columnWidth,
              height: rowHeight,
              background: c ? fitWidth ? c.level === 0 ? 'var(--control-bg)' : `color-mix(in srgb, var(--accent) ${[0, 25, 45, 70, 100][c.level]}%, transparent)` : LEVEL_BG[c.level] : 'transparent',
              // Inset hairline on filled cells — the board's quiet edge that keeps
              // the darkest levels legible against the panel.
              boxShadow: c ? 'inset 0 0 0 1px rgba(245,245,244,0.04)' : undefined,
            }}
          />
        ))}
      </div>

      {/* Quiet mono month ticks, absolutely positioned at each labelled column. */}
      {showMonthTicks && (
        <div data-contribution-months className="relative mt-1.5" style={{ width: fitWidth ? '100%' : width, height: 12 }} aria-hidden>
          {monthTicks.filter((m) => !fitWidth || m.col <= columns - 4).map((m) => (
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
