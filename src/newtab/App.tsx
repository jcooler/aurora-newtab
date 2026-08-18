import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { adaptStoredLayout } from '../lib/layout/canvasAdapter'
import type { CanvasSize, StoredLayout } from '../lib/layout/canvasTypes'
import { migrationSourceProfile, resolveLayoutsDocument } from '../lib/layout/myLayoutAdapter'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  hideSelected,
  moveSelected,
  moveSelectedLive,
  nudgeSelected,
  resetSession,
  restoreSelectedDefaults,
  selectWidget,
  setSelectedTier,
  stepSelectedLayer,
  undo,
} from '../lib/layout/editSession'
import WidgetInspector from './edit/WidgetInspector'
import { useCanvasDrag } from './edit/useCanvasDrag'
import { useLongPress } from './arrange/useLongPress'
import { createLayout, saveLayoutsDocument, switchActiveLayout } from '../lib/layout/layoutOperations'
import LayoutBadge from './edit/LayoutBadge'
import { canvasKeyboardDelta } from './arrange/canvasSnap'
import { useDialogEscape } from '../lib/dialogStack'
import { isPremium } from '../lib/premium'
import { useStorage } from '../lib/storage/context'
import EditToolbar from './edit/EditToolbar'
import { useEditMode } from './edit/useEditMode'
import type { BlockId } from '../lib/layout/types'
import { applyPanelColor } from '../theme/index'
import Drawer from '../settings/Drawer'
import DrawerBoundary from '../settings/DrawerBoundary'
import SettingsPanel from '../settings/SettingsPanel'
import { haActionsOf, type HomeAssistantConfig } from '../services/connectors/homeassistant'
import Background from './components/Background'
import UtilityTray from './components/UtilityTray'
import type { UtilityCloseGuard, UtilityToolId, UtilityTrayBridge } from './components/utilityTrayBridge'
import WidgetBoundary from './components/WidgetBoundary'
import CanvasSurface from './canvas/CanvasSurface'
import PaletteHost from './widgets/palette/PaletteHost'
import { selectActiveWidgetRegistry } from './widgetRegistry'
import { resolveWidgetRenderer, type WidgetRendererProps } from './widgetRenderers'
import { useCanvasViewport } from './useCanvasViewport'
import { projectTextScale } from './canvas/canvasTextScale'

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

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [layout] = useStoredKey('layout')
  const [layouts] = useStoredKey('layouts')
  const [connectors] = useStoredKey('connectors')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFocusAnchor, setSettingsFocusAnchor] = useState<
    { tab: 'widgets' | 'connectors'; anchor: string; nonce: number } | null
  >(null)
  const [utilityTrayOpen, setUtilityTrayOpen] = useState(false)
  const [activeUtilityTool, setActiveUtilityTool] = useState<UtilityToolId | null>(null)
  const [utilityTrayHost, setUtilityTrayHost] = useState<HTMLDivElement | null>(null)
  const [bookmarksPopoverOpen, setBookmarksPopoverOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const utilityTrayInvokerRef = useRef<HTMLButtonElement>(null)
  const utilityCloseGuardRef = useRef<{ tool: UtilityToolId; guard: UtilityCloseGuard } | null>(null)
  const effectiveUtilityToolRef = useRef<UtilityToolId | null>(null)

  const storedLayout = useMemo(() => usableStoredLayout(layout), [layout])
  const viewport = useCanvasViewport()

  useEffect(() => {
    if (settings) applyPanelColor(document.documentElement, settings.panelColor)
  }, [settings?.panelColor])

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

  const inputsReady = Boolean(
    settings && isRecord(settings.widgets) && DENSITY_PREFERENCES.has(settings.layoutDensity)
      && storedLayout && connectors && isRecord(connectors),
  )
  const activeEntries = useMemo(
    () => inputsReady && settings && connectors ? selectActiveWidgetRegistry(settings, connectors) : [],
    [connectors, inputsReady, settings],
  )
  const enabledBlockIds = useMemo(() => activeEntries.map((entry) => entry.id), [activeEntries])

  // The gear on a widget's hover chrome (named-layouts spec 2.5): Settings
  // opens focused on that widget's own section. Connector-backed widgets
  // land on their Connectors card; toggle-backed widgets on their Widgets
  // row; always-on widgets on the Widgets group.
  const openSettingsForWidget = useCallback((id: BlockId) => {
    const entry = activeEntries.find((candidate) => candidate.id === id)
    const availability = entry?.availability
    const target = availability?.kind === 'connector'
      ? { tab: 'connectors' as const, anchor: availability.id }
      : availability?.kind === 'widget'
        ? { tab: 'widgets' as const, anchor: availability.key }
        : { tab: 'widgets' as const, anchor: 'widgets' }
    setSettingsFocusAnchor((previous) => ({ ...target, nonce: (previous?.nonce ?? 0) + 1 }))
    requestSettingsOpen()
  }, [activeEntries, requestSettingsOpen])

  const storage = useStorage()
  // The resolved named-layouts document: a valid stored document wins; until
  // the first explicit save (NL-P3 switcher) the in-memory "My layout" is
  // derived from the legacy stored layout through the frozen migration
  // profile rule. Nothing here ever writes storage.
  const layoutsDocument = useMemo(() => (
    inputsReady && storedLayout && layouts !== undefined
      ? resolveLayoutsDocument(layouts, storedLayout, migrationSourceProfile(viewport), enabledBlockIds)
      : null
  ), [enabledBlockIds, inputsReady, layouts, storedLayout, viewport.width, viewport.height])
  const activeLayout = layoutsDocument
    ? layoutsDocument.layouts.find((candidate) => candidate.id === layoutsDocument.activeLayoutId) ?? null
    : null

  const editMode = useEditMode({ document: layoutsDocument, enabledIds: enabledBlockIds, storage })
  const session = editMode.session
  const sessionLiveRef = useRef(false)
  sessionLiveRef.current = session !== null

  const itemRectsRef = useRef(new Map<BlockId, DOMRectReadOnly>())
  const onItemGeometryChange = useCallback((id: BlockId, rect: DOMRectReadOnly | null) => {
    if (rect) itemRectsRef.current.set(id, rect)
    else itemRectsRef.current.delete(id)
  }, [])

  const drag = useCanvasDrag({
    getSurface: () => document.querySelector<HTMLElement>('[data-canvas-surface]'),
    getItemRects: () => itemRectsRef.current,
    onPreviewMove: (id, point, first) => {
      editMode.dispatch((current) => (
        first
          ? moveSelected(selectWidget(current, id), point)
          : moveSelectedLive(selectWidget(current, id), point)
      ))
    },
    onDrop: () => {},
  })

  // Touch long-press enters the edit session and takes over the drag
  // (spec 2.5) — the retained document-level detector, premium-gated.
  useLongPress((blockId, event) => {
    if (!sessionLiveRef.current) editMode.begin(null)
    editMode.select(blockId)
    drag.startDrag(blockId, event)
  })

  // Escape cancels the edit session exactly (spec 2.5), through the shared
  // dialog stack so it composes with every other Escape consumer.
  useDialogEscape(() => { editMode.cancel() }, session !== null)

  // The keyboard command entry (scope decision 4): Ctrl/Cmd+Shift+E.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'e') return
      if (!isPremium()) return
      const target = event.target as HTMLElement | null
      if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      editMode.begin(document.activeElement instanceof HTMLElement ? document.activeElement : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode])

  // Arrow keys move the selection by 8px, Shift+Arrow by 1px (spec 2.5),
  // converted to percent against the live viewport span.
  useEffect(() => {
    if (!session) return
    function onKey(event: KeyboardEvent) {
      const delta = canvasKeyboardDelta(event.key, event.shiftKey)
      if (!delta) return
      const target = event.target as HTMLElement | null
      if (target && target.closest('input, textarea, select')) return
      event.preventDefault()
      editMode.dispatch((current) => nudgeSelected(current, {
        xPct: delta.x / window.innerWidth * 100,
        yPct: delta.y / window.innerHeight * 100,
      }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, session])

  if (!inputsReady || !settings || !photoPrefs || !storedLayout || !connectors || !activeLayout) return null

  const homeAssistant = connectors.homeassistant as HomeAssistantConfig | undefined
  const utilityTools: { id: UtilityToolId; label: string }[] = [
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
    onBookmarksPopoverOpenChange: setBookmarksPopoverOpen,
    utilityTray,
  }
  const elevatedIds = new Set<BlockId>([
    ...(bookmarksPopoverOpen ? ['bookmarks' as const] : []),
  ])
  const renderWidget = (entry: (typeof activeEntries)[number], size: CanvasSize) => {
    const Renderer = resolveWidgetRenderer(entry.rendererKey)
    return <Renderer {...rendererProps} canvasSize={size} />
  }
  const textScale = projectTextScale(settings.layoutDensity, viewport)
  // The pre-existing narrow Settings/Tray modality boundary (unrelated to the
  // 600px narrow floor): below 900 CSS px the tray is modal.
  const narrowModality = viewport.width < 900

  const renderedLayout = session ? activeDraftLayout(session) : activeLayout

  return (
    <main
      data-aurora-canvas=""
      data-canvas-text-scale={textScale}
      data-editing={session ? 'true' : undefined}
      className="aurora-canvas text-fg"
    >
      <div className="contents" inert={utilityTrayOpen && narrowModality}>
        <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} utilityTray={utilityTray} />
        <CanvasSurface
          activeLayout={renderedLayout}
          entries={activeEntries}
          viewport={viewport}
          elevatedIds={elevatedIds}
          chrome={session ? 'editing' : 'normal'}
          selectedId={session?.selectedId ?? null}
          guides={drag.guides}
          onSelectItem={editMode.select}
          onItemGeometryChange={onItemGeometryChange}
          onGripPointerDown={(id, event) => {
            event.preventDefault()
            if (!session) editMode.begin(event.currentTarget as HTMLElement)
            editMode.select(id)
            drag.startDrag(id, {
              clientX: event.clientX,
              clientY: event.clientY,
              pointerId: event.pointerId,
            })
          }}
          onGearClick={openSettingsForWidget}
          renderWidget={renderWidget}
        />
        {!session && layoutsDocument && isPremium() ? (
          <LayoutBadge
            document={layoutsDocument}
            onSwitch={(layoutId) => {
              // Explicit user switching (spec 2.1): instant, cannot lose or
              // alter data — one validated write of the layouts key.
              void saveLayoutsDocument(storage, switchActiveLayout(layoutsDocument, layoutId))
            }}
            onEdit={(invoker) => editMode.begin(invoker)}
            onNew={() => {
              const name = `Layout ${layoutsDocument.layouts.length + 1}`
              const id = crypto.randomUUID()
              void saveLayoutsDocument(
                storage,
                switchActiveLayout(createLayout(layoutsDocument, { id, name }), id),
              )
            }}
          />
        ) : null}
        {session ? <div className="edit-scrim" aria-hidden /> : null}
        {session && session.selectedId ? (() => {
          const selectedId = session.selectedId
          const entry = activeEntries.find((candidate) => candidate.id === selectedId)
          const placement = activeDraftLayout(session).widgets[selectedId]
          const anchorRect = itemRectsRef.current.get(selectedId)
          if (!entry || !placement || !anchorRect) return null
          const overlapLabels = [...itemRectsRef.current]
            .filter(([id, rect]) => (
              id !== selectedId
              && rect.left < anchorRect.right && rect.right > anchorRect.left
              && rect.top < anchorRect.bottom && rect.bottom > anchorRect.top
            ))
            .map(([id]) => activeEntries.find((candidate) => candidate.id === id)?.label ?? id)
          return (
            <WidgetInspector
              entry={entry}
              placement={placement}
              anchorRect={anchorRect}
              overlapLabels={overlapLabels}
              onTier={(tier) => editMode.dispatch((current) => setSelectedTier(current, tier))}
              onLayer={(direction) => editMode.dispatch((current) => stepSelectedLayer(current, direction))}
              onHide={() => editMode.dispatch(hideSelected)}
              onRestore={() => editMode.dispatch(restoreSelectedDefaults)}
            />
          )
        })() : null}
        {session ? (
          <EditToolbar
            session={session}
            onSwitchLayout={(layoutId) => {
              editMode.dispatch((current) => beginEditSession(
                switchActiveLayout(current.draft, layoutId),
                enabledBlockIds,
              ))
            }}
            onBulkTier={(tier) => editMode.dispatch((current) => applyBulkTier(current, tier))}
            onUndo={() => editMode.dispatch(undo)}
            onReset={() => editMode.dispatch(resetSession)}
            onCancel={editMode.cancel}
            onSave={() => void editMode.save()}
          />
        ) : null}

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
            <SettingsPanel open={settingsOpen} focusAnchor={settingsFocusAnchor} layoutsDocument={layoutsDocument} />
          </DrawerBoundary>
        </Drawer>
        <WidgetBoundary name="palette">
          <PaletteHost onOpenSettings={requestSettingsOpen} />
        </WidgetBoundary>
      </div>

      <UtilityTray
        open={utilityTrayOpen}
        modal={narrowModality}
        onClose={requestUtilityTrayClose}
        invokerRef={utilityTrayInvokerRef}
        tools={utilityTools}
        activeTool={selectedUtilityTool}
        onToolChange={(tool) => requestUtilityToolChange(tool as UtilityToolId)}
        contentRef={setUtilityTrayHost}
      ><></></UtilityTray>
    </main>
  )
}
