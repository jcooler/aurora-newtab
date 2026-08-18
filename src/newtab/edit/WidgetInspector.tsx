import { anchorPanel } from '../../lib/layout/anchor'
import type { NamedLayoutPlacement, WidgetTier } from '../../lib/layout/namedLayouts'
import type { WidgetRegistryEntry } from '../widgetRegistry'

const TIER_LABELS: Readonly<Record<WidgetTier, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

const PANEL_SIZE = { w: 240, h: 260 }

/** The small floating inspector beside the selected widget (named-layouts
 *  spec 2.5): tier, layer forward/backward, hide, restore defaults, plus the
 *  passive overlap warning (spec 2.2: warned about while editing, never
 *  silently corrected). Non-modal; positioned by the shared anchorPanel
 *  rules so it opens toward available space and clamps to the viewport. */
export default function WidgetInspector({
  entry,
  placement,
  anchorRect,
  overlapLabels,
  onTier,
  onLayer,
  onHide,
  onRestore,
}: {
  entry: WidgetRegistryEntry
  placement: NamedLayoutPlacement
  anchorRect: DOMRectReadOnly
  overlapLabels: readonly string[]
  onTier: (tier: WidgetTier) => void
  onLayer: (direction: 'forward' | 'backward') => void
  onHide: () => void
  onRestore: () => void
}) {
  const viewport = {
    w: typeof window === 'undefined' ? 1 : window.innerWidth,
    h: typeof window === 'undefined' ? 1 : window.innerHeight,
  }
  const position = anchorPanel(anchorRect, PANEL_SIZE, viewport)
  const free = placement.kind === 'free'
  const button = 'rounded-md border border-control-border bg-control-bg px-2 py-1 text-xs font-medium text-fg transition-colors hover:bg-control-bg-hover'

  return (
    <div
      role="dialog"
      aria-label={`${entry.label} inspector`}
      className="edit-inspector"
      style={{
        left: position.left,
        ...('top' in position ? { top: position.top } : { bottom: position.bottom }),
      }}
    >
      <p className="text-xs font-semibold text-fg">{entry.label}</p>
      {free ? (
        <div role="radiogroup" aria-label="Size" className="flex items-center gap-1">
          {entry.canvasSizes.map((tier) => (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={placement.kind === 'free' && placement.tier === tier}
              className={`${button}${placement.kind === 'free' && placement.tier === tier ? ' border-accent text-accent' : ''}`}
              onClick={() => onTier(tier)}
            >
              {TIER_LABELS[tier]}
            </button>
          ))}
        </div>
      ) : null}
      {free ? (
        <div className="flex items-center gap-1">
          <button type="button" className={button} onClick={() => onLayer('backward')}>
            Send backward
          </button>
          <button type="button" className={button} onClick={() => onLayer('forward')}>
            Bring forward
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <button type="button" className={button} onClick={onHide}>
          Hide
        </button>
        <button type="button" className={button} onClick={onRestore}>
          Restore defaults
        </button>
      </div>
      {overlapLabels.length > 0 ? (
        <p className="text-xs text-amber-300">
          Overlaps {overlapLabels.join(', ')}
        </p>
      ) : null}
    </div>
  )
}
