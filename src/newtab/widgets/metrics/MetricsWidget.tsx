import { useMemo, useState, type CSSProperties } from 'react'

import { useAccount } from '../../../account/AccountContext'
import type { SyncPhase } from '../../../account/types'
import { readLocalDay } from '../../../lib/hooks/useLocalDay'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useMetrics, type MetricsContextValue } from '../../../metrics/MetricsProvider'
import { summarizeMetrics } from '../../../metrics/history'
import type { DailyMetricSummary, MetricRange, MetricSummary } from '../../../metrics/types'
import DockLine from '../shared/DockLine'
import TierFrame from '../shared/TierFrame'

const RANGES: readonly MetricRange[] = ['7d', '30d', '90d', '365d']

function shiftDay(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`
}

function activeCategories(day: DailyMetricSummary): number {
  return Number(day.habits.completed > 0 || day.habits.tracked > 0)
    + Number(day.focus.sessions > 0 || day.focus.minutes > 0)
    + Number(day.tasks.completed > 0 || day.tasks.carriedForward > 0)
    + Number(day.calendar.events > 0 || day.calendar.busyMinutes > 0)
    + Number(Object.values(day.development).some((value) => value > 0))
    + Number(day.fitness.activities > 0 || day.fitness.durationMinutes > 0 || day.fitness.distanceMeters > 0)
}

function activeDayCount(summary: MetricSummary): number {
  return summary.days.filter((day) => activeCategories(day) > 0).length
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function formatBusy(minutes: number): string {
  return `${formatDuration(minutes)} busy`
}

function habitRate(summary: MetricSummary): string {
  return summary.totals.habits.tracked > 0
    ? `${Math.round(summary.totals.habits.completed / summary.totals.habits.tracked * 100)}%`
    : '—'
}

function comparisonCopy(delta: number): string {
  if (delta === 0) return 'Same active days as previous period'
  return `${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'day' : 'days'} vs previous period`
}

function categoryDelta(current: number, previous: number, suffix = ''): string {
  const delta = current - previous
  return `${delta > 0 ? '+' : ''}${delta}${suffix}`
}

function condensedLevels(days: readonly DailyMetricSummary[], limit: number): number[] {
  if (days.length <= limit) return days.map(activeCategories)
  const size = Math.ceil(days.length / limit)
  const levels: number[] = []
  for (let index = 0; index < days.length; index += size) {
    const slice = days.slice(index, index + size)
    levels.push(Math.max(...slice.map(activeCategories)))
  }
  return levels
}

function ActivityRhythm({ summary, bars = false, compact = false }: { summary: MetricSummary; bars?: boolean; compact?: boolean }) {
  const active = activeDayCount(summary)
  const levels = condensedLevels(summary.days, compact ? 7 : bars ? 20 : 24)
  if (compact || bars) {
    return (
      <div
        className={`metrics-bars ${compact ? 'metrics-bars--compact' : ''}`}
        role="img"
        aria-label={`${active} active days in the last ${summary.days.length} days`}
      >
        {levels.map((level, index) => (
          <i
            key={index}
            data-today={index === levels.length - 1 ? 'true' : undefined}
            style={{ '--metrics-level': `${Math.max(8, Math.round(level / 6 * 100))}%` } as CSSProperties}
          />
        ))}
      </div>
    )
  }

  const width = 252
  const height = 94
  const xStep = (width - 8) / Math.max(1, levels.length - 1)
  const points = levels.map((level, index) => ({
    x: 4 + index * xStep,
    y: height - 8 - Math.max(0, Math.min(6, level)) / 6 * (height - 16),
  }))
  const line = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const area = `${line} L${points.at(-1)!.x.toFixed(2)} ${height - 8} L${points[0]!.x.toFixed(2)} ${height - 8} Z`
  const last = points.at(-1)!
  return (
    <svg className="metrics-rhythm-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${active} active days in the last ${summary.days.length} days`}>
      <path className="metrics-chart-grid" d="M4 21 H248 M4 47 H248 M4 73 H248" />
      <path className="metrics-chart-area" d={area} />
      <path className="metrics-chart-line" d={line} />
      <circle className="metrics-chart-last" cx={last.x} cy={last.y} r="3.25" />
    </svg>
  )
}

function summaryPair(history: NonNullable<MetricsContextValue['history']>, range: MetricRange, today: string) {
  const current = summarizeMetrics(history, range, today)
  const previous = summarizeMetrics(history, range, shiftDay(current.start, -1))
  return { current, previous }
}

