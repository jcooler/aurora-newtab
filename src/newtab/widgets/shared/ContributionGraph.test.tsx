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

const CONTRIBUTIONS_112_DAYS: Contributions = {
  total: 224,
  days: Array.from({ length: 112 }, (_, index) => {
    const date = new Date(2026, 0, 1)
    date.setDate(date.getDate() + index)
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      count: index % 5,
    }
  }),
}

describe('ContributionGraph tier composition', () => {
  it.each([
    ['compact', '10px', '7px', '1px'],
    ['standard', '16px', '10px', '1px'],
    ['full', '23px', '17px', '2px'],
  ] as const)('centers the %s contribution composition with authored rectangular cells', (tier, width, height, gap) => {
    const { container } = render(
      <ContributionGraph contributions={CONTRIBUTIONS_112_DAYS} tier={tier} showMonthTicks={tier === 'full'} />,
    )
    const shell = container.querySelector('[data-contribution-composition]')!
    const graph = screen.getByRole('img', { name: /contribution activity/i })
    expect(shell.className).toContain('mx-auto')
    expect(shell.className).toContain('w-fit')
    expect(graph.style.gridAutoColumns).toBe(width)
    expect(graph.style.gridTemplateRows).toBe(`repeat(7, ${height})`)
    expect(graph.style.gap).toBe(gap)
  })

  it('can omit month metadata in a tighter tier without removing the graph or stats', () => {
    const { container } = render(
      <ContributionGraph contributions={CONTRIBUTIONS} tier="standard" showMonthTicks={false} />,
    )

    expect(container.querySelector('[data-contribution-months]')).toBeNull()
    expect(screen.queryByText('Jan')).toBeNull()
    expect(screen.getByText('contributions').closest('[data-contribution-summary]')).toBeTruthy()
    expect(screen.getByText('day streak')).toBeTruthy()
  })

  it('keeps visible month metadata at the 11px floor', () => {
    const { container } = render(<ContributionGraph contributions={CONTRIBUTIONS} tier="standard" />)
    const months = container.querySelector('[data-contribution-months]')
    expect(months).toBeTruthy()
    expect(months?.textContent).toContain('Jan')
    expect(months?.querySelector('span')?.className).toContain('text-[11px]')
  })

  it('can move the summary into a parent composition without duplicating it', () => {
    const { container } = render(
      <ContributionGraph contributions={CONTRIBUTIONS} tier="standard" showSummary={false} />,
    )

    expect(screen.getByRole('img', { name: /contribution activity/i })).toBeTruthy()
    expect(container.querySelector('[data-contribution-summary]')).toBeNull()
  })

  it('keeps empty pad cells transparent and gives every contribution a truthful title', () => {
    const { container } = render(<ContributionGraph contributions={CONTRIBUTIONS} tier="standard" />)
    const cells = container.querySelectorAll('[role="img"] > div')
    const pad = cells[cells.length - 1]
    expect(pad?.getAttribute('title')).toBeNull()
    expect(pad?.getAttribute('style')).toContain('background: transparent')
    expect(cells[0]?.getAttribute('title')).toBe('1 contribution · 2026-01-25')
    expect(cells[1]?.getAttribute('title')).toBe('2 contributions · 2026-01-26')
  })
})
