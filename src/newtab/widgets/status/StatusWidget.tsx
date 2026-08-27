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
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import TierFrame, { ResourceFrameStatus, resourceFrameState } from '../shared/TierFrame'
import StatusTooltip from './StatusTooltip'

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

export default function StatusWidget({
  canvasSize,
  presentation = 'free',
  docked,
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
} = {}) {
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
      canvasSize={canvasSize}
      presentation={presentation}
      docked={docked}
    />
  )
}

function StatusInner({
  config,
  services,
  canvasSize,
  presentation,
  docked,
}: {
  config: StatusConfig
  services: { name: string; url: string }[]
  canvasSize?: CanvasSize
  presentation: WidgetPresentationMode
  docked?: boolean
}) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` forward (though fetchStatus
  // deliberately ignores it — see status.ts's own doc comment: a failed
  // recheck reports `unknown`, never a stale cached `none`). No cached data
  // yet (first-ever load still in flight, or a total failure) renders
  // nothing rather than an empty shell — same as every other connector
  // widget.
  const { data, state } = useConnectorSnapshot<StatusData>('status', config, (prev) =>
    fetchStatus(services, prev),
  )
  const tier = canvasSize ?? 'standard'
  if (!data) {
    if (docked) return null
    const frameState = resourceFrameState(state)
    if (presentation === 'stack') {
      return <ResourceFrameStatus label="Service status" tier={tier} state={frameState === 'hard-error' ? 'hard-error' : 'loading'} />
    }
    return (
      <StatusIntrinsicState
        state={frameState === 'hard-error' ? 'hard-error' : 'loading'}
        copy={frameState === 'hard-error' ? 'Service status unavailable.' : 'Checking service status...'}
      />
    )
  }

  // fetchStatus returns one entry per configured service, INDEX-ALIGNED with
  // `services` (its own doc comment) — rendered as-is, in configured order,
  // for the dot row.
  const rows = data.services
  if (rows.length === 0) {
    if (docked) return null
    if (presentation === 'stack') {
      return <ResourceFrameStatus label="Service status" tier={tier} state="empty" message="No service results right now." />
    }
    return <StatusIntrinsicState state="empty" copy="No service results right now." />
  }

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

  const tone = trouble.length > 0
    ? (hasSevereTrouble ? 'critical' : 'attention')
    : unknownCount > 0 ? 'unknown' : 'quiet'
  // The accessible name still carries the words the visible strip dropped
  // (owner-reported 2026-08-21: "All operational" and "4 services" were
  // whitespace). Sighted users read the dots; a screen reader still hears
  // the summary, so removing the text cost nothing in meaning.
  const summaryLabel = `Service status: ${summaryValue}, ${rows.length} services`

  // Docked tier: the dots are the complete static readout. The former detail
  // panel repeated the same provider descriptions without adding an action.
  if (docked) {
    return <StatusDock rows={rows} tone={tone} label={summaryLabel} />
  }

  const framed = presentation === 'stack'
  const compact = tier === 'compact'
  const visibleRows = framed && tier === 'compact' ? rows.slice(0, 4) : rows
  const body = (
    <>
      {!compact ? <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Service status</h2>
      </div> : null}
      <span data-status-summary className="sr-only">{summaryValue}, {rows.length} services</span>
      <div data-work-pulse-detail data-work-pulse-status-dots data-testid="status-dots" className={`${compact ? '' : 'mt-1'} flex flex-wrap gap-x-3 gap-y-1`}>
        {visibleRows.map((service, index) => compact ? (
          <StatusTooltip key={index} service={service}>
            <span className={`size-2 rounded-full ${dotClass(service.indicator)}`} aria-hidden />
            <span className={`max-w-24 truncate text-[11px] leading-4 ${presentation === 'free' ? 'text-canvas-fg-muted' : 'text-fg-muted'}`}>
              {service.name}
            </span>
          </StatusTooltip>
        ) : (
          <span key={index} title={dotTitle(service)} className="flex min-w-0 items-center gap-1.5">
            <span className={`size-2 rounded-full ${dotClass(service.indicator)}`} aria-hidden />
            <span className={`max-w-24 truncate text-[11px] leading-4 ${presentation === 'free' ? 'text-canvas-fg-muted' : 'text-fg-muted'}`}>
              {service.name}
            </span>
          </span>
        ))}
      </div>
      {tier !== 'compact' ? trouble.map((service, index) => (
        <p key={index} data-work-pulse-rows className="text-photo mt-1 truncate text-sm text-red-400">
          {service.name}: {service.description}
        </p>
      )) : null}
    </>
  )

  if (presentation === 'stack') {
    return (
      <TierFrame label="Service status" tier={tier} state={resourceFrameState(state)} data-status-tone={tone} className={`${tier === 'compact' ? 'p-2' : 'p-3'} text-left`}>
        {body}
      </TierFrame>
    )
  }

  return (
    <section aria-label="Service status" data-service-status-surface="intrinsic" data-status-tone={tone} className="text-photo grid w-fit max-w-[320px] gap-1 text-left text-canvas-fg">
      {body}
    </section>
  )
}

function StatusIntrinsicState({
  state,
  copy,
}: {
  state: 'loading' | 'empty' | 'hard-error'
  copy: string
}) {
  return (
    <section aria-label="Service status" data-service-status-surface="intrinsic" className="text-photo w-fit text-sm text-canvas-fg-muted">
      <p role={state === 'hard-error' ? 'alert' : 'status'}>{copy}</p>
    </section>
  )
}

/** Static dock readout: provider dots retain titles and one complete
 *  accessible summary without introducing a dead details interaction. */
function StatusDock({
  rows,
  tone,
  label,
}: {
  rows: readonly ServiceStatus[]
  tone: 'quiet' | 'attention' | 'critical' | 'unknown'
  label: string
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-dock-line=""
      data-status-tone={tone}
      className="dock-line text-left"
    >
      {rows.map((service, index) => (
        <span key={index} title={dotTitle(service)} className={`size-2 rounded-full ${dotClass(service.indicator)}`} />
      ))}
    </div>
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
