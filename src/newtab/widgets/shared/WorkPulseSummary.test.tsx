// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkPulseSummary from './WorkPulseSummary'

describe('WorkPulseSummary', () => {
  it.each([
    ['quiet', 'All clear'],
    ['attention', '3 items need attention'],
    ['critical', '1 deployment failed'],
    ['unknown', '2 services unreachable'],
  ] as const)('renders an honest %s summary without an interactive or live-region affordance', (tone, value) => {
    const { container } = render(<WorkPulseSummary label="GitHub" value={value} tone={tone} />)
    const summary = screen.getByLabelText(`GitHub: ${value}`)
    expect(summary.getAttribute('data-work-pulse-tone')).toBe(tone)
    expect(summary.getAttribute('aria-live')).toBeNull()
    expect(summary.getAttribute('role')).toBeNull()
    expect(container.querySelector('button, a')).toBeNull()
    expect(summary.querySelector('[data-work-pulse-value]')?.className).toContain('text-sm')
  })

  it('keeps optional metadata secondary and included in the accessible summary', () => {
    const { container } = render(
      <WorkPulseSummary label="Vercel" value="2 building" tone="attention" metadata="5 deployments" />,
    )
    expect(screen.getByLabelText('Vercel: 2 building, 5 deployments')).toBeTruthy()
    const metadata = container.querySelector('[data-work-pulse-metadata]')
    expect(metadata?.textContent).toBe('5 deployments')
    expect(metadata?.getAttribute('data-stage-text-tier')).toBe('metadata')
    expect(metadata?.className).toContain('text-xs')
  })
})
