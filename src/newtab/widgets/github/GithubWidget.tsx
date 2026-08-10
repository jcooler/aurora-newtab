import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchGithub, DEFAULT_GITHUB_VIEWS, type GithubData, type GithubItem } from '../../../services/connectors/github'
import type { ConnectorConfig, GithubConfig } from '../../../services/connectors/types'

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
  return <GithubInner token={github.token} />
}

function GithubInner({ token }: { token: string }) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately and
  // refreshes once per mount, carrying `prev` so ETag 304s keep each section.
  // No cached data yet (first-ever load in flight, or a total failure) renders
  // nothing rather than an empty shell — same as RssInner.
  // TODO(Task 68): resolve per-user views from stored config; DEFAULT_GITHUB_VIEWS
  // (all sections on) keeps current behavior unchanged until that lands.
  const { data } = useConnectorSnapshot<GithubData>('github', (prev) => fetchGithub(token, prev, DEFAULT_GITHUB_VIEWS))
  if (!data) return null

  const prs = (data.prs ?? []).slice(0, MAX_PRS)
  const issues = (data.issues ?? []).slice(0, MAX_ISSUES)
  const notifications = data.notifications
  // Connected but nothing waiting — a deliberate, friendly rendered state (the
  // widget shows the card, unlike RSS which renders nothing when empty), so the
  // live connection is still visible.
  const empty = prs.length === 0 && issues.length === 0

  return (
    // Floating panel surface: the solid panel token per the house rule for
    // floating surfaces (a photo shows through the ambient --panel token — too
    // little contrast for a list of links), plus the shape/elevation the brief
    // pins. w-80 is the fixed card width. `p-4`->`p-3` (Task 55 fix round 2,
    // right-column-only — see MAX_PRS's own comment): a modest, deliberate
    // chrome trim (8px of card height), not a shape change — rounded-2xl/
    // shadow-lg/w-80 all unchanged, screenshot-verified against
    // connectors-github.png and connectors-all.png before shipping.
    <section aria-label="GitHub" className="w-80 rounded-2xl bg-panel-solid p-3 dense:p-2 text-fg shadow-lg">
      <div className="mb-1.5 dense:mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">GitHub</h2>
        {/* Unread chip renders ONLY when the count is known AND positive
            (Controller ruling 2): null (endpoint unavailable) hides it; 0 (all
            caught up) hides it too. "50+" at the per-page cap. */}
        {notifications !== null && notifications > 0 && (
          <span className="text-xs text-fg-muted">
            {notifications >= NOTIF_CAP ? '50+' : notifications} unread
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-fg-muted">No PRs waiting on you 🎉</p>
      ) : (
        <>
          {prs.length > 0 && (
            <ul className="flex flex-col gap-2 dense:gap-1">
              {prs.map((item) => (
                <ItemRow key={item.url} item={item} />
              ))}
            </ul>
          )}
          {issues.length > 0 && (
            <ul
              className={`flex flex-col gap-2 dense:gap-1${
                prs.length > 0 ? ' mt-3 dense:mt-2 border-t border-panel-border pt-3 dense:pt-2' : ''
              }`}
            >
              {issues.map((item) => (
                <ItemRow key={item.url} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
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
