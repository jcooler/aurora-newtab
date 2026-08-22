import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import {
  fetchSentryIssues,
  isSentryData,
  sentryItemLimit,
  type SentryData,
  type SentryIssue,
} from '../../../services/connectors/sentry'
import type { ConnectorConfig, SentryConfig } from '../../../services/connectors/types'
import { WorkConnectorSetup, WorkDockDetail, WorkWidgetShell } from '../work/WorkWidgetShell'
import { workPresentationState, workRowClass } from '../work/workPresentation'

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
    isSentryData,
  )

  const issues = data?.issues ?? []
  const presentation = workPresentationState(true, state, data !== null && issues.length === 0)
  const critical = issues.filter((issue) => issue.severity === 'critical').length
  const facts = [
    `${issues.length} unresolved`,
    critical > 0 ? `${critical} critical` : issues.length > 0 ? 'No critical' : null,
  ]
  const visible = canvasSize === 'full'
    ? issues
    : canvasSize === 'standard'
      ? issues.slice(0, sentryItemLimit(config))
      : []
  const detailRows = issues.slice(0, Math.min(3, sentryItemLimit(config)))

  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.sentry
      return next
    })
  }

  if (docked) {
    const dockFacts = presentation === 'hard-error'
      ? ['Sentry unavailable']
      : presentation === 'loading'
        ? ['Loading Sentry']
        : facts
    return (
      <WorkDockDetail
        label="Sentry"
        facts={dockFacts}
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
          </div>
          {visible.length > 0 ? <IssueList issues={visible} className="mt-3" /> : null}
        </>
      ) : null}
    </WorkWidgetShell>
  )
}

function IssueList({ issues, className = '' }: { issues: readonly SentryIssue[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {issues.map((issue) => (
        <li key={issue.id}>
          <IssueRow issue={issue} />
        </li>
      ))}
    </ul>
  )
}

function IssueRow({ issue }: { issue: SentryIssue }) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg group-hover:text-accent group-focus-within:text-accent">
          {issue.title}
        </span>
        <span className={`block truncate text-xs ${workRowClass}`}>
          {issue.project.name} · {issue.shortId}
        </span>
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
