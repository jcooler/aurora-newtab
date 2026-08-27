// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WidgetBoundary from './WidgetBoundary'

afterEach(() => vi.restoreAllMocks())

function ThrowSecret({ secret }: { secret: string }): never {
  throw new Error(secret)
}

describe('WidgetBoundary', () => {
  it('renders children while healthy', () => {
    render(<WidgetBoundary name="Weather"><p>Forecast ready</p></WidgetBoundary>)
    expect(screen.getByText('Forecast ready')).toBeTruthy()
  })

  it('contains a failed widget in a fixed-safe named alert and preserves siblings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <section>
        <WidgetBoundary name="Weather"><ThrowSecret secret="synthetic render failure" /></WidgetBoundary>
        <p>Calendar sibling survives</p>
      </section>,
    )
    const fallback = screen.getByRole('alert', { name: 'Weather unavailable' })
    expect(fallback.textContent).toBe('Weather is unavailable.')
    expect(fallback.getAttribute('style')).toBeNull()
    expect(screen.getByText('Calendar sibling survives')).toBeTruthy()
  })

  it('logs only a constant prefix plus safe registry label and never leaks thrown secrets', () => {
    const fakeToken = 'ghp_AURORA_UNIQUE_FAKE_TOKEN_9385'
    const capabilityUrl = 'https://calendar.example/private.ics?token=AURORA_CAPABILITY_4921'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <WidgetBoundary name="Calendar">
        <ThrowSecret secret={`${fakeToken} ${capabilityUrl}`} />
      </WidgetBoundary>,
    )
    expect(screen.getByRole('alert', { name: 'Calendar unavailable' })).toBeTruthy()
    expect(document.body.textContent).not.toContain(fakeToken)
    expect(document.body.textContent).not.toContain(capabilityUrl)
    expect(consoleError).toHaveBeenCalledWith('[aurora] widget render failure:', 'Calendar')
    const serialized = consoleError.mock.calls.flat().map((value) => {
      try { return typeof value === 'string' ? value : JSON.stringify(value) }
      catch { return '[unserializable]' }
    }).join('\n')
    expect(serialized).not.toContain(fakeToken)
    expect(serialized).not.toContain(capabilityUrl)
  })
})
