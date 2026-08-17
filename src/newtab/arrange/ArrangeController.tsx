import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { adaptStoredLayout, saveCanvasProfile } from '../../lib/layout/canvasAdapter'
import { CANVAS_PROFILE_LABELS, canvasDefaults, resolveCanvasProfile } from '../../lib/layout/canvasDefaults'
import type { CanvasProfile, CanvasProfileKey, StoredLayout } from '../../lib/layout/canvasTypes'
import type { BlockId } from '../../lib/layout/types'
import { closeAllDialogs, hasOpenDialogs } from '../../lib/dialogStack'
import { isPremium } from '../../lib/premium'
import { useStorage } from '../../lib/storage/context'
import type { ArrangePreview } from './arrangePreview'
import {
  bringCanvasItemForward,
  copyCanvasProfileIntoDraft,
  createCanvasDraft,
  moveCanvasItem,
  moveCanvasItemToBottomBar,
  moveCanvasItemToCanvas,
  normalizeCanvasDraft,
  overlappingCanvasIds,
  resetCanvasDraft,
  resizeCanvasItem,
  restoreCanvasItemDefault,
  selectCanvasItem,
  sendCanvasItemBackward,
  setCanvasItemVisibility,
  setDesktopEverywhere,
  undoCanvasDraft,
  type CanvasDraft,
} from './canvasDraft'
import { canvasKeyboardDelta, snapCanvasPosition, type CanvasGuide, type SnapNeighbor } from './canvasSnap'
import { useLongPress } from './useLongPress'
import type { WidgetRegistryEntry } from '../widgetRegistry'

const PROFILE_KEYS: readonly CanvasProfileKey[] = ['compact', 'standard', 'display', 'ultrawide']
const BOTTOM_BAR_IDS: ReadonlySet<BlockId> = new Set(['bookmarks', 'links', 'timer', 'tasks', 'notes'])

interface ArrangeControllerProps {
  profile: CanvasProfileKey
  layout: StoredLayout
  entries: readonly WidgetRegistryEntry[]
  viewport: { width: number; height: number }
  onPreviewChange: (preview: ArrangePreview | null) => void
  onModeChange?: (arranging: boolean) => void
  returnFocusRef?: RefObject<HTMLElement | null>
  openSignal?: number
}

interface DragState {
  id: BlockId
  pointerId: number
  startDraft: CanvasDraft
  pointerOffset: { x: number; y: number }
}

function buttonClass(active = false): string {
  return `arrange-button${active ? ' arrange-button--active' : ''}`
}

function profileFromDraft(draft: CanvasDraft): CanvasProfile {
  return normalizeCanvasDraft(draft)
}

