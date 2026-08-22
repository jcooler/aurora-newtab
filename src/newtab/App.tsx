import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { adaptStoredLayout } from '../lib/layout/canvasAdapter'
import type { CanvasSize, StoredLayout } from '../lib/layout/canvasTypes'
import { migrationSourceProfile, resolveLayoutsDocument } from '../lib/layout/myLayoutAdapter'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  dockSelected,
  dockSelectedLive,
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
  undockSelected,
  undockSelectedLive,
} from '../lib/layout/editSession'
import type { DockEdge } from '../lib/layout/namedLayouts'
import WidgetInspector from './edit/WidgetInspector'
import { useCanvasDrag } from './edit/useCanvasDrag'
import { useLongPress } from './arrange/useLongPress'
import { createLayout, saveLayoutsDocument, switchActiveLayout } from '../lib/layout/layoutOperations'
import LayoutBadge from './edit/LayoutBadge'
import { canvasKeyboardDelta } from './arrange/canvasSnap'
import { enforceDockEligibility, NARROW_FLOOR_WIDTH } from '../lib/layout/renderLayout'
import { restoreHiddenWidget } from '../lib/layout/editSession'
import { useDialogEscape } from '../lib/dialogStack'
import { isPremium } from '../lib/premium'
import { useStorage } from '../lib/storage/context'
import EditToolbar from './edit/EditToolbar'
import { useEditMode } from './edit/useEditMode'
import type { BlockId } from '../lib/layout/types'
import { applyInkColors, applyPanelColor } from '../theme/index'
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
import { TimerSessionProvider, useTimerFlowState } from './widgets/timer/TimerSessionProvider'
import FlowScreen from './flow/FlowScreen'

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

