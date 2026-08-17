import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { adaptStoredLayout, semanticLayoutV2 } from '../lib/layout/canvasAdapter'
import type { CanvasSize, StoredLayout } from '../lib/layout/canvasTypes'
import type { BlockId, LayoutV2 } from '../lib/layout/types'
import { applyPanelColor } from '../theme/index'
import Drawer from '../settings/Drawer'
import DrawerBoundary from '../settings/DrawerBoundary'
import SettingsPanel from '../settings/SettingsPanel'
import { haActionsOf, type HomeAssistantConfig } from '../services/connectors/homeassistant'
import ArrangeController from './arrange/ArrangeController'
import type { ArrangePreview } from './arrange/arrangePreview'
import Background from './components/Background'
import UtilityTray from './components/UtilityTray'
import type { UtilityCloseGuard, UtilityToolId, UtilityTrayBridge } from './components/utilityTrayBridge'
import WidgetBoundary from './components/WidgetBoundary'
import CanvasSurface from './canvas/CanvasSurface'
import PaletteHost from './widgets/palette/PaletteHost'
import { selectActiveWidgetRegistry } from './widgetRegistry'
import { resolveWidgetRenderer, type WidgetRendererProps } from './widgetRenderers'
import { useAdaptiveStageViewport } from './useAdaptiveStageViewport'

