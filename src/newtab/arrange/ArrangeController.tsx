import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BlockId, LayoutProfile, LayoutV2, Priority, WidgetVariant, Zone } from '../../lib/layout/types'
import { withProfileOverrides } from '../../lib/layout/v2'
import { closeAllDialogs, hasOpenDialogs, useDialogEscape } from '../../lib/dialogStack'
import { isPremium } from '../../lib/premium'
import { useStorage } from '../../lib/storage/context'
import { useLongPress } from './useLongPress'
import type { ArrangePreview } from './draftLayout'
import {
  applyArrangeEdit,
  copyProfileDraft,
  createProfileDraft,
  effectiveEditablePlacement,
  resetProfileDraft,
  undoArrangeEdit,
  type ArrangeEdit,
  type ProfileDraft,
} from './profileEditor'
import { WIDGET_REGISTRY, type WidgetRegistryEntry } from '../widgetRegistry'

const PROFILE_LABELS: Readonly<Record<LayoutProfile, string>> = {
  compact: 'Compact', standard: 'Standard', display: 'Display', ultrawide: 'Ultrawide',
}
const ZONE_LABELS: Readonly<Record<Zone, string>> = {
  day: 'Day', now: 'Now', pulse: 'Work Pulse', dock: 'Signal Dock',
}
const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  pinned: 'Pinned', automatic: 'Automatic', dock: 'Dock',
}
const VARIANT_LABELS: Readonly<Record<WidgetVariant, string>> = {
  compact: 'Compact', standard: 'Standard', expanded: 'Expanded',
}

interface ArrangeControllerProps {
  profile: LayoutProfile
  layout: LayoutV2
  entries: readonly WidgetRegistryEntry[]
  onPreviewChange: (preview: ArrangePreview | null) => void
  onModeChange?: (arranging: boolean) => void
  openSignal?: number
}

function fixedButton(active = false): string {
  return `min-h-9 rounded-md border px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
    active ? 'border-accent bg-accent/15 text-accent' : 'border-panel-border text-fg hover:border-accent/60'
  } disabled:cursor-not-allowed disabled:opacity-40`
}

