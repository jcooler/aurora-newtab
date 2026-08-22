import { useState } from 'react'
import { ensureBookmarksPermission } from '../../services/bookmarks'
import { ensurePermission } from '../../services/permissions'
import type { AuroraStorage } from '../../lib/storage/index'
import type {
  Countdown,
  Habit,
  Settings,
  StoredLocation,
  WidgetToggles,
  WorldClock,
} from '../../lib/storage/schema'
import DisclosureSection from '../DisclosureSection'
import Section from '../Section'
import Switch from '../Switch'
import Countdowns from './Countdowns'
import Weather from './Weather'
import WorldClocks from './WorldClocks'
import { row, label, control, submitBtn } from './shared'

interface WidgetGroup {
  title: string
  widgets: readonly (readonly [keyof WidgetToggles, string])[]
}

const WIDGET_GROUPS: readonly WidgetGroup[] = [
  {
    title: 'Core',
    widgets: [
      ['search', 'Search'],
      ['bookmarks', 'Bookmarks'],
      ['links', 'Quick links'],
      ['timer', 'Focus timer'],
      ['todo', 'Tasks'],
      ['notes', 'Notes'],
    ],
  },
  {
    title: 'Personal',
    widgets: [
      ['weather', 'Weather'],
      ['quote', 'Daily quote'],
      ['habits', 'Habits'],
      ['monthCal', 'Month calendar'],
    ],
  },
  {
    title: 'Time & sky',
    widgets: [
      ['clocks', 'World clocks'],
      ['countdown', 'Countdown'],
      ['sun', 'Sun times'],
      ['moon', 'Moon phase'],
    ],
  },
  {
    title: 'Browser',
    widgets: [
      ['readingList', 'Reading List'],
      ['recentlyClosed', 'Recently Closed'],
      ['downloads', 'Downloads'],
      ['tabGroups', 'Tab Groups'],
    ],
  },
]

const BROWSER_WIDGET_PERMISSIONS = Object.freeze({
  readingList: 'readingList',
  recentlyClosed: 'sessions',
  downloads: 'downloads',
  tabGroups: 'tabGroups',
} satisfies Partial<Record<keyof WidgetToggles, chrome.runtime.ManifestPermission>>)

type BrowserWidgetKey = keyof typeof BROWSER_WIDGET_PERMISSIONS

const BROWSER_WIDGET_LABELS = Object.freeze({
  readingList: 'Reading List',
  recentlyClosed: 'Recently Closed',
  downloads: 'Downloads',
  tabGroups: 'Tab Groups',
} satisfies Record<BrowserWidgetKey, string>)

function isBrowserWidgetKey(key: keyof WidgetToggles): key is BrowserWidgetKey {
  return key in BROWSER_WIDGET_PERMISSIONS
}

export const WIDGET_CONTROL_KEYS: readonly (keyof WidgetToggles)[] = Object.freeze(
  WIDGET_GROUPS.flatMap((group) => group.widgets.map(([key]) => key)),
)

const SKY_LOCATION_HINT_ID = 'w-sky-location-hint'
const MAX_HABITS = 6

