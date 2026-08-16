import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import {
  fetchStatus,
  statusServicesOf,
  type ServiceStatus,
  type StatusData,
  type StatusIndicator,
} from '../../../services/connectors/status'
import type { StatusConfig } from '../../../services/connectors/types'
import WorkPulseSummary from '../shared/WorkPulseSummary'

// The status widget — Task 84 (W3-SP2), the eighth connector and the third
// no-auth one (crypto.ts/ics.ts's own company) to reach the newtab page.
// QUIET DOTS, LOUD ONLY WHEN SOMETHING BREAKS: the whole point of a status
// strip is that an all-green day is nearly invisible (dots only, zero
// trouble text) and a bad day is the ONE thing that gets a red line — see
// the trouble-line construction below.

// Construction-time cap on rendered trouble lines — same "the cap belongs to
// the widget, not the data" reasoning as CalendarWidget's MAX_AGENDA_ROWS: a
// user who wires up all MAX_SERVICES=8 curated services during a genuinely
// bad outage day should still see a strip, not a wall of red text eating the
// bottom band.
const MAX_TROUBLE_LINES = 3

const SEVERITY_RANK: Record<'critical' | 'major' | 'minor', number> = {
  critical: 0,
  major: 1,
  minor: 2,
}

export default function StatusWidget() {
  // Zero-hooks-in-the-gate split, same as every other connector widget
  // (CryptoWidget.tsx's own doc comment, the Task 84 brief's named
  // template): the one useStoredKey read runs every render (Rules of Hooks
  // stay satisfied), but a disabled connector, or an enabled one with no
  // services configured yet, never mounts StatusInner and therefore never
  // runs useConnectorSnapshot's own subscribe/refresh. statusServicesOf
  // (Task 83) is the one read-time boundary that tolerates a hand-edited or
  // backup-restored config missing `services` entirely.
  const [connectors] = useStoredKey('connectors')
  const status = connectors?.status as StatusConfig | undefined
  const services = statusServicesOf(status)
  if (!status?.enabled || services.length === 0) return null
  // key: a config change (add/remove a service, via Task 85's settings card)
  // REMOUNTS the inner widget so it fetches against the new service list from
  // a clean slate — the SAME remount-key discipline as CalendarWidget's own
  // `key={[view, upcomingCount, ...calendars.map(c => c.url)].join('\n')}`.
  // The remount ALONE does not force a refetch — useConnectorSnapshot only
  // fetches when the cached snapshot is stale or absent. What actually makes
  // an add/remove refresh immediately is Task 85's settings card deleting
  // connectorSnapshots.status as part of that same write (the ics/IcsBody
  // pact, restated here for status: THE PACT — a services-list-changing save
  // clears the snapshot; a config change that doesn't touch the list does
  // not) — the remounted widget then finds no snapshot at all and fetches
  // right away.
  return (
    <StatusInner
      key={services.map((service) => service.url).join('\n')}
      config={status}
      services={services}
    />
  )
}

