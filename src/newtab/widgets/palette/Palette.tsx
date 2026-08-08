import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { searchWeb } from '../../../services/search'
import { todoReducer } from '../todo/todoReducer'
import { buildCommands, filterCommands, type CommandContext } from './commands'

export default function Palette({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void
  onOpenSettings: () => void
}) {
  const [links] = useStoredKey('links')
  const [settings] = useStoredKey('settings')
  const storage = useStorage()
  const panelRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useFocusTrap(panelRef, true)

  // Newest-first shared stack (src/lib/dialogStack.ts). The dialog element's
  // own onKeyDown below no longer intercepts Escape, so it bubbles up to the
  // document listener this hook installs.
  useDialogEscape(onClose)

  // ctx wraps every side effect the commands can trigger. Built once settings
  // has loaded (links defaults to [] so a link-less board still gets a ctx).
  const ctx = useMemo<CommandContext | null>(() => {
    if (!settings) return null
    return {
      links: links ?? [],
      settings,
      openUrl: (url) => window.location.assign(url),
      // Red Argon remediation: routes through Chrome's own Search API
      // (src/services/search.ts) rather than building a provider URL —
      // see that module's doc comment for the full story.
      webSearch: (q) => void searchWeb(q),
      // Same idempotent-list pattern as TodoPanel's auto-seed, but folded into
      // a single transform: this one must ALWAYS produce a change (the new
      // item), so there's no same-reference short-circuit to preserve.
      addTodo: (text) =>
        storage
          .update('todoLists', (current) => {
            const withToday =
              current.length === 0
                ? todoReducer(current, { type: 'addList', name: 'Today' })
                : current
            return todoReducer(withToday, { type: 'addItem', listId: withToday[0]!.id, text })
          })
          .then(() => undefined),
      openSettings: onOpenSettings,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- links/settings/storage/onOpenSettings are the only real deps
  }, [links, settings, storage, onOpenSettings])

  const results = useMemo(
    () => (ctx ? filterCommands(buildCommands(ctx), query, ctx) : []),
    [ctx, query],
  )

  // A query edit can shrink the result list out from under the previous
  // selection, or change which command sits at a given position — reset to
  // the top match every time either changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [query, results.length])

  function runResult(index: number) {
    const cmd = results[index]
    if (!cmd) return
    void cmd.run()
    onClose()
  }

  const active = results[activeIndex]
  const activeId = active ? `palette-option-${active.id}` : undefined

  return (
    <>
      {/* Backdrop is a SIBLING of the dialog, not an ancestor: nesting
          role="dialog" inside an aria-hidden element makes Chrome log
          "Blocked aria-hidden on an element because its descendant retained
          focus" the instant useFocusTrap moves focus in (only un-hidden via
          non-standard leniency). The positioning wrapper below is
          pointer-events-none so clicks in its empty padding fall through to
          this backdrop and still close the palette. */}
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-black/30" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (results.length > 0) setActiveIndex((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (results.length > 0) setActiveIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runResult(activeIndex)
            }
          }}
          className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-panel border border-panel-border bg-panel-solid text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
        >
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Type a command, a link, or "todo: buy milk"'
            className="w-full border-b border-panel-border bg-transparent px-4 py-3 text-fg outline-none placeholder:text-fg-muted"
          />
          <ul id="palette-listbox" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-4 py-3 text-sm text-fg-muted">No matches</li>}
            {results.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`palette-option-${cmd.id}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runResult(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
                  i === activeIndex ? 'bg-control-bg-hover text-fg' : 'text-fg-muted'
                }`}
              >
                <span className="truncate">{cmd.label}</span>
                {cmd.hint && <span className="ml-4 shrink-0 truncate text-xs text-fg-muted">{cmd.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
