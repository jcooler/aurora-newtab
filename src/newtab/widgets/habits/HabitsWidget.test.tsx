// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type Habit } from '../../../lib/storage/schema'
import { localDateKey, prevDayKey } from '../../../lib/habits'
import HabitsWidget from './HabitsWidget'

function habit(id: string, name: string, log: string[] = []): Habit {
  return { id, name, createdAt: 0, log }
}

/** N consecutive local-date keys ending at `todayKey` (inclusive), walked via
 *  habits.ts's own prevDayKey — the exact DST-safe step the widget's real
 *  streak math uses, so this fixture can never drift from what streak()
 *  actually counts. */
function runEndingAt(todayKey: string, n: number): string[] {
  const keys: string[] = []
  let cursor = todayKey
  for (let i = 0; i < n; i++) {
    keys.push(cursor)
    cursor = prevDayKey(cursor)
  }
  return keys
}

async function renderWithHabits(habits: Habit[], { widgetsOn = true } = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, habits: widgetsOn },
  })
  await storage.set('habits', habits)
  const result = render(
    <StorageProvider storage={storage}>
      <HabitsWidget />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, ...result }
}

describe('HabitsWidget', () => {
  // vi.spyOn's own generic overloads don't infer cleanly through a
  // pre-declared `let`, so the spy is typed via a throwaway call rather than
  // spelling out MockInstance's generics by hand (same idiom as
  // WorldClocks.test.tsx).
  let intervalSpy: ReturnType<typeof spyOnSetInterval>
  function spyOnSetInterval() {
    return vi.spyOn(window, 'setInterval')
  }

  beforeEach(() => {
    intervalSpy = spyOnSetInterval()
  })

  afterEach(() => {
    intervalSpy.mockRestore()
  })

  it('Docked renders one dense done-today tally and no chips (NL-P5 batch 2)', async () => {
    const todayKey = localDateKey(new Date())
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, habits: true },
    })
    await storage.set('habits', [habit('h1', 'Read', [todayKey]), habit('h2', 'Run')])
    render(
      <StorageProvider storage={storage}>
        <HabitsWidget docked />
      </StorageProvider>,
    )
    await act(async () => {})

    const line = screen.getByLabelText('Habits: 1/2 today')
    expect(line.getAttribute('data-dock-line')).toBe('')
    // The dense line replaces the chips entirely — no toggle buttons.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing while settings.widgets.habits is off', async () => {
    const { container } = await renderWithHabits([habit('h1', 'Read')], { widgetsOn: false })
    expect(container.firstChild).toBeNull()
  })

  it('an enabled-but-empty habits list renders nothing and never starts the ticking interval (the gate bug)', async () => {
    const { container } = await renderWithHabits([])
    expect(container.firstChild).toBeNull()
    // Mirrors WorldClocks' own regression coverage: the gate must live
    // BEFORE useNow mounts, not after an early return inside the inner
    // component — otherwise an enabled-but-empty widget would still start a
    // 60s interval it immediately throws away every render.
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('a non-array habits value (corrupt/imported) renders nothing rather than throwing (defensive Array.isArray gate)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, habits: true },
    })
    // A hand-edited backup can legally restore a shape storage.set's own
    // types wouldn't allow at compile time — see RssWidget's identical
    // Array.isArray rationale for `feeds`.
    await storage.set('habits', null as unknown as Habit[])
    const { container } = render(
      <StorageProvider storage={storage}>
        <HabitsWidget />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('renders one chip per habit, capped at 6 by construction — 7 in storage renders only 6 (falsifying)', async () => {
    const habits = Array.from({ length: 7 }, (_, i) => habit(`h${i}`, `Habit ${i}`))
    await renderWithHabits(habits)
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })

  it('a today-marked chip has aria-pressed=true', async () => {
    const todayKey = localDateKey(new Date())
    await renderWithHabits([habit('h1', 'Read', [todayKey])])
    expect(screen.getByRole('button', { name: /Read/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('an unmarked chip has aria-pressed=false, and tapping it marks today via storage.update', async () => {
    const { storage } = await renderWithHabits([habit('h1', 'Read', [])])
    const chip = screen.getByRole('button', { name: /Read/ })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    // The interval only exists once the widget actually mounted its inner,
    // ticking half — confirms this test's gate passed through cleanly.
    expect(intervalSpy).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(chip)
    })

    const todayKey = localDateKey(new Date())
    expect((await storage.get('habits'))[0]!.log).toEqual([todayKey])
    expect(screen.getByRole('button', { name: /Read/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('tapping an already-marked chip again unmarks it (toggleDay round-trips through storage)', async () => {
    const todayKey = localDateKey(new Date())
    const { storage } = await renderWithHabits([habit('h1', 'Read', [todayKey])])
    const chip = screen.getByRole('button', { name: /Read/ })

    await act(async () => {
      fireEvent.click(chip)
    })

    expect((await storage.get('habits'))[0]!.log).toEqual([])
    expect(screen.getByRole('button', { name: /Read/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('streak text matches a seeded log with a known streak (12 days ending today)', async () => {
    const todayKey = localDateKey(new Date())
    await renderWithHabits([habit('h1', 'Read', runEndingAt(todayKey, 12))])
    expect(screen.getByText('🔥 12')).toBeTruthy()
  })

  it('streak 0 (empty log) hides the flame and shows an unpressed check, no crash', async () => {
    await renderWithHabits([habit('h1', 'New habit', [])])
    expect(screen.queryByText(/🔥/)).toBeNull()
    expect(screen.getByRole('button', { name: 'New habit' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('a long habit name truncates, with the full name reachable via title', async () => {
    const longName = 'Meditate for twenty minutes every single morning without fail'
    await renderWithHabits([habit('h1', longName)])
    const nameEl = screen.getByTitle(longName)
    expect(nameEl.className).toContain('truncate')
  })
})
