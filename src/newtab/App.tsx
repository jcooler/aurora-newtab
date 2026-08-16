import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { resolveStageDensity, type Density, type StageAllocation, type ViewportSize } from '../lib/layout/adaptiveStage'
import type { BlockId } from '../lib/layout/types'
import { applyPanelColor } from '../theme/index'
import Drawer from '../settings/Drawer'
import DrawerBoundary from '../settings/DrawerBoundary'
import SettingsPanel from '../settings/SettingsPanel'
import Background from './components/Background'
import BoardItem from './components/BoardItem'
import DayContext from './components/DayContext'
import SignalDockEntry from './components/SignalDockEntry'
import WidgetBoundary from './components/WidgetBoundary'
import PaletteHost from './widgets/palette/PaletteHost'
import ArrangeController from './arrange/ArrangeController'
import type { ArrangePreview } from './arrange/arrangePreview'
import { selectActiveWidgetRegistry, WIDGET_REGISTRY_BY_ID } from './widgetRegistry'
import { resolveWidgetRenderer, type WidgetRendererProps } from './widgetRenderers'
import { useAdaptiveStageViewport } from './useAdaptiveStageViewport'
import { DOCK_BLOCK_SIZES } from './dockBlockSizes'

const ZONES = ['day', 'now', 'pulse', 'dock'] as const
const DENSITY_PREFERENCES = new Set(['auto', 'compact', 'balanced', 'spacious'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [layout] = useStoredKey('layout')
  const [connectors] = useStoredKey('connectors')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [arrangePreview, setArrangePreview] = useState<ArrangePreview | null>(null)
  const [arranging, setArranging] = useState(false)
  const [arrangeSignal, setArrangeSignal] = useState(0)
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [bookmarksPopoverOpen, setBookmarksPopoverOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [openSignalDockId, setOpenSignalDockId] = useState<BlockId | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const wasArrangingRef = useRef(false)
  const dockPointerDownRef = useRef(false)
  const dockKeyboardScrollRef = useRef<number | null>(null)

  useEffect(() => {
    if (settings) applyPanelColor(document.documentElement, settings.panelColor)
  }, [settings?.panelColor])

  useEffect(() => {
    const wasArranging = wasArrangingRef.current
    wasArrangingRef.current = arranging
    if (wasArranging && !arranging && document.activeElement === document.body) settingsButtonRef.current?.focus()
  }, [arranging])

  const requestArrange = useCallback(() => {
    setSettingsOpen(false)
    setArrangeSignal((value) => value + 1)
  }, [])

  // Restore/migration fixtures can publish related keys in separate native
  // storage notifications. Treat those raw intermediate shapes as hydration,
  // not as planner input: the next complete notification replans this same
  // mounted App without ever indexing a missing widget map/profile envelope.
  const stageInputsReady = Boolean(
    settings && isRecord(settings.widgets) && DENSITY_PREFERENCES.has(settings.layoutDensity) &&
    layout && isRecord(layout.profiles) && connectors && isRecord(connectors),
  )

  const activeEntries = useMemo(
    () => stageInputsReady && settings && connectors ? selectActiveWidgetRegistry(settings, connectors) : [],
    [stageInputsReady, settings, connectors],
  )
  const viewport = useAdaptiveStageViewport(useCallback((size: ViewportSize): Density => {
    if (!stageInputsReady || !settings || !layout) return 'compact'
    const profile = size.width < 900 || size.height < 700
      ? 'compact'
      : size.width >= 1600 && size.width / size.height >= 2.1
        ? 'ultrawide'
        : size.width >= 2200 && size.height >= 1100 ? 'display' : 'standard'
    const overrides = arrangePreview?.profile === profile
      ? arrangePreview.overrides
      : layout.profiles[profile]
    return resolveStageDensity({
      preference: settings.layoutDensity,
      viewport: size,
      profile,
      entries: activeEntries,
      overrides,
      dockBlockSizes: DOCK_BLOCK_SIZES,
    }).density
  }, [activeEntries, arrangePreview, layout, settings, stageInputsReady]))

  const resolution = useMemo(() => {
    if (!stageInputsReady || !settings || !layout) return null
    const overrides = arrangePreview?.profile === viewport.profile
      ? arrangePreview.overrides
      : layout.profiles[viewport.profile]
    return resolveStageDensity({
      preference: settings.layoutDensity,
      viewport,
      profile: viewport.profile,
      entries: activeEntries,
      overrides,
      dockBlockSizes: DOCK_BLOCK_SIZES,
    })
  }, [activeEntries, arrangePreview, layout, settings, stageInputsReady, viewport.height, viewport.profile, viewport.width])

  useEffect(() => {
    if (!openSignalDockId || !resolution) return
    const allocation = resolution.plan.allocations.find(({ id }) => id === openSignalDockId)
    const entry = WIDGET_REGISTRY_BY_ID[openSignalDockId]
    if (allocation?.zone !== 'dock' || entry.availability.kind !== 'connector') setOpenSignalDockId(null)
  }, [openSignalDockId, resolution])

  if (!stageInputsReady || !settings || !photoPrefs || !layout || !connectors || !resolution) return null

  const rendererProps: WidgetRendererProps = {
    onWeatherExpandedChange: setWeatherExpanded,
    onBookmarksPopoverOpenChange: setBookmarksPopoverOpen,
    onNotesOpenChange: setNotesOpen,
    onTasksOpenChange: setTasksOpen,
    onTimerOpenChange: setTimerOpen,
  }
  const openById: Partial<Record<BlockId, boolean>> = {
    weather: weatherExpanded,
    bookmarks: bookmarksPopoverOpen,
    notes: notesOpen,
    tasks: tasksOpen,
    timer: timerOpen,
  }
  if (openSignalDockId) openById[openSignalDockId] = true
  const pinnedOverflow = (['day', 'now', 'pulse'] as const).some((zone) =>
    resolution.plan.implicitRows[zone] > resolution.geometry.capacities[zone][1])
  const viewportOverflow = resolution.diagnostics.some((diagnostic) => diagnostic.kind === 'density-viewport-overflow')
  const renderAllocation = (allocation: StageAllocation) => {
    const entry = WIDGET_REGISTRY_BY_ID[allocation.id]
    const Renderer = resolveWidgetRenderer(entry.rendererKey)
    const renderer = <Renderer {...rendererProps} />
    const child = allocation.zone === 'dock' && entry.availability.kind === 'connector' ? (
      <SignalDockEntry
        entry={entry}
        open={openSignalDockId === entry.id}
        onOpenChange={(open) => setOpenSignalDockId(open ? entry.id : null)}
      >
        {renderer}
      </SignalDockEntry>
    ) : renderer
    return (
      <BoardItem
        key={entry.id}
        entry={entry}
        allocation={allocation}
        profile={viewport.profile}
        className={openById[entry.id] ? (entry.id === 'bookmarks' ? 'z-50' : 'z-30') : ''}
      >
        {child}
      </BoardItem>
    )
  }

  return (
    <main
      data-adaptive-stage=""
      data-stage-sublayout={resolution.geometry.sublayout}
      data-stage-pinned-overflow={pinnedOverflow ? 'true' : undefined}
      data-stage-viewport-overflow={viewportOverflow ? 'true' : undefined}
      data-stage-geometry-fits={resolution.geometry.fits ? 'true' : 'false'}
      data-stage-density-attempts={resolution.attempts.map((attempt) => (
        `${attempt.density}:${attempt.geometryFits ? 'fits' : 'overflow'}:${attempt.automaticDockCount}`
      )).join(',')}
      className="adaptive-stage text-fg"
    >
      <div className="contents" inert={arranging}>
          <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />
          <div className="adaptive-stage__grid">
            {ZONES.map((zone) => {
              const allocations = resolution.plan.allocations.filter((allocation) => allocation.zone === zone)
              const dockTrackCount = allocations.reduce((total, allocation) => total + allocation.colSpan, 0)
              return (
                <section
                  key={zone}
                  data-stage-zone={zone}
                  data-stage-zone-container={zone}
                  aria-label={zone === 'day' ? 'Day' : zone === 'now' ? 'Now' : zone === 'pulse' ? 'Work Pulse' : 'Signal Dock'}
                  className={`stage-zone stage-zone--${zone}${allocations.some((allocation) => openById[allocation.id]) ? ' stage-zone--elevated' : ''}${bookmarksPopoverOpen && allocations.some((allocation) => allocation.id === 'bookmarks') ? ' stage-zone--elevated-high' : ''}`}
                  style={zone === 'dock' ? {
                    '--stage-dock-track-count': dockTrackCount,
                    '--stage-dock-block-size': `${resolution.geometry.dockBlockSize}px`,
                  } as CSSProperties : undefined}
                  onKeyDownCapture={zone === 'dock' ? (event) => {
                    if (event.key === 'Tab') dockKeyboardScrollRef.current = event.currentTarget.scrollLeft
                  } : undefined}
                  onPointerDownCapture={zone === 'dock' ? () => {
                    dockKeyboardScrollRef.current = null
                    dockPointerDownRef.current = true
                  } : undefined}
                  onPointerUpCapture={zone === 'dock' ? () => { dockPointerDownRef.current = false } : undefined}
                  onPointerCancelCapture={zone === 'dock' ? () => { dockPointerDownRef.current = false } : undefined}
                  onFocus={zone === 'dock' ? (event) => {
                    // Pointer activation must keep the target stationary
                    // between down and up or the browser cancels the click.
                    // Keyboard focus has no pointer coordinate to preserve,
                    // so it can safely reveal an offscreen Dock control.
                    if (dockPointerDownRef.current) {
                      dockPointerDownRef.current = false
                      return
                    }
                    if (event.target instanceof HTMLElement && typeof event.target.scrollIntoView === 'function') {
                      // Native Tab focus may scroll before React receives the
                      // focus event. Replay nearest from the offset where the
                      // keyboard move began, so a far target is not centered.
                      if (dockKeyboardScrollRef.current !== null) {
                        event.currentTarget.scrollLeft = dockKeyboardScrollRef.current
                        dockKeyboardScrollRef.current = null
                      }
                      // Move only when an edge is outside the scrollport. This
                      // preserves the frozen minimum-scroll keyboard contract
                      // and avoids panning on every Tab through visible items.
                      event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    }
                  } : undefined}
                >
                  {zone === 'day' && allocations.length === 0 ? <DayContext /> : null}
                  {allocations.map(renderAllocation)}
                </section>
              )
            })}
          </div>

          <button
            ref={settingsButtonRef}
            type="button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
            className="settings-gear fixed bottom-4 right-4 rounded-full bg-panel-solid p-2 text-fg-muted shadow-lg shadow-black/25 backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82-.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
            <DrawerBoundary open={settingsOpen}>
              <SettingsPanel onArrangeLayout={requestArrange} open={settingsOpen} />
            </DrawerBoundary>
          </Drawer>
          <WidgetBoundary name="palette">
            <PaletteHost onOpenSettings={() => setSettingsOpen(true)} arranging={arranging} />
          </WidgetBoundary>
      </div>
      <ArrangeController
        profile={viewport.profile}
        layout={layout}
        entries={activeEntries}
        onPreviewChange={setArrangePreview}
        onModeChange={setArranging}
        openSignal={arrangeSignal}
      />
    </main>
  )
}
