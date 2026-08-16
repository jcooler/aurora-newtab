import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchVercel, DEFAULT_VERCEL_VIEWS, relAge, type VercelData, type VercelDeployment } from '../../../services/connectors/vercel'
import { resolveViews } from '../../../services/connectors/views'
import type { ConnectorConfig, VercelConfig, VercelViews } from '../../../services/connectors/types'

const MAX_DEPLOYMENTS = 5

// Fixed presentation order for the status-summary line's segments — a status
// summary reads as a stable "success / failure / in-progress" line (READY ->
// ERROR -> BUILDING -> QUEUED -> CANCELED, the five states vercel.ts's own
// comment documents the API returning), NOT a frequency ranking: unlike
// jira's counts chip (which genuinely surfaces "what's most common" and is
// sorted by count), reordering THIS line as counts drift between refreshes
// would be visually noisy for very little information gained — a status
// summary should read the same way every time. Anything OUTSIDE this list
// (an unrecognized future state) is appended after, in first-seen order —
// defensive, same "filter, don't throw / never silently drop" discipline as
// the rest of the connector layer.
const STATE_ORDER = ['READY', 'ERROR', 'BUILDING', 'QUEUED', 'CANCELED']

/** Counts deployments by their RAW state string and orders them per
 *  STATE_ORDER (unknown states trail, in first-seen order). Takes the
 *  UNSLICED deployments array — the brief is explicit: the summary must stay
 *  honest even when the rows section below is capped at MAX_DEPLOYMENTS or
 *  turned off entirely, so it counts from the full snapshot, never the
 *  display-capped slice. A state that never occurs is never a key in
 *  `counts` and therefore never a result entry — that IS "states with 0
 *  omitted" per the brief; no separate zero-filter is needed. */
function summaryEntries(deployments: VercelDeployment[]): [string, number][] {
  const counts: Record<string, number> = {}
  const seenOrder: string[] = []
  for (const d of deployments) {
    if (!(d.state in counts)) seenOrder.push(d.state)
    counts[d.state] = (counts[d.state] ?? 0) + 1
  }
  const known = STATE_ORDER.filter((s) => s in counts)
  const rest = seenOrder.filter((s) => !STATE_ORDER.includes(s))
  return [...known, ...rest].map((s): [string, number] => [s, counts[s]])
}

/** Narrow `connectors.vercel` (a ConnectorConfig union member, or undefined)
 *  to a CONNECTED VercelConfig, defensively — same rationale and shape as
 *  GithubWidget's connectedGithub: schema.ts ties every connector id to the
 *  whole union rather than its specific member, and a hand-edited backup can
 *  legally restore { enabled: true } with no token at all. Gate defends
 *  token string-ness (the one field the fetch below needs). */
function connectedVercel(config: ConnectorConfig | undefined): VercelConfig | null {
  if (!config || !('token' in config)) return null
  const vercel = config as VercelConfig
  if (!vercel.enabled || typeof vercel.token !== 'string' || vercel.token.length === 0) return null
  return vercel
}

export default function VercelWidget() {
  // Zero-hooks-in-the-gate split, same as GithubWidget/GitlabWidget/JiraWidget:
  // the one useStoredKey read runs every render (Rules of Hooks stay
  // satisfied), but a disabled/unconnected connector never mounts VercelInner
  // and therefore never runs useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const vercel = connectedVercel(connectors?.vercel)
  if (!vercel) return null
  return (
    <VercelInner
      vercel={vercel}
      token={vercel.token}
      views={resolveViews(DEFAULT_VERCEL_VIEWS, vercel.views)}
    />
  )
}

