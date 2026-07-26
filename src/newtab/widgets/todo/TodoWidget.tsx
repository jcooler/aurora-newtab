import { Suspense, lazy, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

const TodoPanel = lazy(() => import('./TodoPanel'))

export default function TodoWidget() {
  const [settings] = useStoredKey('settings')
  const [open, setOpen] = useState(false)
  if (!settings?.widgets.todo) return null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-16 rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm text-fg backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Tasks
      </button>
      {open && (
        <Suspense fallback={null}>
          <TodoPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
