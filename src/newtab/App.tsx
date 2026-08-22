import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { adaptStoredLayout } from '../lib/layout/canvasAdapter'
import type { CanvasSize, StoredLayout } from '../lib/layout/canvasTypes'
import { migrationSourceProfile, resolveLayoutsDocument } from '../lib/layout/myLayoutAdapter'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  createStackFromDrop,
  detachSelectedStackMember,
  dockSelected,
  dockSelectedLive,
  hideSelected,
  moveSelected,
  moveSelectedLive,
  nudgeSelected,
  resetSession,
  removeSelectedStackMember,
  reorderSelectedStackMember,
  restoreSelectedDefaults,
  selectStack,
  selectWidget,
  setSelectedStackFacing,
  setSelectedTier,
  stepSelectedLayer,
  type DockGestureMemory,
  type EditSession,
  undo,
  undockSelected,
  undockSelectedLive,
} from '../lib/layout/editSession'
import type { DockEdge } from '../lib/layout/namedLayouts'
import WidgetInspector from './edit/WidgetInspector'
import StackInspector from './edit/StackInspector'
import { useCanvasDrag, type CanvasDragSubject } from './edit/useCanvasDrag'
import { useLongPress } from './arrange/useLongPress'
import {
  createLayout,
  saveLayoutsDocument,
  switchActiveLayout,
  updateStoredStackFacing,
} from '../lib/layout/layoutOperations'
import LayoutBadge from './edit/LayoutBadge'
import { canvasKeyboardDelta } from './arrange/canvasSnap'
import { fallbackDockBandRect, nudgeDockPoint } from './edit/dockGeometry'
import { enforceDockEligibility, NARROW_FLOOR_WIDTH } from '../lib/layout/renderLayout'
import { restoreHiddenWidget } from '../lib/layout/editSession'
import { useDialogEscape } from '../lib/dialogStack'
import { isPremium } from '../lib/premium'
import { useStorage } from '../lib/storage/context'
import EditToolbar from './edit/EditToolbar'
import { useEditMode } from './edit/useEditMode'
import { BLOCK_IDS, type BlockId } from '../lib/layout/types'
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

  const itemRectsRef = useRef(new Map<string, DOMRectReadOnly>())
  const [, setGeometryRevision] = useState(0)
  const onItemGeometryChange = useCallback((id: BlockId, rect: DOMRectReadOnly | null) => {
    if (rect) itemRectsRef.current.set(id, rect)
    else itemRectsRef.current.delete(id)
    setGeometryRevision((current) => current + 1)
  }, [])
  const onStackGeometryChange = useCallback((id: string, rect: DOMRectReadOnly | null) => {
    if (rect) itemRectsRef.current.set(id, rect)
    else itemRectsRef.current.delete(id)
    setGeometryRevision((current) => current + 1)
  }, [])

  const [dragZone, setDragZone] = useState<DockEdge | null>(null)
  const draggingSubjectRef = useRef<CanvasDragSubject | null>(null)
  const dragOriginSessionRef = useRef<EditSession | null>(null)
  const dragTierMemoryRef = useRef<DockGestureMemory | null>(null)
  const rememberDragTier = (subject: CanvasDragSubject) => {
    if (subject.kind !== 'widget') {
      dragTierMemoryRef.current = null
      return
    }
    const layout = session ? activeDraftLayout(session) : activeLayout
    const placement = layout?.widgets[subject.id]
    dragTierMemoryRef.current = placement?.kind === 'free'
      ? { returnTier: placement.tier }
      : placement?.kind === 'docked'
        ? { dockTier: placement.tier, returnTier: placement.returnTier }
        : null
  }
  const drag = useCanvasDrag({
    getSurface: () => document.querySelector<HTMLElement>('[data-canvas-surface]'),
    getItemRects: () => itemRectsRef.current,
    // Live dock mechanics (owner-reported 2026-08-18: a docked item popped
    // out of the strip on its first move, so in-strip reordering felt broken
    // and re-docking was a fight). The widget follows the gesture: pointer
    // in a dock band docks/reorders LIVE, leaving the band undocks, and the
    // whole gesture stays one undo entry (the first operation pushes it).
    onPreviewMove: (subject, placement, first) => {
      draggingSubjectRef.current = subject
      if (subject.kind === 'stack-member') return
      editMode.dispatch((current) => {
        if (dragOriginSessionRef.current === null) dragOriginSessionRef.current = current
        const selected = subject.kind === 'widget'
          ? selectWidget(current, subject.id)
          : selectStack(current, subject.id)
        const layout = activeDraftLayout(selected)
        if (subject.kind === 'widget' && placement.kind === 'dock') {
          return first
            ? dockSelected(selected, placement.dock, placement.point, dragTierMemoryRef.current ?? undefined)
            : dockSelectedLive(selected, placement.dock, placement.point, dragTierMemoryRef.current ?? undefined)
        }
        if (placement.kind !== 'canvas') return selected
        if (subject.kind === 'widget' && layout.widgets[subject.id]?.kind === 'docked') {
          return first
            ? undockSelected(selected, placement.point)
            : undockSelectedLive(selected, placement.point)
        }
        return first
          ? moveSelected(selected, placement.point)
          : moveSelectedLive(selected, placement.point)
      })
    },
    onZoneChange: setDragZone,
    onCancel: () => {
      draggingSubjectRef.current = null
      const origin = dragOriginSessionRef.current
      dragOriginSessionRef.current = null
      dragTierMemoryRef.current = null
      if (origin) editMode.dispatch(() => origin)
    },
    // Dock eligibility (spec 2.3, owner-reported 2026-08-18): a widget with
    // no Docked tier is never offered a dock zone — its edge drop is an
    // ordinary free placement.
    canDock: (id) => activeEntries.some((entry) => entry.id === id && entry.supportsDocked),
    isDockPeer: (id, dock) => {
      if (!BLOCK_IDS.includes(id as BlockId)) return false
      const layout = session ? activeDraftLayout(session) : activeLayout
      const placement = layout?.widgets[id as BlockId]
      return placement?.kind === 'docked' && placement.dock === dock
    },
    canStackTarget: (sourceId, target) => {
      const layout = session ? activeDraftLayout(session) : activeLayout
      if (!layout) return false
      if (layout.widgets[sourceId]?.kind !== 'free') return false
      if (target.kind === 'widget') return target.id !== sourceId && layout.widgets[target.id]?.kind === 'free'
      return layout.stacks?.some((stack) => stack.id === target.id && !stack.members.includes(sourceId)) ?? false
    },
    onDrop: ({ placement, stackTarget }) => {
      const subject = draggingSubjectRef.current
      const memory = dragTierMemoryRef.current ?? undefined
      draggingSubjectRef.current = null
      dragOriginSessionRef.current = null
      dragTierMemoryRef.current = null
      if (!subject) return
      editMode.dispatch((current) => {
        if (subject.kind === 'stack-member') {
          return placement.kind === 'canvas'
            ? detachSelectedStackMember(selectStack(current, subject.stackId), subject.id, placement.point)
            : current
        }
        if (subject.kind === 'stack') {
          return placement.kind === 'canvas'
            ? moveSelectedLive(selectStack(current, subject.id), placement.point)
            : current
        }
        const selected = selectWidget(current, subject.id)
        if (stackTarget) {
          // The first live move already owns this gesture's undo snapshot.
          return createStackFromDrop(selected, subject.id, stackTarget, crypto.randomUUID(), false)
        }
        if (placement.kind === 'dock') {
          return dockSelectedLive(selected, placement.dock, placement.point, memory)
        }
        return activeDraftLayout(selected).widgets[subject.id]?.kind === 'docked'
          ? undockSelectedLive(selected, placement.point)
          : moveSelectedLive(selected, placement.point)
      })
    },
  })

  const startCanvasObjectDrag = (
    subject: CanvasDragSubject,
    objectId: string,
    event: ReactPointerEvent,
  ) => {
    event.preventDefault()
    dragOriginSessionRef.current = null
    draggingSubjectRef.current = subject
    rememberDragTier(subject)
    // Starting edit mode unmounts the normal hover grip under the pointer.
    // Swallow only the release click that lands back on the grabbed object.
    let timeoutId: number | undefined
    const cleanupSuppressor = () => {
      document.removeEventListener('click', swallowClick, { capture: true })
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      clickSuppressorCleanupsRef.current.delete(cleanupSuppressor)
    }
    const swallowClick = (clickEvent: MouseEvent) => {
      cleanupSuppressor()
      const object = clickEvent.target instanceof Element
        ? clickEvent.target.closest('[data-canvas-object-id]')
        : null
      if (object?.getAttribute('data-canvas-object-id') === objectId) {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
    }
    document.addEventListener('click', swallowClick, { capture: true })
    timeoutId = window.setTimeout(cleanupSuppressor, 500)
    clickSuppressorCleanupsRef.current.add(cleanupSuppressor)
    if (!session) editMode.begin(event.currentTarget as HTMLElement)
    editMode.select(subject.kind === 'stack-member'
      ? { kind: 'stack', id: subject.stackId }
      : subject)
    drag.startDrag(subject, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    })
  }

  // Long-press enters edit mode on TOUCH ONLY (spec 2.5, review fix I3) —
  // the retained document-level detector stays untouched; the filter lives
  // here. Below the narrow floor the stack renders no anchored geometry, so
  // a drag would mutate positions invisibly — suppressed (review fix M7).
  useLongPress((blockId, event) => {
    if (event.pointerType !== 'touch') return
    if (window.innerWidth < NARROW_FLOOR_WIDTH) return
    if (!sessionLiveRef.current) editMode.begin(null)
    editMode.select({ kind: 'widget', id: blockId })
    const subject = { kind: 'widget' as const, id: blockId }
    draggingSubjectRef.current = subject
    rememberDragTier(subject)
    drag.startDrag(subject, event)
  })

  // Escape cancels the edit session exactly (spec 2.5), through the shared
  // dialog stack so it composes with every other Escape consumer.
  useDialogEscape(() => {
    drag.cancelDrag()
    editMode.cancel()
  }, session !== null)

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
      editMode.dispatch((current) => {
        const selection = current.selection
        const placement = selection?.kind === 'widget'
          ? activeDraftLayout(current).widgets[selection.id]
          : undefined
        if (selection?.kind === 'widget' && placement?.kind === 'docked') {
          const memberRect = itemRectsRef.current.get(selection.id)
          if (!memberRect) return current
          const bar = document.querySelector<HTMLElement>(
            placement.dock === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar',
          )
          const measured = bar?.getBoundingClientRect()
          const fallback = fallbackDockBandRect(placement.dock, {
            width: window.innerWidth,
            height: window.innerHeight,
          })
          const band = measured && measured.width > 0 && measured.height > 0
            ? measured
            : fallback
          return dockSelected(current, placement.dock, nudgeDockPoint({
            memberRect,
            band,
            delta,
          }), {
            dockTier: placement.tier,
            returnTier: placement.returnTier,
          })
        }
        return nudgeSelected(current, {
          xPct: delta.x / window.innerWidth * 100,
          yPct: delta.y / window.innerHeight * 100,
        })
      })
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
  const toolbarTopOffset = session && hasTopDock
    ? (() => {
        const band = fallbackDockBandRect('top', viewport)
        return band.top + band.height + 8
      })()
    : undefined

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
          selectedId={session?.selection?.kind === 'widget' ? session.selection.id : null}
          selectedStackId={session?.selection?.kind === 'stack' ? session.selection.id : null}
          stackTarget={session ? drag.stackTarget : null}
          // Guides are session chrome only. The hook also clears them on
          // every finish/cancel path, while this gate makes edit-session
          // ownership explicit (owner-reported 2026-08-18 "blue lines where
          // borders are").
          guideSet={session ? drag.guideSet : null}
          onSelectItem={(id) => editMode.select({ kind: 'widget', id })}
          onSelectStack={(id) => editMode.select({ kind: 'stack', id })}
          onItemGeometryChange={onItemGeometryChange}
          onStackGeometryChange={onStackGeometryChange}
          onGripPointerDown={(id, event) => {
            startCanvasObjectDrag({ kind: 'widget', id }, id, event)
          }}
          onStackGripPointerDown={(id, event) => {
            startCanvasObjectDrag({ kind: 'stack', id }, `stack:${id}`, event)
          }}
          onStepStack={(id, direction) => {
            if (session) {
              const stack = activeDraftLayout(session).stacks?.find((candidate) => candidate.id === id)
              if (!stack) return
              const index = stack.members.indexOf(stack.facing)
              const next = stack.members[(index + direction + stack.members.length) % stack.members.length]
              editMode.dispatch((current) => setSelectedStackFacing(selectStack(current, id), next))
              return
            }
            void updateStoredStackFacing(storage, renderedLayout.id, id, direction === 1 ? 'next' : 'previous')
          }}
          onFaceStack={(id, face) => {
            if (session) {
              editMode.dispatch((current) => setSelectedStackFacing(selectStack(current, id), face))
              return
            }
            void updateStoredStackFacing(storage, renderedLayout.id, id, face)
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
        {session && session.selection ? (() => {
          const draftLayout = activeDraftLayout(session)
          const selection = session.selection
          const objectId = selection.kind === 'stack' ? `stack:${selection.id}` : selection.id
          const anchorRect = itemRectsRef.current.get(objectId)
          if (!anchorRect) return null
          const selectedPlacement = selection.kind === 'widget'
            ? draftLayout.widgets[selection.id]
            : undefined

          const overlapLabels = [...itemRectsRef.current]
            .filter(([candidateId, rect]) => {
              if (candidateId === objectId) return false
              if (selectedPlacement?.kind === 'docked') {
                if (candidateId.startsWith('stack:')) return false
                const candidate = draftLayout.widgets[candidateId as BlockId]
                if (candidate?.kind !== 'docked' || candidate.dock !== selectedPlacement.dock) return false
              } else if (!candidateId.startsWith('stack:')) {
                const candidate = draftLayout.widgets[candidateId as BlockId]
                if (candidate?.kind !== 'free') return false
              }
              return rect.left < anchorRect.right && rect.right > anchorRect.left
                && rect.top < anchorRect.bottom && rect.bottom > anchorRect.top
            })
            .map(([candidateId]) => {
              if (candidateId.startsWith('stack:')) {
                const stack = draftLayout.stacks?.find((candidate) => `stack:${candidate.id}` === candidateId)
                const facing = activeEntries.find((entry) => entry.id === stack?.facing)
                return stack ? `${facing?.label ?? 'Widget'} +${stack.members.length - 1}` : candidateId
              }
              return activeEntries.find((entry) => entry.id === candidateId)?.label ?? candidateId
            })

          if (selection.kind === 'stack') {
            const stack = draftLayout.stacks?.find((candidate) => candidate.id === selection.id)
            if (!stack) return null
            const entries = stack.members.flatMap((id) => {
              const entry = activeEntries.find((candidate) => candidate.id === id)
              return entry ? [entry] : []
            })
            return (
              <StackInspector
                stack={stack}
                entries={entries}
                anchorRect={anchorRect}
                overlapLabels={overlapLabels}
                onTier={(tier) => editMode.dispatch((current) => setSelectedTier(current, tier))}
                onLayer={(direction) => editMode.dispatch((current) => stepSelectedLayer(current, direction))}
                onReorder={(id, direction) => editMode.dispatch((current) => (
                  reorderSelectedStackMember(selectStack(current, stack.id), id, direction)
                ))}
                onRemove={(id) => editMode.dispatch((current) => (
                  removeSelectedStackMember(selectStack(current, stack.id), id)
                ))}
                onMemberPointerDown={(id, event) => {
                  startCanvasObjectDrag(
                    { kind: 'stack-member', stackId: stack.id, id },
                    `stack:${stack.id}`,
                    event,
                  )
                }}
                onHide={() => editMode.dispatch((current) => hideSelected(selectStack(current, stack.id)))}
              />
            )
          }

          const entry = activeEntries.find((candidate) => candidate.id === selection.id)
          const placement = draftLayout.widgets[selection.id]
          if (!entry || !placement) return null
          return (
            <WidgetInspector
              entry={entry}
              placement={placement}
              anchorRect={anchorRect}
              toolbarRect={document.querySelector<HTMLElement>('.edit-toolbar')?.getBoundingClientRect()}
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
            onCancel={() => {
              drag.cancelDrag()
              editMode.cancel()
            }}
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
