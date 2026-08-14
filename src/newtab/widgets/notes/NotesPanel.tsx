import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import type { PanelPlacement } from '../../../lib/layout/anchor'
import { useNotesPersistence } from './useNotesPersistence'

export interface NotesPanelHandle {
  requestClose(): Promise<boolean>
}

interface NotesPanelProps {
  anchor: PanelPlacement
  onClose: () => void
}

const NotesPanel = forwardRef<NotesPanelHandle, NotesPanelProps>(function NotesPanel(
  { anchor, onClose },
  forwardedRef,
) {
  const notes = useNotesPersistence()
  const panelRef = useRef<HTMLDivElement>(null)
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

  useImperativeHandle(forwardedRef, () => ({ requestClose }), [requestClose])
  useFocusTrap(panelRef, notes.ready)
  useDialogEscape(() => requestClose(), notes.ready)

  if (!notes.ready) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notes"
      style={{
        position: 'fixed',
        left: anchor.left,
        ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
      }}
      className="z-30 flex h-64 w-80 flex-col overflow-hidden rounded-panel border border-panel-border bg-panel-solid shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
    >
      <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">Notes</h2>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-4 text-xs text-fg-muted"
        >
          {notes.status === 'saving' ? 'Saving…' : notes.status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      {notes.status === 'error' && (
        <div
          role="alert"
          className="mx-3.5 mb-1 flex min-h-9 items-center justify-between gap-2 rounded border border-red-400/50 px-2 text-xs text-fg"
        >
          <span>Couldn’t save. Your note is still here.</span>
          <button
            type="button"
            onClick={() => void notes.retry()}
            className="min-h-9 shrink-0 px-2 font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Retry save
          </button>
        </div>
      )}
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
        className="w-full flex-1 resize-none bg-transparent px-3.5 pb-3.5 pt-1 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  )
})

export default NotesPanel
