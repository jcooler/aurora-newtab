import { useState } from 'react'

import ProgressRing from '../../../components/ProgressRing'
import { toggleDay } from '../../../lib/habits'
import { readLocalDay, useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { applyProgressIntent, progressValueForDay, validProgressGoals, type ProgressIntent } from '../../../lib/progress'
import { useStorage } from '../../../lib/storage/context'
import type { Habit, ProgressGoal } from '../../../lib/storage/schema'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import DockLine from '../shared/DockLine'

const MAX_VISIBLE_ROWS = 3

type FailedMutation =
  | { authority: 'progress'; intent: ProgressIntent }
  | { authority: 'habit'; id: string }

type RailItem =
  | { source: 'Manual'; goal: ProgressGoal }
  | { source: 'Habit'; habit: Habit }

function validHabit(value: unknown): value is Habit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && row.id.length > 0
    && typeof row.name === 'string' && row.name.trim().length > 0
    && typeof row.createdAt === 'number' && Number.isInteger(row.createdAt) && row.createdAt >= 0
    && Array.isArray(row.log) && row.log.every((day) => typeof day === 'string')
}

function validHabits(value: unknown): Habit[] {
  return Array.isArray(value) ? value.filter(validHabit) : []
}

export default function ProgressWidget({
  canvasSize = 'compact',
  presentation = 'free',
  docked = false,
  onOpenProgress,
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
  onOpenProgress?: () => void
} = {}) {
  // The storage subscriptions stay unconditional, but the local-day owner is
  // mounted only after the toggle and renderable-data gates have both passed.
  const [settings] = useStoredKey('settings')
  const [storedGoals] = useStoredKey('progressGoals')
  const [storedHabits] = useStoredKey('habits')
  const goals = validProgressGoals(storedGoals)
  const habits = validHabits(storedHabits)

  if (!settings?.widgets.progress || (goals.length === 0 && habits.length === 0)) return null
  return <ProgressRail goals={goals} habits={habits} canvasSize={canvasSize} presentation={presentation} docked={docked} onOpenProgress={onOpenProgress} />
}