function Locked({ tier, onOpenMetrics }: { tier: 'compact' | 'standard' | 'full'; onOpenMetrics?: () => void }) {
  return (
    <TierFrame label="Metrics" tier={tier} state="permission-required" className="metrics-frame metrics-state-frame metrics-locked">
      <div className="metrics-state-kicker"><span className="metrics-pulse-mark" aria-hidden><i /><i /><i /><i /><i /></span><span>Private metrics</span></div>
      <h2>See the rhythm behind your days.</h2>
      <p>Understand focus, habits, tasks, and more without syncing raw activity.</p>
      {onOpenMetrics ? <button type="button" onClick={onOpenMetrics}>See premium plans <span aria-hidden>→</span></button> : null}
    </TierFrame>
  )
}

function Empty({ tier }: { tier: 'compact' | 'standard' | 'full' }) {
  return (
    <TierFrame label="Metrics" tier={tier} state="empty" className="metrics-frame metrics-state-frame metrics-empty">
      <header><strong>Metrics</strong><span>Ready when you are</span></header>
      <div className="metrics-empty-rhythm" aria-hidden>{Array.from({ length: 7 }, (_, index) => <i key={index} className={index === 0 ? 'is-first' : ''} />)}</div>
      <h2>Your first week starts here.</h2>
      <p>Complete a habit, task, or Focus session and your private history begins automatically.</p>
    </TierFrame>
  )
}

function Waiting({ tier, issue, retry }: { tier: 'compact' | 'standard' | 'full'; issue: boolean; retry: () => void }) {
  return (
    <TierFrame label="Metrics" tier={tier} state={issue ? 'hard-error' : 'loading'} aria-busy={!issue || undefined} className="metrics-frame metrics-state-frame metrics-waiting">
      <span className="metrics-loading-rhythm" aria-hidden><i /><i /><i /><i /><i /></span>
      {issue ? (
        <>
          <h2 role="alert">Metrics is unavailable.</h2>
          <p>Your local data was not changed.</p>
          <button type="button" onClick={retry}>Try again</button>
        </>
      ) : <p role="status">Loading metrics…</p>}
    </TierFrame>
  )
}

function CompactMetrics({ summary }: { summary: MetricSummary }) {
  const active = activeDayCount(summary)
  return (
    <>
      <header className="metrics-compact-header"><strong>Metrics</strong><span>Last 7 days</span></header>
      <div className="metrics-compact-main">
        <div className="metrics-compact-score"><b>{active}<span>/7</span></b><small>active days</small></div>
        <ActivityRhythm summary={summary} compact />
      </div>
      <div className="metrics-compact-support"><span><b>{summary.totals.tasks.completed}</b> tasks</span><span><b>{summary.totals.focus.minutes}</b> focus min</span></div>
    </>
  )
}

function StandardMetrics({ summary, previous, onOpenMetrics }: { summary: MetricSummary; previous: MetricSummary; onOpenMetrics?: () => void }) {
  const active = activeDayCount(summary)
  const delta = active - activeDayCount(previous)
  return (
    <>
      <header className="metrics-standard-header"><strong>Metrics</strong>{onOpenMetrics ? <button type="button" onClick={onOpenMetrics}>View history</button> : null}</header>
      <div className="metrics-standard-summary">
        <div><b>{active}</b><span>{' active days'}</span><small>{comparisonCopy(delta)}</small></div>
        <ActivityRhythm summary={summary} bars />
      </div>
      <div className="metrics-standard-support" aria-label="Thirty day summary">
        <span><small>Focus</small><b>{formatDuration(summary.totals.focus.minutes)}</b></span>
        <span><small>Tasks</small><b>{summary.totals.tasks.completed} done</b></span>
        <span><small>Habits</small><b>{habitRate(summary)}</b></span>
      </div>
    </>
  )
}

function categoryRows(current: MetricSummary, previous: MetricSummary) {
  const habitCurrent = current.totals.habits.tracked ? Math.round(current.totals.habits.completed / current.totals.habits.tracked * 100) : 0
  const habitPrevious = previous.totals.habits.tracked ? Math.round(previous.totals.habits.completed / previous.totals.habits.tracked * 100) : 0
  return [
    ['Focus', formatDuration(current.totals.focus.minutes), categoryDelta(current.totals.focus.minutes, previous.totals.focus.minutes, 'm')],
    ['Tasks', `${current.totals.tasks.completed} done`, categoryDelta(current.totals.tasks.completed, previous.totals.tasks.completed)],
    ['Habits', habitRate(current), categoryDelta(habitCurrent, habitPrevious, ' pts')],
    ['Calendar', formatBusy(current.totals.calendar.busyMinutes), categoryDelta(current.totals.calendar.busyMinutes, previous.totals.calendar.busyMinutes, 'm')],
    ['Development', `${current.totals.development.commits} commits`, categoryDelta(current.totals.development.commits, previous.totals.development.commits)],
    ['Fitness', `${current.totals.fitness.activities} activities`, categoryDelta(current.totals.fitness.activities, previous.totals.fitness.activities)],
  ] as const
}

