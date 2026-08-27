import { anchorPanel, VIEWPORT_PANEL_GUTTER, type PanelPlacement } from '../../lib/layout/anchor'
import type { CalendarLayoutPreference, NamedLayoutPlacement, WidgetTier } from '../../lib/layout/namedLayouts'
import { dockedRenderSize, dockSizeVaries, type WidgetRegistryEntry } from '../widgetRegistry'

const TIER_LABELS: Readonly<Record<WidgetTier, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

const PANEL_SIZE = { w: 248, h: 264 }

function avoidToolbar(
  placement: PanelPlacement,
  toolbarRect: DOMRectReadOnly | undefined,
  viewport: { w: number; h: number },
  panelSize: { w: number; h: number },
): PanelPlacement {
  if (!toolbarRect) return placement
  const top = 'top' in placement
    ? placement.top
    : viewport.h - placement.bottom - panelSize.h
  const panel = {
    left: placement.left,
    top,
    right: placement.left + panelSize.w,
    bottom: top + panelSize.h,
  }
  const overlaps = panel.left < toolbarRect.right
    && panel.right > toolbarRect.left
    && panel.top < toolbarRect.bottom
    && panel.bottom > toolbarRect.top
  if (!overlaps) return placement

  const gap = 8
  const below = toolbarRect.bottom + gap
  if (below + panelSize.h <= viewport.h - VIEWPORT_PANEL_GUTTER) {
    return { left: placement.left, top: below }
  }
  const above = toolbarRect.top - gap - panelSize.h
  if (above >= VIEWPORT_PANEL_GUTTER) return { left: placement.left, top: above }
  return placement
}

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
  toolbarRect,
  overlapLabels,
  onTier,
  onLayer,
  onHide,
  onRestore,
  calendarPreference,
  onCalendarPreference,
}: {
  entry: WidgetRegistryEntry
  placement: NamedLayoutPlacement
  anchorRect: DOMRectReadOnly
  toolbarRect?: DOMRectReadOnly
  overlapLabels: readonly string[]
  onTier: (tier: WidgetTier) => void
  onLayer: (direction: 'forward' | 'backward') => void
  onHide: () => void
  onRestore: () => void
  calendarPreference?: CalendarLayoutPreference
  onCalendarPreference?: (patch: Partial<CalendarLayoutPreference>) => void
}) {
  const viewport = {
    w: typeof window === 'undefined' ? 1 : window.innerWidth,
    h: typeof window === 'undefined' ? 1 : window.innerHeight,
  }
  const free = placement.kind === 'free'
  const docked = placement.kind === 'docked'
  // The free inspector owns layer controls and is the full design height;
  // docked variants are much shorter. Collision decisions use the variant
  // that is actually rendered, so a 163px Bookmarks panel is not rejected by
  // a fictional 264px box in short desktop windows.
  const sizeRow = free || (docked && entry.canvasSizes.length > 1 && dockSizeVaries(entry))
  const panelSize = {
    w: PANEL_SIZE.w,
    h: entry.id === 'ics' && calendarPreference ? (free ? 368 : 274) : free ? PANEL_SIZE.h : sizeRow ? 164 : 124,
  }
  const position = avoidToolbar(
    anchorPanel(anchorRect, panelSize, viewport),
    toolbarRect,
    viewport,
    panelSize,
  )
  // Docked members size within the strip too (owner direction 2026-08-18:
  // docked Bookmarks compact = the one-letter mark bar); the checked radio
  // reflects the stored choice or the widget's docked default.
  // A docked Size row only where size actually changes the strip form —
  // offering dead radios on every docked widget would be lying UI.
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
          <span className="edit-inspector__label">Overlap order</span>
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
      {entry.id === 'ics' && calendarPreference && onCalendarPreference ? (
        <div className="edit-inspector__row" data-calendar-preferences="">
          <span className="edit-inspector__label">Default view</span>
          <div role="radiogroup" aria-label="Default Calendar view" className="edit-segment">
            {(['agenda', 'month'] as const).map((view) => (
              <button
                key={view}
                type="button"
                role="radio"
                aria-checked={calendarPreference.defaultView === view}
                className="edit-segment__option"
                onClick={() => onCalendarPreference({ defaultView: view })}
              >
                {view === 'agenda' ? 'Agenda' : 'Month'}
              </button>
            ))}
          </div>
          <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-xs text-fg">
            <span>Include public holidays</span>
            <input
              type="checkbox"
              checked={calendarPreference.includePublicHolidays}
              onChange={(event) => onCalendarPreference({ includePublicHolidays: event.currentTarget.checked })}
              className="size-4 accent-[var(--accent)]"
            />
          </label>
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