export default function Widgets({
  settings,
  patch,
  habits,
  worldClocks,
  countdowns,
  storage,
  location,
}: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
  habits: Habit[] | undefined
  worldClocks: WorldClock[] | undefined
  countdowns: Countdown[] | undefined
  storage: AuroraStorage
  location: StoredLocation | null | undefined
}) {
  const [bookmarksPermissionDenied, setBookmarksPermissionDenied] = useState(false)
  const [browserPermissionDenied, setBrowserPermissionDenied] = useState<BrowserWidgetKey | null>(null)

  const updateHabits = (fn: (list: Habit[]) => Habit[]) => void storage.update('habits', fn)

  function handleAddHabit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    if (!name) return
    updateHabits((list) =>
      list.length >= MAX_HABITS
        ? list
        : [...list, { id: crypto.randomUUID(), name, createdAt: Date.now(), log: [] }],
    )
    event.currentTarget.reset()
  }

  async function handleWidgetToggle(key: keyof WidgetToggles, checked: boolean) {
    if (key === 'bookmarks' && checked) {
      let granted: boolean
      try {
        granted = await ensureBookmarksPermission()
      } catch {
        granted = false
      }
      if (!granted) {
        setBookmarksPermissionDenied(true)
        return
      }
    }
    const browserWidgetKey = isBrowserWidgetKey(key) ? key : null
    const browserPermission = browserWidgetKey
      ? BROWSER_WIDGET_PERMISSIONS[browserWidgetKey]
      : undefined
    if (browserPermission && checked) {
      let granted: boolean
      try {
        // Keep this as the first await. Chrome requires request() to remain
        // inside the switch's direct user gesture.
        granted = await ensurePermission(browserPermission)
      } catch {
        granted = false
      }
      if (!granted) {
        setBrowserPermissionDenied(browserWidgetKey)
        return
      }
    }
    if (key === 'bookmarks') setBookmarksPermissionDenied(false)
    if (browserPermissionDenied === key) setBrowserPermissionDenied(null)
    patch({ widgets: { ...settings.widgets, [key]: checked } })
  }

  return (
    <Section title="Widgets">
      <div data-widget-toggle-groups="" data-settings-anchor="widgets" tabIndex={-1} className="space-y-4">
        {WIDGET_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h4 className="mb-1.5 text-xs font-medium text-fg">{group.title}</h4>
            <div
              data-widget-toggle-grid=""
              className="grid grid-cols-1 gap-x-4 min-[900px]:grid-cols-2"
            >
              {group.widgets.map(([key, widgetLabel]) => (
                <div
                  key={key}
                  data-settings-anchor={key}
                  tabIndex={-1}
                  className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-0.5 transition-colors hover:bg-control-bg/60"
                >
                  <label htmlFor={`w-${key}`} className={label}>
                    {widgetLabel}
                  </label>
                  <Switch
                    id={`w-${key}`}
                    checked={settings.widgets[key]}
                    onChange={(checked) => void handleWidgetToggle(key, checked)}
                    describedBy={
                      key === 'bookmarks' && bookmarksPermissionDenied
                        ? 'w-bookmarks-error'
                        : key === browserPermissionDenied
                          ? `w-${key}-permission-error`
                        : (key === 'sun' || key === 'moon') && !location
                          ? SKY_LOCATION_HINT_ID
                          : undefined
                    }
                  />
                </div>
              ))}
            </div>
            {group.title === 'Time & sky' && !location ? (
              <p
                id={SKY_LOCATION_HINT_ID}
                className="mt-1 px-2 text-xs leading-relaxed text-fg-muted"
              >
                Sun times and moon phase use the weather location. Turn on the
                weather widget and set a location first.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      {bookmarksPermissionDenied ? (
        <p id="w-bookmarks-error" role="alert" className="mt-2 text-xs text-fg-muted">
          Bookmarks permission was denied, so the widget stays off. Turn it on
          again to re-request it.
        </p>
      ) : null}

      {browserPermissionDenied ? (
        <p
          id={`w-${browserPermissionDenied}-permission-error`}
          role="alert"
          className="mt-2 text-xs text-fg-muted"
        >
          {BROWSER_WIDGET_LABELS[browserPermissionDenied]} access was denied, so the widget stays off. Turn it on again to re-request it.
        </p>
      ) : null}

      <div data-widget-editors="" className="mt-4 space-y-2 border-t border-hairline pt-4">
        {location ? (
          <DisclosureSection title="Weather location">
            <Weather location={location} storage={storage} />
          </DisclosureSection>
        ) : null}

        <DisclosureSection title="World clocks">
          <WorldClocks worldClocks={worldClocks} storage={storage} />
        </DisclosureSection>

        <DisclosureSection title="Countdowns">
          <Countdowns countdowns={countdowns} storage={storage} />
        </DisclosureSection>

        {settings.widgets.habits ? (
          <DisclosureSection title="Habits">
            {(habits ?? []).map((habit) => (
              <div key={habit.id} className={row}>
                <label htmlFor={`habit-name-${habit.id}`} className="sr-only">
                  Habit name
                </label>
                <input
                  id={`habit-name-${habit.id}`}
                  key={habit.name}
                  defaultValue={habit.name}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim()
                    if (!value || value === habit.name) return
                    updateHabits((list) =>
                      list.map((item) =>
                        item.id === habit.id ? { ...item, name: value } : item,
                      ),
                    )
                  }}
                  className={`${control} w-32`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${habit.name}`}
                  onClick={() =>
                    updateHabits((list) => list.filter((item) => item.id !== habit.id))
                  }
                  className="min-h-9 min-w-9 cursor-pointer rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </div>
            ))}
            {(habits?.length ?? 0) < MAX_HABITS ? (
              <form className={row} onSubmit={handleAddHabit}>
                <label htmlFor="habit-new-name" className="sr-only">
                  New habit name
                </label>
                <input
                  id="habit-new-name"
                  name="name"
                  placeholder="Habit name"
                  className={`${control} w-32`}
                />
                <button type="submit" className={submitBtn}>
                  Add
                </button>
              </form>
            ) : (
              <p className="text-xs text-fg-muted">Max 6 habits.</p>
            )}
          </DisclosureSection>
        ) : null}
      </div>
    </Section>
  )
}
