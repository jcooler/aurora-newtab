import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchGitlab, DEFAULT_GITLAB_VIEWS, type GitlabData, type GitlabMr } from '../../../services/connectors/gitlab'
import { resolveGithubViews } from '../../../services/connectors/github'
import { DEFAULT_JIRA_VIEWS } from '../../../services/connectors/jira'
import { resolveViews } from '../../../services/connectors/views'
import type { ConnectorConfig, GitlabConfig, GitlabViews, GithubConfig, JiraConfig } from '../../../services/connectors/types'
import ContributionGraph from '../shared/ContributionGraph'

// Display cap for the to-dos count — mirrors the service's per_page=20 fetch,
// so a full page reads as "20+" rather than an exact-but-misleading number.
const TODOS_CAP = 20
// GLANCE cap (Task 55 fix round) — this is a glance panel, not a full list
// (the "N to-dos" chip above already says "there's more"), and it shares the
// right column's budget below the collapsed weather chip's own tallest
// state with github's card above it and jira's below. Lowered from 5 — see
// GithubWidget.tsx's own MAX_PRS/MAX_ISSUES comment for the full rationale
// (fix round 1) and its follow-up (fix round 2, the weather-chip forced-
// state probe) — MAX_MRS itself did not need to move again in round 2; the
// card's own CHROME did (`p-4`->`p-3`, `mb-2`->`mb-1.5` below), the same
// modest trim github/jira also got.
const MAX_MRS = 3
// GLANCE cap for the review-asks rows (Task 75), pinned by the same discipline
// as MAX_MRS: this is a glance panel, and the MR header already tells the user
// there's a full queue elsewhere — the review list is a nudge ("N MRs want your
// eyes"), not the review queue itself. Held to 2 (below MAX_MRS's 3) because
// review asks are the SECOND rows section on this card and share what's left of
// the right rail's budget after the assigned MRs and the (taller) graph.
const MAX_REVIEW_ASKS = 2

// Section separators for the composed card, mirroring GithubWidget's idiom.
// ROW_SEP divides one rendered list from another and is always present between
// two lists. The GRAPH_SEP_* pair divides the FIRST list from the graph above
// it, and each appears ONLY at the breakpoint where the graph itself reveals —
// so no orphan hairline is stranded under the header on the tiers where the
// graph has yielded. WHICH breakpoint depends on whether gitlab is the sole
// forge card (reveal on `taller`) or stacked (reveal on `grand`). Two literal
// class strings (not interpolated) so Tailwind's JIT emits both.
const ROW_SEP = ' mt-3 dense:mt-2 border-t border-panel-border pt-3 dense:pt-2'
const GRAPH_SEP_TALLER = ' taller:mt-3 taller:border-t taller:border-panel-border taller:pt-3'
const GRAPH_SEP_GRAND = ' grand:mt-3 grand:border-t grand:border-panel-border grand:pt-3'

/** Fix wave, Finding C1/I3 fallout: `reviewAsksTier`/its INVERSE both used to
 *  be built with `` `hidden ${tierName}:block` `` — a template-interpolated
 *  class name. Tailwind's build-time scanner extracts candidate classes by
 *  scanning the SOURCE TEXT for complete, unbroken class-name strings (the
 *  same rule GRAPH_SEP_TALLER/GRAPH_SEP_GRAND's own comment states above); an
 *  interpolated template never appears as a complete string anywhere in the
 *  file, so `roomiest:block`/`grand:hidden`/etc. were silently never
 *  generated — jsdom unit tests still passed (they only assert the
 *  className STRING, never real CSS), but the real-Chromium harness caught
 *  it: the tier never actually revealed/hid in a built page. Fixed with
 *  literal lookup maps — every VALUE below is a complete literal string
 *  Tailwind's scanner can see, keyed by the SAME tier-name string the reveal
 *  logic already derives once. */
const REVIEW_ASKS_TIER_CLASS: Record<'roomy' | 'roomier' | 'grand' | 'roomiest', string> = {
  roomy: ' hidden roomy:block',
  roomier: ' hidden roomier:block',
  grand: ' hidden grand:block',
  roomiest: ' hidden roomiest:block',
}
const REVIEW_ASKS_INVERSE_TIER_CLASS: Record<'roomy' | 'roomier' | 'grand' | 'roomiest', string> = {
  roomy: ' roomy:hidden',
  roomier: ' roomier:hidden',
  grand: ' grand:hidden',
  roomiest: ' roomiest:hidden',
}