function ProgressRail({
  goals,
  habits,
  canvasSize,
  presentation,
  docked,
  onOpenProgress,
}: {
  goals: ProgressGoal[]
  habits: Habit[]
  canvasSize: CanvasSize
  presentation: WidgetPresentationMode
  docked: boolean
  onOpenProgress?: () => void
}) {
  const storage = useStorage()
  const { key: todayKey } = useLocalDay()
  const [failedMutation, setFailedMutation] = useState<FailedMutation | null>(null)
  const items: RailItem[] = [
    ...goals.map((goal): RailItem => ({ source: 'Manual', goal })),
    ...habits.map((habit): RailItem => ({ source: 'Habit', habit })),
  ]
  const visible = items.slice(0, MAX_VISIBLE_ROWS)
  const remaining = items.length - visible.length

  async function applyManualIntent(intent: ProgressIntent) {
    try {
      await storage.update('progressGoals', (freshGoals) => (
        applyProgressIntent(freshGoals, intent, readLocalDay().key)
      ))
      setFailedMutation(null)
    } catch {
      setFailedMutation({ authority: 'progress', intent })
    }
  }

  async function toggleHabit(id: string) {
    try {
      await storage.update('habits', (freshHabits) => {
        const freshToday = readLocalDay().key
        return freshHabits.map((habit) => habit.id === id
          ? { ...habit, log: toggleDay(habit.log, freshToday) }
          : habit)
      })
      setFailedMutation(null)
    } catch {
      setFailedMutation({ authority: 'habit', id })
    }
  }

  async function retryFailedMutation() {
    if (!failedMutation) return
    if (failedMutation.authority === 'progress') await applyManualIntent(failedMutation.intent)
    else await toggleHabit(failedMutation.id)
  }

  if (docked) {
    return (
      <DockLine
        label="Progress"
        facts={visible.map((item) => {
          if (item.source === 'Manual') {
            const value = progressValueForDay(item.goal, todayKey)
            return `${item.goal.name} ${value >= item.goal.target ? 'done' : `${value}/${item.goal.target}`}`
          }
          return `${item.habit.name} ${item.habit.log.includes(todayKey) ? 'done' : 'open'}`
        })}
      />
    )
  }

  return (
    <section
      aria-label="Daily Progress"
      data-canvas-size={canvasSize}
      data-progress-presentation={presentation}
      className="group/progress grid w-64 max-w-[min(16rem,calc(100vw-2rem))] gap-1.5 text-photo text-canvas-fg"
    >
      <div className="grid gap-1.5">
        {visible.map((item) => {
          if (item.source === 'Manual') {
            const value = progressValueForDay(item.goal, todayKey)
            const complete = value >= item.goal.target
            const action = complete ? 'Keep complete' : 'Increment by 1'
            return (
              <button
                key={`manual:${item.goal.id}`}
                type="button"
                data-testid="progress-canvas-row"
                aria-label={`Manual ${item.goal.name}: ${value} of ${item.goal.target} ${item.goal.unit}, ${complete ? 'complete' : 'incomplete'}. ${action}`}
                onClick={() => void applyManualIntent({ kind: 'increment', id: item.goal.id })}
                className={`flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-control-bg px-2 py-1.5 text-left transition-opacity hover:bg-control-bg-hover focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${complete ? 'opacity-75 hover:opacity-100 focus-visible:opacity-100' : ''}`}
              >
                <ProgressRing value={value} target={item.goal.target} unit={item.goal.unit} />
                <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                  <span data-testid="progress-canvas-name" className="truncate text-xs font-medium">{item.goal.name}</span>
                  <span className="font-mono text-[11px] text-canvas-fg-muted">{complete ? 'Done' : `${value} / ${item.goal.target}`}</span>
                </span>
              </button>
            )
          }

          const complete = item.habit.log.includes(todayKey)
          const action = complete ? 'Reopen today' : 'Mark done today'
          return (
            <button
              key={`habit:${item.habit.id}`}
              type="button"
              data-testid="progress-canvas-row"
              aria-pressed={complete}
              aria-label={`Habit ${item.habit.name}: ${complete ? 1 : 0} of 1 day, ${complete ? 'complete' : 'incomplete'}. ${action}`}
              onClick={() => void toggleHabit(item.habit.id)}
              className={`flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-control-bg px-2 py-1.5 text-left transition-opacity hover:bg-control-bg-hover focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${complete ? 'opacity-75 hover:opacity-100 focus-visible:opacity-100' : ''}`}
            >
              <ProgressRing value={complete ? 1 : 0} target={1} unit="day" />
              <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                <span data-testid="progress-canvas-name" className="truncate text-xs font-medium">{item.habit.name}</span>
                <span className="font-mono text-[11px] text-canvas-fg-muted">{complete ? 'Done' : '0 / 1'}</span>
              </span>
            </button>
          )
        })}
      </div>

      {onOpenProgress ? (
        <div className="flex min-h-8 items-center justify-between gap-3 px-2 text-[11px] text-canvas-fg-muted">
          <span className="font-mono">{remaining > 0 ? `${remaining} more` : ''}</span>
          <button
            type="button"
            onClick={onOpenProgress}
            className="min-h-8 cursor-pointer rounded px-1.5 font-medium text-canvas-fg opacity-0 transition-opacity group-hover/progress:opacity-100 group-focus-within/progress:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent [@media(pointer:coarse)]:opacity-100 motion-reduce:transition-none"
          >
            Open Progress
          </button>
        </div>
      ) : null}

      <div aria-live="polite" className="min-h-4 px-2 text-[11px] text-canvas-fg-muted">
        {failedMutation ? (
          <span>
            Progress was not saved. Try again.{' '}
            <button type="button" onClick={() => void retryFailedMutation()} className="min-h-8 cursor-pointer font-medium text-canvas-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent">Retry</button>
          </span>
        ) : null}
      </div>
    </section>
  )
}
