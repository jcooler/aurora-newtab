import { useMemo, useState, type CSSProperties } from 'react'

import { useAccount } from '../../../account/AccountContext'
import type { SyncPhase } from '../../../account/types'
import { readLocalDay } from '../../../lib/hooks/useLocalDay'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useMetrics, type MetricsContextValue } from '../../../metrics/MetricsProvider'
import { summarizeMetrics } from '../../../metrics/history'
import type { MetricRange, MetricSummary } from '../../../metrics/types'
import { activeDayCount, activityIntervals } from './activityIntervals'
import DockLine from '../shared/DockLine'
import TierFrame from '../shared/TierFrame'

const RANGES: readonly MetricRange[] = ['7d', '30d', '90d', '365d']

function shiftDay(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`
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

function chartDate(key: string, year = false): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}), timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`))
}

function ActivityRhythm({ summary, compact = false }: { summary: MetricSummary; compact?: boolean }) {
  const [detail, setDetail] = useState<string | null>(null)
  const active = activeDayCount(summary)
  const intervals = activityIntervals(summary)
  const label = `${active} active days in the last ${summary.days.length} days`
  const maximum = Math.max(1, ...intervals.map((interval) => interval.dayCount))
  if (compact) {
    return (
      <div className="metrics-day-markers" role="img" aria-label={label}>
        {intervals.map((interval) => <span key={interval.start} title={`${chartDate(interval.start)}: ${interval.activeDays ? 'Active' : 'No recorded activity'}`}><i data-active={interval.activeDays > 0} /><small>{new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${interval.start}T12:00:00Z`))}</small></span>)}
      </div>
    )
  }
  return (
    <div className="metrics-interval-chart" role="group" aria-label={label}>
      <div className="metrics-interval-scale" aria-hidden><span>{maximum}</span><span>0</span></div>
      <div className="metrics-interval-bars">
        {intervals.map((interval) => {
          const dates = interval.start === interval.end ? chartDate(interval.start, summary.range === '365d') : `${chartDate(interval.start, summary.range === '365d')} – ${chartDate(interval.end, summary.range === '365d')}`
          const copy = `${dates}: ${interval.activeDays} active days out of ${interval.dayCount}`
          return <button key={interval.start} type="button" aria-label={copy} onFocus={() => setDetail(copy)} onBlur={() => setDetail(null)} onMouseEnter={() => setDetail(copy)} onMouseLeave={() => setDetail(null)} onClick={() => setDetail(copy)} onKeyDown={(event) => { if (event.key === 'Escape') setDetail(null) }} style={{ '--metrics-level': `${interval.activeDays / maximum * 100}%` } as CSSProperties}><i aria-hidden /></button>
        })}
      </div>
      <div className="metrics-axis-copy"><span>{chartDate(summary.start, summary.range === '365d')}</span><span>{chartDate(summary.end, summary.range === '365d')}</span></div>
      {detail ? <div className="metrics-chart-detail" role="status">{detail}</div> : null}
    </div>
  )
}

function summaryPair(history: NonNullable<MetricsContextValue['history']>, range: MetricRange, today: string) {
  const current = summarizeMetrics(history, range, today)
  const previous = summarizeMetrics(history, range, shiftDay(current.start, -1))
  const previousAvailable = history.buckets.some((bucket) => (
    bucket.date >= previous.start && bucket.date <= previous.end
  ))
  return { current, previous, previousAvailable }
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

function StandardMetrics({ summary, previous, previousAvailable, onOpenMetrics }: { summary: MetricSummary; previous: MetricSummary; previousAvailable: boolean; onOpenMetrics?: () => void }) {
  const active = activeDayCount(summary)
  const delta = active - activeDayCount(previous)
  return (
    <>
      <header className="metrics-standard-header"><strong>Metrics</strong>{onOpenMetrics ? <button type="button" onClick={onOpenMetrics}>View history</button> : null}</header>
      <div className="metrics-standard-summary">
        <div><b>{active}</b><span>{' active days'}</span><small>Last 30 days</small>{previousAvailable ? <small title={comparisonCopy(delta)}>{comparisonCopy(delta)}</small> : null}</div>
        <ActivityRhythm summary={summary} />
      </div>
      <p className="metrics-interval-description">Active days per 5-day interval</p>
      <div className="metrics-standard-support" aria-label="Thirty day summary">
        <span><small>Focus</small><b>{formatDuration(summary.totals.focus.minutes)}</b></span>
        <span><small>Tasks</small><b>{summary.totals.tasks.completed} done</b></span>
        <span><small>Habits</small><b>{habitRate(summary)}</b></span>
      </div>
    </>
  )
}

function categoryRows(current: MetricSummary, previous: MetricSummary, previousAvailable: boolean) {
  const habitCurrent = current.totals.habits.tracked ? Math.round(current.totals.habits.completed / current.totals.habits.tracked * 100) : 0
  const habitPrevious = previous.totals.habits.tracked ? Math.round(previous.totals.habits.completed / previous.totals.habits.tracked * 100) : 0
  return [
    ['Focus', formatDuration(current.totals.focus.minutes), previousAvailable ? categoryDelta(current.totals.focus.minutes, previous.totals.focus.minutes, 'm') : null],
    ['Tasks', `${current.totals.tasks.completed} done`, previousAvailable ? categoryDelta(current.totals.tasks.completed, previous.totals.tasks.completed) : null],
    ['Habits', habitRate(current), previousAvailable ? categoryDelta(habitCurrent, habitPrevious, ' pts') : null],
    ['Calendar', formatBusy(current.totals.calendar.busyMinutes), previousAvailable ? categoryDelta(current.totals.calendar.busyMinutes, previous.totals.calendar.busyMinutes, 'm') : null],
    ['Development', `${current.totals.development.commits} commits`, previousAvailable ? categoryDelta(current.totals.development.commits, previous.totals.development.commits) : null],
  ] as const
}

function ExpandedMetrics({
  summary,
  previous,
  previousAvailable,
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
  previousAvailable: boolean
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
  const rows = categoryRows(summary, previous, previousAvailable)
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
          <div className="metrics-trend-summary"><div><b>{active}</b><span>active days</span></div>{previousAvailable ? <small>{comparisonCopy(delta)}</small> : null}</div>
          <ActivityRhythm key={range} summary={summary} />
          <p className="metrics-interval-description">Active days per {activityIntervals(summary)[0]?.dayCount ?? 1}-day interval. Last interval: {activityIntervals(summary).at(-1)?.dayCount ?? 1} days.</p>
          {notice && onRetry ? <div className="metrics-collection-notice" role="status"><span>{notice}</span><button type="button" onClick={onRetry}>Try again</button></div> : null}
        </div>
        <div className="metrics-category-list" aria-label="Metric categories">
          {rows.map(([label, value, deltaCopy]) => <div className="metrics-category-row" key={label}><span>{label}</span><strong>{value}</strong>{deltaCopy ? <small>{deltaCopy}</small> : null}</div>)}
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

  if (docked) {
    if (!metrics.hydrated) return <DockLine label="Metrics" facts={['Loading']} />
    if (metrics.issue && !hasHistory) return <DockLine label="Metrics" facts={['Unavailable']} tone="attention" />
    if (!metrics.entitled && !hasHistory) return <DockLine label="Metrics" facts={['Premium history']} />
    if (!hasHistory || !summaries) return <DockLine label="Metrics" facts={['Ready when you are']} />
    const status = metrics.issue
      ? 'Updates paused'
      : !metrics.entitled
        ? 'History paused'
        : syncPhase === 'offline'
          ? 'Sync offline'
          : null
    return <DockLine label="Metrics" facts={[`${activeDayCount(summaries.current)} active days`, `Focus ${formatDuration(summaries.current.totals.focus.minutes)}`, `Tasks ${summaries.current.totals.tasks.completed}`, status]} tone={metrics.issue ? 'attention' : 'quiet'} />
  }

  if (!metrics.hydrated) return <Waiting tier={tier} issue={false} retry={metrics.retryMetrics} />
  if (metrics.issue && !hasHistory) return <Waiting tier={tier} issue retry={metrics.retryMetrics} />
  if (!metrics.entitled && !hasHistory) return <Locked tier={tier} onOpenMetrics={onOpenMetrics} />
  if (!hasHistory || !summaries) return <Empty tier={tier} />

  const state = metrics.issue ? 'partial' : !metrics.entitled || syncPhase === 'offline' ? 'stale' : 'ready'
  return (
    <TierFrame label="Metrics" tier={tier} state={state} className={`metrics-frame metrics-frame--${tier}`}>
      {tier === 'compact' ? <CompactMetrics summary={summaries.current} /> : null}
      {tier === 'standard' ? <StandardMetrics summary={summaries.current} previous={summaries.previous} previousAvailable={summaries.previousAvailable} onOpenMetrics={onOpenMetrics} /> : null}
      {tier === 'full' ? (
        <ExpandedMetrics
          summary={summaries.current}
          previous={summaries.previous}
          previousAvailable={summaries.previousAvailable}
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