// The house eyebrow for a quiet section separator (the tasks panel + wave-1
// language): 11px, uppercased, wide-tracked, muted.
const EYEBROW = 'mb-2 dense:mb-1 text-[11px] uppercase tracking-[0.08em] text-fg-muted'

/** Narrow `connectors.gitlab` (a ConnectorConfig union member, or undefined)
 *  to a CONNECTED GitlabConfig, defensively — same rationale and shape as
 *  github's connectedGithub (GithubWidget.tsx): schema.ts ties every
 *  connector id to the whole union rather than its specific member, and a
 *  hand-edited backup can legally restore { enabled: true } with none of the
 *  fields at all. Gate defends token, instanceUrl AND username string-ness:
 *  the brief is explicit gitlab needs both credential fields (unlike github's
 *  token-only gate, because instanceUrl feeds directly into the fetch URL),
 *  and Task 74's review-asks + activity-graph sections now build URLs from
 *  `username` too — so a missing/empty username must block those sections'
 *  requests the same way (defensive narrowing, closing Task 74's carried
 *  Minor). */
function connectedGitlab(config: ConnectorConfig | undefined): GitlabConfig | null {
  if (!config || !('token' in config) || !('instanceUrl' in config)) return null
  const gitlab = config as GitlabConfig
  if (!gitlab.enabled) return null
  if (typeof gitlab.token !== 'string' || gitlab.token.length === 0) return null
  if (typeof gitlab.instanceUrl !== 'string' || gitlab.instanceUrl.length === 0) return null
  if (typeof gitlab.username !== 'string' || gitlab.username.length === 0) return null
  return gitlab
}

export default function GitlabWidget() {
  // Zero-hooks-in-the-gate split, same as GithubWidget/RssWidget: the one
  // useStoredKey read runs every render (Rules of Hooks stay satisfied), but a
  // disabled/unconnected connector never mounts GitlabInner and therefore
  // never runs useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const gitlab = connectedGitlab(connectors?.gitlab)
  if (!gitlab) return null

  // The activity graph's reveal tier (below) depends on the OTHER forge cards
  // sharing the right rail's flow column (github, jira). `soleForgeCard`: neither
  // is enabled, so gitlab's graph can reveal one tier lower (`taller`). Same
  // conservative over-approximation GithubWidget's forgeSiblings uses — an
  // enabled-but-broken sibling renders null yet still forces the higher tier,
  // which fails QUIET and SAFE (the graph waits for a window it did not strictly
  // need) rather than lapping the bottom-anchored Tasks pill.
  const github = connectors?.github
  const soleForgeCard = !github?.enabled && !connectors?.jira?.enabled
  // The cross-card rule: when github's OWN commit graph is enabled — which makes
  // github a stacked sibling — github's graph is the hero and gitlab's yields to
  // it entirely (below). Reading github's graph-enabled state needs the ONE
  // documented cast: schema.ts ties every connector id to the whole
  // ConnectorConfig union, so `views` (a GithubViews-shaped field) isn't
  // reachable without narrowing to GithubConfig. Enabled-shaped github only (the
  // `github?.enabled === true` short-circuit); resolveGithubViews backfills an
  // absent/partial views to all-on (commitGraph:true), matching exactly what
  // GithubWidget itself renders for a github connected before the field existed.
  const githubGraphEnabled =
    github?.enabled === true && resolveGithubViews(github as GithubConfig).commitGraph

  // Task 77 — the review-asks section-tier fix. `reviewAsks` only threatens
  // anything when jira ALSO shares the right rail (jira is the lowest card, and
  // gitlab's extra height is what pushes jira's bottom toward the Tasks pill —
  // see index.css's `roomy`/`roomier`/`roomiest` comment for the full
  // measurement writeup and the four thresholds this feeds). Same conservative
  // "enabled, not rendered" read as `soleForgeCard`/`githubGraphEnabled` above:
  // an enabled-but-broken jira still forces the gate. `jiraDueSoonEnabled` is
  // the sibling's OWN new section — needed because turning BOTH new sections on
  // at once needs a taller floor than either alone (measured).
  const jira = connectors?.jira
  const jiraEnabled = jira?.enabled === true
  const jiraDueSoonEnabled = jiraEnabled && resolveViews(DEFAULT_JIRA_VIEWS, (jira as JiraConfig).views).dueSoon

  return (
    <GitlabInner
      token={gitlab.token}
      instanceUrl={gitlab.instanceUrl}
      username={gitlab.username}
      views={resolveViews(DEFAULT_GITLAB_VIEWS, gitlab.views)}
      soleForgeCard={soleForgeCard}
      githubGraphEnabled={githubGraphEnabled}
      jiraEnabled={jiraEnabled}
      jiraDueSoonEnabled={jiraDueSoonEnabled}
    />
  )
}

