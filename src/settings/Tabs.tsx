import { useRef, type ReactNode } from 'react'

/** The Settings drawer's tab bar and its one live panel.
 *
 *  Selection lives in the PARENT (SettingsPanel), and `children` is only ever
 *  the ACTIVE tab's content: the inactive tabs' sections are unmounted rather
 *  than hidden, so a section's hooks (Data's import state, Layout's confirm
 *  dialog, …) don't run while it isn't on screen — the same "don't render
 *  what isn't shown" rule the rest of the app follows.
 *
 *  Keyboard: the APG tabs pattern with AUTOMATIC activation — Left/Right (with
 *  wrap) and Home/End both move focus and select, the same "arrows apply the
 *  choice immediately" convention the theme radiogroup already uses
 *  (General.tsx). Roving tabindex means only the selected tab is a Tab stop.
 *  Down/Up are deliberately NOT aliased onto Left/Right the way the theme
 *  radiogroup aliases them: APG reserves the vertical arrows for a VERTICAL
 *  tablist, and this bar sits at the top of a scrollable drawer whose content
 *  those keys belong to. */
export default function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: readonly { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
  children: ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((t) => t.id === active)
    let nextIndex: number
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1 + tabs.length) % tabs.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabs.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    onChange(tabs[nextIndex]!.id)
    // Focus is moved imperatively on the target button — that works even
    // though its tabIndex is still -1 at the moment of the call, since
    // script-driven focus ignores tabIndex; the roving tabIndex only governs
    // Tab-key navigation. Same mechanism as the theme radiogroup's.
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Settings sections"
        ref={listRef}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-panel-border"
      >
        {tabs.map((t) => {
          const selected = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={selected}
              // Only the selected tab controls anything: the other panels are
              // not in the document, and an aria-controls pointing at an id
              // that doesn't exist is a dangling reference, not a wiring.
              aria-controls={selected ? `settings-tabpanel-${t.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              // -mb-px pulls the active underline onto the list's own hairline
              // so the two read as one rule with a lit segment, rather than
              // two stacked lines. cursor-pointer because Tailwind v4's
              // preflight sets `button { cursor: default }` — the inverted
              // affordance already fixed on the weather chip and the bookmarks
              // chips, and these are the drawer's primary navigation.
              className={`-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
                selected
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`settings-tabpanel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
        className="flex flex-col gap-6"
      >
        {children}
      </div>
    </div>
  )
}
