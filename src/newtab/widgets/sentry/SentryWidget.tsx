import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import {
  fetchSentryIssues,
  isSentryDataForRegion,
  sentryItemLimit,
  type SentryData,
  type SentryIssue,
} from '../../../services/connectors/sentry'
import type { ConnectorConfig, SentryConfig } from '../../../services/connectors/types'
import { WorkConnectorSetup, WorkDockDetail, WorkWidgetShell } from '../work/WorkWidgetShell'
import { workPresentationState, workRowClass } from '../work/workPresentation'

const SENTRY_FRAME_ROWS: Readonly<Record<CanvasSize, number>> = {
  compact: 1,
  standard: 2,
  full: 3,
}

function connectedSentry(config: ConnectorConfig | undefined): SentryConfig | null {
  if (!config || !('organization' in config) || !('region' in config)) return null
  const sentry = config as SentryConfig
  return sentry.enabled && typeof sentry.token === 'string' && sentry.token.trim().length > 0 &&
    typeof sentry.organization === 'string' && sentry.organization.trim().length > 0
    ? sentry
    : null
}

export default function SentryWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const candidate = connectors?.sentry
  if (!candidate || candidate.enabled !== true) return null
  const config = connectedSentry(candidate)
  if (!config) return <WorkConnectorSetup title="Sentry" canvasSize={canvasSize} docked={docked} />
  return <SentryInner config={config} canvasSize={canvasSize} docked={docked} />
}

function SentryInner({
  config,
  canvasSize,
  docked,
}: {
  config: SentryConfig
  canvasSize: CanvasSize
  docked: boolean
}) {
  const storage = useStorage()
  const { data, state, lastError } = useConnectorSnapshot<SentryData>(
    'sentry',
    config,
    async () => {
      const result = await fetchSentryIssues(config)
      if (!result.ok) throw new Error(result.message)
      return result.data
    },
    undefined,
    undefined,
    (value) => isSentryDataForRegion(value, config.region),
  )

  const issues = data?.issues ?? []
  const presentation = workPresentationState(true, state, data !== null && issues.length === 0)
  const critical = issues.filter((issue) => issue.severity === 'critical').length
  const strongest = strongestIssue(issues)
  const topTrending = topTrendingIssue(issues)
  const dockFacts = [
    `${issues.length} unresolved`,
    topTrending?.shortId ?? null,
  ]
  const rowLimit = presentation === 'retained-error' ? canvasSize === 'compact' ? 0 : 1 : SENTRY_FRAME_ROWS[canvasSize]
  const visible = (canvasSize === 'compact' && topTrending ? [topTrending] : issues).slice(0, Math.min(rowLimit, sentryItemLimit(config)))
  const detailRows = issues.slice(0, Math.min(3, sentryItemLimit(config)))

  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.sentry
      return next
    })
  }

  if (docked) {
    const renderedDockFacts = presentation === 'hard-error'
      ? ['Sentry unavailable']
      : presentation === 'loading'
        ? ['Loading Sentry']
        : dockFacts
    return (
      <WorkDockDetail
        label="Sentry"
        facts={renderedDockFacts}
        tone={critical > 0 ? 'critical' : 'quiet'}
        presentation={presentation}
        emptyLabel="No unresolved issues."
        errorMessage={lastError ?? undefined}
        onRefresh={retry}
      >
        <IssueList issues={detailRows} />
      </WorkDockDetail>
    )
  }

  return (
    <WorkWidgetShell
      title="Sentry"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel="No unresolved issues."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {data && issues.length > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className={critical > 0 ? 'text-sm font-semibold text-red-400' : 'text-sm font-semibold'}>
              {issues.length} unresolved
            </strong>
            <span className="text-xs text-fg-muted">{critical} critical</span>
            {canvasSize === 'compact' && strongest && topTrending ? (
              <span className="sr-only">
                <span className="text-xs font-medium text-fg-muted">{levelLabel(strongest.level)}</span>
                <span className="text-xs font-medium text-fg-muted">{topTrending.shortId}</span>
              </span>
            ) : null}
          </div>
          {visible.length > 0 ? (
            <IssueList
              issues={visible}
              className={canvasSize === 'standard' ? 'mt-2' : 'mt-3'}
              dense={canvasSize === 'standard'}
              full={canvasSize === 'full'}
              framed
            />
          ) : null}
        </>
      ) : null}
    </WorkWidgetShell>
  )
}