function StatusInner({
  config,
  services,
}: {
  config: StatusConfig
  services: { name: string; url: string }[]
}) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` forward (though fetchStatus
  // deliberately ignores it — see status.ts's own doc comment: a failed
  // recheck reports `unknown`, never a stale cached `none`). No cached data
  // yet (first-ever load still in flight, or a total failure) renders
  // nothing rather than an empty shell — same as every other connector
  // widget.
  const { data } = useConnectorSnapshot<StatusData>('status', config, (prev) =>
    fetchStatus(services, prev),
  )
  if (!data) return null

  // fetchStatus returns one entry per configured service, INDEX-ALIGNED with
  // `services` (its own doc comment) — rendered as-is, in configured order,
  // for the dot row.
  const rows = data.services

  // Trouble = minor/major/critical — unknown is explicitly NOT trouble (a
  // gray "couldn't check" dot, not a red claim that something is actually
  // broken). Worst-first (critical > major > minor); Array#sort is stable,
  // so services tied at the same severity keep their configured relative
  // order. Capped at MAX_TROUBLE_LINES, a construction-time slice — not a
  // "show more" affordance.
  const trouble = rows
    .filter(
      (s): s is ServiceStatus & { indicator: 'minor' | 'major' | 'critical' } =>
        s.indicator === 'minor' || s.indicator === 'major' || s.indicator === 'critical',
    )
    .sort((a, b) => SEVERITY_RANK[a.indicator] - SEVERITY_RANK[b.indicator])
    .slice(0, MAX_TROUBLE_LINES)
  const unknownCount = rows.filter((service) => service.indicator === 'unknown').length
  const hasSevereTrouble = trouble.some((service) => service.indicator === 'major' || service.indicator === 'critical')
  const summaryValue = trouble.length > 0
    ? `${trouble.length} service ${trouble.length === 1 ? 'issue' : 'issues'}`
    : unknownCount > 0
      ? `${unknownCount} unreachable`
      : 'All operational'

  return (
    // A slim floating STRIP, not a panel — the SAME `w-88 text-center`
    // language as CryptoWidget's own section (see that file's doc comment
    // for why: centering is the bottom band's job via its own `items-center`,
    // not this widget's or the PositionedBlock className's). FIRST child of
    // the bottom band (App.tsx), above crypto.
    <section aria-label="Service status" className="w-88 text-center">
      <h2 className="text-sm font-semibold text-fg">Service status</h2>
      <WorkPulseSummary
        label="Service status"
        value={summaryValue}
        tone={trouble.length > 0 ? (hasSevereTrouble ? 'critical' : 'attention') : unknownCount > 0 ? 'unknown' : 'quiet'}
        metadata={`${rows.length} services`}
      />
      <div data-work-pulse-detail className="flex justify-center gap-2">
        {rows.map((s, i) => (
          <span key={i} title={dotTitle(s)} className={`size-2 rounded-full ${dotClass(s.indicator)}`} />
        ))}
      </div>
      {trouble.map((s, i) => (
        // FIX ROUND (post-Task 86, controller-approved): the OUTER
        // PositionedBlock (App.tsx) now reveals this whole section at a
        // NEW, LOWER `ampler` floor (>=922h — see index.css's own doc
        // comment) sized for the dot row alone, so the glance-value dots
        // survive Jon's canonical 1600x900. The trouble TEXT still needs the
        // taller `tallest` floor (>=1042h) — Task 86's own measured number,
        // UNCHANGED, just re-scoped from "the whole strip's floor" to "this
        // text's own floor" (see App.tsx's bottom-zone comment and
        // index.css's `tallest` doc comment for the arithmetic: a
        // service with trouble text showing is a taller status block than
        // dots alone, and it's THIS number that proves the taller block
        // still clears the links row). `text-photo` is the house
        // photo-floating-text shadow (index.css's own `@utility
        // text-photo`) — this line sits directly on the background photo,
        // same as every other bottom-band text (crypto's own price/change
        // spans), so it needs the same legibility treatment; it never had
        // it before this fix round.
        <p key={i} data-work-pulse-rows className="hidden tallest:block mt-1 truncate text-sm text-red-400 text-photo">
          {s.name} — {s.description}
        </p>
      ))}
    </section>
  )
}

/** indicator -> dot color. none is the only "healthy" color (emerald);
 *  unknown gets its own muted gray rather than reusing red/amber — an
 *  unreachable check is a DIFFERENT claim than a confirmed problem (see
 *  status.ts's own doc comment on why fetchStatus never carries a stale
 *  `prev` indicator forward through a failed recheck).
 *
 *  FIX ROUND: unknown's ink was `bg-fg-muted/40` — PANEL-adaptive ink
 *  (re-tints toward black under a light `panelColor` pick, src/theme's own
 *  applyPanelColor). Wrong axis: this strip floats directly on the
 *  background PHOTO, never on a panel (same reasoning CryptoWidget.tsx's own
 *  zero-tint cell already documents for its own `text-canvas-fg-muted`
 *  choice over plain `text-fg-muted`) — a light panelColor pick would have
 *  silently dropped this dot toward near-black, low-contrast against a
 *  typically darker photo, while every OTHER indicator's color (emerald/
 *  amber/red-400 below) stays fixed regardless of panelColor. `-canvas-`
 *  is the FIXED, theme-independent ink family (index.css's `@theme inline`
 *  registers `--color-canvas-fg-muted`, themes.css pins its value), so
 *  `bg-canvas-fg-muted/40` now matches every other dot's own
 *  panelColor-independence. Numerically identical to the old class at
 *  DEFAULT settings (`--canvas-fg-muted` and `--fg-muted` share the same
 *  default `rgb(245 245 244 / 0.68)`) — Task 86's own pixel-sample probe
 *  (scripts/preview.mjs) measured `rgb(66, 66, 66)` before this change and
 *  still does after it; the fix only matters once a user picks a light
 *  panel. */
function dotClass(indicator: StatusIndicator): string {
  switch (indicator) {
    case 'none':
      return 'bg-emerald-400'
    case 'minor':
      return 'bg-amber-400'
    case 'major':
    case 'critical':
      return 'bg-red-400'
    case 'unknown':
      return 'bg-canvas-fg-muted/40'
  }
}

/** `{name}: {description}` for every real indicator, `{name}: unreachable`
 *  for unknown — unknown's `description` is always '' (fetchOneStatus never
 *  fills it on that path), so a bare `{name}: ` would read as broken copy
 *  rather than an honest "couldn't check" statement. */
function dotTitle(s: ServiceStatus): string {
  return s.indicator === 'unknown' ? `${s.name}: unreachable` : `${s.name}: ${s.description}`
}
