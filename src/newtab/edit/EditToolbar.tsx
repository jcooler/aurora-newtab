import type { EditSession } from '../../lib/layout/editSession'
import type { WidgetTier } from '../../lib/layout/namedLayouts'
import { WIDGET_TIERS } from '../../lib/layout/namedLayouts'

const TIER_LABELS: Readonly<Record<WidgetTier, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

/** The slim edit toolbar (named-layouts spec 2.5): layout switcher, bulk
 *  tier control, Undo, Reset, Cancel, and the single committing Save. The
 *  switcher is disabled while dirty (scope decision 3): switching mid-edit
 *  would either lose or silently commit the draft, and it does neither. */
export default function EditToolbar({
  session,
  hiddenWidgets = [],
  topOffset,
  interactionLocked = false,
  onRestoreHidden,
  onSwitchLayout,
  onBulkTier,
  onUndo,
  onReset,
  onCancel,
  onSave,
}: {
  /** Pushes the fixed toolbar below a rendered top dock so strip members
   *  stay reachable during a session (owner-reported 2026-08-18: the
   *  toolbar sat over the top-docked Bookmarks). */
  topOffset?: number
  /** A held pointer may cause this toolbar to appear underneath itself.
   *  Keep the new controls out of hit testing until that pointer releases. */
  interactionLocked?: boolean
  session: EditSession
  /** Widgets hidden in the edited layout (review fix I2): each gets a Show
   *  control so Hide is never a dead end. */
  hiddenWidgets?: readonly { id: string; label: string }[]
  onRestoreHidden?: (id: string) => void
  onSwitchLayout: (layoutId: string) => void
  onBulkTier: (tier: WidgetTier) => void
  onUndo: () => void
  onReset: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const button = 'rounded-md border border-control-border bg-control-bg px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-control-bg-hover disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <div
      role="toolbar"
      aria-label="Edit layout"
      inert={interactionLocked}
      className="edit-toolbar"
      style={topOffset !== undefined ? { top: topOffset } : undefined}
    >
      <label className="flex items-center gap-1.5 text-xs text-fg-muted">
        Layout
        <select
          aria-label="Edited layout"
          className="rounded-md border border-control-border bg-control-bg px-1.5 py-1 text-xs text-fg disabled:cursor-not-allowed disabled:opacity-50"
          value={session.draft.activeLayoutId}
          disabled={session.dirty}
          title={session.dirty ? 'Save or cancel your changes first' : undefined}
          onChange={(event) => onSwitchLayout(event.target.value)}
        >
          {session.draft.layouts.map((layout) => (
            <option key={layout.id} value={layout.id}>{layout.name}</option>
          ))}
        </select>
      </label>
      <span role="group" aria-label="Set all widgets to" className="flex items-center gap-1">
        {/* The visible label is load-bearing (owner-reported 2026-08-18):
            without it these read as the SELECTED widget's size and the bulk
            re-tier looks like the wrong widget changing. */}
        <span className="text-xs text-fg-muted">All widgets</span>
        {WIDGET_TIERS.map((tier) => (
          <button key={tier} type="button" className={button} onClick={() => onBulkTier(tier)}>
            {TIER_LABELS[tier]}
          </button>
        ))}
      </span>
      {hiddenWidgets.length > 0 ? (
        <details className="edit-toolbar__hidden">
          <summary className={button}>Hidden {hiddenWidgets.length}</summary>
          <span role="group" aria-label="Hidden in this layout" className="edit-toolbar__hidden-menu">
            {hiddenWidgets.map(({ id, label: widgetLabel }) => (
              <button
                key={id}
                type="button"
                className={button}
                aria-label={`Show ${widgetLabel}`}
                onClick={() => onRestoreHidden?.(id)}
              >
                Show {widgetLabel}
              </button>
            ))}
          </span>
        </details>
      ) : null}
      <span className="flex items-center gap-1">
        <button type="button" className={button} disabled={session.past.length === 0} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={button} disabled={!session.dirty} onClick={onReset}>
          Reset
        </button>
        <button type="button" className={button} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${button} border-accent text-accent`}
          onClick={onSave}
        >
          Save
        </button>
      </span>
    </div>
  )
}
