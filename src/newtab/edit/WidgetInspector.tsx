import { anchorPanel } from '../../lib/layout/anchor'
import type { NamedLayoutPlacement, WidgetTier } from '../../lib/layout/namedLayouts'
import { dockedRenderSize, dockSizeVaries, type WidgetRegistryEntry } from '../widgetRegistry'

const TIER_LABELS: Readonly<Record<WidgetTier, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

const PANEL_SIZE = { w: 248, h: 264 }

/** The small floating inspector beside the selected widget (named-layouts
 *  spec 2.5): tier, layer forward/backward, hide, restore defaults, plus the
 *  passive overlap warning (spec 2.2: warned about while editing, never
 *  silently corrected). Non-modal; positioned by the shared anchorPanel
 *  rules so it opens toward available space and clamps to the viewport.
 *
 *  Presentation (owner direction 2026-08-18: keep the interaction, clean up
 *  the box): a named header, labelled rows, a joined segmented size control,
 *  and the two quieter footer actions — no more grid of identical buttons. */
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
  const docked = placement.kind === 'docked'
  // Docked members size within the strip too (owner direction 2026-08-18:
  // docked Bookmarks compact = the one-letter mark bar); the checked radio
  // reflects the stored choice or the widget's docked default.
  // A docked Size row only where size actually changes the strip form —
  // offering dead radios on every docked widget would be lying UI.
  const sizeRow = free || (docked && entry.canvasSizes.length > 1 && dockSizeVaries(entry))
  const checkedTier = free
    ? placement.tier
    : docked
      ? dockedRenderSize(entry, placement.tier)
      : undefined

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
      <p className="edit-inspector__title">
        {entry.label}
        <span className="edit-inspector__context">{free ? 'On the canvas' : placement.kind === 'docked' ? 'In the bar' : 'Hidden'}</span>
      </p>
      {sizeRow ? (
        <div className="edit-inspector__row">
          <span className="edit-inspector__label">Size</span>
          <div role="radiogroup" aria-label="Size" className="edit-segment">
            {entry.canvasSizes.map((tier) => (
              <button
                key={tier}
                type="button"
                role="radio"
                aria-checked={checkedTier === tier}
                className="edit-segment__option"
                onClick={() => onTier(tier)}
              >
                {TIER_LABELS[tier]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {free ? (
        <div className="edit-inspector__row">
          <span className="edit-inspector__label">Layer</span>
          <div className="edit-inspector__actions">
            <button type="button" className="edit-inspector__button" onClick={() => onLayer('backward')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              Send backward
            </button>
            <button type="button" className="edit-inspector__button" onClick={() => onLayer('forward')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              Bring forward
            </button>
          </div>
        </div>
      ) : null}
      <div className="edit-inspector__footer">
        <button type="button" className="edit-inspector__button edit-inspector__button--quiet" onClick={onHide}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          Hide
        </button>
        <button type="button" className="edit-inspector__button edit-inspector__button--quiet" onClick={onRestore}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Restore defaults
        </button>
      </div>
      {overlapLabels.length > 0 ? (
        <p className="edit-inspector__note">
          Overlaps {overlapLabels.join(', ')}
        </p>
      ) : null}
    </div>
  )
}
