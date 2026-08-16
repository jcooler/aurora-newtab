import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { WidgetRegistryEntry } from '../widgetRegistry'

interface SignalDockEntryProps {
  entry: WidgetRegistryEntry
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export default function SignalDockEntry({ entry, open, onOpenChange, children }: SignalDockEntryProps) {
  const contentId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const action = open ? 'Close' : 'Open'

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    onOpenChange(false)
    buttonRef.current?.focus()
  }

  return (
    <div
      data-signal-dock-entry=""
      data-signal-dock-open={open ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
    >
      <div data-signal-dock-header="">
        <span data-signal-dock-identity="">{entry.label}</span>
        <span data-signal-dock-fallback="">Enabled</span>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${action} ${entry.label} details`}
          onClick={() => onOpenChange(!open)}
        >
          <span aria-hidden>{open ? '−' : '+'}</span>
        </button>
      </div>
      <div
        id={contentId}
        data-signal-dock-content=""
        inert={open ? undefined : true}
        tabIndex={open ? -1 : undefined}
      >
        {children}
      </div>
    </div>
  )
}
