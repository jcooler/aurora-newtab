import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { anchorPanel } from '../../../lib/layout/anchor'

/** Keeps the glance readable while retaining every native row operation. */
export default function WidgetRowActions({ label, inline = false, children }: { label: string; inline?: boolean; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const close = () => { setAnchor(null); queueMicrotask(() => trigger.current?.focus()) }
  useDialogEscape(close, anchor !== null)
  useEffect(() => {
    if (!anchor) return
    panel.current?.querySelector<HTMLElement>('a,button:not(:disabled)')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setAnchor(null)
    }
    const reposition = () => setAnchor(null)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', reposition)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', reposition) }
  }, [anchor])
  if (inline) return <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">{children}</div>
  const position = anchor ? anchorPanel(anchor, { w: 264, h: 210 }, { w: window.innerWidth, h: window.innerHeight }) : null
  return <>
    <button ref={trigger} type="button" aria-label={`Actions for ${label}`} aria-haspopup="dialog" aria-expanded={anchor !== null} className="widget-row-actions-trigger text-sm" onClick={() => anchor ? close() : setAnchor(trigger.current?.getBoundingClientRect() ?? null)}><span aria-hidden>···</span></button>
    {position ? createPortal(<div ref={panel} role="dialog" aria-label={`Actions for ${label}`} className="widget-row-actions-panel" style={{ left: position.left, ...('top' in position ? { top: position.top } : { bottom: position.bottom }) }}>
      <div className="widget-row-actions-content">{children}</div>
      <button type="button" onClick={close} className="widget-row-actions-close">Close actions</button>
    </div>, document.body) : null}
  </>
}
