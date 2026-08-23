import { useState } from 'react'
import type { AuroraStorage } from '../../../lib/storage/index'
import type { NamedLayout } from '../../../lib/layout/namedLayouts'
import {
  detectLegacyCalendarPlacements,
  layoutRevision,
  saveCalendarConsolidation,
  type LegacyCalendarId,
  type LegacyCalendarPlacement,
} from '../../../lib/layout/calendarConsolidation'

const LABELS: Readonly<Record<LegacyCalendarId, string>> = {
  ics: 'Calendar feed',
  monthCal: 'Month',
  publicHolidays: 'Public Holidays',
}

function placementCopy(placement: LegacyCalendarPlacement): string {
  if (placement.kind === 'stack') return `Stack position ${placement.index + 1}, ${placement.tier}`
  if (placement.placement.kind === 'docked') return `${placement.placement.dock} bar, position ${placement.placement.order + 1}`
  if (placement.placement.kind === 'hidden') return 'Hidden'
  return `${placement.placement.tier}, layer ${placement.placement.layer + 1}`
}

export default function CalendarConsolidationPrompt({
  layout,
  storage,
  onLater,
  onSaved,
}: {
  layout: NamedLayout
  storage: AuroraStorage
  onLater: () => void
  onSaved: () => void
}) {
  const placements = detectLegacyCalendarPlacements(layout)
  const [keep, setKeep] = useState<LegacyCalendarId | null>(null)
  const [defaultView, setDefaultView] = useState<'agenda' | 'month'>('agenda')
  const [includePublicHolidays, setIncludePublicHolidays] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = (id: LegacyCalendarId) => {
    setKeep(id)
    setDefaultView(id === 'monthCal' ? 'month' : 'agenda')
  }
  const save = async () => {
    if (!keep || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveCalendarConsolidation(storage, {
        layoutId: layout.id,
        expectedRevision: layoutRevision(layout),
        keep,
        defaultView,
        includePublicHolidays,
      })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Calendar could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="calendar-consolidation-title" className="w-full max-w-lg rounded-2xl border border-panel-border bg-panel-solid p-5 text-fg shadow-2xl">
        <h2 id="calendar-consolidation-title" className="text-lg font-semibold">Bring your date widgets together</h2>
        <p className="mt-1 text-sm leading-5 text-fg-muted">Choose which current placement becomes Calendar. The other date cards are removed from {layout.name} only.</p>
        <fieldset className="mt-4 grid gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Keep this placement</legend>
          {placements.map((placement) => (
            <label key={placement.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-panel-border px-3 py-2 hover:bg-control-bg">
              <input type="radio" name="calendar-placement" checked={keep === placement.id} onChange={() => choose(placement.id)} className="size-4 accent-[var(--accent)]" />
              <span className="min-w-0"><span className="block text-sm font-medium">{LABELS[placement.id]}</span><span className="block truncate text-xs text-fg-muted">{placementCopy(placement)}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs text-fg-muted">Default view
            <select value={defaultView} onChange={(event) => setDefaultView(event.currentTarget.value as 'agenda' | 'month')} className="min-h-9 rounded-lg border border-panel-border bg-control-bg px-2 text-sm text-fg">
              <option value="agenda">Agenda</option><option value="month">Month</option>
            </select>
          </label>
          <label className="flex min-h-9 items-end gap-2 pb-2 text-sm text-fg"><input type="checkbox" checked={includePublicHolidays} onChange={(event) => setIncludePublicHolidays(event.currentTarget.checked)} className="size-4 accent-[var(--accent)]" />Include public holidays</label>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onLater} className="min-h-9 rounded-lg px-3 text-sm text-fg-muted hover:bg-control-bg hover:text-fg">Later</button>
          <button type="button" disabled={!keep || saving} onClick={() => void save()} className="min-h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save unified Calendar'}</button>
        </div>
      </section>
    </div>
  )
}
