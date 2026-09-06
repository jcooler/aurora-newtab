import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchJira, DEFAULT_JIRA_VIEWS, type JiraData, type JiraIssue } from '../../../services/connectors/jira'
import { DEFAULT_GITLAB_VIEWS } from '../../../services/connectors/gitlab'
import { resolveGithubViews } from '../../../services/connectors/github'
import { resolveViews } from '../../../services/connectors/views'
import type { ConnectorConfig, JiraConfig, JiraViews, GitlabConfig, GithubConfig } from '../../../services/connectors/types'
import DockLine from '../shared/DockLine'
import WorkPulseSummary from '../shared/WorkPulseSummary'
import TierFrame, { ResourceFrameStatus, resourceFrameState } from '../shared/TierFrame'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { DEFAULT_BRIEFING_SOURCES } from '../../../lib/storage/schema'
import { attentionRuntimeScope, attentionSnapshotScope, effectiveJiraViews, type AttentionRuntimeScope } from '../../../services/connectors/attentionPolicy'

// GLANCE cap (Task 55 fix round) — this is a glance panel, not a full list
// (the counts line above already says "there's more"), and it shares the
// right column's budget below the collapsed weather chip's own tallest
// state with github's and gitlab's cards above it — the LOWEST of the
// three, so its own bottom edge is what has to clear the Tasks pill.
// Lowered from 5 — see GithubWidget.tsx's own MAX_PRS/MAX_ISSUES comment
// for the full rationale; this connector's own regression (jira's max-issue
// card overlapping the Tasks pill) is what fix round 1 was scoped to fix.
// Held at 3 (not lowered further) through fix round 2's follow-up
// regression (the weather chip's forced-worst-case floor) per the
// controller ruling that jira stays >=3 — the card's own CHROME absorbed
// that round's savings instead (`p-4`->`p-3`, `mb-2`->`mb-1.5` below).
const MAX_ISSUES = 3
// GLANCE cap for the due-soon rows (Task 75), same discipline as MAX_ISSUES:
// this is the second rows section on the lowest right-rail card, so it holds
// to 2 (below MAX_ISSUES's 3). "Due soon" is a nudge toward the deadlines that
// matter now, not the whole calendar — the assigned list and its counts already
// carry the fuller picture.
const MAX_DUE_SOON = 2

// The house eyebrow for a quiet section separator (the tasks panel + wave-1
// language): 11px, uppercased, wide-tracked, muted.
const EYEBROW = 'mb-2 dense:mb-1 text-[11px] uppercase tracking-[0.08em] text-fg-muted'
// Row separator between the assigned list and the due-soon list — always
// present when both render (mirrors github/gitlab's ROW_SEP; jira has no
// tier-gated section, so there is no graph separator variant here).
const ROW_SEP = ' mt-3 dense:mt-2 border-t border-panel-border pt-3 dense:pt-2'

/** Fix wave, Finding C1/I3 fallout: mirrors GitlabWidget.tsx's own
 *  REVIEW_ASKS_TIER_CLASS/REVIEW_ASKS_INVERSE_TIER_CLASS — `dueSoonTier`/its
 *  INVERSE must never be built from a template-interpolated tier name
 *  (Tailwind's scanner only extracts COMPLETE literal class-name strings from
 *  the source text; an interpolated one never generates the real CSS, which a
 *  jsdom unit test can't catch — it only asserts the className STRING — but
 *  the real-Chromium harness did). Literal lookup maps, keyed by the same
 *  tier-name string the reveal logic derives once. */
const DUE_SOON_TIER_CLASS: Record<'roomy' | 'roomier' | 'grand' | 'roomiest', string> = {
  roomy: ' hidden roomy:block',
  roomier: ' hidden roomier:block',
  grand: ' hidden grand:block',
  roomiest: ' hidden roomiest:block',
}
const DUE_SOON_INVERSE_TIER_CLASS: Record<'roomy' | 'roomier' | 'grand' | 'roomiest', string> = {
  roomy: ' roomy:hidden',
  roomier: ' roomier:hidden',
  grand: ' grand:hidden',
  roomiest: ' roomiest:hidden',
}

