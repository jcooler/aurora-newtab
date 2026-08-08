// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type Countdown } from '../../../lib/storage/schema'
import { localDateKey } from '../../../lib/habits'
import { daysUntil } from '../../../lib/worldTime'
import MonthCalWidget from './MonthCalWidget'

// May 2026 — the SAME 6-row worst-case month monthGrid.test.ts pins (Friday
// start + 31 days): April 26-30 lead in, June 1-6 trail out, giving every
// test below real out-of-month cells to assert against, not a lucky-empty
// edge case (Feb 2026, by contrast, has ZERO leading/trailing cells — see
// monthGrid.test.ts's own comment on why 28 days from a Sunday start divides
// evenly into exactly 4 weeks).
const NOW = new Date(2026, 4, 15, 9, 0, 0) // 2026-05-15, a Friday, mid-month
const TODAY_KEY = '2026-05-15'

async function renderWithMonthCal({
  widgetsOn = true,
  countdowns = [] as Countdown[],
} = {}): Promise<{ storage: AuroraStorage; container: HTMLElement }> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, monthCal: widgetsOn },
  })
  await storage.set('countdowns', countdowns)
  const { container } = render(
    <StorageProvider storage={storage}>
      <MonthCalWidget />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, container }
}

function cell(container: HTMLElement, key: string): HTMLElement | null {
  return container.querySelector(`[data-cell-key="${key}"]`)
}

describe('MonthCalWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing while settings.widgets.monthCal is off', async () => {
    const { container } = await renderWithMonthCal({ widgetsOn: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders the current month\'s matrix (May 2026) with the today cell ringed', async () => {
    const { container } = await renderWithMonthCal()
    expect(screen.getByText('May 2026')).toBeTruthy()
    // 6 rows x 7 cols — May 2026 is the 6-row worst case (see monthGrid.test.ts).
    expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(42)

    const today = cell(container, TODAY_KEY)
    expect(today).toBeTruthy()
    expect(today!.querySelector('span')!.className).toContain('ring-accent')
  })

  it('out-of-month leading/trailing cells are styled muted and never ringed', async () => {
    const { container } = await renderWithMonthCal()
    const leadingApril30 = cell(container, '2026-04-30') // leads in from April
    const trailingJune1 = cell(container, '2026-06-01') // trails into June
    const inMonthMay1 = cell(container, '2026-05-01')

    expect(leadingApril30!.querySelector('span')!.className).toContain('text-fg-muted/50')
    expect(trailingJune1!.querySelector('span')!.className).toContain('text-fg-muted/50')
    expect(inMonthMay1!.querySelector('span')!.className).not.toContain('text-fg-muted/50')

    expect(leadingApril30!.querySelector('span')!.className).not.toContain('ring-accent')
    expect(trailingJune1!.querySelector('span')!.className).not.toContain('ring-accent')
  })

  it('the Today button is hidden while viewing the current month', async () => {
    await renderWithMonthCal()
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
    // Only the two nav chevrons are tabbable — the a11y-lighter static-table
    // path (see the component's own doc comment): no interactive cells.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('Previous month navigates (header + matrix swap), hides the ring even on a matching day-of-month, and reveals the Today button; clicking it snaps back', async () => {
    const { container } = await renderWithMonthCal()

    await act(async () => {
      screen.getByRole('button', { name: 'Previous month' }).click()
    })

    expect(screen.getByText('April 2026')).toBeTruthy()
    expect(screen.queryByText('May 2026')).toBeNull()
    // April also has a 15th — but it must NOT be ringed; only the CURRENT
    // month's today cell ever is.
    expect(container.querySelectorAll('.ring-accent')).toHaveLength(0)
    expect(cell(container, '2026-04-15')).toBeTruthy()

    const todayBtn = screen.getByRole('button', { name: 'Today' })
    expect(todayBtn).toBeTruthy()

    await act(async () => {
      todayBtn.click()
    })

    expect(screen.getByText('May 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
    expect(cell(container, TODAY_KEY)!.querySelector('span')!.className).toContain('ring-accent')
  })

  it('Next month navigates forward (May -> June)', async () => {
    const { container } = await renderWithMonthCal()

    await act(async () => {
      screen.getByRole('button', { name: 'Next month' }).click()
    })

    expect(screen.getByText('June 2026')).toBeTruthy()
    expect(cell(container, '2026-06-15')).toBeTruthy()
    expect(cell(container, TODAY_KEY)).toBeNull() // May's own cells are gone
  })

  it('countdown dot parity: a countdown dated exactly TODAY dots today\'s cell — the identical date string daysUntil (CountdownLine\'s own parser) treats as day 0', async () => {
    // Parity anchor, proven against the REAL function CountdownLine.tsx
    // imports (not a re-implementation): the same date key this widget dots
    // is the one daysUntil calls "0 days away" for the same todayKey.
    expect(daysUntil(TODAY_KEY, TODAY_KEY)).toBe(0)
    expect(localDateKey(NOW)).toBe(TODAY_KEY)

    const { container } = await renderWithMonthCal({
      countdowns: [{ id: 'c1', name: 'Launch day', date: TODAY_KEY }],
    })

    const dot = cell(container, TODAY_KEY)!.querySelector('[data-countdown-dot]')
    expect(dot).toBeTruthy()
  })

  it('a countdown on a DIFFERENT date does not dot an adjacent cell', async () => {
    const { container } = await renderWithMonthCal({
      countdowns: [{ id: 'c1', name: 'Launch day', date: '2026-05-20' }],
    })

    expect(cell(container, '2026-05-20')!.querySelector('[data-countdown-dot]')).toBeTruthy()
    expect(cell(container, '2026-05-19')!.querySelector('[data-countdown-dot]')).toBeNull()
    expect(cell(container, TODAY_KEY)!.querySelector('[data-countdown-dot]')).toBeNull()
  })
})
