import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchGithub, resolveGithubViews, type GithubData, type GithubItem } from '../../../services/connectors/github'
import type { ConnectorConfig, GithubConfig } from '../../../services/connectors/types'
import ContributionGraph from './ContributionGraph'

// Display cap for the unread count — mirrors the service's per_page=50 fetch,
// so a full page reads as "50+" rather than an exact-but-misleading number.
const NOTIF_CAP = 50
// GLANCE caps (Task 55 fix round, then TIGHTENED AGAIN in fix round 2) —
// this is a glance panel, not a full list (the "N unread" chip above
// already says "there's more"), and it shares the right column's budget
// below the collapsed weather chip's own TALLEST possible state with
// gitlab's and jira's own cards. Lowered from 4/3 (original ship) to 3/2
// (fix round 1), then MAX_PRS again to 2 (fix round 2): fix round 1 only
// re-derived github's top against the chip's OBSERVED (lucky, dry-day)
// bottom (~120px) — review caught that the chip is variable-height
// (WeatherWidget.tsx: a rain-callout line whenever any forecast hour has
// precipProb >= NOTABLE_PRECIP, 30%, a routine threshold; a stale/offline
// line whenever the cache is >=30min old or a fetch fails), and its REAL,
// deterministically-forced 3-line worst case measures 164px — below github's
// then-current top-[14vh]=126px, a real overlap
// (scripts/preview.mjs's forced-state probe, "Weather chip WORST-CASE
// height probe", is what pins this number now, never the live fetch's
// lucky-day result). With the chip's real floor at 164+16=180px, the three
// display-max cards no longer fit even at the fix-round-1 caps, so
// MAX_PRS dropped one more row (see App.tsx's github PositionedBlock
// comment for the full re-measured arithmetic) and all three right-column
// cards' own chrome (this file's `p-4`->`p-3`, `mb-2`->`mb-1.5`) was
// trimmed modestly to recover the rest — a small, deliberate visual change
// scoped to github/gitlab/jira only (vercel, on the left column, isn't
// part of this budget and was left untouched).
const MAX_PRS = 2
const MAX_ISSUES = 2

// Section separators for the composed card (the board's composed face: graph on
// top, border-t-divided rows below). ROW_SEP divides one list from another and
// is always present between two rendered lists. The GRAPH_SEP_* pair divides the
// FIRST list from the graph above it, and each appears ONLY at the breakpoint
// where the graph itself reveals — so no orphan hairline is ever stranded under
// the header on the tiers where the graph has yielded. WHICH breakpoint depends
// on how many forge SIBLINGS share the flow column below github (GithubInner
// picks the pair to match the wrapper): sole card / one sibling reveal on
// `taller` (>=890h); two siblings (gitlab AND jira) reveal on `grand` (>=1041h).
// Two literal class strings (not interpolated) so Tailwind's JIT emits both.
const ROW_SEP = ' mt-3 dense:mt-2 border-t border-panel-border pt-3 dense:pt-2'
const GRAPH_SEP_TALLER = ' taller:mt-3 taller:border-t taller:border-panel-border taller:pt-3'
const GRAPH_SEP_GRAND = ' grand:mt-3 grand:border-t grand:border-panel-border grand:pt-3'

/** Narrow `connectors.github` (a ConnectorConfig union member, or undefined)
 *  to a CONNECTED GithubConfig, defensively. schema.ts ties every connector id
 *  to the whole union rather than its specific member, and a hand-edited backup
 *  can legally restore { enabled: true } with no token at all — so this tests
 *  for the token field's presence (`'token' in`) before reading it, then
 *  applies the connector's gate (enabled + a non-empty string token). Returns
 *  null unless all three hold. This is the single documented narrowing approach
 *  for the widget (Controller ruling 6). */
function connectedGithub(config: ConnectorConfig | undefined): GithubConfig | null {
  if (!config || !('token' in config)) return null
  const github = config as GithubConfig
  if (!github.enabled || typeof github.token !== 'string' || github.token.length === 0) return null
  return github
}

export default function GithubWidget() {
  // Zero-hooks-in-the-gate split, same as RssWidget: the one useStoredKey read
  // runs every render (Rules of Hooks stay satisfied), but a disabled/
  // unconnected connector never mounts GithubInner and therefore never runs
  // useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const github = connectedGithub(connectors?.github)
  if (!github) return null
  // Count the enabled forge SIBLINGS that share the right rail's flow column
  // below github (gitlab, jira). A deliberately CONSERVATIVE over-approximation
  // of "will render a card": an enabled-but-broken sibling (no token, a failed
  // fetch) renders null and takes no column height, but the graph yields anyway
  // under this count — which fails QUIET and SAFE (the graph waits for a taller
  // window that it did not strictly need) rather than the reverse (a graph that
  // laps the Tasks pill). This governs the graph's reveal tier — see GithubInner
  // and App.tsx's right-rail comment.
  const forgeSiblings = (connectors?.gitlab?.enabled ? 1 : 0) + (connectors?.jira?.enabled ? 1 : 0)
  return <GithubInner github={github} forgeSiblings={forgeSiblings} />
}