function GitlabInner({
  token,
  instanceUrl,
  username,
  views,
  soleForgeCard,
  githubGraphEnabled,
  jiraEnabled,
  jiraDueSoonEnabled,
}: {
  token: string
  instanceUrl: string
  username: string
  views: GitlabViews
  soleForgeCard: boolean
  githubGraphEnabled: boolean
  jiraEnabled: boolean
  jiraDueSoonEnabled: boolean
}) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so a per-section failure
  // keeps that section (fetchGitlab has no ETag round-trip — see its own doc
  // comment — but still carries `prev` forward for the quiet-failure path).
  // The user's resolved views gate the fetch (a section turned off never issues
  // a request — see fetchGitlab) AND this render (below).
  const { data } = useConnectorSnapshot<GitlabData>('gitlab', (prev) =>
    fetchGitlab(instanceUrl, token, username, views, prev),
  )
  // No cached data yet (first-ever load in flight, or a total failure) renders
  // nothing rather than an empty shell — same as GithubInner/RssInner.
  if (!data) return null

  // Old snapshots predate the contributions field — read it defensively. An
  // empty day array is treated as absent (a graph needs cells to draw), so the
  // section only appears when activityGraph is on AND there are real days.
  const contributions = data.contributions ?? null
  const graph =
    views.activityGraph && contributions !== null && contributions.days.length > 0 ? contributions : null

  // Cross-card rule: github's graph is the hero. When it's enabled (which means
  // github is a stacked sibling), gitlab's graph yields ENTIRELY — never
  // rendered, only marked for the harness probe (data-yield below). Otherwise it
  // reveals at the wave-1 sole-vs-stacked tier: sole forge card → `taller`,
  // stacked (without github's graph) → `grand`. Task 77 measures whether a
  // very-tall reveal is honest and updates the class + derivation if so.
  const graphWrap = soleForgeCard ? 'hidden taller:block' : 'hidden grand:block'
  const renderGraph = graph !== null && !githubGraphEnabled
  // A data-bearing graph WITHHELD for github's — the falsifiable cross-card
  // state the harness probes (`data-yield="github"` on the section).
  const graphYieldedToGithub = graph !== null && githubGraphEnabled

  // STRICTLY graph-only composition (activityGraph on, every other section off,
  // to-dos chip included). The graph is then the card's ONLY content, so the
  // card lives and dies with it, never a broken "GitLab" header husk:
  //   · no graph data at all (old snapshot, empty days) → render null.
  //   · github's graph wins (graphYieldedToGithub) → the graph never shows, so
  //     nothing would ever render → null (the cross-card whole-card case).
  //   · otherwise the WHOLE card follows the graph's reveal tier (the SECTION
  //     carries `hidden <tier>:block`), yielding as one — GithubWidget's pattern.
  const graphOnly = views.activityGraph && !views.mergeRequests && !views.reviewAsks && !views.todos
  if (graphOnly && (graph === null || githubGraphEnabled)) return null
  // Where the tier boundary lands: on the SECTION when strictly graph-only (the
  // whole card yields), on the inner graph wrapper otherwise. Exactly one carries
  // it, so the reveal is a single whole-card OR single-section boundary.
  const sectionTier = graphOnly ? ` ${graphWrap}` : ''
  const innerGraphClass = graphOnly ? undefined : graphWrap
  const graphSep = soleForgeCard ? GRAPH_SEP_TALLER : GRAPH_SEP_GRAND

  // A disabled list is empty regardless of what the snapshot still carries.
  const mrs = views.mergeRequests ? (data.mrs ?? []).slice(0, MAX_MRS) : []
  const reviewMrs = views.reviewAsks ? (data.reviewMrs ?? []).slice(0, MAX_REVIEW_ASKS) : []
  const todos = data.todos

  // Task 77 — review-asks yields under height pressure too, the SAME "extra
  // section yields before the whole card" pattern the activity graph already
  // establishes above (ratified wave-1 precedent — see GithubWidget.tsx's own
  // comment on this and index.css's `roomy`/`roomier`/`roomiest` derivation for
  // the full measurement writeup, including the screenshotted overlap this
  // closes: gitlab's reviewAsks pushes jira — the right rail's lowest card —
  // toward the Tasks pill when both are enabled). Gated when jira actually
  // shares the rail (jiraEnabled, passed down from GitlabWidget) OR — fix wave,
  // Finding C1 — when jira is ABSENT but github's own graph is enabled: that
  // TWO-CARD composition (github+graph directly above gitlab, gitlab then the
  // stack's own LOWEST card) is not safe at every height either — measured,
  // real overlap at Jon's canonical 1600x900 (github+graph bottom 591 + the
  // 16px flow gap + gitlab-with-reviewAsks 303.5 = 910.5 vs pillTop 846, a
  // 64.5px overlap). Reuses `roomy` (the needed floor is only 980.5, <= roomy's
  // 995 — conservative-safe, verified arithmetically rather than re-derived; see
  // index.css's own `roomy` comment for the ledger of every call site). A
  // jira-less stack WITHOUT github's graph enabled IS still safe
  // unconditionally (github rows-only 235 bottom 415 + 16 + 303.5 = 734.5,
  // clears pillTop 846 at 900h) — that remains the ONLY composition that
  // renders review-asks untiered. `anyGraphEnabled` folds in BOTH possible
  // graph owners (github's or gitlab's own) since jira's bottom moves by the
  // identical +176px regardless of which card carries it (index.css's
  // derivation proves the two totals equal); note it reduces to exactly
  // `githubGraphEnabled` whenever `!jiraEnabled` (its own gitlab term needs
  // jira absent from the composition to matter, and gitlab's OWN graph can't
  // push GITLAB's own card height against itself), so the two-card branch
  // below reads `githubGraphEnabled` directly rather than re-deriving it.
  const anyGraphEnabled = githubGraphEnabled || views.activityGraph
  const reviewAsksTierName: '' | keyof typeof REVIEW_ASKS_TIER_CLASS = !jiraEnabled
    ? githubGraphEnabled
      ? 'roomy'
      : ''
    : anyGraphEnabled && jiraDueSoonEnabled
      ? 'roomiest'
      : anyGraphEnabled
        ? 'grand'
        : jiraDueSoonEnabled
          ? 'roomier'
          : 'roomy'
  const reviewAsksTier = reviewAsksTierName ? REVIEW_ASKS_TIER_CLASS[reviewAsksTierName] : ''

  // The friendly empty line ("No MRs assigned to you.") shows whenever a rows
  // section is enabled and NOTHING from either rows list would actually be
  // VISIBLE — a quiet day, or an all-tier-hidden one. Two independent things
  // can occupy the "rows" slot instead of real visible rows: the activity
  // graph (above) and, since Task 77 shipped `reviewAsksTier`, the review-asks
  // list itself. Its VISIBILITY is the exact INVERSE of whichever of those is
  // the one actually competing for the space:
  //   · the graph competes whenever it renders at all (graph !== null &&
  //     !githubGraphEnabled) — the ORIGINAL wave-1 empty-state law, unchanged.
  //   · fix wave, Finding I3: when the graph does NOT compete (no data, or
  //     yielded to github) but reviewMrs DOES have rows that are themselves
  //     CSS-tier-gated (reviewAsksTierName truthy), the empty line takes THAT
  //     tier's inverse instead. Before this fix, a "0 MRs, review-asks
  //     tier-hidden" composition fell through to a bare "GitLab" header below
  //     the reveal height: the rows were tier-hidden, but the empty line was
  //     gated off by the plain data check `reviewMrs.length === 0` alone,
  //     which is false whenever real review-asks data exists — exactly the
  //     "never gate visibility on DATA when display is CSS-tier-gated"
  //     violation the wave-1 law forbids. When the graph DOES compete, its own
  //     tier is proven to always be <= reviewAsksTierName's own tier in every
  //     composition where BOTH are active (the graph's own tier is `grand`
  //     whenever jiraEnabled — the precondition for a non-'' reviewAsksTierName
  //     — and reviewAsksTierName's own values in that same state are `grand`
  //     or the strictly TALLER `roomiest`, never smaller), so the graph's
  //     existing inverse tier already covers the combined case and needs no
  //     further change here.
  //   · with NEITHER competing (no graph data and reviewMrs empty, or
  //     reviewAsksTierName is '' — review-asks renders unconditionally), the
  //     line shows unconditionally, exactly as before.
  // Exactly one of {graph, review-asks rows, empty line} is ever visible at
  // any height — never a husk band, never a double render.
  const showEmpty =
    (views.mergeRequests || views.reviewAsks) &&
    mrs.length === 0 &&
    (reviewMrs.length === 0 || reviewAsksTierName !== '')
  const emptyLineTier =
    graph === null || githubGraphEnabled
      ? reviewMrs.length > 0 && reviewAsksTierName
        ? REVIEW_ASKS_INVERSE_TIER_CLASS[reviewAsksTierName]
        : ''
      : soleForgeCard
        ? ' taller:hidden'
        : ' grand:hidden'

  // No-husk law (wave 2, generalized): render null when NOTHING inside the card
  // would render — no data-bearing graph section, no rows in any enabled list, no
  // to-dos chip with a positive count, and no friendly empty line. (to-dos-only
  // with 0 to-dos is the canonical case; all-views-off is the degenerate one.)
  const chipShows = views.todos && todos > 0
  const anyRow = mrs.length > 0 || reviewMrs.length > 0
  if (!renderGraph && !anyRow && !chipShows && !showEmpty) return null

  return (
    // Floating panel surface — identical shape/elevation to GithubWidget's
    // section (the house rule for floating surfaces): the solid panel token,
    // rounded-2xl/shadow-lg, w-80 fixed card width. `p-4`->`p-3` (Task 55
    // fix round 2 — see GithubWidget.tsx's own MAX_PRS comment): a modest,
    // right-column-only chrome trim, not a shape change. `data-yield="github"`
    // marks the cross-card yield (a data-bearing gitlab graph withheld because
    // github's is the hero) for the harness probe.
    <section
      aria-label="GitLab"
      {...(graphYieldedToGithub ? { 'data-yield': 'github' } : {})}
      className={`w-80 rounded-2xl bg-panel-solid p-3 dense:p-2 text-fg shadow-lg${sectionTier}`}
    >
      <div className="mb-1.5 dense:mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">GitLab</h2>
        {/* To-dos chip renders only when the view is on AND the count is > 0 —
            todos is a plain number here (no null/"unavailable" case, unlike
            github's notifications), so 0 (all caught up) is the only hidden
            state besides the view being off. "20+" at the per-page cap. */}
        {views.todos && todos > 0 && (
          <span className="text-xs text-fg-muted">{todos >= TODOS_CAP ? '20+' : todos} to-dos</span>
        )}
      </div>

      {/* Activity graph on top — the board's composed face. It yields FIRST
          under height pressure (its reveal tier is HIGHER than the whole-card
          hide), and the cross-card rule can withhold it entirely for github's
          graph. When strictly graph-only, the boundary moves to the SECTION
          (sectionTier) and this wrapper carries nothing — the whole card yields
          as one, no husk. */}
      {renderGraph && graph && (
        <div className={innerGraphClass}>
          <ContributionGraph contributions={graph} />
        </div>
      )}

      {mrs.length > 0 && (
        <ul className={`flex flex-col gap-2 dense:gap-1${renderGraph ? graphSep : ''}`}>
          {mrs.map((item) => (
            <ItemRow key={item.url} item={item} />
          ))}
        </ul>
      )}

      {reviewMrs.length > 0 && (
        <div className={(mrs.length > 0 ? ROW_SEP : renderGraph ? graphSep : '') + reviewAsksTier}>
          {/* The eyebrow separates review asks from the assigned MRs ONLY when
              both render — a single review list needs no label (its rows carry
              their own context), same restraint as github's unlabelled lists. */}
          {mrs.length > 0 && <p className={EYEBROW}>Review asks</p>}
          <ul className="flex flex-col gap-2 dense:gap-1">
            {reviewMrs.map((item) => (
              <ItemRow key={item.url} item={item} />
            ))}
          </ul>
        </div>
      )}

      {showEmpty && <p className={`text-sm text-fg-muted${emptyLineTier}`}>No MRs assigned to you.</p>}
    </section>
  )
}

/** One MR row: the whole row is a single external link (a new tab, and rel
 *  that severs window.opener and strips the referrer), with the project
 *  prefix as quiet context above the title and the full title one hover away
 *  via the title attribute — identical shape to GithubWidget's ItemRow. Shared
 *  by both MR sections (assigned + review asks). */
function ItemRow({ item }: { item: GitlabMr }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.title}
        className="group block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        {item.project && <span className="block truncate text-xs text-fg-muted">{item.project}</span>}
        <span className="block truncate text-sm dense:text-xs font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.title}
        </span>
      </a>
    </li>
  )
}
