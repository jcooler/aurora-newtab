import { Suspense, lazy, useEffect, useState } from 'react'

const Palette = lazy(() => import('./Palette'))

export default function PaletteHost({
  onOpenSettings,
  arranging = false,
}: {
  onOpenSettings: () => void
  /** True while arrange mode (ArrangeController) is on. PaletteHost's own
   *  listener is registered on `window`, which `inert` cannot touch (inert
   *  only blocks pointer reach and Tab traversal on the element it's applied
   *  to) — so even though the rest of the page goes inert while arranging,
   *  this hotkey would otherwise still fire and open a palette stacked dead
   *  underneath the arrange overlay (unreachable except via Escape/Ctrl+K).
   *  Gating here, not via `inert`, is the only mechanism that actually
   *  works for a window-level listener. */
  arranging?: boolean
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (arranging) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault() // page-level Ctrl/Cmd+K is interceptable on the new tab
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [arranging])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <Palette onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />
    </Suspense>
  )
}