function ExpandedMetrics({
  summary,
  previous,
  range,
  setRange,
  status,
  action,
  onAction,
  notice,
  onRetry,
}: {
  summary: MetricSummary
  previous: MetricSummary
  range: MetricRange
  setRange: (range: MetricRange) => void
  status?: string
  action?: string
  onAction?: () => void
  notice?: string
  onRetry?: () => void
}) {
  const active = activeDayCount(summary)
  const delta = active - activeDayCount(previous)
  const rows = categoryRows(summary, previous)
  return (
    <>
      <header className={`metrics-expanded-header ${status ? 'metrics-expanded-header--status' : ''}`}>
        <strong>Metrics</strong>
        {status ? <span className="metrics-plain-status"><i aria-hidden />{status}</span> : (
          <div className="metrics-range-control" role="group" aria-label="History range">
            {RANGES.map((choice) => <button key={choice} type="button" aria-pressed={choice === range} className={choice === range ? 'is-active' : ''} onClick={() => setRange(choice)}>{choice}</button>)}
          </div>
        )}
        {action && onAction ? <button type="button" className="metrics-status-action" onClick={onAction}>{action}</button> : null}
      </header>
      <div className="metrics-expanded-content">
        <div className="metrics-trend-region">
          <div className="metrics-trend-summary"><div><b>{active}</b><span>active days</span></div><small>{comparisonCopy(delta)}</small></div>
          <ActivityRhythm summary={summary} />
          <div className="metrics-axis-copy"><span>{summary.start.slice(5).replace('-', '/')}</span><span>Today</span></div>
          {notice && onRetry ? <div className="metrics-collection-notice" role="status"><span>{notice}</span><button type="button" onClick={onRetry}>Try again</button></div> : null}
        </div>
        <div className="metrics-category-list" aria-label="Metric categories">
          {rows.map(([label, value, deltaCopy]) => <div className="metrics-category-row" key={label}><span>{label}</span><strong>{value}</strong><small>{deltaCopy}</small></div>)}
        </div>
      </div>
    </>
  )
}

export function MetricsWidgetView({
  canvasSize = 'compact',
  docked = false,
  onOpenMetrics,
  today = readLocalDay().key,
  metrics,
  syncPhase,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
  onOpenMetrics?: () => void
  today?: string
  metrics: MetricsContextValue
  syncPhase: SyncPhase
}) {
  const [range, setRange] = useState<MetricRange>('30d')
  const tier = canvasSize === 'full' ? 'full' : canvasSize === 'standard' ? 'standard' : 'compact'
  const hasHistory = Boolean(metrics.history?.buckets.length)
  const requestedRange: MetricRange = tier === 'compact' ? '7d' : tier === 'standard' ? '30d' : range
  const summaries = useMemo(
    () => metrics.history ? summaryPair(metrics.history, requestedRange, today) : null,
    [metrics.history, requestedRange, today],
  )

  if (!metrics.hydrated) return <Waiting tier={tier} issue={false} retry={metrics.retryMetrics} />
  if (metrics.issue && !hasHistory) return <Waiting tier={tier} issue retry={metrics.retryMetrics} />
  if (!metrics.entitled && !hasHistory) return <Locked tier={tier} onOpenMetrics={onOpenMetrics} />
  if (!hasHistory || !summaries) return <Empty tier={tier} />

  if (docked) {
    return <DockLine label="Metrics" facts={[`${activeDayCount(summaries.current)} active days`, `Focus ${formatDuration(summaries.current.totals.focus.minutes)}`, `Tasks ${summaries.current.totals.tasks.completed}`]} />
  }

  const state = metrics.issue ? 'partial' : !metrics.entitled || syncPhase === 'offline' ? 'stale' : 'ready'
  return (
    <TierFrame label="Metrics" tier={tier} state={state} className={`metrics-frame metrics-frame--${tier}`}>
      {tier === 'compact' ? <CompactMetrics summary={summaries.current} /> : null}
      {tier === 'standard' ? <StandardMetrics summary={summaries.current} previous={summaries.previous} onOpenMetrics={onOpenMetrics} /> : null}
      {tier === 'full' ? (
        <ExpandedMetrics
          summary={summaries.current}
          previous={summaries.previous}
          range={range}
          setRange={setRange}
          status={!metrics.entitled ? 'History paused' : syncPhase === 'offline' ? 'Sync offline' : metrics.issue ? 'Update interrupted' : undefined}
          action={!metrics.entitled ? 'Renew' : undefined}
          onAction={onOpenMetrics}
          notice={metrics.issue ? 'History safe. Updates paused.' : undefined}
          onRetry={metrics.retryMetrics}
        />
      ) : null}
    </TierFrame>
  )
}

export default function MetricsWidget(props: {
  canvasSize?: CanvasSize
  docked?: boolean
  onOpenMetrics?: () => void
}) {
  const metrics = useMetrics()
  const { snapshot } = useAccount()
  return <MetricsWidgetView {...props} metrics={metrics} syncPhase={snapshot.sync.phase} />
}