/** Narrow `connectors.jira` (a ConnectorConfig union member, or undefined) to
 *  a CONNECTED JiraConfig, defensively — same rationale and shape as
 *  gitlab's connectedGitlab (GitlabWidget.tsx): schema.ts ties every
 *  connector id to the whole union rather than its specific member, and a
 *  hand-edited backup can legally restore { enabled: true } with none of the
 *  fields at all. Gate defends site/email/apiToken string-ness — all three
 *  feed directly into the fetch below (site into the URL, email+apiToken
 *  into the Basic-auth header), so a missing/empty one must block the
 *  fetch, not just the token. */
function connectedJira(config: ConnectorConfig | undefined): JiraConfig | null {
  if (!config || !('site' in config) || !('email' in config) || !('apiToken' in config)) return null
  const jira = config as JiraConfig
  if (!jira.enabled) return null
  if (typeof jira.site !== 'string' || jira.site.length === 0) return null
  if (typeof jira.email !== 'string' || jira.email.length === 0) return null
  if (typeof jira.apiToken !== 'string' || jira.apiToken.length === 0) return null
  return jira
}

export default function JiraWidget({ canvasSize, docked }: { canvasSize?: CanvasSize; docked?: boolean } = {}) {
  // Zero-hooks-in-the-gate split, same as GithubWidget/GitlabWidget: the one
  // useStoredKey read runs every render (Rules of Hooks stay satisfied), but a
  // disabled/unconnected connector never mounts JiraInner and therefore
  // never runs useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const [settings] = useStoredKey('settings')
  if (!settings) return null
  const jira = connectedJira(connectors?.jira)
  if (!jira) return null
  const views = resolveViews(DEFAULT_JIRA_VIEWS, jira.views)
  if (!views.assigned && !views.dueSoon && !views.statusChips) return null

  // Task 77 — the due-soon section-tier fix (mirrors GitlabWidget.tsx's
  // reviewAsksTier, symmetric derivation, see index.css's
  // `roomy`/`roomier`/`roomiest` comment for the full measurement writeup).
  // `dueSoon` only threatens anything when gitlab ALSO shares the right rail
  // (gitlab sits above jira in the flow; jira is the lowest card, so ITS OWN
  // extra height is what pushes its bottom toward the Tasks pill) — same
  // conservative "enabled, not rendered" read GitlabWidget.tsx's own
  // `jiraEnabled` uses. `gitlabReviewAsksEnabled` is the sibling's OWN new
  // section (both new sections on at once needs a taller floor than either
  // alone, measured). `anyGraphEnabled` folds in BOTH possible graph owners —
  // github's or gitlab's own — since jira's bottom moves by the identical
  // +176px regardless of which card carries it.
  const gitlab = connectors?.gitlab
  const gitlabEnabled = gitlab?.enabled === true
  // Minor fix (review pass): resolveViews(DEFAULT_GITLAB_VIEWS, ...) used to be
  // called TWICE here — once for gitlabReviewAsksEnabled, once inline inside
  // anyGraphEnabled — against the identical config. Resolved ONCE into
  // `gitlabViews` (null when gitlab isn't enabled, so the two reads below stay
  // defensive without re-deriving); both booleans then just read a field off it.
  const gitlabViews = gitlabEnabled ? resolveViews(DEFAULT_GITLAB_VIEWS, (gitlab as GitlabConfig).views) : null
  const gitlabReviewAsksEnabled = gitlabViews?.reviewAsks ?? false
  const github = connectors?.github
  const anyGraphEnabled =
    (github?.enabled === true && resolveGithubViews(github as GithubConfig).commitGraph) ||
    (gitlabViews?.activityGraph ?? false)

  return (
    <JiraInner
      jira={jira}
      site={jira.site}
      email={jira.email}
      apiToken={jira.apiToken}
      views={views}
      gitlabEnabled={gitlabEnabled}
      gitlabReviewAsksEnabled={gitlabReviewAsksEnabled}
      anyGraphEnabled={anyGraphEnabled}
      canvasSize={canvasSize}
      docked={docked}
      runtime={attentionRuntimeScope(
        settings.briefingEnabled === true,
        settings.briefingSources ?? DEFAULT_BRIEFING_SOURCES,
      )}
    />
  )
}

