import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useNow } from '../../../lib/hooks/useNow'
import { calendarDayDifference, resolvedLocalTimeZone, zonedLocalDayRange } from '../../../lib/dates'
import {
  fetchIcs,
  icsCalendarsOf,
  isIcsData,
  icsViewOf,
  type IcsData,
  type IcsEvent,
} from '../../../services/connectors/ics'
import { calendarColorClass, calendarColorOf, isCalendarColor } from '../../../services/connectors/calendarColors'
import type {
  GoogleCalendarConfig,
  IcsCalendar,
  IcsConfig,
  MicrosoftCalendarConfig,
} from '../../../services/connectors/types'
import type { WidgetVariant } from '../../../lib/layout/types'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import DockLine from '../shared/DockLine'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationState } from '../../widgetSizeContracts'
import type { AsyncResourceState } from '../../../lib/asyncState'
import {
  calendarPreferenceFor,
  updateCalendarLayoutPreference,
} from '../../../lib/layout/calendarConsolidation'
import {
  fetchPublicHolidays,
  isPublicHolidaysData,
  normalizeHolidayCountryCode,
  publicHolidayDisplayName,
  type PublicHoliday,
  type PublicHolidaysData,
} from '../../../services/connectors/publicHolidays'
import type { PublicHolidaysConfig } from '../../../services/connectors/types'
import { calendarMonthCells, composeCalendarItems, type CalendarAgendaItem } from './calendarComposition'
import CalendarContextPopover, { type CalendarContextRow } from './CalendarContextPopover'
import { useGoogleCalendar } from '../../../providers/GoogleCalendarProvider'
import { useMicrosoftCalendar } from '../../../providers/MicrosoftCalendarProvider'

// The calendar widget — Task 54, the seventh connector and the second
// no-auth one (ics.ts, Task 53) to reach the newtab page. SOLID CARD as of
// Jon's darker-color ruling (this batch): it sits directly above RSS's own
// new card, and a bare-text widget above a card reads unfinished — so it now
// wears the same bg-panel-solid + rounded-2xl + shadow-lg + p-2.5 card
// language as RssWidget/GithubWidget, dropping the text-photo shadow the bare
// version used (that utility is only for text floating directly on the
// photo). This was a JUDGMENT-CALL consistency completion — Jon named the
// "news rss stuff"; the calendar is the widget one row up that would look
// half-done left bare — he can veto it. The card's chrome (p-2.5) and its
// placement are pinned against the left-column floors just like RSS's — see
// App.tsx's ics PositionedBlock and scripts/preview.mjs's ics gap probe.
//
// COMPACT-FORMAT AMENDMENT (controller ruling, this task): the brief's own
// starting spec called for up to 4 agenda rows below the "Next: …" line at
// `left-8 top-[62vh]`. Neither survived a real measurement against the
// shipped layout — top-[62vh] is Vercel's slot as of Task 51, and even a
// free band nearby is too tight for 4 text rows. The ruling that replaced
// it: cap agenda rows at TWO (not four) — a fixed, CONSTRUCTION-time cap
// (MAX_AGENDA_ROWS below), not a runtime clamp that only happens to fit
// today's fixture — placed in whichever band scripts/preview.mjs's own
// collision probe actually measures clear (see App.tsx's own comment on the
// ics PositionedBlock for the measured numbers). Arrange mode still lets a
// user drag this anywhere they prefer.
const CALENDAR_ROW_LIMIT: Readonly<Record<WidgetVariant, number>> = {
  compact: 0,
  standard: 2,
  expanded: 5,
}

export function calendarPresentationState(
  state: AsyncResourceState,
  hasData: boolean,
  hasNext: boolean,
): WidgetPresentationState {
  if (!hasData) return state.operation === 'error' ? 'hard-error' : 'loading'
  if (!hasNext) return 'empty'
  if (state.freshness === 'stale' || state.operation === 'error') return 'stale'
  return 'ready'
}

