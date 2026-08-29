import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import { validateProgressDraft, type ProgressIntent } from '../../lib/progress'
import type { ProgressGoal } from '../../lib/storage/schema'
import { btnDanger, btnPrimary, btnQuiet, control, label } from './shared'

const TITLE_ID = 'progress-goal-dialog-title'
const DESCRIPTION_ID = 'progress-goal-dialog-description'

export default function ProgressGoalDialog({
  open,
  kind,
  goal,
  invokerRef,
  fallbackFocusRef,
  onClose,
  onIntent,
  canMoveUp = false,
  canMoveDown = false,
}: {
  open: boolean
  kind: 'add' | 'edit'
  goal: ProgressGoal | null
  invokerRef: RefObject<HTMLButtonElement | null>
  fallbackFocusRef: RefObject<HTMLElement | null>
  onClose: () => void
  onIntent: (intent: ProgressIntent) => Promise<boolean>
  canMoveUp?: boolean
  canMoveDown?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousOpen = useRef(false)
  const sessionRef = useRef(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('1')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [failedIntent, setFailedIntent] = useState<ProgressIntent | null>(null)

  useFocusTrap(dialogRef, open)
  useDialogEscape(() => onClose(), open)

  useEffect(() => {
    const wasOpen = previousOpen.current
    if (open && !wasOpen) {
      sessionRef.current += 1
      setEditingId(kind === 'edit' ? goal?.id ?? null : null)
      setName(kind === 'edit' ? goal?.name ?? '' : '')
      setTarget(String(kind === 'edit' ? goal?.target ?? 1 : 1))
      setUnit(kind === 'edit' ? goal?.unit ?? '' : '')
      setError(null)
      setDeleteArmed(false)
      setPending(false)
      setFailedIntent(null)
    } else if (!open && wasOpen) {
      sessionRef.current += 1
      const invoker = invokerRef.current
      queueMicrotask(() => {
        const focusTarget = invoker?.isConnected ? invoker : fallbackFocusRef.current
        if (focusTarget?.isConnected) focusTarget.focus()
      })
    }
    previousOpen.current = open
  }, [fallbackFocusRef, goal, invokerRef, kind, open])

  async function execute(intent: ProgressIntent, closeOnSuccess = true) {
    const session = sessionRef.current
    setPending(true)
    setFailedIntent(null)
    const saved = await onIntent(intent)
    if (session !== sessionRef.current) return
    setPending(false)
    if (!saved) {
      setFailedIntent(intent)
      return
    }
    if (closeOnSuccess) onClose()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateProgressDraft({ name, unit, target: Number(target) })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    if (kind === 'edit') {
      if (!editingId) return
      await execute({ kind: 'edit', id: editingId, ...result.value })
      return
    }
    await execute({
      kind: 'add',
      id: crypto.randomUUID(),
      ...result.value,
      createdAt: Date.now(),
    })
  }

  if (!open) return null
  const title = kind === 'edit' ? 'Edit progress' : 'Add progress'

  return createPortal(
    <div
      data-testid="progress-dialog-backdrop"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
        className="w-full max-w-md rounded-2xl border border-hairline bg-panel-solid p-5 text-fg shadow-2xl"
      >
        <h2 id={TITLE_ID} className="font-display text-xl font-medium tracking-[-0.02em]">{title}</h2>
        <p id={DESCRIPTION_ID} className="mt-1 text-sm text-fg-muted">
          Set one local daily value. You can change it at any time.
        </p>

        <form noValidate onSubmit={(event) => void save(event)} className="mt-5 space-y-4">
          <div>
            <label htmlFor="progress-goal-name" className={label}>Name</label>
            <input id="progress-goal-name" value={name} onChange={(event) => setName(event.currentTarget.value)} className={`${control} mt-1 w-full`} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 max-[420px]:grid-cols-1">
            <div>
              <label htmlFor="progress-goal-target" className={label}>Daily target</label>
              <input id="progress-goal-target" type="number" inputMode="numeric" min={1} max={999999} step={1} value={target} onChange={(event) => setTarget(event.currentTarget.value)} className={`${control} mt-1 w-full font-mono`} />
            </div>
            <div>
              <label htmlFor="progress-goal-unit" className={label}>Unit</label>
              <input id="progress-goal-unit" value={unit} onChange={(event) => setUnit(event.currentTarget.value)} className={`${control} mt-1 w-full`} />
            </div>
          </div>

          {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}

          {failedIntent ? (
            <div aria-live="polite" className="text-xs text-fg-muted">
              <span>Progress was not saved. Try again.</span>{' '}
              <button type="button" disabled={pending} onClick={() => void execute(failedIntent)} className="min-h-9 cursor-pointer font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">Retry</button>
            </div>
          ) : null}

          {kind === 'edit' && editingId ? (
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
              <button type="button" disabled={!canMoveUp || pending} onClick={() => void execute({ kind: 'move', id: editingId, direction: -1 })} className={`${btnQuiet} disabled:cursor-not-allowed disabled:opacity-40`}>Move up</button>
              <button type="button" disabled={!canMoveDown || pending} onClick={() => void execute({ kind: 'move', id: editingId, direction: 1 })} className={`${btnQuiet} disabled:cursor-not-allowed disabled:opacity-40`}>Move down</button>
              <button type="button" disabled={pending} onClick={() => void execute({ kind: 'complete', id: editingId })} className={btnQuiet}>Complete today</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true)
                    return
                  }
                  void execute({ kind: 'remove', id: editingId })
                }}
                className={btnDanger}
              >
                {deleteArmed ? 'Confirm delete' : 'Delete goal'}
              </button>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className={btnQuiet}>Cancel</button>
            <button type="submit" disabled={pending} className={btnPrimary}>Save</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