const DENSITY_PREFERENCES = new Set(['auto', 'compact', 'balanced', 'spacious'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function usableStoredLayout(value: StoredLayout | null | undefined): StoredLayout | null {
  if (!value) return null
  try {
    adaptStoredLayout(value)
    return value
  } catch {
    return null
  }
}

function semanticLayoutOrNull(value: StoredLayout | null | undefined): LayoutV2 | null {
  if (!value) return null
  try {
    return semanticLayoutV2(value)
  } catch {
    return null
  }
}

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [layout] = useStoredKey('layout')
  const [connectors] = useStoredKey('connectors')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [utilityTrayOpen, setUtilityTrayOpen] = useState(false)
  const [activeUtilityTool, setActiveUtilityTool] = useState<UtilityToolId | null>(null)
  const [utilityTrayHost, setUtilityTrayHost] = useState<HTMLDivElement | null>(null)
  const [, setArrangePreview] = useState<ArrangePreview | null>(null)
  const [arranging, setArranging] = useState(false)
  const [arrangeSignal, setArrangeSignal] = useState(0)
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [bookmarksPopoverOpen, setBookmarksPopoverOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const utilityTrayInvokerRef = useRef<HTMLButtonElement>(null)
  const utilityCloseGuardRef = useRef<{ tool: UtilityToolId; guard: UtilityCloseGuard } | null>(null)
  const effectiveUtilityToolRef = useRef<UtilityToolId | null>(null)
  const wasArrangingRef = useRef(false)

  const storedLayout = useMemo(() => usableStoredLayout(layout), [layout])
  const semanticLayout = useMemo(() => semanticLayoutOrNull(storedLayout), [storedLayout])
  const density = settings?.layoutDensity === 'compact'
    || settings?.layoutDensity === 'balanced'
    || settings?.layoutDensity === 'spacious'
    ? settings.layoutDensity
    : 'balanced'
  const viewport = useAdaptiveStageViewport(density)

  useEffect(() => {
    if (settings) applyPanelColor(document.documentElement, settings.panelColor)
  }, [settings?.panelColor])

  useEffect(() => {
    const wasArranging = wasArrangingRef.current
    wasArrangingRef.current = arranging
    if (wasArranging && !arranging && document.activeElement === document.body) settingsButtonRef.current?.focus()
  }, [arranging])

  const registerUtilityCloseGuard = useCallback((tool: UtilityToolId, guard: UtilityCloseGuard | null) => {
    if (guard) utilityCloseGuardRef.current = { tool, guard }
    else if (utilityCloseGuardRef.current?.tool === tool) utilityCloseGuardRef.current = null
  }, [])

  const passUtilityGuard = useCallback(async () => {
    const registered = utilityCloseGuardRef.current
    if (!registered || registered.tool !== effectiveUtilityToolRef.current) return true
    return registered.guard()
  }, [])

  const requestUtilityTrayClose = useCallback(() => {
    const registered = utilityCloseGuardRef.current
    if (!registered || registered.tool !== effectiveUtilityToolRef.current) {
      setUtilityTrayOpen(false)
      return
    }
    void (async () => {
      if (await passUtilityGuard()) setUtilityTrayOpen(false)
    })()
  }, [passUtilityGuard])

  const requestUtilityTool = useCallback((tool: UtilityToolId, invoker: HTMLButtonElement) => {
    const openTool = () => {
      utilityTrayInvokerRef.current = invoker
      setActiveUtilityTool(tool)
      setUtilityTrayOpen(true)
    }
    const registered = utilityCloseGuardRef.current
    if (!utilityTrayOpen || tool === effectiveUtilityToolRef.current || !registered || registered.tool !== effectiveUtilityToolRef.current) {
      openTool()
      return
    }
    void (async () => {
      if (await passUtilityGuard()) openTool()
    })()
  }, [passUtilityGuard, utilityTrayOpen])

  const requestUtilityToolChange = useCallback((tool: UtilityToolId) => {
    void (async () => {
      if (tool === effectiveUtilityToolRef.current || await passUtilityGuard()) setActiveUtilityTool(tool)
    })()
  }, [passUtilityGuard])

  const requestSettingsOpen = useCallback(() => {
    const open = () => {
      setUtilityTrayOpen(false)
      setSettingsOpen(true)
    }
    const registered = utilityCloseGuardRef.current
    if (!registered || registered.tool !== effectiveUtilityToolRef.current) {
      open()
      return
    }
    void (async () => {
      if (await passUtilityGuard()) open()
    })()
  }, [passUtilityGuard])

  const requestArrange = useCallback(() => {
    const begin = () => {
      setUtilityTrayOpen(false)
      setSettingsOpen(false)
      setArrangeSignal((value) => value + 1)
    }
    const registered = utilityCloseGuardRef.current
    if (!registered || registered.tool !== effectiveUtilityToolRef.current) {
      begin()
      return
    }
    void (async () => {
      if (await passUtilityGuard()) begin()
    })()
  }, [passUtilityGuard])

  const inputsReady = Boolean(
    settings && isRecord(settings.widgets) && DENSITY_PREFERENCES.has(settings.layoutDensity)
      && storedLayout && semanticLayout && connectors && isRecord(connectors),
  )
  const activeEntries = useMemo(
    () => inputsReady && settings && connectors ? selectActiveWidgetRegistry(settings, connectors) : [],
    [connectors, inputsReady, settings],
  )

  if (!inputsReady || !settings || !photoPrefs || !storedLayout || !semanticLayout || !connectors) return null

  const homeAssistant = connectors.homeassistant as HomeAssistantConfig | undefined
  const utilityTools: { id: UtilityToolId; label: string }[] = [
    ...(settings.widgets.todo ? [{ id: 'tasks' as const, label: 'Tasks' }] : []),
    ...(settings.widgets.notes ? [{ id: 'notes' as const, label: 'Notes' }] : []),
    ...(settings.widgets.timer ? [{ id: 'timer' as const, label: 'Timer' }] : []),
    ...(homeAssistant?.enabled && typeof homeAssistant.instanceUrl === 'string' && homeAssistant.instanceUrl.length > 0
      && typeof homeAssistant.token === 'string' && homeAssistant.token.length > 0 && haActionsOf(homeAssistant).length > 0
      ? [{ id: 'homeassistant' as const, label: 'Home Assistant' }]
      : []),
    { id: 'refresh', label: 'Refresh' },
  ]
  const selectedUtilityTool = utilityTrayOpen && activeUtilityTool
    ? activeUtilityTool
    : utilityTools.some(({ id }) => id === activeUtilityTool)
      ? activeUtilityTool
      : utilityTools[0]!.id
  effectiveUtilityToolRef.current = selectedUtilityTool
  const utilityTray: UtilityTrayBridge = {
    activeTool: utilityTrayOpen ? selectedUtilityTool : null,
    host: utilityTrayHost,
    requestTool: requestUtilityTool,
    close: requestUtilityTrayClose,
    registerCloseGuard: registerUtilityCloseGuard,
  }
  const rendererProps: WidgetRendererProps = {
    onWeatherExpandedChange: setWeatherExpanded,
    onBookmarksPopoverOpenChange: setBookmarksPopoverOpen,
    utilityTray,
  }
  const elevatedIds = new Set<BlockId>([
    ...(weatherExpanded ? ['weather' as const] : []),
    ...(bookmarksPopoverOpen ? ['bookmarks' as const] : []),
  ])
  const renderWidget = (entry: (typeof activeEntries)[number], size: CanvasSize) => {
    const Renderer = resolveWidgetRenderer(entry.rendererKey)
    return <Renderer {...rendererProps} canvasSize={size} />
  }

  return (
    <main
      data-aurora-canvas=""
      data-canvas-profile={viewport.profile}
      className="aurora-canvas text-fg"
    >
      <div className="contents" inert={arranging || (utilityTrayOpen && viewport.profile === 'compact')}>
        <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} utilityTray={utilityTray} />
        <CanvasSurface
          layout={storedLayout}
          profileKey={viewport.profile}
          entries={activeEntries}
          viewport={viewport}
          elevatedIds={elevatedIds}
          renderWidget={renderWidget}
        />

        <button
          type="button"
          aria-label="Open utility tray"
          aria-haspopup="dialog"
          aria-expanded={utilityTrayOpen}
          onClick={(event) => {
            utilityTrayInvokerRef.current = event.currentTarget
            setActiveUtilityTool(selectedUtilityTool)
            setUtilityTrayOpen(true)
          }}
          className="utility-tray-trigger fixed bottom-4 right-16 flex min-h-9 min-w-9 items-center justify-center rounded-full bg-panel-solid text-fg-muted shadow-lg shadow-black/25 backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 7h16v12H4z" />
            <path d="M9 7V5h6v2M4 11h16M10 11v2h4v-2" />
          </svg>
        </button>
        <button
          ref={settingsButtonRef}
          type="button"
          aria-label="Open settings"
          onClick={requestSettingsOpen}
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
          <PaletteHost onOpenSettings={requestSettingsOpen} arranging={arranging} />
        </WidgetBoundary>
      </div>

      <UtilityTray
        open={utilityTrayOpen}
        modal={viewport.profile === 'compact'}
        onClose={requestUtilityTrayClose}
        invokerRef={utilityTrayInvokerRef}
        tools={utilityTools}
        activeTool={selectedUtilityTool}
        onToolChange={(tool) => requestUtilityToolChange(tool as UtilityToolId)}
        contentRef={setUtilityTrayHost}
      ><></></UtilityTray>
      <ArrangeController
        profile={viewport.profile}
        layout={semanticLayout}
        entries={activeEntries}
        onPreviewChange={setArrangePreview}
        onModeChange={setArranging}
        openSignal={arrangeSignal}
      />
    </main>
  )
}
