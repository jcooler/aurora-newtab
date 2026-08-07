import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchJira, type JiraData, type JiraIssue } from '../../../services/connectors/jira'
import type { ConnectorConfig, JiraConfig } from '../../../services/connectors/types'

const MAX_ISSUES = 5

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

export default function JiraWidget() {
  // Zero-hooks-in-the-gate split, same as GithubWidget/GitlabWidget: the one
  // useStoredKey read runs every render (Rules of Hooks stay satisfied), but a
  // disabled/unconnected connector never mounts JiraInner and therefore
  // never runs useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const jira = connectedJira(connectors?.jira)
  if (!jira) return null
  return <JiraInner site={jira.site} email={jira.email} apiToken={jira.apiToken} />
}

function JiraInner({ site, email, apiToken }: { site: string; email: string; apiToken: string }) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so the one-endpoint fetch's
  // quiet-failure path keeps it (fetchJira has no ETag round-trip — see its
  // own doc comment — but still carries `prev` forward). No cached data yet
  // (first-ever load in flight, or a total failure) renders nothing rather
  // than an empty shell — same as GithubInner/GitlabInner.
  const { data } = useConnectorSnapshot<JiraData>('jira', (prev) => fetchJira(site, email, apiToken, prev))
  if (!data) return null

  const issues = (data.issues ?? []).slice(0, MAX_ISSUES)
  const counts = data.counts ?? {}
  const countEntries = Object.entries(counts)
  // Connected but nothing assigned — a deliberate, friendly rendered state
  // (same as GitlabWidget's "No MRs assigned to you." line), so the live
  // connection is still visible.
  const empty = issues.length === 0

  // First two statuses BY COUNT (descending); Array.prototype.sort is stable,
  // so equal counts keep the insertion order countByStatus (jira.ts) produced
  // — i.e. whichever status was seen FIRST in the issues array.
  const topCounts = [...countEntries].sort((a, b) => b[1] - a[1]).slice(0, 2)

  return (
    // Floating panel surface — identical shape/elevation to GithubWidget's/
    // GitlabWidget's section (the house rule for floating surfaces): the
    // solid panel token, rounded-2xl/shadow-lg/p-4, w-80 fixed card width.
    <section aria-label="Jira" className="w-80 rounded-2xl bg-panel-solid p-4 text-fg shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Jira</h2>
        {/* Counts line renders only when there's at least one status to show —
            'when non-empty' per the brief. Never present alongside the empty
            state below (empty implies countEntries is also empty, since
            counts is derived FROM issues). */}
        {countEntries.length > 0 && (
          <span className="text-xs text-fg-muted">
            {topCounts.map(([status, count]) => `${count} ${status}`).join(' · ')}
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-fg-muted">Nothing assigned to you.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((item) => (
            <ItemRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One issue row: the whole row is a single external link (a new tab, and
 *  rel that severs window.opener and strips the referrer), with the issue
 *  key as quiet context above the summary and the full summary one hover
 *  away via the title attribute — identical shape to GithubWidget's/
 *  GitlabWidget's ItemRow. */
function ItemRow({ item }: { item: JiraIssue }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.summary}
        className="group block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="block truncate text-xs text-fg-muted font-medium">{item.key}</span>
        <span className="block truncate text-sm text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.summary}
        </span>
      </a>
    </li>
  )
}
