// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MetricsContextValue } from '../../../metrics/MetricsProvider'
import type { MetricBucketV1, MetricsHistoryV1 } from '../../../metrics/types'
import { MetricsWidgetView } from './MetricsWidget'

const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111'

function bucket(id: string, date: string, values: MetricBucketV1['values']): MetricBucketV1 {
  return {
    schemaVersion: 1,
    id,
    date,
    source: values.kind,
    sourceInstanceId: values.kind === 'focus' ? INSTALLATION_ID : values.kind === 'tasks' ? 'local-tasks' : values.kind === 'habits' ? 'local-habits' : values.kind === 'calendar' ? 'ics' : values.kind === 'development' ? 'github' : 'strava',
    installationId: INSTALLATION_ID,
    sequence: 1,
    values,
  }
}

const HISTORY: MetricsHistoryV1 = {
  version: 1,
  installationId: INSTALLATION_ID,
  buckets: [
    bucket('10000000-0000-4000-8000-000000000001', '2026-09-02', { kind: 'tasks', completed: 5, carriedForward: 1 }),
    bucket('10000000-0000-4000-8000-000000000002', '2026-09-02', { kind: 'focus', sessions: 2, minutes: 50 }),
    bucket('10000000-0000-4000-8000-000000000003', '2026-09-01', { kind: 'habits', completed: 3, tracked: 4, streak: 2 }),
    bucket('10000000-0000-4000-8000-000000000004', '2026-09-01', { kind: 'calendar', events: 2, busyMinutes: 120 }),
    bucket('10000000-0000-4000-8000-000000000005', '2026-08-28', { kind: 'development', commits: 4, reviews: 1, issues: 0, deployments: 1, failures: 0 }),
    bucket('10000000-0000-4000-8000-000000000006', '2026-08-28', { kind: 'fitness', activities: 1, durationMinutes: 35, distanceMeters: 5_000, elevationMeters: 40, types: { run: 1, ride: 0, walk: 0, hike: 0, swim: 0, other: 0 } }),
  ],
}

function metrics(overrides: Partial<MetricsContextValue> = {}): MetricsContextValue {
  return {
    hydrated: true,
    entitled: true,
    history: HISTORY,
    issue: null,
    retryMetrics: vi.fn(),
    deleteMetricsHistory: vi.fn(async () => undefined),
    exportMetricsHistory: vi.fn(() => null),
    recordFocusCompletion: (current) => current,
    ...overrides,
  }
}

afterEach(cleanup)