export default function ArrangeController({
  profile,
  layout,
  entries,
  viewport,
  onPreviewChange,
  onModeChange,
  returnFocusRef,
  openSignal,
}: ArrangeControllerProps) {
  const storage = useStorage()
  const [mode, setMode] = useState<'off' | 'on'>('off')
  const [draft, setDraft] = useState<CanvasDraft | null>(null)
  const [rects, setRects] = useState<Partial<Record<BlockId, DOMRect>>>({})
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [guides, setGuides] = useState<readonly CanvasGuide[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [announcement, setAnnouncement] = useState('')
  const modeRef = useRef(mode)
  const draftRef = useRef<CanvasDraft | null>(draft)
  const draftsRef = useRef<Partial<Record<CanvasProfileKey, CanvasDraft>>>({})
  const layoutRef = useRef(layout)
  const entriesRef = useRef(entries)
  const profileRef = useRef(profile)
  const sessionLayoutRef = useRef<StoredLayout | null>(null)
  const sessionEntriesRef = useRef<readonly WidgetRegistryEntry[]>([])
  const pendingFocusRef = useRef<BlockId | null>(null)
  const entryPromiseRef = useRef<Promise<void> | null>(null)
  const mountedRef = useRef(true)
  const dragRef = useRef<DragState | null>(null)

  modeRef.current = mode
  draftRef.current = draft
  layoutRef.current = layout
  entriesRef.current = entries
  profileRef.current = profile

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    onModeChange?.(mode === 'on')
  }, [mode, onModeChange])

  const buildDraft = useCallback((target: CanvasProfileKey, preferredId?: BlockId): CanvasDraft => {
    const sourceLayout = sessionLayoutRef.current ?? layoutRef.current
    const activeEntries = sessionEntriesRef.current.length > 0 ? sessionEntriesRef.current : entriesRef.current
    const normalized = adaptStoredLayout(sourceLayout)
    const saved = normalized.profiles[target]
    const resolved = resolveCanvasProfile(target, activeEntries, saved)
    const effective: CanvasProfile = {
      mode: saved?.mode ?? resolved.mode,
      placements: { ...saved?.placements, ...resolved.placements },
    }
    const defaults = canvasDefaults(target, activeEntries)
    const selected = preferredId && activeEntries.some((entry) => entry.id === preferredId)
      ? preferredId
      : activeEntries[0]?.id ?? null
    return createCanvasDraft(target, effective, defaults, selected)
  }, [])

  const previewFor = useCallback((current: CanvasDraft): ArrangePreview => {
    let source = current
    if (current.useDesktopLayoutEverywhere && current.profile !== 'standard') {
      source = draftsRef.current.standard ?? buildDraft('standard', current.selectedId ?? undefined)
      draftsRef.current.standard = source
    }
    return {
      profile: current.profile,
      canvas: profileFromDraft(source),
      inspectorOpen,
      guides,
      hiddenIds: [...current.hiddenIds],
      ...(current.useDesktopLayoutEverywhere ? { useDesktopLayoutEverywhere: true as const } : {}),
    }
  }, [buildDraft, guides, inspectorOpen])

  useEffect(() => {
    if (mode !== 'on' || !draft) return
    onPreviewChange(previewFor(draft))
  }, [draft, mode, onPreviewChange, previewFor])

  const replaceDraft = useCallback((next: CanvasDraft) => {
    draftRef.current = next
    draftsRef.current[next.profile] = next
    setDraft(next)
    setSaveState('idle')
  }, [])

  const measureAll = useCallback(() => {
    const next: Partial<Record<BlockId, DOMRect>> = {}
    for (const entry of sessionEntriesRef.current) {
      const element = document.querySelector<HTMLElement>(`[data-block-id="${entry.id}"]`)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 || rect.height > 0) next[entry.id] = rect
    }
    setRects(next)
  }, [])

  useLayoutEffect(() => {
    if (mode !== 'on') return
    measureAll()
    const frame = requestAnimationFrame(measureAll)
    window.addEventListener('resize', measureAll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measureAll)
    }
  }, [draft?.hiddenIds, draft?.profile, draft?.placements, measureAll, mode])

  useEffect(() => {
    if (mode !== 'on' || !pendingFocusRef.current) return
    const entry = sessionEntriesRef.current.find((candidate) => candidate.id === pendingFocusRef.current)
    const target = entry
      ? document.querySelector<HTMLButtonElement>(`[aria-label="Edit ${entry.label}"]`)
      : null
    if (!target) return
    target.focus()
    pendingFocusRef.current = null
  }, [mode, rects])

  const exit = useCallback(() => {
    modeRef.current = 'off'
    draftRef.current = null
    draftsRef.current = {}
    sessionLayoutRef.current = null
    sessionEntriesRef.current = []
    dragRef.current = null
    setMode('off')
    setDraft(null)
    setRects({})
    setInspectorOpen(true)
    setGuides([])
    setSaveState('idle')
    setAnnouncement('')
    onPreviewChange(null)
    returnFocusRef?.current?.focus()
  }, [onPreviewChange, returnFocusRef])

  const cancel = useCallback(() => {
    if (saveState !== 'pending') exit()
  }, [exit, saveState])

  const begin = useCallback((preferredId?: BlockId) => {
    if (!isPremium() || modeRef.current === 'on') return
    const start = () => {
      const nextProfile = profileRef.current
      sessionLayoutRef.current = layoutRef.current
      sessionEntriesRef.current = [...entriesRef.current]
      const next = buildDraft(nextProfile, preferredId)
      draftsRef.current = { [nextProfile]: next }
      draftRef.current = next
      pendingFocusRef.current = next.selectedId
      setDraft(next)
      setInspectorOpen(true)
      setGuides([])
      setSaveState('idle')
      setAnnouncement(next.selectedId ? `${sessionEntriesRef.current.find((entry) => entry.id === next.selectedId)?.label ?? 'Widget'} selected.` : '')
      modeRef.current = 'on'
      setMode('on')
    }
    if (!hasOpenDialogs()) {
      start()
      return
    }
    if (entryPromiseRef.current) return
    entryPromiseRef.current = closeAllDialogs().then((closed) => {
      if (closed && mountedRef.current && modeRef.current === 'off') start()
    }).finally(() => { entryPromiseRef.current = null })
  }, [buildDraft])

  useLongPress(useCallback((blockId: BlockId) => begin(blockId), [begin]))

  const previousOpenSignalRef = useRef(openSignal)
  useEffect(() => {
    if (openSignal === undefined || previousOpenSignalRef.current === openSignal) return
    previousOpenSignalRef.current = openSignal
    begin()
  }, [begin, openSignal])

  useEffect(() => {
    if (mode !== 'on') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      const drag = dragRef.current
      if (drag) {
        dragRef.current = null
        replaceDraft(drag.startDraft)
        setGuides([])
        setAnnouncement('Move cancelled.')
        return
      }
      cancel()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [cancel, mode, replaceDraft])

  const select = useCallback((id: BlockId) => {
    const current = draftRef.current
    if (!current) return
    const next = selectCanvasItem(current, id)
    if (next !== current) {
      replaceDraft(next)
      const label = sessionEntriesRef.current.find((entry) => entry.id === id)?.label ?? 'Widget'
      setAnnouncement(`${label} selected.`)
    }
    setInspectorOpen(true)
  }, [replaceDraft])

  const announceMove = useCallback((next: CanvasDraft, id: BlockId) => {
    const label = sessionEntriesRef.current.find((entry) => entry.id === id)?.label ?? 'Widget'
    const overlaps = overlappingCanvasIds(next, viewport, id)
      .map((candidate) => sessionEntriesRef.current.find((entry) => entry.id === candidate)?.label ?? candidate)
    setAnnouncement(`${label} moved.${overlaps.length > 0 ? ` Overlaps ${overlaps.join(', ')}.` : ''}`)
  }, [viewport])

  const keyboardMove = useCallback((id: BlockId, key: string, fine: boolean) => {
    const delta = canvasKeyboardDelta(key, fine)
    const current = draftRef.current
    const placement = current?.placements[id]
    if (!delta || !current || placement?.kind !== 'canvas') return false
    const next = moveCanvasItem(current, id, {
      x: placement.x + delta.x / viewport.width * 100,
      y: placement.y + delta.y / viewport.height * 100,
    })
    replaceDraft(next)
    announceMove(next, id)
    return true
  }, [announceMove, replaceDraft, viewport.height, viewport.width])

  const switchProfile = useCallback((target: CanvasProfileKey) => {
    const current = draftRef.current
    if (!current || current.profile === target) return
    draftsRef.current[current.profile] = current
    const stored = draftsRef.current[target] ?? buildDraft(target, current.selectedId ?? undefined)
    const next = { ...stored, hiddenIds: [...current.hiddenIds] }
    draftsRef.current[target] = next
    replaceDraft(next)
    pendingFocusRef.current = next.selectedId
    setInspectorOpen(true)
    setAnnouncement(`${CANVAS_PROFILE_LABELS[target]} preview selected.`)
  }, [buildDraft, replaceDraft])

  const save = useCallback(async () => {
    const current = draftRef.current
    if (!current || saveState === 'pending') return
    setSaveState('pending')
    try {
      const saveLayout = (stored: StoredLayout) => {
        let next: StoredLayout = stored
        if (current.useDesktopLayoutEverywhere) {
          const desktop = draftsRef.current.standard ?? buildDraft('standard')
          const profileValue = profileFromDraft(desktop)
          for (const key of PROFILE_KEYS) next = saveCanvasProfile(next, key, profileValue)
          return next
        }
        const candidates = Object.values(draftsRef.current)
          .filter((candidate): candidate is CanvasDraft => Boolean(candidate))
          .filter((candidate) => candidate.profile === current.profile || candidate.history.length > 0)
        for (const candidate of candidates) {
          next = saveCanvasProfile(next, candidate.profile, profileFromDraft(candidate))
        }
        return next
      }
      if (current.hiddenIds.length > 0) {
        await storage.updateMany(['layout', 'settings', 'connectors'], ({ layout: stored, settings, connectors }) => {
          let nextSettings = settings
          let nextConnectors = connectors
          for (const id of current.hiddenIds) {
            const availability = sessionEntriesRef.current.find((entry) => entry.id === id)?.availability
            if (availability?.kind === 'widget' && nextSettings.widgets[availability.key]) {
              nextSettings = {
                ...nextSettings,
                widgets: { ...nextSettings.widgets, [availability.key]: false },
              }
            } else if (availability?.kind === 'connector') {
              const config = nextConnectors[availability.id]
              if (config?.enabled === true) {
                nextConnectors = {
                  ...nextConnectors,
                  [availability.id]: { ...config, enabled: false },
                }
              }
            }
          }
          return {
            layout: saveLayout(stored),
            ...(nextSettings === settings ? {} : { settings: nextSettings }),
            ...(nextConnectors === connectors ? {} : { connectors: nextConnectors }),
          }
        })
      } else {
        await storage.update('layout', saveLayout)
      }
      if (mountedRef.current) exit()
    } catch {
      if (mountedRef.current) setSaveState('error')
    }
  }, [buildDraft, exit, saveState, storage])

  if (mode !== 'on' || !draft) return null

  const selectedEntry = sessionEntriesRef.current.find((entry) => entry.id === draft.selectedId) ?? null
  const selectedPlacement = selectedEntry ? draft.placements[selectedEntry.id] : null
  const defaults = canvasDefaults(draft.profile, sessionEntriesRef.current)
  const overlapIds = selectedEntry ? overlappingCanvasIds(draft, viewport, selectedEntry.id) : []
  const small = draft.profile === 'compact'

  return (
    <div
      data-arrange-overlay=""
      data-arrange-profile={draft.profile}
      data-arrange-small-sheet={small && inspectorOpen ? 'true' : undefined}
      className="arrange-overlay"
    >
      <div role="toolbar" aria-label="Arrange layout" className="arrange-toolbar">
        <div role="tablist" aria-label="Canvas previews" className="arrange-profile-tabs">
          {PROFILE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={draft.profile === key}
              className={buttonClass(draft.profile === key)}
              onClick={() => switchProfile(key)}
            >{CANVAS_PROFILE_LABELS[key]}</button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={draft.useDesktopLayoutEverywhere}
          className={buttonClass(draft.useDesktopLayoutEverywhere)}
          disabled={saveState === 'pending'}
          onClick={() => replaceDraft(setDesktopEverywhere(draft, !draft.useDesktopLayoutEverywhere))}
        >Use Desktop layout everywhere</button>
        {draft.profile !== 'standard' ? (
          <button
            type="button"
            className={buttonClass()}
            disabled={saveState === 'pending'}
            onClick={() => {
              const source = draftsRef.current.standard ?? buildDraft('standard')
              draftsRef.current.standard = source
              replaceDraft(copyCanvasProfileIntoDraft(draft, sessionEntriesRef.current.map((entry) => entry.id), profileFromDraft(source)))
            }}
          >Copy Desktop layout</button>
        ) : null}
        <span className="arrange-toolbar-spacer" />
        <button type="button" className={buttonClass()} disabled={draft.history.length === 0 || saveState === 'pending'} onClick={() => replaceDraft(undoCanvasDraft(draft))}>Undo</button>
        <button type="button" className={buttonClass()} disabled={saveState === 'pending'} onClick={() => replaceDraft(resetCanvasDraft(draft, sessionEntriesRef.current.map((entry) => entry.id), defaults))}>Reset</button>
        <button type="button" className={buttonClass()} disabled={saveState === 'pending'} onClick={cancel}>Cancel</button>
        <button type="button" className={buttonClass(true)} disabled={saveState === 'pending'} onClick={() => void save()}>{saveState === 'pending' ? 'Saving...' : 'Save'}</button>
      </div>

      {saveState === 'error' ? <p role="alert" className="arrange-save-error">Layout could not be saved. Review your changes and try again.</p> : null}

      {Object.entries(rects).map(([rawId, rect]) => {
        const id = rawId as BlockId
        const entry = sessionEntriesRef.current.find((candidate) => candidate.id === id)
        if (!entry || !rect) return null
        const selected = draft.selectedId === id
        return (
          <button
            key={id}
            type="button"
            aria-label={`Edit ${entry.label}`}
            aria-pressed={selected}
            className={`arrange-target${selected ? ' arrange-target--selected' : ''}`}
            style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onClick={() => select(id)}
            onKeyDown={(event) => {
              select(id)
              if (!keyboardMove(id, event.key, event.shiftKey)) return
              event.preventDefault()
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              select(id)
              event.currentTarget.setPointerCapture?.(event.pointerId)
              dragRef.current = {
                id,
                pointerId: event.pointerId,
                startDraft: draftRef.current ?? draft,
                pointerOffset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
              }
              setGuides([])
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return
              const neighbors: SnapNeighbor[] = Object.entries(rects).flatMap(([candidate, candidateRect]) => (
                candidate !== id && candidateRect
                  ? [{ id: candidate as BlockId, left: candidateRect.left, top: candidateRect.top, width: candidateRect.width, height: candidateRect.height }]
                  : []
              ))
              const snapped = snapCanvasPosition({
                pointer: { x: event.clientX, y: event.clientY },
                pointerOffset: drag.pointerOffset,
                box: { width: rect.width, height: rect.height },
                bounds: viewport,
                neighbors,
              })
              const next = moveCanvasItem(drag.startDraft, id, {
                x: (snapped.left + rect.width / 2) / viewport.width * 100,
                y: (snapped.top + rect.height / 2) / viewport.height * 100,
              })
              replaceDraft(next)
              setGuides(snapped.guides)
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current
              if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              dragRef.current = null
              setGuides([])
              if (draftRef.current) announceMove(draftRef.current, id)
            }}
            onPointerCancel={() => {
              const drag = dragRef.current
              if (!drag || drag.id !== id) return
              dragRef.current = null
              replaceDraft(drag.startDraft)
              setGuides([])
              setAnnouncement('Move cancelled.')
            }}
          />
        )
      })}

      {guides.map((guide, index) => (
        <div
          key={`${guide.axis}-${guide.value}-${index}`}
          data-canvas-guide={guide.kind}
          className={`arrange-guide arrange-guide--${guide.axis}`}
          style={guide.axis === 'x' ? { left: guide.value } : { top: guide.value }}
        />
      ))}

      {inspectorOpen && selectedEntry && selectedPlacement ? (
        <aside
          role="complementary"
          aria-label={`${selectedEntry.label} inspector`}
          data-arrange-inspector-mode={small ? 'sheet' : 'side'}
          className={`arrange-inspector${small ? ' arrange-inspector--sheet' : ''}`}
        >
          <header className="arrange-inspector-header">
            <div>
              <p className="arrange-inspector-eyebrow">Selected widget</p>
              <h2>{selectedEntry.label}</h2>
            </div>
            {small ? <button type="button" className={buttonClass()} onClick={() => setInspectorOpen(false)}>Close inspector</button> : null}
          </header>

          {selectedPlacement.kind === 'canvas' ? (
            <>
              <section aria-label="Position" className="arrange-inspector-section">
                <h3>Position</h3>
                <p className="arrange-coordinates"><span>X {selectedPlacement.x.toFixed(1)}%</span><span>Y {selectedPlacement.y.toFixed(1)}%</span></p>
                <div className="arrange-nudge-grid">
                  {[
                    ['Move up', 'ArrowUp'], ['Move left', 'ArrowLeft'], ['Move right', 'ArrowRight'], ['Move down', 'ArrowDown'],
                  ].map(([label, key]) => <button key={key} type="button" className={buttonClass()} onClick={() => keyboardMove(selectedEntry.id, key, false)}>{label}</button>)}
                </div>
                <button type="button" className={buttonClass()} onClick={() => replaceDraft(restoreCanvasItemDefault(draft, selectedEntry.id, defaults.placements[selectedEntry.id], 'position'))}>Restore default position</button>
              </section>

              <section aria-label="Size" className="arrange-inspector-section">
                <h3>Size</h3>
                <div role="radiogroup" aria-label="Widget size" className="arrange-size-options">
                  {selectedEntry.canvasSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={selectedPlacement.size === size}
                      className={buttonClass(selectedPlacement.size === size)}
                      onClick={() => replaceDraft(resizeCanvasItem(draft, selectedEntry, size))}
                    >{size === 'full' ? 'Full' : size[0].toUpperCase() + size.slice(1)}</button>
                  ))}
                </div>
                <button type="button" className={buttonClass()} onClick={() => replaceDraft(restoreCanvasItemDefault(draft, selectedEntry.id, defaults.placements[selectedEntry.id], 'size'))}>Restore default size</button>
              </section>
            </>
          ) : <p>Bottom bar position {selectedPlacement.order + 1}</p>}

          {selectedEntry.availability.kind !== 'always' ? (
            <label className="arrange-visibility">
              <input
                type="checkbox"
                checked={!draft.hiddenIds.includes(selectedEntry.id)}
                onChange={(event) => {
                  const next = setCanvasItemVisibility(draft, selectedEntry.id, event.currentTarget.checked)
                  replaceDraft(next)
                  setAnnouncement(`${selectedEntry.label} ${event.currentTarget.checked ? 'shown' : 'hidden'} in the preview.`)
                }}
              /> Visible
            </label>
          ) : null}

          {overlapIds.length > 0 ? (
            <section aria-label="Overlap" className="arrange-overlap-warning">
              <p>Overlaps {overlapIds.map((id) => sessionEntriesRef.current.find((entry) => entry.id === id)?.label ?? id).join(', ')}.</p>
              <div>
                <button type="button" className={buttonClass()} onClick={() => replaceDraft(bringCanvasItemForward(draft, selectedEntry.id, viewport))}>Bring forward</button>
                <button type="button" className={buttonClass()} onClick={() => replaceDraft(sendCanvasItemBackward(draft, selectedEntry.id, viewport))}>Send backward</button>
              </div>
            </section>
          ) : null}

          {BOTTOM_BAR_IDS.has(selectedEntry.id) ? (
            selectedPlacement.kind === 'canvas'
              ? <button type="button" className={buttonClass()} onClick={() => replaceDraft(moveCanvasItemToBottomBar(draft, selectedEntry.id))}>Move to Bottom bar</button>
              : <button type="button" className={buttonClass()} onClick={() => replaceDraft(moveCanvasItemToCanvas(draft, selectedEntry.id, defaults.placements[selectedEntry.id]))}>Move to Canvas</button>
          ) : null}
        </aside>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </div>
  )
}
