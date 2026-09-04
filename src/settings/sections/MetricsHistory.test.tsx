// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MetricsContextValue } from '../../metrics/MetricsProvider'
import type { MetricsHistoryV1 } from '../../metrics/types'
import { MetricsHistoryView } from './MetricsHistory'

const HISTORY: MetricsHistoryV1 = {
  version: 1,
  installationId: '11111111-1111-4111-8111-111111111111',
  buckets: [{
    schemaVersion: 1,
    id: '10000000-0000-4000-8000-000000000001',
    date: '2026-09-02',
    source: 'tasks',
    sourceInstanceId: 'local-tasks',
    installationId: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    values: { kind: 'tasks', completed: 5, carriedForward: 1 },
  }],
}

function metrics(overrides: Partial<MetricsContextValue> = {}): MetricsContextValue {
  return {
    hydrated: true,
    entitled: true,
    history: HISTORY,
    issue: null,
    retryMetrics: vi.fn(),
    deleteMetricsHistory: vi.fn(async () => undefined),
    exportMetricsHistory: vi.fn(() => '{"product":"Tab Two","kind":"metrics-history"}'),
    recordFocusCompletion: (current) => current,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Metrics history settings', () => {
  it('uses the shared premium prompt when no history or entitlement exists', () => {
    const onSignIn = vi.fn()
    const onViewPlans = vi.fn()
    render(<MetricsHistoryView metrics={metrics({ entitled: false, history: null })} signedIn={false} onSignIn={onSignIn} onViewPlans={onViewPlans} today="2026-09-02" />)

    expect(screen.getByRole('heading', { name: 'Metrics history' })).toBeTruthy()
    expect(screen.getByText('See longer patterns without syncing raw activity.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(screen.getByRole('button', { name: 'View plans' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(onViewPlans).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Continue free' }))
    expect(screen.queryByRole('button', { name: 'View plans' })).toBeNull()
  })

  it('downloads only through a user-initiated Blob action', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:metrics')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<MetricsHistoryView metrics={metrics()} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)

    expect(createObjectURL).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Export history' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:metrics')
  })

  it('requires a fresh second gesture before deleting one selected source', async () => {
    const deleteMetricsHistory = vi.fn(async () => undefined)
    render(<MetricsHistoryView metrics={metrics({ deleteMetricsHistory })} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)

    expect(screen.getByText('Existing activity can build new summaries again after deletion.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('History to delete'), { target: { value: 'tasks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected history' }))
    expect(deleteMetricsHistory).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Tasks history' }))
    })
    expect(deleteMetricsHistory).toHaveBeenCalledWith({ source: 'tasks' })
  })

  it('offers only the five paid-MVP metric categories while legacy fitness data remains readable', () => {
    render(<MetricsHistoryView metrics={metrics()} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)

    const options = [...screen.getByLabelText('History to delete').querySelectorAll('option')]
      .map((option) => option.textContent)
    expect(options).toEqual(['Habits', 'Focus', 'Tasks', 'Calendar', 'Development'])
    expect(screen.queryByText('Fitness')).toBeNull()
  })

  it('requires a separate two-step confirmation for complete deletion', async () => {
    const deleteMetricsHistory = vi.fn(async () => undefined)
    render(<MetricsHistoryView metrics={metrics({ deleteMetricsHistory })} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete all history' }))
    expect(deleteMetricsHistory).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete all history' }))
    })
    expect(deleteMetricsHistory).toHaveBeenCalledWith()
  })

  it('keeps expired retained history exportable and deletable', () => {
    render(<MetricsHistoryView metrics={metrics({ entitled: false })} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)
    expect(screen.getByText('History paused')).toBeTruthy()
    expect(screen.getByText('1 saved day')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export history' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete all history' })).toBeTruthy()
  })

  it('reports deletion failure without clearing the armed scope', async () => {
    const deleteMetricsHistory = vi.fn(async () => { throw new Error('secret failure') })
    render(<MetricsHistoryView metrics={metrics({ deleteMetricsHistory })} signedIn onSignIn={vi.fn()} onViewPlans={vi.fn()} today="2026-09-02" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete all history' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete all history' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('Metrics history was not deleted. Try again.')
    expect(screen.getByRole('button', { name: 'Confirm delete all history' })).toBeTruthy()
  })
})
