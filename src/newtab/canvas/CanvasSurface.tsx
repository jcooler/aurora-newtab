import { useMemo, type ReactNode } from 'react'
import { adaptStoredLayout } from '../../lib/layout/canvasAdapter'
import { CANVAS_PROFILE_LABELS, resolveCanvasProfile } from '../../lib/layout/canvasDefaults'
import { canvasMinimumHeight, fitCanvasProfile } from '../../lib/layout/canvasGeometry'
import type { CanvasProfile, CanvasProfileKey, CanvasSize, StoredLayout } from '../../lib/layout/canvasTypes'
import CanvasItem from './CanvasItem'
import CanvasLegibilityLayer from './CanvasLegibilityLayer'
import type { WidgetRegistryEntry } from '../widgetRegistry'

interface CanvasSurfaceProps {
  layout: StoredLayout
  profileKey: CanvasProfileKey
  sourceProfileKey?: CanvasProfileKey
  profileOverride?: CanvasProfile
  entries: readonly WidgetRegistryEntry[]
  viewport?: { width: number; height: number }
  elevatedIds?: ReadonlySet<WidgetRegistryEntry['id']>
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize) => ReactNode
}

function liveViewport(): { width: number; height: number } {
  return {
    width: typeof window === 'undefined' ? 1 : window.innerWidth,
    height: typeof window === 'undefined' ? 1 : window.innerHeight,
  }
}

export default function CanvasSurface({
  layout,
  profileKey,
  sourceProfileKey,
  profileOverride,
  entries,
  viewport = liveViewport(),
  elevatedIds,
  onItemGeometryChange,
  renderWidget,
}: CanvasSurfaceProps) {
  const normalized = useMemo(() => adaptStoredLayout(layout), [layout])
  const resolvedSource = sourceProfileKey ?? profileKey
  const preliminary = useMemo(() => {
    if (profileOverride) return profileOverride
    return resolveCanvasProfile(resolvedSource, entries, normalized.profiles[resolvedSource])
  }, [entries, normalized, profileOverride, resolvedSource])
  const canvasHeight = canvasMinimumHeight(profileKey, preliminary, viewport.height)
  const resolved = useMemo(() => (
    profileOverride ?? resolveCanvasProfile(
      resolvedSource,
      entries,
      normalized.profiles[resolvedSource],
      { width: viewport.width, height: canvasHeight },
    )
  ), [canvasHeight, entries, normalized, profileOverride, resolvedSource, viewport.width])
  const fitted = useMemo(
    () => fitCanvasProfile(resolved, { width: viewport.width, height: canvasHeight }),
    [canvasHeight, resolved, viewport.width],
  )
  const canvasEntries = entries.filter((entry) => fitted.placements[entry.id]?.kind === 'canvas')
  const bottomEntries = entries
    .filter((entry) => fitted.placements[entry.id]?.kind === 'bottom-bar')
    .sort((a, b) => {
      const left = fitted.placements[a.id]
      const right = fitted.placements[b.id]
      return (left?.kind === 'bottom-bar' ? left.order : 0) - (right?.kind === 'bottom-bar' ? right.order : 0)
    })

  return (
    <div data-canvas-root="" className="canvas-root">
      <section
        aria-label="Canvas"
        data-canvas-surface=""
        data-canvas-profile={profileKey}
        data-canvas-source-profile={resolvedSource}
        data-canvas-layout={CANVAS_PROFILE_LABELS[profileKey]}
        data-canvas-mode={fitted.mode}
        data-canvas-viewport-width={viewport.width}
        data-canvas-viewport-height={canvasHeight}
        className="canvas-surface"
        style={{ minHeight: `${canvasHeight}px`, height: `${canvasHeight}px` }}
      >
        <CanvasLegibilityLayer />
        {canvasEntries.map((entry) => {
          const placement = fitted.placements[entry.id]
          if (!placement || placement.kind !== 'canvas') return null
          return (
            <CanvasItem
              key={entry.id}
              entry={entry}
              profile={profileKey}
              placement={placement}
              className={elevatedIds?.has(entry.id) ? 'canvas-item--elevated' : ''}
              onGeometryChange={onItemGeometryChange}
            >
              {renderWidget(entry, placement.size)}
            </CanvasItem>
          )
        })}
      </section>
      {bottomEntries.length > 0 ? (
        <nav aria-label="Bottom bar" className="canvas-bottom-bar">
          {bottomEntries.map((entry) => {
            const placement = fitted.placements[entry.id]
            if (!placement || placement.kind !== 'bottom-bar') return null
            return (
              <CanvasItem key={entry.id} entry={entry} profile={profileKey} placement={placement}>
                {renderWidget(entry, placement.size)}
              </CanvasItem>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
