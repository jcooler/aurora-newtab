import { useEffect, useState } from 'react'
import {
  detectLegacyCalendarPlacements,
  layoutRevision,
  saveCalendarConsolidation,
  type LegacyCalendarId,
} from '../../lib/layout/calendarConsolidation'
import type { CalendarLayoutPreference, NamedLayout } from '../../lib/layout/namedLayouts'
import type { AuroraStorage } from '../../lib/storage/index'
import { control, submitBtn } from './shared'

const LABELS: Readonly<Record<LegacyCalendarId, string>> = {
  ics: 'Calendar',
  monthCal: 'Month',
  publicHolidays: 'Public Holidays',
}

export default function CalendarConsolidationSettings({
  layout,
  preference,
  storage,
}: {
  layout: NamedLayout
  preference: CalendarLayoutPreference
  storage: AuroraStorage
}) {
  const placements = detectLegacyCalendarPlacements(layout)
  const revision = layoutRevision(layout)
  const [selection, setSelection] = useState<{
    keep: LegacyCalendarId
    expectedRevision: string
    expectedPreference: CalendarLayoutPreference
  } | null>(null)
  const [defaultView, setDefaultView] = useState<'agenda' | 'month'>(preference.defaultView)
  const [includePublicHolidays, setIncludePublicHolidays] = useState(preference.includePublicHolidays)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    setSelection(null)
    setDefaultView(preference.defaultView)
    setIncludePublicHolidays(preference.includePublicHolidays)
    setMessage(null)
  }, [preference.defaultView, preference.includePublicHolidays, revision])

  if (placements.length < 2) return null

  const choose = (id: LegacyCalendarId) => {
    setSelection({ keep: id, expectedRevision: revision, expectedPreference: { ...preference } })
    setMessage(null)
  }

  const combine = async () => {
    if (!selection || saving) return
    setSaving(true)
    setMessage(null)
    try {
      await saveCalendarConsolidation(storage, {
        layoutId: layout.id,
        expectedRevision: selection.expectedRevision,
        expectedPreference: selection.expectedPreference,
        keep: selection.keep,
        defaultView,
        includePublicHolidays,
      })
      setMessage({ kind: 'success', text: 'Calendar combined for this layout.' })
    } catch (cause) {
      setMessage({
        kind: 'error',
        text: cause instanceof Error ? cause.message : 'Calendar could not be combined.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 border-t border-control-border pt-3">
      <p className="text-sm font-medium text-fg">Combine date cards</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Keep one existing card location and show Agenda or Month there.
      </p>
      <fieldset className="mt-3 grid gap-2">
        <legend className="text-xs font-medium text-fg-muted">Card location to keep</legend>
        {placements.map((placement) => (
          <label key={placement.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-fg hover:bg-control-bg-hover">
            <input
              type="radio"
              name={`calendar-location-${layout.id}`}
              checked={selection?.keep === placement.id}
              onChange={() => choose(placement.id)}
              className="size-4 accent-[var(--accent)]"
            />
            <span>{LABELS[placement.id]}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 grid gap-3 min-[420px]:grid-cols-2">
        <label className="grid gap-1 text-xs text-fg-muted">
          Default view
          <select
            value={defaultView}
            onChange={(event) => setDefaultView(event.currentTarget.value as 'agenda' | 'month')}
            className={control}
          >
            <option value="agenda">Agenda</option>
            <option value="month">Month</option>
          </select>
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={includePublicHolidays}
            onChange={(event) => setIncludePublicHolidays(event.currentTarget.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Include public holidays
        </label>
      </div>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className="mt-2 text-xs text-fg-muted">
          {message.text}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!selection || saving}
        onClick={() => void combine()}
        className={`${submitBtn} mt-3 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {saving ? 'Combining…' : 'Combine into Calendar'}
      </button>
    </div>
  )
}
