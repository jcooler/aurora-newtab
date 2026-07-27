import { useEffect, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import Background from './components/Background'
import Clock from './components/Clock'
import Greeting from './components/Greeting'
import FocusLine from './components/FocusLine'
import SearchBar from './components/SearchBar'
import WidgetBoundary from './components/WidgetBoundary'
import Drawer from '../settings/Drawer'
import SettingsPanel from '../settings/SettingsPanel'
import WeatherWidget from './widgets/weather/WeatherWidget'
import LinksWidget from './widgets/links/LinksWidget'
import TodoWidget from './widgets/todo/TodoWidget'
import TimerWidget from './widgets/timer/TimerWidget'
import NotesWidget from './widgets/notes/NotesWidget'
import QuoteWidget from './widgets/quote/QuoteWidget'
import PaletteHost from './widgets/palette/PaletteHost'
import BookmarksBar from './widgets/bookmarks/BookmarksBar'

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings || !photoPrefs) return null

  return (
    <main className="relative h-screen overflow-hidden text-fg">
      <div className="flex h-full flex-col items-center justify-center">
        <WidgetBoundary name="clock">
          <Clock />
          <Greeting />
        </WidgetBoundary>
        <WidgetBoundary name="search">
          <SearchBar />
        </WidgetBoundary>
        <WidgetBoundary name="focus">
          <FocusLine />
        </WidgetBoundary>
        <WidgetBoundary name="links">
          <LinksWidget />
        </WidgetBoundary>
      </div>

      {/*
        Background mounts here — after the centered column — purely for tab
        order: its refresh button (the only focusable thing it renders) must
        come after search/focus-line/links but before Tasks/gear. The
        aria-hidden photo layer's `-z-10` pins it behind everything in the
        paint order regardless of where it sits in the DOM, so moving it here
        doesn't change what's visible or what's hit-testable on top of it.
      */}
      <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />

      {/*
        Weather, the bookmarks bar, timer, and notes mount here — after
        Background's refresh button but before Tasks/gear — purely for tab
        order (all four are `fixed`-positioned, so this has no effect on
        layout): search -> focus -> links -> photo refresh -> weather
        controls -> bookmarks chips -> timer pill -> notes pill -> Tasks ->
        gear.
      */}
      <WidgetBoundary name="weather">
        <WeatherWidget />
      </WidgetBoundary>

      <WidgetBoundary name="bookmarks">
        <BookmarksBar />
      </WidgetBoundary>

      <WidgetBoundary name="timer">
        <TimerWidget />
      </WidgetBoundary>

      <WidgetBoundary name="notes">
        <NotesWidget />
      </WidgetBoundary>

      <WidgetBoundary name="todo">
        <TodoWidget />
      </WidgetBoundary>

      <button
        type="button"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-4 right-4 rounded-full bg-panel p-2 text-fg-muted backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <WidgetBoundary name="quote">
        <QuoteWidget />
      </WidgetBoundary>

      <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsPanel />
      </Drawer>

      <WidgetBoundary name="palette">
        <PaletteHost onOpenSettings={() => setSettingsOpen(true)} />
      </WidgetBoundary>
    </main>
  )
}