export default function CalendarWidget({
  stageVariant = 'standard',
  canvasSize,
  docked,
  layoutId,
}: { stageVariant?: WidgetVariant; canvasSize?: CanvasSize; docked?: boolean; layoutId?: string } = {}) {
  // Zero-hooks-in-the-gate split, same as every other connector widget
  // (RssWidget/CryptoWidget's own doc comments): the one useStoredKey read
  // runs every render (Rules of Hooks stay satisfied), but a disabled
  // connector, or an enabled one with no calendars yet, never mounts
  // CalendarInner and therefore never runs useConnectorSnapshot's own
  // subscribe/refresh or the 60s tick below.
  const [connectors] = useStoredKey('connectors')
  // BodyProps.config-style narrowing, same rationale as every sibling
  // widget: connectors.ics is the generic ConnectorConfig union at the type
  // level (schema.ts ties every id to the same union), but only the ics
  // connector ever writes here — one documented cast.
  const ics = connectors?.ics as IcsConfig | undefined
  // icsCalendarsOf (Task 1) is now the ONLY place that understands both
  // at-rest shapes (new `calendars` array, legacy single `url`) and defends
  // every malformed-entry edge a hand-edited/backup-restored config can hit
  // structurally — this gate just checks enabled + non-empty.
  const calendars = icsCalendarsOf(ics)
  // icsViewOf (Task 1) reads config.view/upcomingCount with the same
  // read-time-tolerance discipline as icsCalendarsOf — an absent or
  // malformed value defaults rather than throwing. Read unconditionally
  // (before the gate below) so the Rules-of-Hooks-free gate stays a single
  // early return; icsViewOf itself is a pure function, not a hook.
  const { view, upcomingCount, meetLinks } = icsViewOf(ics)
  if (layoutId) {
    return (
      <UnifiedCalendarWidget
        layoutId={layoutId}
        ics={ics}
        calendars={calendars}
        holidayConfig={connectors?.publicHolidays as PublicHolidaysConfig | undefined}
        googleConfig={connectors?.googleCalendar as GoogleCalendarConfig | undefined}
        microsoftConfig={connectors?.microsoftCalendar as MicrosoftCalendarConfig | undefined}
        canvasSize={canvasSize ?? (stageVariant === 'compact' ? 'compact' : 'standard')}
        docked={docked}
      />
    )
  }
  if (!ics?.enabled || calendars.length === 0) return null
  // key: a config change (add/remove/reorder, OR a view-mode/count change)
  // REMOUNTS the inner widget so selectAgenda re-runs from a clean slate
  // against the new calendars/view. The remount ALONE does not force a
  // refetch — useConnectorSnapshot's mount effect only fetches when the
  // cached snapshot is stale or absent (its own TTL-gated contract, see
  // that hook's doc comment). What actually makes an add/remove refresh
  // immediately (and is what makes the spec's index-keyed-fallback edge
  // transient) is IcsBody (Connectors.tsx) deleting connectorSnapshots.ics
  // as part of that same write — the remounted widget then finds no
  // snapshot at all and fetches right away. A view-mode/count-only change
  // does NOT clear the snapshot (IcsBody's own clearIcsSnapshot doc
  // comment), so it remounts against the same cached data with no
  // unnecessary fetch.
  return (
    <CalendarInner
      config={ics}
      key={[view, upcomingCount, ...calendars.map((c) => c.url)].join('\n')}
      calendars={calendars}
      view={view}
      upcomingCount={upcomingCount}
      meetLinks={meetLinks}
      stageVariant={stageVariant}
      canvasSize={canvasSize ?? (stageVariant === 'compact' ? 'compact' : 'standard')}
      docked={docked}
    />
  )
}

const DISABLED_ICS: IcsConfig = { enabled: false, calendars: [] }
const DISABLED_HOLIDAYS: PublicHolidaysConfig = { enabled: false, countryCode: 'US' }