describe('Metrics widget approved states', () => {
  it('reserves the Compact frame while loading', () => {
    render(<MetricsWidgetView canvasSize="compact" today="2026-09-02" metrics={metrics({ hydrated: false, history: null })} syncPhase="disabled" />)
    expect(screen.getByRole('status').textContent).toContain('Loading metrics')
    expect(screen.getByRole('region', { name: 'Metrics' }).getAttribute('data-tier-frame-state')).toBe('loading')
  })

  it('shows the premium promise and one real action without a fake chart when locked', () => {
    const onOpenMetrics = vi.fn()
    render(<MetricsWidgetView canvasSize="standard" today="2026-09-02" metrics={metrics({ entitled: false, history: null })} syncPhase="disabled" onOpenMetrics={onOpenMetrics} />)
    const region = screen.getByRole('region', { name: 'Metrics' })
    expect(within(region).getByRole('heading', { name: 'See the rhythm behind your days.' })).toBeTruthy()
    expect(within(region).queryByRole('img', { name: /activity rhythm/i })).toBeNull()
    fireEvent.click(within(region).getByRole('button', { name: 'See premium plans' }))
    expect(onOpenMetrics).toHaveBeenCalledOnce()
  })

  it('uses the truthful first-use state for an entitled account with no history', () => {
    render(<MetricsWidgetView canvasSize="standard" today="2026-09-02" metrics={metrics({ history: null })} syncPhase="disabled" />)
    expect(screen.getByRole('heading', { name: 'Your first week starts here.' })).toBeTruthy()
    expect(screen.queryByText('0 active days')).toBeNull()
  })

  it('keeps Compact to active days, rhythm, Tasks, and Focus', () => {
    render(<MetricsWidgetView canvasSize="compact" today="2026-09-02" metrics={metrics()} syncPhase="up_to_date" />)
    const region = screen.getByRole('region', { name: 'Metrics' })
    expect(region.textContent).toContain('3/7')
    expect(region.textContent).toContain('5 tasks')
    expect(region.textContent).toContain('50 focus min')
    expect(within(region).getByRole('img', { name: /3 active days in the last 7 days/i })).toBeTruthy()
    expect(within(region).queryByRole('button')).toBeNull()
  })

  it('shows the approved Standard hierarchy and opens history', () => {
    const onOpenMetrics = vi.fn()
    render(<MetricsWidgetView canvasSize="standard" today="2026-09-02" metrics={metrics()} syncPhase="up_to_date" onOpenMetrics={onOpenMetrics} />)
    expect(screen.getByRole('region', { name: 'Metrics' }).textContent).toContain('3 active days')
    expect(screen.getByText('50m')).toBeTruthy()
    expect(screen.getByText('5 done')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.queryByText(/previous period/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View history' }))
    expect(onOpenMetrics).toHaveBeenCalledOnce()
  })

  it('offers one keyboard-native active range in Full and changes local presentation only', () => {
    render(<MetricsWidgetView canvasSize="full" today="2026-09-02" metrics={metrics()} syncPhase="up_to_date" />)
    const ranges = screen.getByRole('group', { name: 'History range' })
    expect(within(ranges).getAllByRole('button')).toHaveLength(4)
    expect(within(ranges).getByRole('button', { name: '30d' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(ranges).getByRole('button', { name: '7d' }))
    expect(within(ranges).getByRole('button', { name: '7d' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(ranges).getByRole('button', { name: '30d' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Development')).toBeTruthy()
    expect(screen.queryByText('Fitness')).toBeNull()
  })

  it('keeps retained history visible when entitlement expires or sync is offline', () => {
    const { rerender } = render(<MetricsWidgetView canvasSize="full" today="2026-09-02" metrics={metrics({ entitled: false })} syncPhase="up_to_date" />)
    expect(screen.getByText('History paused')).toBeTruthy()
    expect(screen.getByText('5 done')).toBeTruthy()

    rerender(<MetricsWidgetView canvasSize="full" today="2026-09-02" metrics={metrics()} syncPhase="offline" />)
    expect(screen.getByText('Sync offline')).toBeTruthy()
    expect(screen.getByText('5 done')).toBeTruthy()
  })

  it('retains useful data through collection errors and exposes a bounded retry', () => {
    const retryMetrics = vi.fn()
    render(<MetricsWidgetView canvasSize="full" today="2026-09-02" metrics={metrics({ issue: 'collection', retryMetrics })} syncPhase="up_to_date" />)
    expect(screen.getByText('History safe. Updates paused.')).toBeTruthy()
    expect(screen.getByText('5 done')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retryMetrics).toHaveBeenCalledOnce()
  })

  it('uses a truthful hard error without retained data', () => {
    render(<MetricsWidgetView canvasSize="standard" today="2026-09-02" metrics={metrics({ history: null, issue: 'storage' })} syncPhase="needs_attention" />)
    expect(screen.getByRole('alert').textContent).toContain('Metrics is unavailable')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('reduces Docked presentation to one dense line', () => {
    render(<MetricsWidgetView canvasSize="compact" docked today="2026-09-02" metrics={metrics()} syncPhase="up_to_date" />)
    const line = screen.getByLabelText('Metrics: 3 active days, Focus 50m, Tasks 5')
    expect(line.textContent).toContain('3 active days')
    expect(line.textContent).toContain('Focus 50m')
    expect(line.textContent).toContain('Tasks 5')
  })

  it.each([
    ['loading', metrics({ hydrated: false, history: null }), 'disabled', 'Metrics: Loading'],
    ['locked', metrics({ entitled: false, history: null }), 'disabled', 'Metrics: Premium history'],
    ['first use', metrics({ history: null }), 'up_to_date', 'Metrics: Ready when you are'],
    ['unavailable', metrics({ history: null, issue: 'storage' }), 'needs_attention', 'Metrics: Unavailable'],
  ] as const)('keeps the %s state inside the one-line Docked contract', (_name, value, syncPhase, label) => {
    render(<MetricsWidgetView canvasSize="compact" docked today="2026-09-02" metrics={value} syncPhase={syncPhase} />)
    expect(screen.getByLabelText(label).hasAttribute('data-dock-line')).toBe(true)
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()
  })
})