export default function ArrangeController({
  profile,
  layout,
  entries,
  onPreviewChange,
  onModeChange,
  openSignal,
}: ArrangeControllerProps) {
  const storage = useStorage()
  const [mode, setMode] = useState<'off' | 'on'>('off')
  const [sessionProfile, setSessionProfile] = useState<LayoutProfile | null>(null)
  const [sessionEntries, setSessionEntries] = useState<readonly WidgetRegistryEntry[]>([])
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [selectedId, setSelectedId] = useState<BlockId | null>(null)
  const [rects, setRects] = useState<Partial<Record<BlockId, DOMRect>>>({})
  const [copySource, setCopySource] = useState<LayoutProfile>('compact')
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'error'>('idle')
  const overlayRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const modeRef = useRef<'off' | 'on'>('off')
  const profileRef = useRef(profile)
  const layoutRef = useRef(layout)
  const entriesRef = useRef(entries)
  const sessionLayoutRef = useRef(layout)
  const sessionProfileRef = useRef<LayoutProfile | null>(null)
  const draftRef = useRef<ProfileDraft | null>(null)
  const pendingFocusRef = useRef<BlockId | null>(null)
  const entryPromiseRef = useRef<Promise<void> | null>(null)

  profileRef.current = profile
  layoutRef.current = layout
  entriesRef.current = entries
  modeRef.current = mode
  draftRef.current = draft

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    onModeChange?.(mode === 'on')
  }, [mode, onModeChange])

  const measureAll = useCallback(() => {
    const next: Partial<Record<BlockId, DOMRect>> = {}
    for (const entry of sessionEntries) {
      const element = document.querySelector<HTMLElement>(`[data-block-id="${entry.id}"]`)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 || rect.height > 0) next[entry.id] = rect
    }
    setRects(next)
  }, [sessionEntries])

  useLayoutEffect(() => {
    if (mode !== 'on') return
    measureAll()
    const frame = requestAnimationFrame(measureAll)
    window.addEventListener('resize', measureAll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measureAll)
    }
  }, [mode, draft?.overrides, measureAll])

  useEffect(() => {
    if (mode !== 'on' || !pendingFocusRef.current) return
    const target = overlayRef.current?.querySelector<HTMLButtonElement>(
      `[aria-label="Edit ${sessionEntries.find((entry) => entry.id === pendingFocusRef.current)?.label ?? ''}"]`,
    )
    if (!target) return
    target.focus()
    pendingFocusRef.current = null
  }, [mode, rects, sessionEntries])

  const publish = useCallback((next: ProfileDraft) => {
    const activeProfile = sessionProfileRef.current
    draftRef.current = next
    setDraft(next)
    if (activeProfile) onPreviewChange({ profile: activeProfile, overrides: next.overrides })
  }, [onPreviewChange])

  const exit = useCallback(() => {
    modeRef.current = 'off'
    sessionProfileRef.current = null
    draftRef.current = null
    setMode('off')
    setSessionProfile(null)
    setSessionEntries([])
    setDraft(null)
    setSelectedId(null)
    setRects({})
    setSaveState('idle')
    onPreviewChange(null)
  }, [onPreviewChange])

  const cancel = useCallback(() => {
    if (saveState !== 'pending') exit()
  }, [exit, saveState])

  useDialogEscape(cancel, mode === 'on')

  const begin = useCallback((preferredId?: BlockId) => {
    if (!isPremium() || modeRef.current === 'on') return
    const start = () => {
      const nextProfile = profileRef.current
      const nextLayout = layoutRef.current
      const nextEntries = [...entriesRef.current]
      const nextDraft = createProfileDraft(nextLayout, nextProfile)
      const firstId = preferredId && nextEntries.some((entry) => entry.id === preferredId)
        ? preferredId
        : nextEntries[0]?.id ?? null
      sessionLayoutRef.current = nextLayout
      sessionProfileRef.current = nextProfile
      draftRef.current = nextDraft
      pendingFocusRef.current = firstId
      setSessionProfile(nextProfile)
      setSessionEntries(nextEntries)
      setDraft(nextDraft)
      setSelectedId(firstId)
      setCopySource(nextProfile === 'compact' ? 'standard' : 'compact')
      setSaveState('idle')
      modeRef.current = 'on'
      setMode('on')
      onPreviewChange({ profile: nextProfile, overrides: nextDraft.overrides })
    }
    if (!hasOpenDialogs()) {
      start()
      return
    }
    if (entryPromiseRef.current) return
    entryPromiseRef.current = closeAllDialogs().then((closed) => {
      if (closed && mountedRef.current && modeRef.current === 'off') start()
    }).finally(() => { entryPromiseRef.current = null })
  }, [onPreviewChange])

  useLongPress(useCallback((blockId: BlockId) => begin(blockId), [begin]))

  const previousOpenSignalRef = useRef(openSignal)
  useEffect(() => {
    if (openSignal === undefined || previousOpenSignalRef.current === openSignal) return
    previousOpenSignalRef.current = openSignal
    begin()
  }, [begin, openSignal])

  const edit = useCallback((change: ArrangeEdit) => {
    const current = draftRef.current
    const activeProfile = sessionProfileRef.current
    if (!current || !activeProfile) return
    const next = applyArrangeEdit(current, activeProfile, sessionEntries, change)
    if (next !== current) {
      setSaveState('idle')
      publish(next)
    }
  }, [publish, sessionEntries])

  const save = useCallback(async () => {
    const current = draftRef.current
    const activeProfile = sessionProfileRef.current
    if (!current || !activeProfile || saveState === 'pending') return
    setSaveState('pending')
    try {
      await storage.update('layout', (stored) => withProfileOverrides(stored, activeProfile, current.overrides))
      if (mountedRef.current) exit()
    } catch {
      if (mountedRef.current) setSaveState('error')
    }
  }, [exit, saveState, storage])

  if (mode !== 'on' || !sessionProfile || !draft) return null

  const selectedEntry = sessionEntries.find((entry) => entry.id === selectedId) ?? null
  const selectedPlacement = selectedEntry
    ? effectiveEditablePlacement(sessionProfile, selectedEntry, draft.overrides)
    : null
  const locked = selectedPlacement?.locked === true

  return (
    <div
      ref={overlayRef}
      data-arrange-overlay=""
      className="fixed inset-0 z-[60] bg-black/10 motion-reduce:transition-none"
    >
      {sessionEntries.map((entry) => {
        const rect = rects[entry.id]
        if (!rect) return null
        const selected = entry.id === selectedId
        return (
          <button
            key={entry.id}
            type="button"
            aria-label={`Edit ${entry.label}`}
            aria-pressed={selected}
            onClick={() => setSelectedId(entry.id)}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key)) return
              event.preventDefault()
              setSelectedId(entry.id)
              edit({
                kind: 'move-order',
                id: entry.id,
                delta: event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
              })
            }}
            style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            className={`rounded-md border-2 bg-accent/10 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent ${
              selected ? 'border-accent' : 'border-accent/55 hover:border-accent'
            }`}
          />
        )
      })}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Arrange ${PROFILE_LABELS[sessionProfile]} profile`}
        className="fixed bottom-3 left-1/2 max-h-[min(26rem,calc(100vh-1.5rem))] w-[min(58rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-3 text-fg shadow-2xl motion-reduce:transition-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base">Arrange {PROFILE_LABELS[sessionProfile]} profile</h2>
            <p className="text-sm text-fg-muted">Preview only until Save.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={fixedButton()} disabled={draft.history.length === 0 || saveState === 'pending'} onClick={() => publish(undoArrangeEdit(draft))}>Undo</button>
            <button type="button" className={fixedButton()} disabled={saveState === 'pending'} onClick={() => publish(resetProfileDraft(draft))}>Reset profile</button>
            <button type="button" className={fixedButton()} disabled={saveState === 'pending'} onClick={cancel}>Cancel</button>
            <button type="button" className={fixedButton(true)} disabled={saveState === 'pending'} onClick={() => void save()}>{saveState === 'pending' ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

        {saveState === 'error' ? <p role="alert" className="mt-2 rounded-md border border-red-400/50 px-3 py-2 text-sm text-red-200">Layout could not be saved. Review your changes and try again.</p> : null}

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-panel-border pt-3">
          <label className="grid gap-1 text-sm">
            <span>Copy from profile</span>
            <select className="min-h-9 rounded-md border border-panel-border bg-panel-solid px-2" value={copySource} onChange={(event) => setCopySource(event.target.value as LayoutProfile)}>
              {(['compact', 'standard', 'display', 'ultrawide'] as const).filter((value) => value !== sessionProfile).map((value) => <option key={value} value={value}>{PROFILE_LABELS[value]}</option>)}
            </select>
          </label>
          <button type="button" className={fixedButton()} disabled={saveState === 'pending'} onClick={() => publish(copyProfileDraft(draft, sessionLayoutRef.current, copySource, WIDGET_REGISTRY))}>Copy profile</button>
        </div>

        {selectedEntry && selectedPlacement ? (
          <section aria-label={`${selectedEntry.label} placement`} className="mt-3 grid gap-3 border-t border-panel-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm">{selectedEntry.label}</h3>
              <button type="button" aria-pressed={locked} className={fixedButton(locked)} onClick={() => edit({ kind: 'set-locked', id: selectedEntry.id, locked: !locked })}>{locked ? 'Unlock placement' : 'Lock placement'}</button>
            </div>

            <fieldset disabled={locked || saveState === 'pending'} className="grid gap-3 disabled:opacity-50">
              <legend className="sr-only">Edit {selectedEntry.label}</legend>
              <div className="flex flex-wrap gap-2" aria-label="Zone targets">
                {selectedEntry.eligibleZones.map((zone) => (
                  <button key={zone} type="button" className={fixedButton(selectedPlacement.zone === zone)} disabled={selectedPlacement.zone === zone} onClick={() => edit({ kind: 'set-zone', id: selectedEntry.id, zone })}>Move to {ZONE_LABELS[zone]}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Order controls">
                <button type="button" className={fixedButton()} onClick={() => edit({ kind: 'move-order', id: selectedEntry.id, delta: -1 })}>Move earlier</button>
                <button type="button" className={fixedButton()} onClick={() => edit({ kind: 'move-order', id: selectedEntry.id, delta: 1 })}>Move later</button>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Presentation variants">
                {selectedEntry.allowedVariants.map((variant) => (
                  <button key={variant} type="button" className={fixedButton(selectedPlacement.variant === variant)} disabled={selectedPlacement.variant === variant} onClick={() => edit({ kind: 'set-variant', id: selectedEntry.id, variant })}>{VARIANT_LABELS[variant]}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Priority controls">
                {(['pinned', 'automatic', 'dock'] as const).map((priority) => (
                  <button key={priority} type="button" className={fixedButton(selectedPlacement.priority === priority)} disabled={selectedPlacement.priority === priority || (priority === 'dock' && !selectedEntry.eligibleZones.includes('dock'))} onClick={() => edit({ kind: 'set-priority', id: selectedEntry.id, priority })}>{PRIORITY_LABELS[priority]}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2" aria-label="Resize controls">
                <span className="text-sm text-fg-muted">{selectedPlacement.colSpan} columns × {selectedPlacement.rowSpan} rows</span>
                <button type="button" className={fixedButton()} disabled={selectedPlacement.colSpan <= 1} onClick={() => edit({ kind: 'resize', id: selectedEntry.id, colSpan: selectedPlacement.colSpan - 1 })}>Narrower</button>
                <button type="button" className={fixedButton()} onClick={() => edit({ kind: 'resize', id: selectedEntry.id, colSpan: selectedPlacement.colSpan + 1 })}>Wider</button>
                <button type="button" className={fixedButton()} disabled={selectedPlacement.rowSpan <= 1} onClick={() => edit({ kind: 'resize', id: selectedEntry.id, rowSpan: selectedPlacement.rowSpan - 1 })}>Shorter</button>
                <button type="button" className={fixedButton()} onClick={() => edit({ kind: 'resize', id: selectedEntry.id, rowSpan: selectedPlacement.rowSpan + 1 })}>Taller</button>
              </div>
            </fieldset>
          </section>
        ) : null}
      </aside>
    </div>
  )
}
