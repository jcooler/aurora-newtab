import { useEffect, useRef, useState, type ReactNode } from 'react'
import { row, label } from './sections/shared'

// Live-drag writes are debounced so dragging the native picker doesn't storm
// storage; the final value ALSO commits immediately on the picker's own
// `change`. Deep-equal writes are no-ops at the storage layer, so the
// debounced trailing write and the commit never fight even when they carry
// the same color. (Hoisted verbatim from the original widget-color picker
// when the appearance system grew to six pickers.)
const COLOR_DEBOUNCE_MS = 150

/** One appearance color row: a swatch-as-label opening the native picker,
 *  a quiet Reset shown only while a value is actually stored (null = auto),
 *  and an optional advisory line (contrast/visibility warnings — advisory
 *  because the user owns the pick; nothing blocks). */
export default function ColorPickerRow({
  id,
  labelText,
  resetLabel,
  stored,
  fallbackHex,
  onWrite,
  advisory,
}: {
  id: string
  labelText: string
  /** Exact reset button accessible name (kept caller-owned so long-standing
   *  names like "Reset widget color" never drift). */
  resetLabel: string
  /** The stored value; null = auto (swatch falls back, Reset hidden). */
  stored: string | null
  /** What auto currently looks like — shown in the swatch when stored is null. */
  fallbackHex: string
  onWrite: (hex: string | null) => void
  advisory?: ReactNode
}) {
  const onWriteRef = useRef(onWrite)
  onWriteRef.current = onWrite

  const effective = stored ?? fallbackHex
  // Local draft so dragging the native picker isn't snapped back by the
  // controlled `value` before the (debounced) write lands; re-synced when
  // the stored value actually changes — our commit, Reset, or another tab.
  const [draft, setDraft] = useState(effective)
  useEffect(() => {
    setDraft(effective)
  }, [effective])

  const inputRef = useRef<HTMLInputElement>(null)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearWriteTimer() {
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current)
      writeTimer.current = null
    }
  }

  function onColorInput(hex: string) {
    setDraft(hex)
    clearWriteTimer()
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null
      onWriteRef.current(hex)
    }, COLOR_DEBOUNCE_MS)
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onCommit = () => {
      clearWriteTimer()
      onWriteRef.current(el.value)
    }
    el.addEventListener('change', onCommit)
    return () => {
      el.removeEventListener('change', onCommit)
      clearWriteTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once; onWrite is read via ref
  }, [])

  return (
    <>
      <div className={row}>
        <span className={label} id={`${id}-label`}>
          {labelText}
        </span>
        <div className="flex items-center gap-3">
          <label
            htmlFor={id}
            className="relative inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full"
          >
            <input
              ref={inputRef}
              id={id}
              type="color"
              aria-label={labelText}
              value={draft}
              onChange={(e) => onColorInput(e.currentTarget.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              style={{ backgroundColor: draft }}
              className="size-7 rounded-full border border-control-border shadow-inner shadow-black/30 transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent motion-reduce:transition-none"
            />
          </label>
          {stored !== null && (
            <button
              type="button"
              aria-label={resetLabel}
              onClick={() => {
                clearWriteTimer()
                onWriteRef.current(null)
              }}
              className="min-h-9 min-w-9 rounded-full px-2 py-1 text-xs text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      {advisory}
    </>
  )
}
