import { useMemo, useState } from 'react'

import PremiumPrompt from '../../account/PremiumPrompt'
import { useAccount } from '../../account/AccountContext'
import { readLocalDay } from '../../lib/hooks/useLocalDay'
import { useMetrics, type MetricsContextValue } from '../../metrics/MetricsProvider'
import type { MetricSource } from '../../metrics/types'
import { btnDanger, btnQuiet, select } from './shared'

const DISPLAY_METRIC_SOURCES = [
  'habits',
  'focus',
  'tasks',
  'calendar',
  'development',
] as const satisfies readonly MetricSource[]

type DisplayMetricSource = (typeof DISPLAY_METRIC_SOURCES)[number]

const SOURCE_LABELS: Readonly<Record<DisplayMetricSource, string>> = Object.freeze({
  habits: 'Habits',
  focus: 'Focus',
  tasks: 'Tasks',
  calendar: 'Calendar',
  development: 'Development',
})

type ArmedDeletion = { kind: 'source'; source: DisplayMetricSource } | { kind: 'all' } | null

export function MetricsHistoryView({
  metrics,
  signedIn,
  onSignIn,
  onViewPlans,
  today,
}: {
  metrics: MetricsContextValue
  signedIn: boolean
  onSignIn: () => void
  onViewPlans: () => void
  today: string
}) {
  const [promptVisible, setPromptVisible] = useState(true)
  const [selectedSource, setSelectedSource] = useState<DisplayMetricSource>('tasks')
  const [armed, setArmed] = useState<ArmedDeletion>(null)
  const [pending, setPending] = useState(false)
  const [alert, setAlert] = useState<string | null>(null)
  const history = metrics.history
  const hasHistory = Boolean(history?.buckets.length)
  const savedDays = useMemo(
    () => new Set(history?.buckets.map((bucket) => bucket.date) ?? []).size,
    [history],
  )

  function exportHistory() {
    setAlert(null)
    try {
      const json = metrics.exportMetricsHistory()
      if (!json) throw new Error('metrics_export_empty')
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tab-two-metrics-${today}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setAlert('Metrics history could not be exported. Try again.')
    }
  }

  async function confirmDeletion(target: Exclude<ArmedDeletion, null>) {
    if (pending) return
    setPending(true)
    setAlert(null)
    try {
      if (target.kind === 'source') await metrics.deleteMetricsHistory({ source: target.source })
      else await metrics.deleteMetricsHistory()
      setArmed(null)
    } catch {
      setAlert('Metrics history was not deleted. Try again.')
    } finally {
      setPending(false)
    }
  }

  if (!hasHistory && !metrics.entitled) {
    return (
      <div data-settings-anchor="metrics-history" tabIndex={-1} className="mt-8 border-t border-hairline pt-6 outline-none">
        {promptVisible ? (
          <PremiumPrompt
            title="Metrics history"
            benefit="See longer patterns without syncing raw activity."
            signedIn={signedIn}
            onSignIn={onSignIn}
            onViewPlans={onViewPlans}
            onContinueFree={() => setPromptVisible(false)}
          />
        ) : (
          <div>
            <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-fg">Metrics history</h2>
            <p className="mt-1 text-sm text-fg-muted">Metrics stays off. Everything else in Tab Two remains available.</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-settings-anchor="metrics-history" tabIndex={-1} className="mt-8 border-t border-hairline pt-6 outline-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-fg">Metrics history</h2>
          <p className="mt-1 max-w-[34rem] text-sm leading-relaxed text-fg-muted">
            Private daily summaries stay on your devices. Raw activity and account secrets are never included.
          </p>
        </div>
        {!metrics.entitled ? <span className="rounded-full border border-control-border px-2.5 py-1 text-xs font-medium text-fg-muted">History paused</span> : null}
      </div>

      {!hasHistory ? (
        <div className="py-7">
          <p className="text-sm font-medium text-fg">No metrics history yet</p>
          <p className="mt-1 text-sm text-fg-muted">Complete a habit, task, or Focus session and history begins automatically.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-4">
            <div>
              <p className="text-sm font-medium text-fg">{savedDays} saved {savedDays === 1 ? 'day' : 'days'}</p>
              <p className="mt-0.5 text-xs text-fg-muted">Download a portable copy whenever you like.</p>
            </div>
            <button type="button" className={btnQuiet} onClick={exportHistory}>Export history</button>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-medium text-fg">Delete history</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">Deletion removes only saved metric summaries. Your tasks, habits, and connector data are unchanged.</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">Existing activity can build new summaries again after deletion.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-48 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
                History to delete
                <select
                  aria-label="History to delete"
                  className={`${select} mt-1 w-full normal-case tracking-normal`}
                  value={selectedSource}
                  onChange={(event) => {
                    setSelectedSource(event.currentTarget.value as DisplayMetricSource)
                    setArmed(null)
                    setAlert(null)
                  }}
                >
                  {DISPLAY_METRIC_SOURCES.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={pending}
                className={`${btnDanger} disabled:cursor-not-allowed disabled:opacity-50`}
                onClick={() => {
                  const target = { kind: 'source' as const, source: selectedSource }
                  if (armed?.kind === 'source' && armed.source === selectedSource) void confirmDeletion(target)
                  else {
                    setArmed(target)
                    setAlert(null)
                  }
                }}
              >
                {armed?.kind === 'source' && armed.source === selectedSource
                  ? `Confirm delete ${SOURCE_LABELS[selectedSource]} history`
                  : 'Delete selected history'}
              </button>
              <button
                type="button"
                disabled={pending}
                className={`${btnDanger} disabled:cursor-not-allowed disabled:opacity-50`}
                onClick={() => {
                  if (armed?.kind === 'all') void confirmDeletion(armed)
                  else {
                    setArmed({ kind: 'all' })
                    setAlert(null)
                  }
                }}
              >
                {armed?.kind === 'all' ? 'Confirm delete all history' : 'Delete all history'}
              </button>
            </div>
          </div>
        </>
      )}

      {alert ? <p role="alert" className="mt-3 text-xs text-red-400">{alert}</p> : null}
    </div>
  )
}

export default function MetricsHistory() {
  const metrics = useMetrics()
  const { snapshot, actions } = useAccount()
  return (
    <MetricsHistoryView
      metrics={metrics}
      signedIn={snapshot.mode === 'signed_in'}
      onSignIn={() => { void actions.beginSignIn() }}
      onViewPlans={() => { void actions.openPlans(snapshot.billing.introductoryEligible ? 'intro_annual' : 'annual') }}
      today={readLocalDay().key}
    />
  )
}