function UnifiedCalendarWidget({
  layoutId,
  ics,
  calendars,
  holidayConfig,
  googleConfig,
  microsoftConfig,
  canvasSize,
  docked = false,
}: {
  layoutId: string
  ics: IcsConfig | undefined
  calendars: IcsCalendar[]
  holidayConfig: PublicHolidaysConfig | undefined
  googleConfig: GoogleCalendarConfig | undefined
  microsoftConfig: MicrosoftCalendarConfig | undefined
  canvasSize: CanvasSize
  docked?: boolean
}) {
  const storage = useStorage()
  const [preferences] = useStoredKey('calendarPreferences')
  const [weekStart] = useStoredKey('calendarWeekStart')
  const localDay = useLocalDay()
  const now = useNow(60_000)
  const google = useGoogleCalendar()
  const microsoft = useMicrosoftCalendar()
  const activeIcs = ics?.enabled && calendars.length > 0 ? ics : DISABLED_ICS
  const countryCode = normalizeHolidayCountryCode(holidayConfig?.countryCode)
  const activeHolidays = holidayConfig?.enabled && countryCode
    ? { ...holidayConfig, countryCode }
    : DISABLED_HOLIDAYS

  const icsSnapshot = useConnectorSnapshot<IcsData>(
    'ics',
    activeIcs,
    (previous) => fetchIcs(calendars, Date.now(), previous, localDay.timeZone),
    undefined,
    { timeZone: localDay.timeZone },
    isIcsData,
  )
  const holidaySnapshot = useConnectorSnapshot<PublicHolidaysData>(
    'publicHolidays',
    activeHolidays,
    () => fetchPublicHolidays(activeHolidays.countryCode, localDay.now),
    undefined,
    localDay.key,
    isPublicHolidaysData,
  )
  const preference = calendarPreferenceFor(preferences, layoutId)
  const [focusView, setFocusView] = useState(false)
  const holidays = preference.includePublicHolidays
    ? holidaySnapshot.data?.holidays ?? []
    : []
  const items = composeCalendarItems({
    events: icsSnapshot.data?.events ?? [],
    icsCalendars: calendars,
    googleConfig,
    googleSnapshot: google.snapshot,
    microsoftConfig,
    microsoftSnapshot: microsoft.snapshot,
    holidays,
    includeHolidays: preference.includePublicHolidays,
    now,
    timeZone: localDay.timeZone,
  })
  const setView = (defaultView: 'agenda' | 'month', focus = false) => {
    if (defaultView === preference.defaultView) return
    setFocusView(focus)
    void updateCalendarLayoutPreference(storage, layoutId, { defaultView })
  }

  if (docked) {
    const next = items[0]
    return next ? <DockLine label="Calendar" facts={[next.title, agendaWhen(next, localDay.timeZone)]} /> : null
  }

  if (canvasSize === 'compact') {
    return (
      <TierFrame label="Calendar" tier="compact" state={items.length > 0 ? 'ready' : 'empty'} className="calendar-refined calendar-refined--compact gap-3 px-3 py-3">
        <header className="flex items-center justify-between gap-2"><strong className="text-[13px] font-semibold">Calendar</strong><span className="text-[11px] text-fg-muted">{shortCalendarDate(localDay.key)}</span></header>
        <CalendarAgenda items={items} limit={1} tier="compact" todayKey={localDay.key} timeZone={localDay.timeZone} emptyLabel="Nothing coming up." />
      </TierFrame>
    )
  }

  if (canvasSize === 'full') {
    return (
      <TierFrame label="Calendar" tier="full" state={items.length > 0 ? 'ready' : 'empty'} className="calendar-refined calendar-refined--full p-4">
        <div
          data-calendar-full-composition
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-start gap-4"
        >
          <div data-testid="calendar-full-month" className="min-w-0">
            <CalendarMonth items={items} holidays={holidays} todayKey={localDay.key} weekStart={weekStart ?? 'locale'} timeZone={localDay.timeZone} roomy />
          </div>
          <section data-testid="calendar-full-agenda" aria-label="Agenda" className="min-w-0 border-l border-panel-border pl-4">
            <CalendarAgenda items={items} limit={3} tier="full" todayKey={localDay.key} timeZone={localDay.timeZone} emptyLabel="Nothing coming up." />
          </section>
        </div>
      </TierFrame>
    )
  }

  const viewTabs = <CalendarViewTabs active={preference.defaultView} onChange={setView} focusActive={focusView} />
  return (
    <TierFrame label="Calendar" tier="standard" state={items.length > 0 ? 'ready' : 'empty'} className="calendar-refined calendar-refined--standard justify-start gap-1.5 px-3 py-2">
      <div data-calendar-standard-composition className="min-h-0 w-full">
        {preference.defaultView === 'month' ? (
          <CalendarMonth items={items} holidays={holidays} todayKey={localDay.key} weekStart={weekStart ?? 'locale'} timeZone={localDay.timeZone} viewControl={viewTabs} />
        ) : (
          <>
            <div className="flex min-h-7 items-center justify-between gap-2">
              <strong className="text-[13px] font-semibold">Calendar</strong>
              {viewTabs}
            </div>
            <CalendarAgenda items={items} limit={3} tier="standard" todayKey={localDay.key} timeZone={localDay.timeZone} emptyLabel="Nothing coming up." />
          </>
        )}
      </div>
    </TierFrame>
  )
}

function CalendarViewTabs({ active, onChange, focusActive }: { active: 'agenda' | 'month'; onChange: (view: 'agenda' | 'month', focus?: boolean) => void; focusActive: boolean }) {
  const activeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (focusActive) activeButton.current?.focus() }, [active, focusActive])
  return (
    <div role="tablist" aria-label="Calendar view" className="inline-flex shrink-0 rounded-lg border border-panel-border bg-black/10 p-0.5">
      {(['agenda', 'month'] as const).map((view) => (
        <button key={view} ref={active === view ? activeButton : undefined} type="button" role="tab" tabIndex={active === view ? 0 : -1} aria-selected={active === view} onClick={() => onChange(view)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          onChange(event.key === 'Home' ? 'agenda' : event.key === 'End' ? 'month' : active === 'agenda' ? 'month' : 'agenda', true)
        }} className={`min-h-6 rounded-md px-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-accent ${active === view ? 'bg-panel-border text-fg' : 'text-fg-muted hover:text-fg'}`}>
          {view === 'agenda' ? 'Agenda' : 'Month'}
        </button>
      ))}
    </div>
  )
}

