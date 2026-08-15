// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssertiveAlert, PoliteStatus, ResourceFeedback } from './StateFeedback'

describe('PoliteStatus', () => {
  it('keeps one atomic polite region mounted as content changes and clears', () => {
    const view = render(<PoliteStatus id="save-feedback" className="feedback">Savingâ€¦</PoliteStatus>)
    const status = screen.getByRole('status')
    expect(status.getAttribute('id')).toBe('save-feedback')
    expect(status.getAttribute('class')).toBe('feedback')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(status.textContent).toBe('Savingâ€¦')

    view.rerender(<PoliteStatus id="save-feedback" className="feedback">Saved</PoliteStatus>)
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('Saved')

    view.rerender(<PoliteStatus id="save-feedback" className="feedback">{null}</PoliteStatus>)
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('')
  })
})

describe('AssertiveAlert', () => {
  it('renders one atomic alert only while literal error content exists', () => {
    const view = render(<AssertiveAlert id="save-error">Couldnâ€™t save.</AssertiveAlert>)
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('id')).toBe('save-error')
    expect(alert.getAttribute('aria-atomic')).toBe('true')
    expect(alert.getAttribute('aria-live')).toBeNull()
    expect(alert.textContent).toBe('Couldnâ€™t save.')

    view.rerender(<AssertiveAlert id="save-error">{null}</AssertiveAlert>)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ResourceFeedback', () => {
  const copy = {
    loading: 'Loading weatherâ€¦',
    refreshing: 'Refreshingâ€¦',
    stale: 'Updated a while ago',
    offline: 'Offline â€” showing cached',
    unavailable: <><span>Weather unavailable.</span> <button type="button">Retry</button></>,
  }

  it.each([
    ['loading for a no-data pending resource', { operation: 'pending', freshness: 'unknown', hasData: false }, 'status', 'Loading weatherâ€¦'],
    ['refreshing for a cached pending resource', { operation: 'pending', freshness: 'stale', hasData: true }, 'status', 'Refreshingâ€¦'],
    ['an alert for a no-data error', { operation: 'error', freshness: 'unknown', hasData: false }, 'alert', 'Weather unavailable.'],
    ['offline for a cached error', { operation: 'error', freshness: 'fresh', hasData: true }, 'status', 'Offline â€” showing cached'],
    ['stale for an idle stale resource', { operation: 'idle', freshness: 'stale', hasData: true }, 'status', 'Updated a while ago'],
    ['stale for a successful stale resource', { operation: 'success', freshness: 'stale', hasData: true }, 'status', 'Updated a while ago'],
  ] as const)('%s', (_name, state, role, text) => {
    render(<ResourceFeedback state={state} {...copy} id="weather-feedback" className="feedback" />)
    const feedback = screen.getByRole(role)
    expect(feedback.getAttribute('id')).toBe('weather-feedback')
    expect(feedback.getAttribute('class')).toBe('feedback')
    expect(feedback.textContent).toContain(text)
    if (role === 'status') {
      expect(feedback.getAttribute('aria-live')).toBe('polite')
      expect(feedback.getAttribute('aria-atomic')).toBe('true')
    } else {
      expect(feedback.getAttribute('aria-live')).toBeNull()
      expect(feedback.getAttribute('aria-atomic')).toBe('true')
    }
    expect(screen.queryAllByRole('status')).toHaveLength(role === 'status' ? 1 : 0)
    expect(screen.queryAllByRole('alert')).toHaveLength(role === 'alert' ? 1 : 0)
  })

  it.each([
    ['fresh success', { operation: 'success', freshness: 'fresh', hasData: true }],
    ['unknown idle', { operation: 'idle', freshness: 'unknown', hasData: false }],
  ] as const)('is a mounted quiet polite region for %s', (_name, state) => {
    render(<ResourceFeedback state={state} {...copy} />)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps a real named enabled Retry button keyboard-clickable inside unavailable content', () => {
    const onRetry = vi.fn()
    render(
      <ResourceFeedback
        state={{ operation: 'error', freshness: 'unknown', hasData: false }}
        loading={copy.loading}
        refreshing={copy.refreshing}
        stale={copy.stale}
        offline={copy.offline}
        unavailable={<button type="button" onClick={onRetry}>Retry</button>}
      />,
    )
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect((retry as HTMLButtonElement).disabled).toBe(false)
    retry.focus()
    fireEvent.keyDown(retry, { key: 'Enter', code: 'Enter' })
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
