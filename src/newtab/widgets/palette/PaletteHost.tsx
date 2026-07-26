import { Suspense, lazy, useEffect, useState } from 'react'

const Palette = lazy(() => import('./Palette'))

export default function PaletteHost({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault() // page-level Ctrl/Cmd+K is interceptable on the new tab
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <Palette onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />
    </Suspense>
  )
}
