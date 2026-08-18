// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type Countdown } from '../../../lib/storage/schema'
import { todayKey } from '../../../lib/dates'
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
  canvasSize,
}: {
  widgetsOn?: boolean
  countdowns?: Countdown[]
  canvasSize?: 'compact' | 'standard'
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
      <MonthCalWidget canvasSize={canvasSize} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, container }
}

function cell(container: HTMLElement, key: string): HTMLElement | null {
  return container.querySelector(`[data-cell-key="${key}"]`)
}

describe('MonthCalWidget', () => {
  function spyOnSetInterval() {
    return vi.spyOn(window, 'setInterval')
  }
  let intervalSpy: ReturnType<typeof spyOnSetInterval>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    intervalSpy = spyOnSetInterval()
  })
  afterEach(() => {
    intervalSpy.mockRestore()
    vi.useRealTimers()
  })

  it('renders nothing while settings.widgets.monthCal is off', async () => {
    const { container } = await renderWithMonthCal({ widgetsOn: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders the current month\'s matrix (May 2026) with the today cell ringed', async () => {
    const { container } = await renderWithMonthCal()
    expect(intervalSpy).not.toHaveBeenCalled()
    expect(screen.getByText('May 2026')).toBeTruthy()
    // 6 rows x 7 cols — May 2026 is the 6-row worst case (see monthGrid.test.ts).
    expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(42)

    const today = cell(container, TODAY_KEY)
    expect(today).toBeTruthy()
    expect(today!.querySelector('span')!.className).toContain('ring-accent')
    expect(today!.closest('tr')?.hasAttribute('data-current-week')).toBe(true)
    expect(container.querySelectorAll('tr[data-current-week]')).toHaveLength(1)
  })

  it('renders the complete month at EVERY size — the week form is retired (batch-2 owner review)', async () => {
    // "The compact month is a joke... just remove it." Month declares only
    // the standard tier now; even a stale 'compact' prop (a legacy stored
    // tier, or the docked size fallback) must render the complete month,
    // never a single stretched week.
    const { container } = await renderWithMonthCal({ canvasSize: 'compact' })
    expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(42)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6)
    expect(cell(container, TODAY_KEY)).toBeTruthy()
  })

  it('renders Standard as the complete viewed month, including all six May rows', async () => {
    const { container } = await renderWithMonthCal({ canvasSize: 'standard' })
    expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(42)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6)
  })

  it('reserves the metadata tier for weekday headings, not the month label or day values', async () => {
    const { container } = await renderWithMonthCal()
    expect(container.querySelectorAll('th[data-stage-text-tier="metadata"]')).toHaveLength(7)
    const label = container.querySelector('[data-monthcal-label]')
    expect(label?.getAttribute('data-stage-text-tier')).toBeNull()
    expect(label?.getAttribute('aria-label')).toBe(label?.textContent)
    // The compact-only short-label span retired with the compact tier.
    expect(label?.querySelector('[data-monthcal-label-short]')).toBeNull()
    expect(container.querySelector('[data-cell-key] span')?.getAttribute('data-stage-text-tier')).toBeNull()
  })

  it('moves the today identity into June after restoration across midnight', async () => {
    const { container } = await renderWithMonthCal()
    expect(cell(container, TODAY_KEY)!.querySelector('span')!.className).toContain('ring-accent')

    vi.setSystemTime(new Date(2026, 5, 1, 0, 0, 1))
    act(() => window.dispatchEvent(new Event('focus')))

    expect(cell(container, TODAY_KEY)!.querySelector('span')!.className).not.toContain('ring-accent')
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeTruthy()
    act(() => screen.getByRole('button', { name: 'Back to today' }).click())
    expect(screen.getByText('June 2026')).toBeTruthy()
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

  it('the Today button is absent (not just hidden) while viewing the current month', async () => {
    await renderWithMonthCal()
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull()
    // Only the two nav chevrons are tabbable — the a11y-lighter static-table
    // path (see the component's own doc comment): no interactive cells.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('Previous month navigates (header + matrix swap), hides the ring even on a matching day-of-month, and reveals the Today button IN THE HEADER ROW; clicking it snaps back', async () => {
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

    const todayBtn = screen.getByRole('button', { name: 'Back to today' })
    expect(todayBtn).toBeTruthy()
    // Position assertion (fix-wave, MERGE-BLOCKING regression test): the
    // Today button must live INSIDE the header row (data-monthcal-header),
    // not on its own line below the header and above the table — that's
    // the exact structural shape whose extra 21px of height collapsed the
    // monthCal->habits column seam in any off-current 6-row month. Asserting
    // containment (not just presence) is what would catch a regression back
    // to the old below-header placement.
    const header = container.querySelector('[data-monthcal-header]')
    expect(header).toBeTruthy()
    expect(header!.contains(todayBtn)).toBe(true)
    // ...and it must appear BEFORE the table in document order (still part
    // of the header, never sunk below the grid).
    const table = screen.getByRole('table')
    expect(todayBtn.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      todayBtn.click()
    })

    expect(screen.getByText('May 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull()
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

  it('Next month navigation carries the year across a December->January boundary (regression: the harness\'s own forcing loop surfaced "Calendar: undefined 2026" here before the fix)', async () => {
    const { container } = await renderWithMonthCal()

    // May 2026 -> January 2027 is 8 Next clicks. Before the fix, `view.m0`
    // was never normalized back into 0-11 by goNext itself (only monthGrid's
    // OWN internal call normalized, which is why the grid always looked
    // right while the header text silently broke) — MONTH_NAMES[12] is
    // undefined, and `view.y` never incremented on the way past December,
    // so the header rendered "undefined 2026" instead of "January 2027".
    await act(async () => {
      for (let i = 0; i < 8; i++) {
        screen.getByRole('button', { name: 'Next month' }).click()
      }
    })

    expect(screen.getByText('January 2027')).toBeTruthy()
    expect(screen.queryByText(/undefined/)).toBeNull()
    expect(cell(container, '2027-01-15')).toBeTruthy()
  })

  it('Previous month navigation carries the year across a January->December boundary', async () => {
    const { container } = await renderWithMonthCal()

    // May 2026 -> December 2025 is 5 Previous clicks.
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        screen.getByRole('button', { name: 'Previous month' }).click()
      }
    })

    expect(screen.getByText('December 2025')).toBeTruthy()
    expect(screen.queryByText(/undefined/)).toBeNull()
    expect(cell(container, '2025-12-15')).toBeTruthy()
  })

  it('countdown dot parity: a countdown dated exactly TODAY dots today\'s cell — the identical date string daysUntil (CountdownLine\'s own parser) treats as day 0', async () => {
    // Parity anchor, proven against the REAL functions CountdownLine.tsx
    // itself imports (not equivalent-but-differently-named
    // re-implementations): `todayKey` from lib/dates.ts is the literal
    // function CountdownLine.tsx calls to get "today"; `daysUntil` from
    // worldTime.ts is the literal function it calls to compare a countdown's
    // date against it. Both agreeing with MonthCalWidget's own
    // (independently written, habits.ts-derived) date key is the actual
    // parity proof — letter-exact against the consumer, not just
    // functionally-equivalent-by-construction.
    expect(daysUntil(TODAY_KEY, TODAY_KEY)).toBe(0)
    expect(todayKey(NOW)).toBe(TODAY_KEY)

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