function CalendarAgenda({
  items,
  limit,
  timeZone,
  emptyLabel,
  tier,
  todayKey,
}: {
  items: readonly CalendarAgendaItem[]
  limit: number
  timeZone: string
  emptyLabel: string
  tier: 'compact' | 'standard' | 'full'
  todayKey: string
}) {
  const longTitles = items.slice(0, limit).some((item) => item.title.length > 42)
  const severalDays = items.slice(0, limit).some((item) => item.dateKey !== items[0]?.dateKey)
  const visible = items.slice(0, (tier !== 'compact' && longTitles) || (tier === 'standard' && severalDays) ? Math.min(2, limit) : limit)
  if (visible.length === 0) return <p className="text-sm text-fg-muted">{emptyLabel}</p>
  return (
    <ul className={`calendar-readable-agenda calendar-readable-agenda--${tier} ${longTitles ? 'calendar-readable-agenda--long' : ''}`}>
      {visible.map((item, index) => {
        const color = item.sourceColor
        const dayKey = item.dateKey < todayKey ? todayKey : item.dateKey
        const previous = visible[index - 1]
        const showDay = tier !== 'compact' && (!previous || (previous.dateKey < todayKey ? todayKey : previous.dateKey) !== dayKey)
        const when = item.allDay ? 'All day' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(item.start)
        const fullWhen = item.allDay ? `${agendaWhen(item, timeZone)} · All day` : `${agendaWhen(item, timeZone)} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(item.end)}`
        return (
          <li key={`${item.authority}-${item.sourceId}-${item.kind === 'event' ? item.eventId : item.dateKey}`} aria-label={`${item.title} · ${fullWhen} · ${item.sourceLabel}`} className="min-w-0">
            {showDay ? <p className="calendar-agenda-day">{dayKey === todayKey ? 'Today · ' : ''}{shortCalendarDate(dayKey)}</p> : null}
            <div className="calendar-agenda-event">
            <span
              data-calendar-color={color}
              className={`calendar-agenda-color ${isCalendarColor(color) ? calendarColorClass(color) : ''}`}
              style={!isCalendarColor(color) ? { backgroundColor: color } : undefined}
              aria-hidden
            />
            <time dateTime={item.allDay ? item.dateKey : new Date(item.start).toISOString()} title={fullWhen} className="calendar-agenda-time">{when}</time>
            <span className="calendar-agenda-title" title={item.title}>{item.title}</span>
            <span data-calendar-source-label title={item.sourceLabel} className="calendar-agenda-source min-w-0 truncate text-[11px] text-fg-muted">{item.sourceLabel}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function agendaWhen(item: CalendarAgendaItem, timeZone: string): string {
  const date = new Date(`${item.dateKey}T12:00:00`)
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
  if (item.allDay) return day
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(item.start)
  return `${day}, ${time}`
}

function CalendarMonth({ items, holidays, todayKey, weekStart, timeZone, viewControl, roomy = false }: { items: readonly CalendarAgendaItem[]; holidays: readonly PublicHoliday[]; todayKey: string; weekStart: 'locale' | 'sunday' | 'monday'; timeZone: string; viewControl?: ReactNode; roomy?: boolean }) {
  const [todayYear, todayMonth] = todayKey.split('-').map(Number)
  const [view, setView] = useState(() => new Date(todayYear!, todayMonth! - 1, 1))
  const locale = typeof navigator === 'undefined' ? 'en-US' : navigator.language
  const cells = calendarMonthCells(view, weekStart, locale)
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view)
  const shortLabel = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(view)
  const rowCount = cells.length / 7
  const monthKey = `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}`
  const monthHolidays = holidays.filter((holiday) => holiday.date.startsWith(`${monthKey}-`))
  const rowHeight = roomy ? 26 : monthHolidays.length > 0
    ? rowCount === 4 ? 28 : rowCount === 5 ? 24 : 20
    : rowCount === 4 ? 32 : rowCount === 5 ? 28 : 24
  const weekdays = calendarMonthCells(new Date(2026, 1, 1), weekStart, locale)
    .slice(0, 7)
    .map((cell) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(`${cell.key}T12:00:00`)))
  const visibleDateKeys = new Set(cells.map((cell) => cell.key))
  const contextRows = new Map<string, CalendarContextRow[]>()
  for (const holiday of holidays) {
    if (!visibleDateKeys.has(holiday.date)) continue
    const rows = contextRows.get(holiday.date) ?? []
    rows.push({
      key: `holiday:${holiday.date}:${publicHolidayDisplayName(holiday)}`,
      kind: 'holiday',
      title: publicHolidayDisplayName(holiday),
      detail: 'Public holiday',
    })
    contextRows.set(holiday.date, rows)
  }
  for (const item of items) {
    if (item.kind !== 'event' || !visibleDateKeys.has(item.dateKey)) continue
    const rows = contextRows.get(item.dateKey) ?? []
    const color = item.sourceColor
    const when = item.allDay
      ? 'All day'
      : new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(item.start)
    rows.push({
      key: `event:${item.authority}:${item.sourceId}:${item.eventId}`,
      kind: 'event',
      title: item.title,
      detail: `${when} · ${item.sourceLabel}`,
      color,
    })
    contextRows.set(item.dateKey, rows)
  }
  const step = (delta: number) => setView((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  return (
    <div className="min-h-0" data-calendar-density={roomy ? 'roomy' : 'standard'} data-calendar-row-count={rowCount}>
      <div className="flex h-6 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">‹</button>
          <span className="min-w-0 truncate text-sm font-semibold text-fg">{shortLabel}</span>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">›</button>
        </div>
        {viewControl}
      </div>
      <table aria-label={label} className="mt-0.5 w-full table-fixed border-collapse text-center">
        <thead><tr>{weekdays.map((day, index) => <th key={`${day}-${index}`} scope="col" className="pb-px text-[11px] font-medium leading-none text-fg-muted">{day}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr key={row} style={{ height: `${rowHeight}px` }}>
              {cells.slice(row * 7, row * 7 + 7).map((cell) => (
                <td key={cell.key} data-calendar-cell data-cell-key={cell.key} className="p-0 align-middle">
                  {contextRows.has(cell.key) ? (
                    <CalendarContextPopover
                      label={`${shortCalendarDate(cell.key)}, ${contextRows.get(cell.key)!.length} ${contextRows.get(cell.key)!.length === 1 ? 'item' : 'items'}`}
                      heading={longCalendarDate(cell.key)}
                      rows={contextRows.get(cell.key)!}
                      className={`relative mx-auto flex h-full flex-col items-center justify-start rounded-md leading-none ${roomy ? 'w-7 pt-[3px] text-xs' : 'w-6 pt-[2px] text-[11px]'} ${cell.inMonth ? 'text-fg' : 'text-fg-muted/40'} ${cell.key === todayKey ? 'ring-1 ring-accent' : ''} hover:bg-panel-border focus-visible:outline-2 focus-visible:outline-accent`}
                    >
                      <span data-calendar-day-number="">{cell.day}</span>
                      <span
                        aria-hidden
                        data-calendar-occupancy-markers=""
                        className={`mt-1 flex h-[3px] items-center gap-0.5 ${cell.inMonth ? '' : 'opacity-50'}`}
                      >
                        {calendarMarkerColors(contextRows.get(cell.key)!).map((color) => (
                          <span
                            key={color}
                            data-calendar-occupancy-marker=""
                            data-calendar-color={color}
                            className={`rounded-full ${isCalendarColor(color) ? calendarColorClass(color) : ''}`}
                            style={{ width: '3px', height: '3px', ...(!isCalendarColor(color) ? { backgroundColor: color } : {}) }}
                          />
                        ))}
                      </span>
                    </CalendarContextPopover>
                  ) : (
                    <span className={`relative mx-auto flex h-full flex-col items-center justify-start rounded-md leading-none ${roomy ? 'w-7 pt-[3px] text-xs' : 'w-6 pt-[2px] text-[11px]'} ${cell.inMonth ? 'text-fg' : 'text-fg-muted/40'} ${cell.key === todayKey ? 'ring-1 ring-accent' : ''}`}>
                      <span data-calendar-day-number="">{cell.day}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {monthHolidays.length > 0 ? <MonthHolidaySummary holidays={monthHolidays} /> : null}
    </div>
  )
}

function MonthHolidaySummary({ holidays }: { holidays: readonly PublicHoliday[] }) {
  const first = holidays[0]!
  const summary = holidays.length === 1
    ? `${shortCalendarDate(first.date)} ${publicHolidayDisplayName(first)}`
    : `${holidays.length} holidays this month`
  const rows: CalendarContextRow[] = holidays.map((holiday) => ({
    key: `${holiday.date}:${publicHolidayDisplayName(holiday)}`,
    kind: 'holiday',
    title: `${shortCalendarDate(holiday.date)} ${publicHolidayDisplayName(holiday)}`,
    detail: 'Public holiday',
  }))

  return (
    <div data-calendar-holiday-summary="" className="relative mt-0.5 border-t border-panel-border pt-0.5">
      <CalendarContextPopover
        label={summary}
        heading="Holidays this month"
        rows={rows}
        className="min-h-5 max-w-full truncate rounded-md text-left text-[11px] leading-4 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        {holidays.length === 1 ? <><span className="text-accent">{shortCalendarDate(first.date)}</span>{' '}</> : null}
        {holidays.length === 1 ? publicHolidayDisplayName(first) : summary}
      </CalendarContextPopover>
    </div>
  )
}

function calendarMarkerColors(rows: readonly CalendarContextRow[]): string[] {
  return [...new Set(rows.map((row) => row.color ?? 'accent'))].slice(0, 3)
}

function shortCalendarDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`))
}

function longCalendarDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`))
}

function CalendarInner({
  config,
  calendars,
  view,
  upcomingCount,
  meetLinks,
  stageVariant,
  canvasSize,
  docked,
}: {
  config: IcsConfig
  calendars: IcsCalendar[]
  view: 'today' | 'upcoming' | 'per-calendar'
  upcomingCount: number
  // Task 89 — deliberately NOT folded into CalendarWidget's own `key` above:
  // unlike view/upcomingCount/calendars (which change what selectAgenda
  // computes, so need a clean remount), meetLinks only gates whether the
  // headline's ALREADY-selected `next` event renders its Join anchor — a pure
  // render decision. A toggle flip re-renders this component with a new
  // meetLinks prop through the normal parent-rerender path (useStoredKey's
  // connectors subscription), no remount required.
  meetLinks: boolean
  stageVariant: WidgetVariant
  canvasSize: CanvasSize
  docked?: boolean
}) {
  const localDay = useLocalDay()
  // Re-render cadence: reuses the app's existing minute-scale time source
  // (useNow, exported by Clock.tsx's own module and already parameterized
  // by interval) rather than rolling a second bespoke setInterval — Clock
  // itself calls useNow(1000) for its own 1s second-hand; this widget only
  // needs to notice a MINUTE boundary crossing (relative-time text and
  // which events count as "today's remaining" don't change any faster than
  // that), so a distinct 60_000ms interval is passed. useNow's own cleanup
  // (clearInterval on unmount) covers this call too — nothing bespoke to
  // clean up here.
  const now = useNow(60_000)

  // Stale-while-refreshing, same shape as every other connector widget:
  // cached snapshot renders immediately, one refresh per mount. Date.now()
  // lives at exactly this ONE impure call boundary — fetchIcs forwards it
  // to parseIcs as `windowStart`, and parseIcs itself never calls
  // Date.now() (see ics.ts's own doc comment). `prev` carries the
  // last-known events forward through fetchIcs's own quiet-failure path.
  const { data, state } = useConnectorSnapshot<IcsData>(
    'ics',
    config,
    (prev) => fetchIcs(calendars, Date.now(), prev, localDay.timeZone),
    undefined,
    { timeZone: localDay.timeZone },
    isIcsData,
  )
  if (!data) {
    if (docked) return null
    const presentation = calendarPresentationState(state, false, false)
    return (
      <TierFrame label="Calendar" tier={canvasSize} state={presentation} className="justify-center gap-2 p-3">
        {presentation === 'hard-error' ? (
          <p role="alert" className="text-sm text-fg-muted">Calendar is unavailable. Tab Two will retry automatically.</p>
        ) : (
          <p className="text-sm text-fg-muted">Loading calendar…</p>
        )}
      </TierFrame>
    )
  }

  const nowMs = now.getTime()
  const { next, rows } = selectAgenda(
    data.events,
    nowMs,
    view,
    upcomingCount,
    calendars.length,
    localDay.timeZone,
    CALENDAR_ROW_LIMIT[stageVariant],
  )

  // Single-calendar rule (spec): with exactly one configured calendar, no
  // dots render anywhere — the color-coding only earns its keep once there's
  // more than one calendar to distinguish. `multi` gates every dot below.
  const multi = calendars.length > 1
  const frameState = calendarPresentationState(state, true, next !== null)
  const sourceName = (cal: unknown) => calendarSourceName(cal, calendars)
  const dot = (cal: number) => (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${calendarColorClass(calendarColorOf(calendars[cal]?.color, cal))}`}
    />
  )

  if (!next) {
    // Docked tier (NL-P5 batch 2): no next event -> no fact survives, so the
    // dock line renders nothing (the no-whitespace law), never the empty card.
    if (docked) return null
    return (
      <TierFrame label="Calendar" tier={canvasSize} state={frameState} className="justify-center p-3">
        <p className="text-sm text-fg-muted">
          {view === 'today' ? 'No more events today.' : 'No upcoming events.'}
        </p>
      </TierFrame>
    )
  }

  const relative = isAllDay(next) ? 'All day' : relNext(nowMs, next.start, localDay.timeZone)

  // Docked tier (NL-P5 batch 2): the headline's own title + time strings as
  // one dense line — the SAME next/relative derivation the card renders first.
  if (docked) return <DockLine label="Calendar" facts={[next.summary, relative]} />

  // Task 89 — Join visibility, the HEADLINE event only (never an agenda row —
  // rows render through formatAgendaRow below, which never touches meetUrl):
  // the connector's own meetLinks flag is on, `next` actually carries a link,
  // and its meeting is either already running or starts within 15 minutes.
  // `next.start - nowMs` goes negative once the meeting has started — still
  // <=15*60_000, so an in-progress meeting keeps showing Join until `end`.
  // !isAllDay(next) (whole-SP review finding): an all-day block's start is
  // always local midnight, deeply in the past for a multi-day event already
  // in progress, so start-now<=15min is trivially true for its ENTIRE span,
  // and selectAgenda's own fallback (see its doc comment) lets an all-day
  // event become `next` once no timed event remains — without this
  // exclusion a multi-day "Company Offsite" with a meetUrl would show Join
  // continuously for days. Join is a real-time meeting affordance; an
  // all-day block is not a meeting you join at a moment. `relative` above
  // already computes isAllDay(next) — reused here, not recomputed.
  const showJoin =
    !isAllDay(next) && meetLinks && !!next.meetUrl && next.start - nowMs <= 15 * 60_000 && nowMs < next.end

  return (
    <TierFrame label="Calendar" tier={canvasSize} state={frameState} className="gap-2 p-3">
      <p
        aria-label={multi ? `Next: ${next.summary} · ${relative} · ${sourceName(next.cal)}` : undefined}
        className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg"
      >
        {multi && dot(next.cal)}
        {/* min-w-0 (not just the row's own): with the Join anchor as a shrink-0
            sibling, this span must be free to shrink below its own content
            width for `truncate` to actually bite — otherwise a flex item's
            default min-width:auto would push Join out past the card edge
            before the title ever gives up space. */}
        <span className="block min-w-0 truncate">
          Next: {next.summary} · {relative}
        </span>
        {multi && (
          <span data-calendar-source title={sourceName(next.cal)} className="max-w-24 shrink-0 truncate text-[11px] font-normal text-fg-muted">
            {sourceName(next.cal)}
          </span>
        )}
        {showJoin && (
          <a
            href={next.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={multi ? `Join ${next.summary} — ${sourceName(next.cal)}` : undefined}
            className="inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center text-accent transition-colors hover:text-accent/80 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Join
          </a>
        )}
      </p>
      {rows.length > 0 && (
        <ul className="flex min-h-0 flex-col gap-1">
          {rows.map((ev) => {
            const rowText = formatAgendaRow(ev, nowMs, localDay.timeZone)
            return (
              <li
                // `cal` included: the spec explicitly promises an event on two
                // calendars renders TWICE — same start+summary, different
                // cal — so start+summary alone collides (React duplicate-key
                // warning, undefined reconciliation between the two rows).
                key={`${ev.cal}-${ev.start}-${ev.summary}`}
                aria-label={multi ? `${rowText} · ${sourceName(ev.cal)}` : undefined}
                className="flex min-w-0 items-center gap-1.5 text-sm leading-5 text-fg-muted"
              >
                {multi && dot(ev.cal)}
                <span className="block min-w-0 truncate">{rowText}</span>
                {multi && (
                  <span data-calendar-source title={sourceName(ev.cal)} className="max-w-24 shrink-0 truncate text-[11px] text-fg-muted">
                    {sourceName(ev.cal)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </TierFrame>
  )
}

/** Calendar display identity is deliberately derived only from non-secret
 *  configured names or the event's numeric source slot. Capability-bearing
 *  feed URLs never participate in the fallback. */
export function calendarSourceName(cal: unknown, calendars: readonly IcsCalendar[]): string {
  if (typeof cal !== 'number' || !Number.isInteger(cal) || cal < 0) return 'Calendar'
  const configured = calendars[cal]?.name
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return `Calendar ${cal + 1}`
}

/** The active IANA zone's calendar-day bounds. The shared helper constructs
 *  the next calendar date, so DST days may be 23h or 25h. */
function localDayRange(t: number, timeZone: string): { start: number; end: number } {
  return zonedLocalDayRange(t, timeZone)
}

/** Explicit parser semantics: timed-midnight events never masquerade as DATE. */
function isAllDay(ev: IcsEvent): boolean {
  return ev.allDay
}

/** Day prefix for a row that isn't today: weekday short for the next 6
 *  days, 'Mon DD' beyond. null (no token) for anything starting today OR
 *  earlier — an in-progress multi-day event renders with the today idiom,
 *  never a past date. */
export function calendarDayToken(start: number, now: number, timeZone: string): string | null {
  const dayDiff = calendarDayDifference(now, start, timeZone)
  if (dayDiff <= 0) return null
  if (dayDiff <= 6)
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(new Date(start))
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(start))
}

/** `{token} · {summary}` (or bare `All day · {summary}` for today) for an
 *  all-day row, else `{token} HH:MM {summary}` (or bare `HH:MM {summary}`
 *  for today) — the brief's own literal examples ('09:30 Standup', 'All day
 *  · {summary}', 'Sat 09:00 Kickoff', 'Aug 18 15:30 Dentist'). Deliberately a
 *  FIXED 24h zero-padded clock here, not settings.use24Hour (unlike
 *  Clock.tsx's own formatClock): this widget renders no other connector's
 *  cards ever read app settings for their own formatting either
 *  (CryptoWidget/VercelWidget format independently of them too), and every
 *  one of the brief's literal examples is already in that exact zero-padded
 *  24h shape. */
function formatAgendaRow(ev: IcsEvent, now: number, timeZone: string): string {
  const token = calendarDayToken(ev.start, now, timeZone)
  if (isAllDay(ev)) return token ? `${token} · ${ev.summary}` : `All day · ${ev.summary}`
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ev.start))
  return token ? `${token} ${hm} ${ev.summary}` : `${hm} ${ev.summary}`
}

/** Pure selection over an ALREADY-sorted-ascending event list (ics.ts's own
 *  contract): `next` is the earliest UPCOMING event that isn't all-day (an
 *  all-day event always starts at local midnight — the earliest possible
 *  instant of whichever day it's active — so picking strictly-by-start would
 *  make it "Next" on every day it's active, which reads wrong: "Next:
 *  Company Holiday · All day" is a worse headline than seeing the holiday as
 *  an agenda row and the next REAL appointment as the headline). Falls back
 *  to the earliest upcoming event of any kind (including all-day) only when
 *  no timed one remains, so a day that's ALL-DAY-only still shows something
 *  rather than the empty state. Headline selection is the SAME across all
 *  three view modes — only `rows` varies by `view`:
 *
 *   - 'today' (unchanged behavior): up to MAX_AGENDA_ROWS other upcoming
 *     events that overlap TODAY's local calendar day (`ev.start < todayEnd`
 *     — not `next` itself), in their already-ascending order. All-day events
 *     sort first among them FOR FREE (their start is local midnight, earlier
 *     than any timed event that day), so no separate all-day-priority sort
 *     step is needed — see the brief's own "All-day events render … first"
 *     line.
 *   - 'upcoming': the next `upcomingCount` other upcoming events regardless
 *     of day, in ascending order — the day tokens (dayToken/formatAgendaRow)
 *     are what make a multi-day list readable.
 *   - 'per-calendar': each calendar's own soonest not-already-shown event
 *     (i.e. excluding `next`), ONE row per calendar, in calendar-INDEX order
 *     (0, 1, 2, …) — not chronological order across calendars. A calendar
 *     with nothing left upcoming simply contributes no row. */
function selectAgenda(
  events: IcsEvent[],
  now: number,
  view: 'today' | 'upcoming' | 'per-calendar',
  upcomingCount: number,
  calendarCount: number,
  timeZone: string,
  rowLimit: number,
): { next: IcsEvent | null; rows: IcsEvent[] } {
  const upcoming = events.filter((ev) => ev.end > now)
  const timed = upcoming.filter((ev) => !isAllDay(ev))
  const next = timed[0] ?? upcoming[0] ?? null
  if (!next) return { next: null, rows: [] }

  const others = upcoming.filter((ev) => ev !== next)
  if (view === 'upcoming') return { next, rows: rowLimit === 0 ? [] : others.slice(0, upcomingCount) }
  if (view === 'per-calendar') {
    const rows: IcsEvent[] = []
    for (let i = 0; i < calendarCount; i++) {
      const first = others.find((ev) => ev.cal === i)
      if (first) rows.push(first)
    }
    return { next, rows: rowLimit === 0 ? [] : rows }
  }
  return {
    next,
    rows: others.filter((ev) => eventStartsBeforeLocalDayEnd(ev.start, now, timeZone)).slice(0, rowLimit),
  }
}

export function eventStartsBeforeLocalDayEnd(start: number, now: number, timeZone: string): boolean {
  return start < localDayRange(now, timeZone).end
}

/** now/start both epoch ms, both read in the LOCAL runtime timezone —
 *  forward-looking sibling to vercel.ts's own relAge (same floor-to-largest-
 *  unit idiom), with two calendar-aware upgrades an AGE never needs (an age
 *  is always in the past, so "today vs tomorrow" never arises there):
 *
 *   - under 60s (or already started/negative): 'now' — an event this close
 *     or already in progress isn't meaningfully counted down.
 *   - under 60 MINUTES: 'in {n} min', regardless of whether that crosses a
 *     midnight boundary — "in 10 min" beats "tomorrow 00:05" for something
 *     that's 10 minutes away, even if the clock just ticked over.
 *   - 60+ minutes away, same LOCAL calendar day as `now`: 'in {n} h'
 *     (floored — always >=1 by construction, since the branch above already
 *     claimed everything under 60 minutes).
 *   - 60+ minutes away, the NEXT local calendar day: 'tomorrow HH:MM'.
 *   - two or more local calendar days out: '{Weekday} HH:MM' — the same
 *     idiom one step further, rather than open-ended day counting.
 *
 *  Calendar-day math uses calendar ordinals in the active IANA zone, never
 *  elapsed 24-hour division, so DST transitions keep exact day labels. */
export function relNext(now: number, start: number, timeZone: string = resolvedLocalTimeZone()): string {
  const diffMs = start - now
  if (diffMs < 60_000) return 'now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `in ${diffMin} min`

  const nowDay = localDayRange(now, timeZone)
  if (start < nowDay.end) return `in ${Math.floor(diffMs / 3_600_000)} h`

  const dayDiff = calendarDayDifference(now, start, timeZone)
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(start))
  if (dayDiff === 1) return `tomorrow ${hm}`
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(new Date(start))
  return `${weekday} ${hm}`
}