function JiraInner({
  jira,
  site,
  email,
  apiToken,
  views,
  gitlabEnabled,
  gitlabReviewAsksEnabled,
  anyGraphEnabled,
  canvasSize,
  docked,
  runtime,
}: {
  jira: JiraConfig
  site: string
  email: string
  apiToken: string
  views: JiraViews
  gitlabEnabled: boolean
  gitlabReviewAsksEnabled: boolean
  anyGraphEnabled: boolean
  canvasSize?: CanvasSize
  docked?: boolean
  runtime: AttentionRuntimeScope
}) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so the two-section fetch's
  // quiet-failure path keeps each section (fetchJira has no ETag round-trip —
  // see its own doc comment — but still carries `prev` forward). No cached
  // data yet (first-ever load in flight, or a total failure) renders nothing
  // rather than an empty shell — same as GithubInner/GitlabInner. The user's
  // resolved views gate the fetch (a section turned off never issues a
  // request — see fetchJira) AND this render (below).
  const fetchViews = effectiveJiraViews(views, runtime)
  const { data, state } = useConnectorSnapshot<JiraData>('jira', jira, (prev) =>
    fetchJira(site, email, apiToken, fetchViews, prev),
    undefined,
    attentionSnapshotScope(runtime, 'assignments', views.assigned),
  )
  const tier = canvasSize ?? 'standard'
  if (!data) {
    if (docked) return null
    const frameState = resourceFrameState(state)
    return <ResourceFrameStatus label="Jira" tier={tier} state={frameState === 'hard-error' ? 'hard-error' : 'loading'} />
  }
  const framed = canvasSize !== undefined

  // A disabled list is empty regardless of what the snapshot still carries.
  const compact = tier === 'compact'
  const standard = tier === 'standard'
  const allIssues = views.assigned ? (data.issues ?? []) : []
  const allDueSoon = views.dueSoon ? (data.dueSoon ?? []) : []
  const issues = framed
    ? allIssues.slice(0, compact ? 1 : standard ? 2 : allDueSoon.length > 0 ? 2 : MAX_ISSUES)
    : canvasSize !== 'compact' ? allIssues.slice(0, canvasSize === 'standard' ? 2 : MAX_ISSUES) : []
  const dueSoon = framed
    ? (compact || standard) && allIssues.length > 0
      ? []
      : allDueSoon.slice(0, compact || (tier === 'full' && issues.length > 0) ? 1 : MAX_DUE_SOON)
    : canvasSize !== 'compact' && (canvasSize !== 'standard' || allIssues.length === 0)
      ? allDueSoon.slice(0, MAX_DUE_SOON)
      : []
  const counts = data.counts ?? {}
  const countEntries = Object.entries(counts)

  // First two statuses BY COUNT (descending); Array.prototype.sort is stable,
  // so equal counts keep the insertion order countByStatus (jira.ts) produced
  // — i.e. whichever status was seen FIRST in the issues array.
  const topCounts = [...countEntries].sort((a, b) => b[1] - a[1]).slice(0, 2)

  // Task 77 — due-soon yields under height pressure, the SAME "extra section
  // yields before the whole card" pattern the activity graph already
  // establishes on github/gitlab (ratified wave-1 precedent — see
  // GitlabWidget.tsx's symmetric `reviewAsksTier` and index.css's
  // `roomy`/`roomier`/`roomiest` derivation for the full measurement writeup,
  // including the screenshotted overlap this closes: jira is the right rail's
  // LOWEST card, and due-soon's extra height pushed its own bottom past the
  // Tasks pill at Jon's own 1600x900 board before this fix). Gated when
  // gitlab actually shares the rail (gitlabEnabled, passed down from
  // JiraWidget) OR — fix wave, Finding C1 — when gitlab is ABSENT but
  // github's own graph is enabled: jira then becomes the right rail's SECOND
  // card, directly below github+graph (gitlab renders null when disabled, so
  // jira moves up into its slot), and that TWO-CARD composition is not safe
  // at every height either — the identical 910.5-vs-846 overlap
  // GitlabWidget.tsx's own reviewAsksTier measures for gitlab's version of
  // this composition; the arithmetic is symmetric because
  // gitlab-with-reviewAsks and jira-with-dueSoon are both the SAME
  // 129.5px-taller card sitting right under github+graph. Reuses `roomy` too.
  // `anyGraphEnabled` already reduces to exactly `githubGraphEnabled`
  // whenever `!gitlabEnabled` (its own gitlab term is gated on
  // gitlabEnabled), so reusing it here for the two-card branch is the SAME
  // check, not a new one. A gitlab-less stack WITHOUT github's graph enabled
  // (jira sole, or jira+github-no-graph) IS still safe unconditionally
  // (github rows-only 235 bottom 415 + 16 + 303.5 = 734.5, clears pillTop 846
  // at 900h) — that remains the ONLY composition that renders due-soon
  // untiered.
  const dueSoonTierName: '' | keyof typeof DUE_SOON_TIER_CLASS = !gitlabEnabled
    ? anyGraphEnabled
      ? 'roomy'
      : ''
    : anyGraphEnabled && gitlabReviewAsksEnabled
      ? 'roomiest'
      : anyGraphEnabled
        ? 'grand'
        : gitlabReviewAsksEnabled
          ? 'roomier'
          : 'roomy'
  const dueSoonTier = !framed && dueSoonTierName ? DUE_SOON_TIER_CLASS[dueSoonTierName] : ''

  // The friendly empty line shows when a rows section is enabled and NOTHING
  // from either rows list would actually be VISIBLE. Jira has no GRAPH
  // competing for the space the way github/gitlab do, but `dueSoonTier`
  // (above) CSS-tier-gates the due-soon rows exactly the same way a graph
  // does — so the same husk this fix wave closed on gitlab (Finding I3) is
  // real here too: assigned on w/ 0 issues, dueSoon on w/ rows that are
  // themselves tier-hidden used to fall through to a bare "Jira" heading (the
  // rows tier-hidden, the empty line gated off by the plain data check
  // `dueSoon.length === 0` alone, which is false whenever real due-soon data
  // exists — exactly the "never gate visibility on DATA when display is
  // CSS-tier-gated" violation the wave-1 law forbids). Fixed with the
  // identical inverse-tier machinery gitlab's `emptyLineTier` uses: when
  // dueSoon has rows that are themselves tier-gated (dueSoonTierName
  // truthy), the empty line takes the INVERSE of that tier, so exactly one
  // of {due-soon rows, empty line} is visible at any height. When dueSoon is
  // genuinely empty, or its own tier is '' (unconditional — no gitlab
  // sibling threatens it), the line shows unconditionally, exactly as
  // before.
  const showEmpty = framed
    ? (views.assigned || views.dueSoon) && allIssues.length === 0 && allDueSoon.length === 0
    : (views.assigned || views.dueSoon) &&
      allIssues.length === 0 &&
      (allDueSoon.length === 0 || dueSoonTierName !== '')
  const emptyLineTier = !framed && allDueSoon.length > 0 && dueSoonTierName
    ? DUE_SOON_INVERSE_TIER_CLASS[dueSoonTierName]
    : ''

  // No-husk law (wave 2, generalized): render null when NOTHING inside the card
  // would render — no rows in either enabled list, no status chip with a value,
  // and no empty line. (status-chips-only with empty counts is the canonical
  // case; all-views-off is the degenerate one.)
  const chipShows = views.statusChips && countEntries.length > 0
  const anySelectedRow = allIssues.length > 0 || allDueSoon.length > 0
  if (!anySelectedRow && !chipShows && !showEmpty) return null
  const countedWork = countEntries.reduce((total, [, count]) => total + count, 0)
  const prioritizedCount = allIssues.length + allDueSoon.length
  const attentionCount = countedWork > 0 ? countedWork : prioritizedCount
  const summaryValue = attentionCount > 0
    ? `${attentionCount} active ${attentionCount === 1 ? 'item' : 'items'}`
    : 'All clear'

  // Docked tier (NL-P5 batch 2, GithubWidget's exemplar shape): dense facts
  // from the SAME selected-view lists the card renders — one data owner, no
  // second fetch. The no-husk return above already covered the no-data case.
  if (docked) {
    const dockFacts = [
      allIssues.length > 0 && `${allIssues.length} assigned`,
      allDueSoon.length > 0 && `${allDueSoon.length} due soon`,
    ]
    return (
      <DockLine
        label="Jira"
        facts={dockFacts.some(Boolean) ? dockFacts : ['All clear']}
        tone={attentionCount > 0 ? 'attention' : 'quiet'}
      />
    )
  }

  return (
    // Floating panel surface — identical shape/elevation to GithubWidget's/
    // GitlabWidget's section (the house rule for floating surfaces): the
    // solid panel token, rounded-2xl/shadow-lg, w-80 fixed card width.
    // `p-4`->`p-3` (Task 55 fix round 2 — see GithubWidget.tsx's own
    // MAX_PRS comment): a modest, right-column-only chrome trim, not a
    // shape change.
    <TierFrame
      label="Jira"
      tier={tier}
      state={resourceFrameState(state, showEmpty)}
      data-canvas-size={tier}
      className={`${tier === 'compact' ? 'p-3' : 'p-4'} jira-refined text-fg`}
    >
      <div className="mb-1.5 dense:mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Jira</h2>
        {/* Counts line renders only when the view is on AND there's at least
            one status to show — 'when non-empty' per the brief. counts are
            derived FROM the assigned issues (jira.ts), and carry from prev when
            the assigned section is off, so a status-chips-only card can still
            show them. */}
        {views.statusChips && countEntries.length > 0 && (
          <span className="text-xs text-fg-muted">
            {topCounts.map(([status, count]) => `${count} ${status}`).join(' · ')}
          </span>
        )}
      </div>

      <WorkPulseSummary
        label="Jira"
        value={summaryValue}
        tone={attentionCount > 0 ? 'attention' : 'quiet'}
      />

      {issues.length > 0 && (
        <ul data-work-pulse-rows className="flex flex-col gap-2 dense:gap-1">
          {issues.map((item) => (
            <ItemRow key={item.key} item={item} />
          ))}
        </ul>
      )}

      {dueSoon.length > 0 && (
        <div className={(issues.length > 0 ? ROW_SEP : '') + dueSoonTier}>
          {/* The eyebrow separates due-soon from the assigned issues ONLY when
              both render — a single due-soon list needs no label (each row's due
              prefix carries its own context). */}
          {issues.length > 0 && <p className={EYEBROW}>Due soon</p>}
          <ul data-work-pulse-rows className="flex flex-col gap-2 dense:gap-1">
            {dueSoon.map((item) => (
              <ItemRow key={item.key} item={item} />
            ))}
          </ul>
        </div>
      )}

      {showEmpty && <p data-work-pulse-rows className={`text-sm text-fg-muted${emptyLineTier}`}>Nothing assigned to you.</p>}
    </TierFrame>
  )
}

/** One issue row: the whole row is a single external link (a new tab, and
 *  rel that severs window.opener and strips the referrer), with the full
 *  summary one hover away via the title attribute — identical shape to
 *  GithubWidget's/GitlabWidget's ItemRow. The quiet prefix line is the issue
 *  key, or `{due} · {key}` on a due-soon row that carried a date (only the
 *  due-soon search surfaces `due`; assigned rows never have it, so the same
 *  row renders both sections). */
function ItemRow({ item }: { item: JiraIssue }) {
  const prefix = item.due ? `${item.due} · ${item.key}` : item.key
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.summary}
        className="group block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="jira-issue-title block text-[13px] font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.summary}
        </span>
        <span data-work-pulse-detail data-stage-text-tier="metadata" className="block truncate text-[11px] text-fg-muted"><span>{prefix}</span> · <span>{item.status}</span></span>
      </a>
    </li>
  )
}