function AuroraApp() {
  const timerFlow = useTimerFlowState()
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
  const clickSuppressorCleanupsRef = useRef(new Set<() => void>())

  useEffect(() => () => {
    for (const cleanup of clickSuppressorCleanupsRef.current) cleanup()
    clickSuppressorCleanupsRef.current.clear()
  }, [])

  const storedLayout = useMemo(() => usableStoredLayout(layout), [layout])
  const viewport = useCanvasViewport()

  useEffect(() => {
    if (!settings) return
    // Order matters: the panel derivation first, then the ink overrides —
    // a custom widget ink beats the derived pair; clearing it re-derives.
    applyPanelColor(document.documentElement, settings.panelColor)
    applyInkColors(document.documentElement, {
      widgetText: settings.widgetTextColor,
      photoText: settings.photoTextColor,
      clock: settings.photoClockColor,
      greeting: settings.photoGreetingColor,
      quote: settings.photoQuoteColor,
    })
  }, [
    settings?.panelColor,
    settings?.widgetTextColor,
    settings?.photoTextColor,
    settings?.photoClockColor,
    settings?.photoGreetingColor,
    settings?.photoQuoteColor,
  ])

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
    // A connector card only exists on the premium Connectors tab; without it
    // the group anchor is the honest fallback (review fix M8).
    const target = availability?.kind === 'connector' && isPremium()
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
  const layoutsDocument = useMemo(() => {
    if (!inputsReady || !storedLayout || layouts === undefined) return null
    const resolved = resolveLayoutsDocument(layouts, storedLayout, migrationSourceProfile(viewport), enabledBlockIds)
    // Dock eligibility (spec 2.3, owner-reported 2026-08-18): an invalid
    // docked placement is corrected to the free default slot HERE, so
    // rendering, edit sessions, and the inspector all see one truthful
    // placement. Pure — persists only through the user's own explicit Save.
    return enforceDockEligibility(
      resolved,
      new Set(activeEntries.filter((entry) => entry.supportsDocked).map((entry) => entry.id)),
    )
  }, [activeEntries, enabledBlockIds, inputsReady, layouts, storedLayout, viewport.width, viewport.height])
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

  const [dragZone, setDragZone] = useState<DockEdge | null>(null)
  const draggingIdRef = useRef<BlockId | null>(null)
  // The pointer maps DIRECTLY to a strip position (spec 2.4, owner-refined
  // 2026-08-18: complete control, exactly like the canvas). Clamped so the
  // dragged member's own box stays inside the bar — measured live because
  // the strip may not exist yet on the first entry into an empty band.
  const dockXPercent = (zone: DockEdge, id: BlockId, pointerX: number): number => {
    const bar = document.querySelector(zone === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar')
    const rect = bar?.getBoundingClientRect()
    const left = rect ? rect.left : 72
    const width = rect && rect.width > 0 ? rect.width : Math.max(1, window.innerWidth - 144)
    const raw = ((pointerX - left) / width) * 100
    const memberWidth = itemRectsRef.current.get(id)?.width ?? 0
    const halfPct = Math.min(50, (memberWidth / 2 / width) * 100)
    return Math.min(100 - halfPct, Math.max(halfPct, raw))
  }
  const drag = useCanvasDrag({
    getSurface: () => document.querySelector<HTMLElement>('[data-canvas-surface]'),
    getItemRects: () => itemRectsRef.current,
    // Live dock mechanics (owner-reported 2026-08-18: a docked item popped
    // out of the strip on its first move, so in-strip reordering felt broken
    // and re-docking was a fight). The widget follows the gesture: pointer
    // in a dock band docks/reorders LIVE, leaving the band undocks, and the
    // whole gesture stays one undo entry (the first operation pushes it).
    onPreviewMove: (id, point, first, context) => {
      draggingIdRef.current = id
      editMode.dispatch((current) => {
        const selected = selectWidget(current, id)
        const layout = activeDraftLayout(selected)
        if (context.zone) {
          const xPct = dockXPercent(context.zone, id, context.pointerX)
          return first
            ? dockSelected(selected, context.zone, xPct)
            : dockSelectedLive(selected, context.zone, xPct)
        }
        if (layout.widgets[id]?.kind === 'docked') {
          return first ? undockSelected(selected, point) : undockSelectedLive(selected, point)
        }
        return first
          ? moveSelected(selected, point)
          : moveSelectedLive(selected, point)
      })
    },
    onZoneChange: setDragZone,
    // Dock eligibility (spec 2.3, owner-reported 2026-08-18): a widget with
    // no Docked tier is never offered a dock zone — its edge drop is an
    // ordinary free placement.
    canDock: (id) => activeEntries.some((entry) => entry.id === id && entry.supportsDocked),
    onDrop: ({ zone, pointerX }) => {
      const id = draggingIdRef.current
      draggingIdRef.current = null
      if (!zone || !id) return
      editMode.dispatch((current) => {
        const selected = selectWidget(current, id)
        // The moves already docked it live; this re-measures the final
        // position at the exact drop pointer, reusing the gesture's one
        // undo entry (review fix I2).
        return dockSelectedLive(selected, zone, dockXPercent(zone, id, pointerX))
      })
    },
  })

  // Long-press enters edit mode on TOUCH ONLY (spec 2.5, review fix I3) —
  // the retained document-level detector stays untouched; the filter lives
  // here. Below the narrow floor the stack renders no anchored geometry, so
  // a drag would mutate positions invisibly — suppressed (review fix M7).
  useLongPress((blockId, event) => {
    if (event.pointerType !== 'touch') return
    if (window.innerWidth < NARROW_FLOOR_WIDTH) return
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
      // A live session ignores the chord entirely — re-entry would discard
      // the draft (review fix C1; begin is also identity-guarded).
      if (sessionLiveRef.current) return
      // Flow is mutually exclusive with every Canvas editing surface. The
      // hidden dashboard never accepts edit commands while the timer owns
      // the viewport.
      if (timerFlow.flow) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      editMode.begin(document.activeElement instanceof HTMLElement ? document.activeElement : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, timerFlow.flow])

  // Arrow keys move the selection by 8px, Shift+Arrow by 1px (spec 2.5),
  // converted to percent against the live viewport span.
  useEffect(() => {
    if (!session) return
    function onKey(event: KeyboardEvent) {
      const delta = canvasKeyboardDelta(event.key, event.shiftKey)
      if (!delta) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select')) return
      event.preventDefault()
      editMode.dispatch((current) => nudgeSelected(current, {
        xPct: delta.x / window.innerWidth * 100,
        yPct: delta.y / window.innerHeight * 100,
      }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, session])

  if (!settings || !photoPrefs || !timerFlow.hydrated) return null

  if (timerFlow.flow) {
    return (
      <main data-aurora-flow="" className="aurora-canvas text-fg">
        <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} showControls={false} />
        <FlowScreen />
      </main>
    )
  }

  if (!inputsReady || !storedLayout || !connectors || !activeLayout) return null

  const homeAssistant = connectors.homeassistant as HomeAssistantConfig | undefined
  const utilityTools: { id: UtilityToolId; label: string }[] = [
    ...(homeAssistant?.enabled && typeof homeAssistant.instanceUrl === 'string' && homeAssistant.instanceUrl.length > 0
      && typeof homeAssistant.token === 'string' && homeAssistant.token.length > 0 && haActionsOf(homeAssistant).length > 0
      ? [{ id: 'homeassistant' as const, label: 'Home Assistant' }]
      : []),
    { id: 'refresh', label: 'Refresh' },
  ]
  // The tray trigger renders only when the tray offers something its
  // visible siblings do not: Home Assistant actions (Refresh duplicates
  // the corner photo button). The layout badge's position follows.
  const trayTriggerVisible = utilityTools.some(({ id }) => id !== 'refresh')
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
  const renderWidget = (entry: (typeof activeEntries)[number], size: CanvasSize, docked = false) => {
    const Renderer = resolveWidgetRenderer(entry.rendererKey)
    return <Renderer {...rendererProps} canvasSize={size} docked={docked} />
  }
  const textScale = projectTextScale(settings.layoutDensity, viewport)
  // The pre-existing narrow Settings/Tray modality boundary (unrelated to the
  // 600px narrow floor): below 900 CSS px the tray is modal.
  const narrowModality = viewport.width < 900

  const renderedLayout = session ? activeDraftLayout(session) : activeLayout
  // The fixed toolbar clears a rendered top dock so its members stay
  // reachable during the session (owner-reported 2026-08-18: the toolbar
  // sat over the top-docked Bookmarks). Any enabled widget docked top in
  // the rendered draft means the strip is painted at the page top.
  const hasTopDock = activeEntries.some((entry) => {
    const widgetPlacement = renderedLayout.widgets[entry.id]
    return widgetPlacement?.kind === 'docked' && widgetPlacement.dock === 'top'
  })
  const toolbarTopOffset = session && hasTopDock ? 64 : undefined

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
          // Guides are session chrome only: if the session cancels while a
          // drag is mid-flight (Escape), the hook's guide state survives
          // until the next pointerup — without this gate the accent
          // hairlines stayed painted on the normal page (owner-reported
          // 2026-08-18 "blue lines where borders are").
          guides={session ? drag.guides : []}
          onSelectItem={editMode.select}
          onItemGeometryChange={onItemGeometryChange}
          onGripPointerDown={(id, event) => {
            event.preventDefault()
            // The grip press begins the session, which unmounts the hover
            // chrome under the pointer — the released click would fall
            // through to whatever the grip overlaid (a docked BOOKMARK
            // navigated the page; witness stage 9 caught it). Swallow the
            // one click this press produces, and ONLY if it lands inside
            // the grabbed widget — clicks anywhere else (toolbar, another
            // widget) are unrelated and pass through.
            const grabbedId = id
            let timeoutId: number | undefined
            const cleanupSuppressor = () => {
              document.removeEventListener('click', swallowClick, { capture: true })
              if (timeoutId !== undefined) window.clearTimeout(timeoutId)
              clickSuppressorCleanupsRef.current.delete(cleanupSuppressor)
            }
            const swallowClick = (clickEvent: MouseEvent) => {
              cleanupSuppressor()
              if (clickEvent.target instanceof Element && clickEvent.target.closest(`[data-block-id="${grabbedId}"]`)) {
                clickEvent.preventDefault()
                clickEvent.stopPropagation()
              }
            }
            document.addEventListener('click', swallowClick, { capture: true })
            timeoutId = window.setTimeout(cleanupSuppressor, 500)
            clickSuppressorCleanupsRef.current.add(cleanupSuppressor)
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
            clearsTray={trayTriggerVisible}
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
        {session && dragZone ? <div className="dock-drop-zone" data-edge={dragZone} aria-hidden /> : null}
        {session && session.selectedId ? (() => {
          const selectedId = session.selectedId
          const entry = activeEntries.find((candidate) => candidate.id === selectedId)
          const placement = activeDraftLayout(session).widgets[selectedId]
          const anchorRect = itemRectsRef.current.get(selectedId)
          if (!entry || !placement || !anchorRect) return null
          // Overlap is a FREE-placement concept (spec 2.2): docked members
          // live in the strips and hidden widgets render nowhere, so neither
          // belongs in the warning (owner-reported 2026-08-18: the note
          // listed widgets nowhere near the selection).
          const draftWidgets = activeDraftLayout(session).widgets
          const overlapLabels = placement.kind !== 'free' ? [] : [...itemRectsRef.current]
            .filter(([id, rect]) => (
              id !== selectedId
              && draftWidgets[id]?.kind !== 'docked'
              && draftWidgets[id]?.kind !== 'hidden'
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
            topOffset={toolbarTopOffset}
            hiddenWidgets={activeEntries.flatMap((entry) => (
              activeDraftLayout(session).widgets[entry.id]?.kind === 'hidden'
                ? [{ id: entry.id, label: entry.label }]
                : []
            ))}
            onRestoreHidden={(id) => editMode.dispatch((current) => restoreHiddenWidget(current, id as BlockId))}
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

        {/* The tray trigger renders only when the tray offers something its
            visible siblings do not (owner-questioned twice, 2026-08-18/19):
            the Refresh tool duplicates the corner photo button, so with no
            Home Assistant actions the briefcase is pure noise. It reappears
            the moment HA actions exist. */}
        {trayTriggerVisible ? <button
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
        </button> : null}
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

export default function App() {
  return (
    <TimerSessionProvider>
      <AuroraApp />
    </TimerSessionProvider>
  )
}
