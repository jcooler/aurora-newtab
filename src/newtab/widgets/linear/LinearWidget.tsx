import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import {
  fetchLinearWork,
  isLinearWorkData,
  linearItemLimit,
  linearTeamIds,
  type LinearIssue,
  type LinearWorkData,
} from '../../../services/connectors/linear'
import type { ConnectorConfig, LinearConfig } from '../../../services/connectors/types'
import { WorkDockDetail, WorkWidgetShell } from '../work/WorkWidgetShell'
import { workPresentationState, workRowClass } from '../work/workPresentation'

function connectedLinear(config: ConnectorConfig | undefined): LinearConfig | null {
  if (!config || !('displayName' in config)) return null
  const linear = config as LinearConfig
  return linear.enabled && typeof linear.token === 'string' && linear.token.trim().length > 0 &&
    typeof linear.displayName === 'string' && linear.displayName.trim().length > 0
    ? linear
    : null
}

export default function LinearWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const config = connectedLinear(connectors?.linear)
  if (!config) return null
  return <LinearInner config={config} canvasSize={canvasSize} docked={docked} />
}

function LinearInner({ config, canvasSize, docked }: { config: LinearConfig; canvasSize: CanvasSize; docked: boolean }) {
  const storage = useStorage()
  const { data, state, lastError } = useConnectorSnapshot<LinearWorkData>(
    'linear',
    config,
    () => fetchLinearWork(config.token, linearTeamIds(config)),
    undefined,
    undefined,
    isLinearWorkData,
  )
  const issues = data?.issues ?? []
  const presentation = workPresentationState(true, state, data !== null && issues.length === 0)
  const dueSoon = issues.filter((issue) => issue.dueSoon).length
  const facts = [
    `${issues.length} assigned`,
    dueSoon > 0 ? `${dueSoon} due soon` : issues.length > 0 ? 'Nothing due soon' : null,
  ]
  const visible = canvasSize === 'full'
    ? issues
    : canvasSize === 'standard'
      ? issues.slice(0, linearItemLimit(config))
      : []
  const detailRows = issues.slice(0, Math.min(3, linearItemLimit(config)))
  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.linear
      return next
    })
  }

  if (docked) {
    return (
      <WorkDockDetail
        label="Linear"
        facts={presentation === 'hard-error' ? ['Linear unavailable'] : presentation === 'loading' ? ['Loading Linear'] : facts}
        tone={dueSoon > 0 ? 'attention' : 'quiet'}
        presentation={presentation}
        emptyLabel="No assigned issues."
        errorMessage={lastError ?? undefined}
        onRefresh={retry}
      >
        <IssueList issues={detailRows} />
      </WorkDockDetail>
    )
  }

  return (
    <WorkWidgetShell
      title="Linear"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel="No assigned issues."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {data && issues.length > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-sm font-semibold">{issues.length} assigned</strong>
            <span className={dueSoon > 0 ? 'text-xs text-accent' : 'text-xs text-fg-muted'}>{dueSoon} due soon</span>
          </div>
          {visible.length > 0 ? <IssueList issues={visible} className="mt-3" /> : null}
        </>
      ) : null}
    </WorkWidgetShell>
  )
}

function IssueList({ issues, className = '' }: { issues: readonly LinearIssue[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {issues.map((issue) => <li key={issue.id}><IssueRow issue={issue} /></li>)}
    </ul>
  )
}

function dueLabel(issue: LinearIssue): string | null {
  if (issue.dueStatus === 'overdue') return 'Overdue'
  if (issue.dueStatus === 'today') return 'Due today'
  if (issue.dueStatus === 'soon') return 'Due soon'
  if (issue.dueStatus === 'later') return 'Due later'
  return null
}

function IssueRow({ issue }: { issue: LinearIssue }) {
  const due = dueLabel(issue)
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 items-center gap-3 rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg group-hover:text-accent group-focus-within:text-accent">
          {issue.title}
        </span>
        <span className={`block truncate text-xs ${workRowClass}`}>
          {issue.identifier} · {issue.team.name} · {issue.state.name}
        </span>
      </span>
      {due || issue.cycle ? (
        <span className={`shrink-0 text-right text-xs ${workRowClass}`}>
          {[due, issue.cycle?.name].filter(Boolean).join(' · ')}
        </span>
      ) : null}
    </a>
  )
}
