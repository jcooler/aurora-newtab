import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { useDialogEscape } from '../../../lib/dialogStack'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import {
  closeTodoistTask,
  fetchTodoistProjects,
  fetchTodoistTasks,
  isTodoistData,
  todoistItemLimit,
  todoistProjectIds,
  type TodoistData,
  type TodoistTask,
} from '../../../services/connectors/todoist'
import type { ConnectorConfig, TodoistConfig } from '../../../services/connectors/types'
import { WorkConnectorSetup, WorkDockDetail, WorkWidgetShell } from '../work/WorkWidgetShell'
import { workPresentationState, workRowClass } from '../work/workPresentation'

function connectedTodoist(config: ConnectorConfig | undefined): TodoistConfig | null {
  if (!config || !('accountLabel' in config)) return null
  const todoist = config as TodoistConfig
  return todoist.enabled && typeof todoist.token === 'string' && todoist.token.trim().length > 0 &&
    typeof todoist.accountLabel === 'string' && todoist.accountLabel.trim().length > 0
    ? todoist
    : null
}

export default function TodoistWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const candidate = connectors?.todoist
  if (!candidate || candidate.enabled !== true) return null
  const config = connectedTodoist(candidate)
  if (!config) return <WorkConnectorSetup title="Todoist" canvasSize={canvasSize} docked={docked} />
  return <TodoistInner config={config} canvasSize={canvasSize} docked={docked} />
}

function TodoistInner({ config, canvasSize, docked }: { config: TodoistConfig; canvasSize: CanvasSize; docked: boolean }) {
  const storage = useStorage()
  const [completeTarget, setCompleteTarget] = useState<TodoistTask | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const completingRef = useRef(false)
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null)

  const { data, state, lastError } = useConnectorSnapshot<TodoistData>(
    'todoist',
    config,
    async () => {
      const [projects, tasks] = await Promise.all([
        fetchTodoistProjects(config.token),
        fetchTodoistTasks(config.token, { projectIds: todoistProjectIds(config) }),
      ])
      return { projects, tasks }
    },
    undefined,
    undefined,
    isTodoistData,
  )
  const tasks = data?.tasks ?? []
  const projects = data?.projects ?? []
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  const presentation = workPresentationState(true, state, data !== null && tasks.length === 0)
  const overdue = tasks.filter((task) => task.bucket === 'overdue').length
  const facts = [`${tasks.length} due`, overdue > 0 ? `${overdue} overdue` : tasks.length > 0 ? 'None overdue' : null]
  const visible = canvasSize === 'full' ? tasks : canvasSize === 'standard' ? tasks.slice(0, todoistItemLimit(config)) : []
  const detailRows = tasks.slice(0, Math.min(3, todoistItemLimit(config)))

  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.todoist
      return next
    })
  }

  const closeConfirmation = () => {
    setCompleteTarget(null)
    setCompleteError(null)
    queueMicrotask(() => restoreFocusRef.current?.focus())
  }
  useDialogEscape(closeConfirmation, completeTarget !== null && !completing)

  async function confirmCompletion() {
    if (!completeTarget || completingRef.current) return
    completingRef.current = true
    setCompleting(true)
    setCompleteError(null)
    try {
      await closeTodoistTask(config.token, completeTarget.id)
      await storage.update('connectorSnapshots', (previous) => {
        const next = { ...previous }
        delete next.todoist
        return next
      })
      closeConfirmation()
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : 'Todoist close failed.')
    } finally {
      completingRef.current = false
      setCompleting(false)
    }
  }

  const rows = (items: readonly TodoistTask[]) => (
    <TaskList
      tasks={items}
      projects={projectNames}
      onComplete={(task, button) => {
        restoreFocusRef.current = button
        setCompleteError(null)
        setCompleteTarget(task)
      }}
    />
  )

  const content = docked ? (
    <WorkDockDetail
      label="Todoist"
      facts={presentation === 'hard-error' ? ['Todoist unavailable'] : presentation === 'loading' ? ['Loading Todoist'] : facts}
      tone={overdue > 0 ? 'attention' : 'quiet'}
      presentation={presentation}
      emptyLabel="No due tasks."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {rows(detailRows)}
    </WorkDockDetail>
  ) : (
    <WorkWidgetShell
      title="Todoist"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel="No due tasks."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {data && tasks.length > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-sm font-semibold">{tasks.length} due</strong>
            <span className={overdue > 0 ? 'text-xs text-accent' : 'text-xs text-fg-muted'}>{overdue} overdue</span>
          </div>
          {visible.length > 0 ? <div className="mt-3">{rows(visible)}</div> : null}
        </>
      ) : null}
    </WorkWidgetShell>
  )

  return (
    <>
      {content}
      <CompletionDialog
        task={completeTarget}
        busy={completing}
        error={completeError}
        onCancel={closeConfirmation}
        onConfirm={() => void confirmCompletion()}
      />
    </>
  )
}

function TaskList({
  tasks,
  projects,
  onComplete,
}: {
  tasks: readonly TodoistTask[]
  projects: ReadonlyMap<string, string>
  onComplete(task: TodoistTask, button: HTMLButtonElement): void
}) {
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <li key={task.id} className="group flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="block truncate text-sm font-medium text-fg group-hover:text-accent group-focus-within:text-accent">
              {task.content}
            </span>
            <span className={`block truncate text-xs ${workRowClass}`}>
              {projects.get(task.projectId) ?? 'Unknown project'} · {bucketLabel(task.bucket)}
            </span>
          </a>
          <button
            type="button"
            aria-label={`Complete ${task.content}`}
            onClick={(event) => onComplete(task, event.currentTarget)}
            className="min-h-9 shrink-0 cursor-pointer rounded-md px-2 text-xs text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            Complete
          </button>
        </li>
      ))}
    </ul>
  )
}

function bucketLabel(bucket: TodoistTask['bucket']): string {
  if (bucket === 'overdue') return 'Overdue'
  if (bucket === 'today') return 'Today'
  return 'Upcoming'
}

function CompletionDialog({
  task,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  task: TodoistTask | null
  busy: boolean
  error: string | null
  onCancel(): void
  onConfirm(): void
}) {
  if (!task) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Complete ${task.content}?`}
        className="w-[min(24rem,calc(100vw_-_2rem))] rounded-panel border border-panel-border bg-panel-solid p-4 text-fg shadow-xl shadow-black/30"
      >
        <h2 className="text-base font-semibold">Complete this task?</h2>
        <p className="mt-2 text-sm text-fg-muted">{task.content}</p>
        {error ? <p role="alert" className="mt-3 text-xs text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cancel completion"
            className="min-h-9 rounded-md px-3 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            aria-label="Confirm completion"
            className="min-h-9 rounded-md px-3 text-sm font-medium text-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {busy ? 'Completing…' : 'Complete'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
