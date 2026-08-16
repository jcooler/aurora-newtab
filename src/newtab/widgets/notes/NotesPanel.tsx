import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'
import { AssertiveAlert, PoliteStatus } from '../../../components/StateFeedback'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import type { PanelPlacement } from '../../../lib/layout/anchor'
import { useNotesPersistence } from './useNotesPersistence'

export interface NotesPanelHandle {
  requestClose(): Promise<boolean>
  flushLatest(): Promise<boolean>
}

interface NotesPanelProps {
  anchor?: PanelPlacement
  onClose: () => void
  viewportRef?: (node: HTMLDivElement | null) => void
  embedded?: boolean
}

const NotesPanel = forwardRef<NotesPanelHandle, NotesPanelProps>(function NotesPanel(
  { anchor, onClose, viewportRef, embedded = false },
  forwardedRef,
) {
  const notes = useNotesPersistence()
  const panelRef = useRef<HTMLDivElement>(null)
  const errorMessageId = useId()
  const onCloseRef = useRef(onClose)
  const closePromiseRef = useRef<Promise<boolean> | null>(null)
  onCloseRef.current = onClose

  const requestClose = useCallback((): Promise<boolean> => {
    if (closePromiseRef.current) return closePromiseRef.current
    const operation = (async () => {
      const persisted = await notes.flushLatest()
      if (!persisted) return false
      onCloseRef.current()
      return true
    })().finally(() => {
      closePromiseRef.current = null
    })
    closePromiseRef.current = operation
    return operation
  }, [notes.flushLatest])

  useImperativeHandle(forwardedRef, () => ({ requestClose, flushLatest: notes.flushLatest }), [notes.flushLatest, requestClose])
  useFocusTrap(panelRef, !embedded && notes.ready)
  useDialogEscape(() => requestClose(), !embedded && notes.ready)

  if (!notes.ready) return null

  return (
    <div
      ref={(node) => {
        panelRef.current = node
        viewportRef?.(node)
      }}
      role={embedded ? 'region' : 'dialog'}
      aria-label="Notes"
      style={embedded ? undefined : {
        position: 'fixed',
        left: anchor!.left,
        ...('top' in anchor! ? { top: anchor!.top } : { bottom: anchor!.bottom }),
      }}
      className={embedded
        ? 'flex min-h-64 w-full flex-col overflow-hidden'
        : 'z-30 flex h-[min(16rem,calc(100dvh-1rem))] w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-panel border border-panel-border bg-panel-solid shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]'}
    >
      <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">Notes</h2>
        <PoliteStatus className="min-h-4 text-xs text-fg-muted">
          {notes.feedback.operation === 'pending'
            ? 'Saving…'
            : notes.feedback.operation === 'success'
              ? 'Saved'
              : ''}
        </PoliteStatus>
      </div>
      <AssertiveAlert
        className="mx-3.5 mb-1 flex min-h-9 items-center justify-between gap-2 rounded border border-red-400/50 px-2 text-xs text-fg"
      >
        {notes.feedback.retainedError ? (
          <>
            <span id={errorMessageId}>Couldn’t save. Your note is still here.</span>
            <button
              type="button"
              onClick={() => void notes.retry()}
              aria-busy={notes.feedback.operation === 'pending' ? 'true' : undefined}
              aria-describedby={errorMessageId}
              disabled={notes.feedback.operation === 'pending'}
              className="min-h-9 shrink-0 px-2 font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              Retry save
            </button>
          </>
        ) : null}
      </AssertiveAlert>
      <label htmlFor="notes-textarea" className="sr-only">
        Scratchpad
      </label>
      <textarea
        id="notes-textarea"
        value={notes.text}
        placeholder="Jot a thought, a link, a to-do…"
        onFocus={notes.focus}
        onBlur={notes.blur}
        onChange={(event) => notes.edit(event.currentTarget.value)}
        className="min-h-9 w-full flex-1 resize-none bg-transparent px-3.5 pb-3.5 pt-1 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  )
})

export default NotesPanel
