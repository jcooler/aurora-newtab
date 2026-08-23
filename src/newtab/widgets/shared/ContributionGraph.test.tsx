// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Contributions } from '../../../services/connectors/types'
import ContributionGraph from './ContributionGraph'

const CONTRIBUTIONS: Contributions = {
  total: 42,
  days: [
    { date: '2026-01-25', count: 1 },
    { date: '2026-01-26', count: 2 },
    { date: '2026-01-27', count: 3 },
    { date: '2026-01-28', count: 4 },
    { date: '2026-01-29', count: 5 },
    { date: '2026-01-30', count: 6 },
    { date: '2026-01-31', count: 7 },
    { date: '2026-02-01', count: 8 },
  ],
}

describe('ContributionGraph tier composition', () => {
  it('can omit month metadata in a tighter tier without removing the graph or stats', () => {
    const { container } = render(
      <ContributionGraph contributions={CONTRIBUTIONS} cell={8} gap={1} showMonthTicks={false} />,
    )

    expect(screen.getByRole('img', { name: /contribution activity/i }).style.gridAutoColumns).toBe('8px')
    expect(container.querySelector('[data-contribution-months]')).toBeNull()
    expect(screen.queryByText('Jan')).toBeNull()
    expect(screen.getByText('contributions').closest('[data-contribution-summary]')).toBeTruthy()
    expect(screen.getByText('day streak')).toBeTruthy()
  })

  it('keeps visible month metadata at the 11px floor', () => {
    const { container } = render(<ContributionGraph contributions={CONTRIBUTIONS} />)
    const months = container.querySelector('[data-contribution-months]')
    expect(months).toBeTruthy()
    expect(months?.textContent).toContain('Jan')
    expect(months?.querySelector('span')?.className).toContain('text-[11px]')
  })

  it('can move the summary into a parent composition without duplicating it', () => {
    const { container } = render(
      <ContributionGraph contributions={CONTRIBUTIONS} showSummary={false} />,
    )

    expect(screen.getByRole('img', { name: /contribution activity/i })).toBeTruthy()
    expect(container.querySelector('[data-contribution-summary]')).toBeNull()
  })
})