function VercelInner({
  vercel,
  token,
  views,
}: {
  vercel: VercelConfig
  token: string
  views: VercelViews
}) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so fetchVercel's
  // quiet-failure path keeps it (no ETag round-trip here — see vercel.ts's
  // own doc comment). No cached data yet (first-ever load in flight, or a
  // total failure) renders nothing rather than an empty shell — same as
  // every other connector widget. The user's resolved views gate the fetch
  // (fetchVercel skips the request when BOTH sections are off — see its own
  // doc comment) AND this render (below).
  const { data } = useConnectorSnapshot<VercelData>('vercel', vercel, (prev) =>
    fetchVercel(token, views, prev),
  )
  if (!data) return null

  // UNSLICED — the status summary below counts EVERY deployment the
  // endpoint returned, not just the MAX_DEPLOYMENTS rows the list displays
  // (or even when that section is off entirely), so its counts stay honest
  // regardless of the rows section's own view/cap (see summaryEntries).
  const allDeployments = data.deployments ?? []
  // A disabled rows section is empty regardless of what the snapshot still
  // carries. fetchVercel already returns deployments failed-first-then-
  // recency sorted (vercel.ts's sortDeployments) — this widget renders that
  // order as-is rather than re-sorting, same division of labor as every
  // other connector widget (the service owns ordering, the widget owns
  // display).
  const deployments = views.deployments ? allDeployments.slice(0, MAX_DEPLOYMENTS) : []
  // The empty-connected copy is gated on the ROWS section being on AND
  // truly empty — same "a disabled section shows neither its rows nor its
  // own empty line" rule github/gitlab/jira apply.
  const showRowsEmpty = views.deployments && deployments.length === 0

  const summary = summaryEntries(allDeployments)
  // Renders only when there's something to summarize — "renders only when
  // deployments non-empty" per the brief. allDeployments.length>0 iff
  // summary.length>0 (every deployment lands in exactly one entry), either
  // check is equivalent; this one matches the brief's own wording.
  const showSummary = views.statusSummary && allDeployments.length > 0

  // No-husk law (wave 2, generalized — the same rule github/gitlab/jira
  // apply): render null when NOTHING inside the card would render — no
  // summary line, no rows, and no "No deployments yet." line (which itself
  // requires the rows section to be ON). statusSummary-only with no
  // deployments is the canonical case; both-views-off is the degenerate one
  // (fetchVercel already skips the request for it, but a STALE cached
  // snapshot from before both were turned off must still degrade to null
  // here, not a bare "Vercel" heading).
  if (!showSummary && deployments.length === 0 && !showRowsEmpty) return null

  // Sole impure boundary in this component: `now` for relAge's age math,
  // read once per render (not per row) so every row in one paint measures
  // against the same instant. relAge itself stays pure and unit-tested at
  // exact second boundaries (vercel.test.ts).
  const now = Date.now()

  // The Adaptive Stage owns collision and Dock allocation. This connector
  // therefore stays represented at every height; semantic variant work may
  // reduce detail but cannot hide the entire section.
  return (
    // Floating panel surface — identical shape/elevation to every other
    // connector card (the house rule for floating surfaces): the solid panel
    // token, rounded-2xl/shadow-lg/p-4, w-80 fixed card width. Vercel sits in
    // the LEFT column (not the right rail's Task 55 budget), so its p-4/mb-2
    // chrome stays untouched — see GithubWidget.tsx's own MAX_PRS comment.
    <section aria-label="Vercel" className="w-80 rounded-2xl bg-panel-solid p-4 dense:p-2 text-fg shadow-lg">
      <h2 className="mb-2 dense:mb-1 text-sm font-semibold text-fg">Vercel</h2>

      {/* Status summary — a one-line chips row, order-pinned ABOVE the
          deployment rows (brief: summary line -> rows). Its own mb-2/
          dense:mb-1 bottom margin follows the h2's own idiom rather than
          ROW_SEP's bordered divider (gitlab/jira reserve that border for
          separating two ROWS lists; this is a compact header-adjacent line,
          not a list, so no divider). */}
      {showSummary && (
        <p className="mb-2 dense:mb-1 text-xs text-fg-muted">
          {summary.map(([state, count], i) => (
            <span key={state}>
              {i > 0 && (
                <span aria-hidden className="mx-1.5 text-fg-muted/40">
                  ·
                </span>
              )}
              {/* Only ERROR gets the danger tone (the same red hue
                  stateClass below uses for its row chip); every OTHER state
                  — including READY — stays muted here, deliberately NOT
                  reusing stateClass's emerald-for-READY: the brief calls out
                  only ERROR's color for this line, and a rainbow summary
                  would compete with the rows' own per-state chips below. */}
              <span className={state === 'ERROR' ? 'text-red-400' : undefined}>{`${count} ${state.toLowerCase()}`}</span>
            </span>
          ))}
        </p>
      )}

      {showRowsEmpty && <p className="text-sm text-fg-muted">No deployments yet.</p>}

      {deployments.length > 0 && (
        <ul className="flex flex-col gap-2 dense:gap-1">
          {deployments.map((item) => (
            <DeploymentRow key={item.url} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** State -> chip color. READY/ERROR are the two states the brief calls out
 *  by name (the parked danger ruling covers ERROR's red specifically);
 *  everything else (BUILDING/QUEUED/CANCELED, or an unrecognized future
 *  state) reads as the neutral muted tone rather than guessing a color for
 *  states this widget was never told to distinguish. */
function stateClass(state: string): string {
  if (state === 'READY') return 'text-emerald-300'
  if (state === 'ERROR') return 'text-red-400'
  return 'text-fg-muted'
}

/** One deployment row: the whole row is a single external link (a new tab,
 *  and rel that severs window.opener and strips the referrer) to the
 *  deployment's inspector page, with the project name truncating first (the
 *  element most likely to overflow the fixed card width) and the state chip
 *  + relative age staying fixed-width beside it. */
function DeploymentRow({ item, now }: { item: VercelDeployment; now: number }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.project}
        className="group flex cursor-pointer items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1 truncate text-sm dense:text-xs font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.project}
        </span>
        <span className={`shrink-0 text-xs ${stateClass(item.state)}`}>{item.state}</span>
        <span data-stage-text-tier="metadata" className="shrink-0 text-xs text-fg-muted">{relAge(now, item.createdAt)}</span>
      </a>
    </li>
  )
}
