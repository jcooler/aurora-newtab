import { useState } from 'react'
import { useDialogEscape } from '../../lib/dialogStack'
import { useLocalDay } from '../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { useStorage } from '../../lib/storage/context'
import { currentFocus, setFocusText } from '../components/focusLogic'
import { useTimerSession } from '../widgets/timer/TimerSessionProvider'
import { todoReducer } from '../widgets/todo/todoReducer'
import FlowAmbience from './FlowAmbience'

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Flow is deliberately not another dashboard card. It leaves the photograph
 * in place and gives the user's focus, timer, and next task the whole field.
 */
export default function FlowScreen() {
  const storage = useStorage()
  const timer = useTimerSession()
  const [storedFocus] = useStoredKey('focus')
  const [todoLists] = useStoredKey('todoLists')
  const [settings] = useStoredKey('settings')
  const { key: today } = useLocalDay()
  const [focusDraft, setFocusDraft] = useState('')

  const focus = storedFocus === undefined ? null : currentFocus(storedFocus, today)
  const firstList = todoLists?.[0]
  const unfinished = firstList?.items.filter((item) => !item.done) ?? []
  const currentTask = unfinished[0]
  const remainingTasks = Math.max(0, unfinished.length - 1)

  useDialogEscape(() => {
    void timer.exitFlow()
  }, timer.session.flow)

  if (!timer.hydrated || storedFocus === undefined || todoLists === undefined || settings === undefined) return null

  const commitFocus = () => {
    const next = setFocusText(focusDraft, today)
    if (!next) return
    void storage.update('focus', () => next)
    setFocusDraft('')
  }

  return (
    <section
      data-flow-screen=""
      aria-label="Flow"
      className="relative z-10 flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-5 py-[clamp(1.25rem,5vh,3.5rem)] text-canvas-fg"
    >
      <FlowAmbience
        enabled={settings.flowAmbience === 'creek'}
        running={timer.session.flow && timer.session.running}
      />
      <div className="flex w-full max-w-5xl flex-col items-center gap-[clamp(0.75rem,2.8vh,2rem)] text-center">
        <div data-flow-focus="" className="w-full max-w-4xl">
          {focus ? (
            <p className="text-photo text-balance text-[clamp(1.4rem,4vw,3.5rem)] font-medium leading-[1.08] tracking-[-0.025em] text-canvas-fg">
              {focus.text}
            </p>
          ) : (
            <form
              className="mx-auto flex max-w-2xl flex-col items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                commitFocus()
              }}
            >
              <label htmlFor="flow-focus-input" className="text-photo text-sm font-medium text-canvas-fg-muted">
                What&rsquo;s your main focus today?
              </label>
              <input
                id="flow-focus-input"
                autoComplete="off"
                value={focusDraft}
                onChange={(event) => setFocusDraft(event.currentTarget.value)}
                onBlur={commitFocus}
                className="text-photo min-h-11 w-full border-b border-canvas-fg-muted bg-transparent px-2 text-center text-[clamp(1.35rem,3.5vw,2.5rem)] text-canvas-fg outline-none transition-colors focus-visible:border-accent motion-reduce:transition-none"
              />
            </form>
          )}
        </div>

        <div data-flow-timer="" className="flex w-full flex-col items-center gap-[clamp(0.45rem,1.6vh,1rem)]">
          <p className="text-photo text-xs font-semibold uppercase tracking-[0.28em] text-canvas-fg-muted">
            {timer.session.mode === 'work' ? 'In flow' : 'Break'}
          </p>
          <p
            aria-label={`${timer.session.mode === 'work' ? 'Work' : 'Break'} timer ${formatRemaining(timer.remainingMs)}`}
            className="text-photo tabular-nums text-[clamp(4.25rem,18vh,10rem)] font-light leading-[0.82] tracking-[-0.065em] text-canvas-fg"
          >
            {formatRemaining(timer.remainingMs)}
          </p>
          <div
            data-flow-progress=""
            className="h-px w-full max-w-2xl overflow-hidden bg-canvas-fg-muted/35"
            role="progressbar"
            aria-label="Timer progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(timer.progressPct)}
          >
            <div
              className="h-full origin-left bg-accent transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${timer.progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={timer.session.running ? 'Pause timer' : 'Resume timer'}
              onClick={() => void (timer.session.running ? timer.pause() : timer.start())}
              className="text-photo min-h-9 rounded-full border border-canvas-fg-muted/50 bg-black/15 px-4 text-sm font-medium text-canvas-fg backdrop-blur-sm transition-colors hover:border-canvas-fg hover:bg-black/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              {timer.session.running ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              aria-label="End flow"
              onClick={() => void timer.exitFlow()}
              className="text-photo min-h-9 rounded-full px-4 text-sm font-medium text-canvas-fg-muted transition-colors hover:text-canvas-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              End flow
            </button>
          </div>
        </div>

        {firstList && currentTask ? (
          <div data-flow-task="" className="flex min-h-9 items-center gap-3 border-t border-canvas-fg-muted/35 px-4 pt-[clamp(0.75rem,2vh,1.25rem)]">
            <label className="relative inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                aria-label={`Complete ${currentTask.text}`}
                checked={false}
                onChange={() => {
                  void storage.update('todoLists', (current) => todoReducer(current, {
                    type: 'toggleItem',
                    listId: firstList.id,
                    itemId: currentTask.id,
                  }))
                }}
                className="peer sr-only"
              />
              <span aria-hidden className="size-5 rounded-full border border-canvas-fg-muted shadow-[0_1px_3px_rgb(0_0_0/0.45)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
            </label>
            <span className="text-photo text-[clamp(1rem,2vw,1.35rem)] text-canvas-fg">{currentTask.text}</span>
            {remainingTasks > 0 ? (
              <span className="text-photo text-xs text-canvas-fg-muted">{remainingTasks} more</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
