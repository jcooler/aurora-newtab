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
  onSwitchLayout,
  onBulkTier,
  onUndo,
  onReset,
  onCancel,
  onSave,
}: {
  session: EditSession
  onSwitchLayout: (layoutId: string) => void
  onBulkTier: (tier: WidgetTier) => void
  onUndo: () => void
  onReset: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const button = 'rounded-md border border-control-border bg-control-bg px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-control-bg-hover disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <div role="toolbar" aria-label="Edit layout" className="edit-toolbar">
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
        {WIDGET_TIERS.map((tier) => (
          <button key={tier} type="button" className={button} onClick={() => onBulkTier(tier)}>
            {TIER_LABELS[tier]}
          </button>
        ))}
      </span>
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
