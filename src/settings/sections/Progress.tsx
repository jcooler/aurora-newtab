import { useRef, useState } from 'react'

import ProgressRing from '../../components/ProgressRing'
import { applyHabitIntent, MAX_HABITS, streak, toggleDay, type HabitIntent } from '../../lib/habits'
import { readLocalDay, useLocalDay } from '../../lib/hooks/useLocalDay'
import { MAX_PROGRESS_GOALS, applyProgressIntent, progressValueForDay, validProgressGoals, type ProgressIntent } from '../../lib/progress'
import type { AuroraStorage } from '../../lib/storage/index'
import type { Habit, ProgressGoal } from '../../lib/storage/schema'
import Section from '../Section'
import { btnDanger, btnPrimary, btnQuiet, control } from './shared'
import ProgressGoalDialog from './ProgressGoalDialog'

type OpenDialog = { kind: 'add' } | { kind: 'edit'; id: string }
type FailedMutation =
  | { authority: 'progress'; intent: ProgressIntent }
  | { authority: 'habit-toggle'; id: string }
  | { authority: 'habit-settings'; intent: HabitIntent }

export default function Progress({ goals, habits, storage }: {
  goals: ProgressGoal[] | undefined
  habits: Habit[] | undefined
  storage: AuroraStorage
}) {
  const today = useLocalDay()
  const manualGoals = validProgressGoals(goals)
  const habitRows = habits ?? []
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [habitEditor, setHabitEditor] = useState<{ id: string; name: string; deleteArmed: boolean } | null>(null)
  const [newHabitName, setNewHabitName] = useState('')
  const [failedMutation, setFailedMutation] = useState<FailedMutation | null>(null)
  const dialogInvokerRef = useRef<HTMLButtonElement>(null)
  const overviewRef = useRef<HTMLDivElement>(null)
  const empty = manualGoals.length === 0 && habitRows.length === 0
  const editingIndex = dialog?.kind === 'edit' ? manualGoals.findIndex((goal) => goal.id === dialog.id) : -1
  const editingGoal = editingIndex >= 0 ? manualGoals[editingIndex]! : null

  async function applyManualIntent(intent: ProgressIntent, reportInOverview = true): Promise<boolean> {
    try {
      await storage.update('progressGoals', (freshGoals) => applyProgressIntent(freshGoals, intent, readLocalDay().key))
      setFailedMutation(null)
      return true
    } catch {
      if (reportInOverview) setFailedMutation({ authority: 'progress', intent })
      return false
    }
  }

  async function toggleHabit(id: string): Promise<boolean> {
    try {
      await storage.update('habits', (list) => {
        const todayKey = readLocalDay().key
        return list.map((habit) => habit.id === id ? { ...habit, log: toggleDay(habit.log, todayKey) } : habit)
      })
      setFailedMutation(null)
      return true
    } catch {
      setFailedMutation({ authority: 'habit-toggle', id })
      return false
    }
  }

  async function applyHabitSettingsIntent(intent: HabitIntent): Promise<boolean> {
    try {
      await storage.update('habits', (list) => applyHabitIntent(list, intent))
      setFailedMutation(null)
      return true
    } catch {
      setFailedMutation({ authority: 'habit-settings', intent })
      return false
    }
  }

  function openDialog(next: OpenDialog, invoker: HTMLButtonElement) {
    dialogInvokerRef.current = invoker
    setDialog(next)
  }

  async function retryFailedMutation() {
    if (!failedMutation) return
    if (failedMutation.authority === 'progress') await applyManualIntent(failedMutation.intent)
    else if (failedMutation.authority === 'habit-toggle') await toggleHabit(failedMutation.id)
    else await applyHabitSettingsIntent(failedMutation.intent)
  }

  return (
    <Section title="Progress">
      <div ref={overviewRef} data-settings-anchor="progress-overview" tabIndex={-1}>
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em] text-fg">Keep what matters moving.</h2>
        <p className="mt-1 max-w-[34rem] text-sm leading-relaxed text-fg-muted">Use light reminders for personal goals. Progress never becomes an attention alert.</p>

        {empty ? (
          <div className="py-8">
            <p className="text-sm font-medium text-fg">Choose one thing to keep moving.</p>
            <p className="mt-1 text-sm text-fg-muted">Add a simple daily value. It stays in this Chrome profile.</p>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-hairline">
            {manualGoals.map((goal) => {
              const value = progressValueForDay(goal, today.key)
              const complete = value >= goal.target
              return (
                <div key={goal.id} data-testid="progress-row" className="flex items-center gap-4 py-4 first:pt-2 max-[520px]:flex-wrap">
                  <ProgressRing value={value} target={goal.target} unit={goal.unit} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Manual</p>
                    <h3 className="truncate text-sm font-medium text-fg">{goal.name}</h3>
                    <p className="font-mono text-xs text-fg-muted">{value} / {goal.target} {goal.unit}</p>
                  </div>
                  <div className="flex gap-2 max-[520px]:ml-[3.75rem]">
                    <button type="button" aria-label={`${complete ? 'Reset' : 'Increment'} ${goal.name}`} onClick={() => void applyManualIntent({ kind: complete ? 'reset' : 'increment', id: goal.id })} className={btnQuiet}>{complete ? 'Reset' : '+1'}</button>
                    <button type="button" aria-label={`Edit ${goal.name}`} onClick={(event) => openDialog({ kind: 'edit', id: goal.id }, event.currentTarget)} className={btnQuiet}>Edit</button>
                  </div>
                </div>
              )
            })}
            {habitRows.map((habit) => {
              const done = habit.log.includes(today.key)
              const days = streak(habit.log, today.key)
              const editing = habitEditor?.id === habit.id
              return (
                <div key={habit.id} data-testid="progress-row" className="flex items-center gap-4 py-4 first:pt-2 max-[520px]:flex-wrap">
                  <ProgressRing value={done ? 1 : 0} target={1} unit="habit" />
                  {editing ? (
                    <form
                      className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const name = habitEditor.name.trim()
                        if (!name) return
                        void applyHabitSettingsIntent({ kind: 'rename', id: habit.id, name }).then((saved) => {
                          if (saved) setHabitEditor(null)
                        })
                      }}
                    >
                      <label className="min-w-40 flex-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
                        Habit name
                        <input
                          autoFocus
                          aria-label="Habit name"
                          value={habitEditor.name}
                          onChange={(event) => setHabitEditor({ ...habitEditor, name: event.currentTarget.value, deleteArmed: false })}
                          className={`${control} mt-1 w-full normal-case tracking-normal`}
                        />
                      </label>
                      <button type="submit" className={btnPrimary}>Save habit</button>
                      <button type="button" onClick={() => setHabitEditor(null)} className={btnQuiet}>Cancel</button>
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => {
                          if (!habitEditor.deleteArmed) {
                            setHabitEditor({ ...habitEditor, deleteArmed: true })
                            return
                          }
                          void applyHabitSettingsIntent({ kind: 'remove', id: habit.id }).then((saved) => {
                            if (saved) setHabitEditor(null)
                          })
                        }}
                      >
                        {habitEditor.deleteArmed ? 'Confirm delete habit' : 'Delete habit'}
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Habit</p>
                        <h3 className="truncate text-sm font-medium text-fg">{habit.name}</h3>
                        <p className="text-xs text-fg-muted">{days} day streak</p>
                      </div>
                      <div className="flex gap-2 max-[520px]:ml-[3.75rem]">
                        <button type="button" aria-label={`${done ? 'Reopen' : 'Done'} ${habit.name}`} onClick={() => void toggleHabit(habit.id)} className={btnQuiet}>{done ? 'Reopen' : 'Done'}</button>
                        <button type="button" aria-label={`Edit ${habit.name}`} onClick={() => setHabitEditor({ id: habit.id, name: habit.name, deleteArmed: false })} className={btnQuiet}>Edit</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {manualGoals.length < MAX_PROGRESS_GOALS ? (
          <button type="button" onClick={(event) => openDialog({ kind: 'add' }, event.currentTarget)} className={`${btnPrimary} mt-4`}>Add progress</button>
        ) : (
          <p className="mt-4 text-xs text-fg-muted">Maximum of 6 manual goals.</p>
        )}

        {habitRows.length < MAX_HABITS ? (
          <form
            className="mt-5 flex max-w-md items-end gap-2 border-t border-hairline pt-5"
            onSubmit={(event) => {
              event.preventDefault()
              const name = newHabitName.trim()
              if (!name) return
              void applyHabitSettingsIntent({ kind: 'add', id: crypto.randomUUID(), name, createdAt: Date.now() }).then((saved) => {
                if (saved) setNewHabitName('')
              })
            }}
          >
            <label className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
              New habit name
              <input aria-label="New habit name" value={newHabitName} onChange={(event) => setNewHabitName(event.currentTarget.value)} className={`${control} mt-1 w-full normal-case tracking-normal`} />
            </label>
            <button type="submit" className={btnQuiet}>Add habit</button>
          </form>
        ) : (
          <p className="mt-5 border-t border-hairline pt-5 text-xs text-fg-muted">Maximum of 6 habits.</p>
        )}

        <div aria-live="polite" className="mt-3 min-h-5 text-xs text-fg-muted">
          {failedMutation ? (
            <span>
              Progress was not saved. Try again.{' '}
              <button type="button" onClick={() => void retryFailedMutation()} className="min-h-9 cursor-pointer font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">Retry</button>
            </span>
          ) : null}
        </div>
      </div>

      <ProgressGoalDialog
        open={dialog !== null}
        kind={dialog?.kind ?? 'add'}
        goal={editingGoal}
        invokerRef={dialogInvokerRef}
        fallbackFocusRef={overviewRef}
        onClose={() => setDialog(null)}
        onIntent={(intent) => applyManualIntent(intent, false)}
        canMoveUp={editingIndex > 0}
        canMoveDown={editingIndex >= 0 && editingIndex < manualGoals.length - 1}
      />
    </Section>
  )
}
