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
  it('changes appearance without changing the displayed days, count, or titles', () => {
    const { container, rerender } = render(<ContributionGraph contributions={CONTRIBUTIONS} tier="standard" fitWidth color="blue" />)
    const titles = [...container.querySelectorAll('[title]')].map(node => node.getAttribute('title'))
    const summary = container.querySelector('[data-contribution-summary]')!.textContent
    rerender(<ContributionGraph contributions={CONTRIBUTIONS} tier="standard" fitWidth color="green" />)
    expect(container.querySelector('[data-contribution-color="green"]')).toBeTruthy()
    expect([...container.querySelectorAll('[title]')].map(node => node.getAttribute('title'))).toEqual(titles)
    expect(container.querySelector('[data-contribution-summary]')!.textContent).toBe(summary)
    expect(container.querySelector('[title]')?.getAttribute('style')).toContain('aspect-ratio: 1 / 1')
  })
  it('separates month labels when a trailing year begins just before a month boundary', () => {
    const days = Array.from({ length: 365 }, (_, index) => ({ date: new Date(Date.UTC(2025, 7, 24 + index)).toISOString().slice(0, 10), count: 1 }))
    const { container } = render(<ContributionGraph contributions={{ total: 365, days }} tier="full" trailingDays={365} fitWidth />)
    const positions = [...container.querySelectorAll<HTMLElement>('[data-contribution-months] span')].map((node) => Number.parseFloat(node.style.left))
    expect(positions.length).toBeGreaterThan(8)
    for (let index = 1; index < positions.length; index++) expect(positions[index] - positions[index - 1]).toBeGreaterThan(7)
  })
  it('limits the displayed days and totals to the same trailing interval', () => {
    const { container } = render(<ContributionGraph contributions={CONTRIBUTIONS} tier="compact" trailingDays={3} fitWidth />)
    expect(screen.getByRole('img', { name: 'Contribution activity over the last 3 days' })).toBeTruthy()
    expect(container.querySelectorAll('[role="img"] [title]')).toHaveLength(3)
    expect(container.querySelector('[data-contribution-summary]')?.textContent).toContain('21 contributions')
    expect(screen.queryByTitle('1 contribution · 2026-01-25')).toBeNull()
    expect(screen.getByTitle('8 contributions · 2026-02-01')).toBeTruthy()
  })
  it.each([
    ['compact', '7px', '7px', '2px'],
    ['standard', '9px', '9px', '2px'],
    ['full', '6px', '6px', '2px'],
  ] as const)('centers the %s contribution composition with square cells', (tier, width, height, gap) => {
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