function GithubInner({ github, forgeSiblings }: { github: GithubConfig; forgeSiblings: number }) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately and
  // refreshes once per mount, carrying `prev` so ETag 304s keep each section.
  // The user's resolved views gate the fetch (a section turned off never issues
  // a request — see fetchGithub) AND this render (below).
  const token = github.token
  const views = resolveGithubViews(github)
  const { data } = useConnectorSnapshot<GithubData>('github', (prev) => fetchGithub(token, prev, views))

  // All four sections off: the user asked for nothing to show, so render no
  // empty shell — the settings copy owns that explanation.
  if (!views.commitGraph && !views.pulls && !views.issues && !views.notifications) return null
  // No cached data yet (first-ever load in flight, or a total failure) renders
  // nothing rather than an empty shell — same as RssInner.
  if (!data) return null

  // Old snapshots predate the contributions field — read it defensively. An
  // empty day array is treated as absent (a graph needs cells to draw), so the
  // section only appears when commitGraph is on AND there are real days.
  const contributions = data.contributions ?? null
  const graph =
    views.commitGraph && contributions !== null && contributions.days.length > 0 ? contributions : null

  // STRICTLY graph-only composition (commitGraph on, every other section off —
  // Jon's "just my commit graph"). The graph is then the card's ONLY content, so
  // the card must live and die with it, never reading as a broken header husk:
  //   · with no graph data at all (an old snapshot without contributions, or empty
  //     days) there is nothing this card could EVER show — render null, the same
  //     ruling as the all-sections-off guard above.
  //   · otherwise the WHOLE card follows the graph's own reveal tier (below): the
  //     SECTION carries the `hidden taller:block` boundary, so under height pressure
  //     the entire card yields as one — never a lone "GitHub" heading. Compositions
  //     with notifications (or rows) instead keep the card always-shown and
  //     tier-gate only the inner graph, because the unread chip / rows legitimately
  //     carry a card even when the graph has yielded (the Task 68 reviewed state).
  const graphOnly = views.commitGraph && !views.pulls && !views.issues && !views.notifications
  if (graphOnly && graph === null) return null

  // The graph reveals only at a height where the WHOLE stack — github plus any
  // sibling cards below it — clears the bottom-anchored Tasks pill by the 16px
  // rail floor. The tier depends on BOTH the sibling count AND github's OWN
  // composition, because a rows-bearing card is far taller than a graph-only one
  // (all measured, scripts/preview.mjs, 1600w):
  //   · sole card or ONE sibling → `taller` (>=890h), for ANY composition.
  //   · two siblings WITH a rows section (pulls or issues on) → `grand` (>=1041h):
  //     github+graph+rows (411) + gitlab + jira put jira at [797-971], which needs
  //     >=1041h. (A SINGLE rows-section is a 306px card that would clear at >=936h,
  //     but rather than a third tier for that ~105px window it reveals on `grand`
  //     too — conservative, one fewer boundary.)
  //   · two siblings and GRAPH-ONLY (no pulls, no issues — Jon's "just my commit
  //     graph"; notifications adds only a header chip, no height) → `taller`
  //     (>=890h): the 201px graph-only card + gitlab + jira put jira at [587-761],
  //     clearing the 890-floor pill (836) by 75px. Without this the graph-only
  //     card would be `grand`-gated and render a HEADER-ONLY HUSK at 890-1040h
  //     (including Jon's 1600x900) — the very card the feature exists to show.
  // One boundary per config shape, so the reveal is monotonic across a resize
  // (toggling a connector or a section changes the shape, never blinks a card).
  // Full class strings so the JIT emits both variants.
  const graphNeedsGrand = forgeSiblings >= 2 && (views.pulls || views.issues)
  const graphWrap = graphNeedsGrand ? 'hidden grand:block' : 'hidden taller:block'
  const graphSep = graphNeedsGrand ? GRAPH_SEP_GRAND : GRAPH_SEP_TALLER
  // Where the tier boundary lands: on the SECTION when strictly graph-only (the
  // whole card yields), on the inner graph wrapper otherwise (the card stays, the
  // graph alone yields). Exactly one of the two ever carries it, so the reveal is
  // a single whole-card OR single-section boundary — monotonic either way.
  const sectionTier = graphOnly ? ` ${graphWrap}` : ''
  const innerGraphClass = graphOnly ? undefined : graphWrap

  // A disabled list is empty regardless of what the snapshot still carries.
  const prs = views.pulls ? (data.prs ?? []).slice(0, MAX_PRS) : []
  const issues = views.issues ? (data.issues ?? []).slice(0, MAX_ISSUES) : []
  const notifications = data.notifications

  // The celebratory empty line is honest only when a LIST section is enabled,
  // both enabled lists are empty, AND no graph is drawing — a graph-only card
  // with an empty list day is NOT "empty".
  const showEmpty = (views.pulls || views.issues) && prs.length === 0 && issues.length === 0 && graph === null

  return (
    // Floating panel surface: the solid panel token per the house rule for
    // floating surfaces (a photo shows through the ambient --panel token — too
    // little contrast for a list of links), plus the shape/elevation the brief
    // pins. w-80 is the fixed card width. `p-4`->`p-3` (Task 55 fix round 2,
    // right-column-only — see MAX_PRS's own comment): a modest, deliberate
    // chrome trim (8px of card height), not a shape change — rounded-2xl/
    // shadow-lg/w-80 all unchanged, screenshot-verified against
    // connectors-github.png and connectors-all.png before shipping.
    <section aria-label="GitHub" className={`w-80 rounded-2xl bg-panel-solid p-3 dense:p-2 text-fg shadow-lg${sectionTier}`}>
      <div className="mb-1.5 dense:mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">GitHub</h2>
        {/* Unread chip renders ONLY when the notifications view is on AND the
            count is known AND positive (Controller ruling 2, compounded with the
            view gate): null (endpoint unavailable) hides it; 0 (all caught up)
            hides it too. "50+" at the per-page cap. */}
        {views.notifications && notifications !== null && notifications > 0 && (
          <span className="text-xs text-fg-muted">
            {notifications >= NOTIF_CAP ? '50+' : notifications} unread
          </span>
        )}
      </div>

      {/* Commit graph on top — the board's composed face. The graph adds 176px
          full-height (168px dense-condensed) to github, so it yields FIRST under
          height pressure — BEFORE any whole right-rail card hides — and its reveal
          tier depends on how many forge siblings share the column (graphWrap):
            · sole card / one sibling → `taller` (>=890h). github ALONE + graph
              (bottom 591) clears the 890-floor pill (836) by 245px; one 174px
              sibling puts the stack bottom at 781, clearing 836 by 55px.
            · two siblings → `grand` (>=1041h). github+graph+gitlab+jira put
              jira at [797-971], which clears the pill (h−54) by 16px only at
              >=1041h — below that the stack would lap the bottom-anchored Tasks
              pill (e.g. hypothetically at 890h, jira.bottom 971 vs pill.top 836,
              a 135px overlap — which is why the graph is NOT revealed there).
          gitlab/jira themselves hide on `dense` (<=864); the graph revealing one
          (or, with two siblings, several) tiers HIGHER is exactly "the graph
          yields before any whole card". See App.tsx's right-rail comment for the
          full re-measured arithmetic and the `grand` derivation. When STRICTLY
          graph-only, this boundary moves to the SECTION (sectionTier) and the inner
          wrapper carries nothing — the whole card yields as one, no husk. */}
      {graph && (
        <div className={innerGraphClass}>
          <ContributionGraph contributions={graph} />
        </div>
      )}

      {prs.length > 0 && (
        <ul className={`flex flex-col gap-2 dense:gap-1${graph ? graphSep : ''}`}>
          {prs.map((item) => (
            <ItemRow key={item.url} item={item} />
          ))}
        </ul>
      )}

      {issues.length > 0 && (
        <ul className={`flex flex-col gap-2 dense:gap-1${prs.length > 0 ? ROW_SEP : graph ? graphSep : ''}`}>
          {issues.map((item) => (
            <ItemRow key={item.url} item={item} />
          ))}
        </ul>
      )}

      {showEmpty && <p className="text-sm text-fg-muted">No PRs waiting on you 🎉</p>}
    </section>
  )
}

/** One PR/issue row: the whole row is a single external link (a new tab, and
 *  rel that severs window.opener and strips the referrer), with the repo prefix
 *  as quiet context above the title and the full title one hover away via the
 *  title attribute. */
function ItemRow({ item }: { item: GithubItem }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.title}
        className="group block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        {item.repo && <span className="block truncate text-xs text-fg-muted">{item.repo}</span>}
        <span className="block truncate text-sm dense:text-xs font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.title}
        </span>
      </a>
    </li>
  )
}
