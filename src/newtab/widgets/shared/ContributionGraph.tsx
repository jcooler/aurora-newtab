// src/newtab/widgets/shared/ContributionGraph.tsx — the contribution heatmap +
// month ticks + stat line, rendered from a Contributions slice. Adapts the
// design board's Heatmap/StatLine (house tokens, A-face geometry: cell 13, gap
// 3) with one pre-ruled content-accuracy deviation from the board — the word is
// "contributions", never "commits" (the data is GitHub's contribution calendar,
// not a commit count), in the stat line AND every cell's hover title. Lives in
// widgets/shared (Task 73) — github was the first connector to use it, but the
// component itself is connector-agnostic (any Contributions-shaped slice).
import type { Contributions } from '../../../services/connectors/types'
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

// A-face geometry: 13px cells, 3px gaps. At the board's 17-column crop that is
// 17×13 + 16×3 = 269px, inside the card's 296px (w-80 − p-3) content box.
// The Full tier passes larger geometry (batch-2 owner review: "make the graph
// larger for the bigger one" — Full must use its space, not restate Standard).
const DEFAULT_CELL = 13
const DEFAULT_GAP = 3

export default function ContributionGraph({
  contributions,
  cell = DEFAULT_CELL,
  gap = DEFAULT_GAP,
  showMonthTicks = true,
}: {
  contributions: Contributions
  cell?: number
  gap?: number
  showMonthTicks?: boolean
}) {
  const CELL = cell
  const GAP = gap
  const { cells, columns, monthTicks, streak } = buildContributionGrid(contributions.days)
  const width = columns * CELL + (columns - 1) * GAP
  const pitch = CELL + GAP
  const dayCount = cells.filter(Boolean).length

  return (
    <div>
      <div
        role="img"
        aria-label={`Contribution activity over the last ${dayCount} days`}
        className="grid grid-flow-col"
        style={{
          width,
          gridTemplateRows: `repeat(7, ${CELL}px)`,
          gridAutoColumns: `${CELL}px`,
          gap: `${GAP}px`,
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            title={c ? `${c.count} contribution${c.count === 1 ? '' : 's'} · ${c.date}` : undefined}
            className="rounded-[3px]"
            style={{
              width: CELL,
              height: CELL,
              background: c ? LEVEL_BG[c.level] : 'transparent',
              // Inset hairline on filled cells — the board's quiet edge that keeps
              // the darkest levels legible against the panel.
              boxShadow: c ? 'inset 0 0 0 1px rgba(245,245,244,0.04)' : undefined,
            }}
          />
        ))}
      </div>

      {/* Quiet mono month ticks, absolutely positioned at each labelled column. */}
      {showMonthTicks && (
        <div data-contribution-months className="relative mt-1.5" style={{ width, height: 12 }} aria-hidden>
          {monthTicks.map((m) => (
            <span
              key={m.col}
              className="absolute font-mono text-[11px] uppercase tracking-wide text-fg-muted/55"
              style={{ left: m.col * pitch }}
            >
              {m.text}
            </span>
          ))}
        </div>
      )}

      {/* Stat line: bright tabular total, accent tabular streak — the card's one
          accent point. "contributions", not the board's "commits". */}
      <p className="mt-2 text-xs text-fg-muted">
        <span className="font-semibold tabular-nums text-fg">{contributions.total}</span> contributions
        <span aria-hidden className="mx-1.5 text-fg-muted/40">
          ·
        </span>
        <span className="font-semibold tabular-nums text-accent">{streak}</span>
        <span> day streak</span>
      </p>
    </div>
  )
}
