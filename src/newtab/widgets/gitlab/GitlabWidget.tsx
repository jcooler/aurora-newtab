import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchGitlab, type GitlabData, type GitlabMr } from '../../../services/connectors/gitlab'
import type { ConnectorConfig, GitlabConfig } from '../../../services/connectors/types'

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

/** Narrow `connectors.gitlab` (a ConnectorConfig union member, or undefined)
 *  to a CONNECTED GitlabConfig, defensively — same rationale and shape as
 *  github's connectedGithub (GithubWidget.tsx): schema.ts ties every
 *  connector id to the whole union rather than its specific member, and a
 *  hand-edited backup can legally restore { enabled: true } with neither
 *  field at all. Gate defends BOTH token and instanceUrl string-ness (the
 *  brief is explicit gitlab needs both, unlike github's token-only gate,
 *  because instanceUrl feeds directly into the fetch URL below). */
function connectedGitlab(config: ConnectorConfig | undefined): GitlabConfig | null {
  if (!config || !('token' in config) || !('instanceUrl' in config)) return null
  const gitlab = config as GitlabConfig
  if (!gitlab.enabled) return null
  if (typeof gitlab.token !== 'string' || gitlab.token.length === 0) return null
  if (typeof gitlab.instanceUrl !== 'string' || gitlab.instanceUrl.length === 0) return null
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
  return <GitlabInner token={gitlab.token} instanceUrl={gitlab.instanceUrl} />
}

function GitlabInner({ token, instanceUrl }: { token: string; instanceUrl: string }) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so a per-section failure
  // keeps that section (fetchGitlab has no ETag round-trip — see its own doc
  // comment — but still carries `prev` forward for the quiet-failure path).
  // No cached data yet (first-ever load in flight, or a total failure) renders
  // nothing rather than an empty shell — same as GithubInner/RssInner.
  const { data } = useConnectorSnapshot<GitlabData>('gitlab', (prev) => fetchGitlab(instanceUrl, token, prev))
  if (!data) return null

  const mrs = (data.mrs ?? []).slice(0, MAX_MRS)
  const todos = data.todos
  // Connected but nothing assigned — a deliberate, friendly rendered state
  // (same as GithubWidget's 🎉 line), so the live connection is still visible.
  const empty = mrs.length === 0

  return (
    // Floating panel surface — identical shape/elevation to GithubWidget's
    // section (the house rule for floating surfaces): the solid panel token,
    // rounded-2xl/shadow-lg, w-80 fixed card width. `p-4`->`p-3` (Task 55
    // fix round 2 — see GithubWidget.tsx's own MAX_PRS comment): a modest,
    // right-column-only chrome trim, not a shape change.
    <section aria-label="GitLab" className="w-80 rounded-2xl bg-panel-solid p-3 dense:p-2 text-fg shadow-lg">
      <div className="mb-1.5 dense:mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">GitLab</h2>
        {/* To-dos chip renders only when > 0 — todos is a plain number here
            (no null/"unavailable" case, unlike github's notifications), so
            0 (all caught up) is the only hidden state. "20+" at the
            per-page cap. */}
        {todos > 0 && (
          <span className="text-xs text-fg-muted">{todos >= TODOS_CAP ? '20+' : todos} to-dos</span>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-fg-muted">No MRs assigned to you.</p>
      ) : (
        <ul className="flex flex-col gap-2 dense:gap-1">
          {mrs.map((item) => (
            <ItemRow key={item.url} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One MR row: the whole row is a single external link (a new tab, and rel
 *  that severs window.opener and strips the referrer), with the project
 *  prefix as quiet context above the title and the full title one hover away
 *  via the title attribute — identical shape to GithubWidget's ItemRow. */
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
