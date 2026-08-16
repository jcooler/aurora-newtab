import { useEffect, useRef, useState, type ReactNode } from 'react'

const ROOMY_SETTINGS = '(min-width: 900px)'

function useRoomySettings() {
  const [roomy, setRoomy] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(ROOMY_SETTINGS).matches
      : false,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(ROOMY_SETTINGS)
    const update = (event: MediaQueryListEvent | MediaQueryList) => setRoomy(event.matches)
    update(query)
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  return roomy
}

/** The Settings drawer's tab bar and its one live panel.
 *
 *  Selection lives in the PARENT (SettingsPanel), and `children` is only ever
 *  the ACTIVE tab's content: the inactive tabs' sections are unmounted rather
 *  than hidden, so a section's hooks (Data's import state, Layout's confirm
 *  dialog, …) don't run while it isn't on screen — the same "don't render
 *  what isn't shown" rule the rest of the app follows.
 *
 *  Keyboard: the APG tabs pattern with AUTOMATIC activation. The reflowed
 *  horizontal list uses Left/Right; the roomy vertical rail uses Up/Down;
 *  Home/End work in both. Roving tabindex means only the selected tab is a
 *  Tab stop. */
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
  const roomy = useRoomySettings()

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((t) => t.id === active)
    let nextIndex: number
    switch (e.key) {
      case 'ArrowRight':
        if (roomy) return
        nextIndex = (currentIndex + 1 + tabs.length) % tabs.length
        break
      case 'ArrowLeft':
        if (roomy) return
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break
      case 'ArrowDown':
        if (!roomy) return
        nextIndex = (currentIndex + 1 + tabs.length) % tabs.length
        break
      case 'ArrowUp':
        if (!roomy) return
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
    <div className="flex flex-col gap-6 min-[900px]:grid min-[900px]:grid-cols-[12rem_minmax(0,1fr)] min-[900px]:items-start">
      <div
        role="tablist"
        aria-label="Settings sections"
        aria-orientation={roomy ? 'vertical' : 'horizontal'}
        ref={listRef}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-panel-border max-[420px]:grid max-[420px]:grid-cols-2 min-[900px]:sticky min-[900px]:top-0 min-[900px]:flex-col min-[900px]:border-r min-[900px]:border-b-0 min-[900px]:pr-4"
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
              className={`-mb-px min-h-9 min-w-9 cursor-pointer border-b-2 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent max-[420px]:w-full min-[900px]:mb-0 min-[900px]:w-full min-[900px]:border-b-0 min-[900px]:border-l-2 min-[900px]:text-left ${
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

      {/* Hairline dividers between sections (the control kit's rhythm pass,
          Task 61): each Section owns its own py-6, and divide-y draws the
          fg-derived hairline in the seam between siblings — one consistent
          rhythm the sections can't individually break. */}
      <div
        role="tabpanel"
        id={`settings-tabpanel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
        className="min-w-0 flex flex-col divide-y divide-hairline"
      >
        {children}
      </div>
    </div>
  )
}