function strongestIssue(issues: readonly SentryIssue[]): SentryIssue | null {
  const rank: Record<SentryIssue['level'], number> = { fatal: 6, error: 5, warning: 4, info: 3, debug: 2, unknown: 1 }
  return issues.reduce<SentryIssue | null>((strongest, issue) =>
    strongest === null || rank[issue.level] > rank[strongest.level] ? issue : strongest, null)
}

function topTrendingIssue(issues: readonly SentryIssue[]): SentryIssue | null {
  const rank: Record<SentryIssue['trend'], number> = { rising: 5, new: 4, steady: 3, falling: 2, unknown: 1 }
  return issues.reduce<SentryIssue | null>((top, issue) => {
    if (top === null) return issue
    if (rank[issue.trend] !== rank[top.trend]) return rank[issue.trend] > rank[top.trend] ? issue : top
    return issue.events24h > top.events24h ? issue : top
  }, null)
}

function levelLabel(level: SentryIssue['level']): string {
  return `${level[0]!.toUpperCase()}${level.slice(1)}`
}

function seenLabel(prefix: string, value: string | null): string | null {
  if (!value) return null
  return `${prefix} ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))}`
}

function IssueList({
  issues,
  className = '',
  dense = false,
  full = false,
  framed = false,
}: {
  issues: readonly SentryIssue[]
  className?: string
  dense?: boolean
  full?: boolean
  framed?: boolean
}) {
  return (
    <ul className={`flex flex-col ${dense ? 'gap-1' : 'gap-2'} ${className}`}>
      {issues.map((issue) => (
        <li key={issue.id}>
          <IssueRow issue={issue} full={full} framed={framed} />
        </li>
      ))}
    </ul>
  )
}

function IssueRow({ issue, full = false, framed = false }: { issue: SentryIssue; full?: boolean; framed?: boolean }) {
  const standardFacts = [levelLabel(issue.level), `${issue.userCount} users`, seenLabel('Last seen', issue.lastSeen)]
  const fullFacts = [
    seenLabel('First seen', issue.firstSeen),
    issue.priority ? `Priority ${issue.priority}` : null,
    issue.isRegression ? 'Regression' : null,
  ]
  if (framed) {
    const details = [issue.title, issue.project.name, issue.shortId, `${issue.events24h} events in 24h`, issue.trend, ...standardFacts, ...fullFacts].filter(Boolean).join(' · ')
    const content = <>
      <span className="sentry-issue-title">{issue.title}</span>
      <span className="sentry-issue-impact">{issue.userCount} users · {issue.events24h} events in 24h</span>
      <span className="sentry-issue-context">{issue.project.name} · {issue.shortId} · {levelLabel(issue.level)}{issue.isRegression ? ' · Regression' : ''}</span>
    </>
    return issue.permalink
      ? <a href={issue.permalink} target="_blank" rel="noopener noreferrer" title={details} aria-label={details} className="sentry-issue-row">{content}</a>
      : <div title={details} aria-label={details} className="sentry-issue-row">{content}</div>
  }
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg group-hover:text-accent group-focus-within:text-accent">
          {issue.title}
        </span>
        <span className={`block truncate text-xs ${workRowClass}`}>
          {issue.project.name} · {issue.shortId}
        </span>
        <span className={`block truncate text-xs ${workRowClass}`}>
          {standardFacts.filter(Boolean).join(' · ')}
        </span>
        {full && fullFacts.some(Boolean) ? (
          <span className={`block truncate text-xs ${workRowClass}`}>
            {fullFacts.filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <span className={`shrink-0 text-right text-xs ${workRowClass}`}>
        {issue.events24h} events in 24h · {issue.trend}
      </span>
    </>
  )
  const className = 'group flex min-w-0 items-center gap-3 rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-accent'

  return issue.permalink ? (
    <a href={issue.permalink} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  )
}
