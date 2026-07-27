import { Suspense, lazy, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

const NotesPanel = lazy(() => import('./NotesPanel'))

export default function NotesWidget() {
  // Gate BEFORE the panel's open/close state exists, same shape as
  // TimerWidget: a disabled widget (settings.widgets.notes starts true, but
  // can be turned off) mounts nothing past the settings read.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.notes) return null
  return <NotesInner />
}

function NotesInner() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-16 rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm text-fg backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Notes
      </button>
      {open && (
        <Suspense fallback={null}>
          <NotesPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
