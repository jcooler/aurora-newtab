import { zonedDateKey } from '../../../lib/dates'
import type { MonthCell } from '../../../lib/monthGrid'
import type { IcsEvent } from '../../../services/connectors/ics'
import { publicHolidayDisplayName, type PublicHoliday } from '../../../services/connectors/publicHolidays'
import type { CalendarWeekStart } from '../../../lib/layout/namedLayouts'
import type {
  GoogleCalendarConfig,
  GoogleCalendarSnapshot,
  IcsCalendar,
} from '../../../services/connectors/types'
import { calendarColorOf } from '../../../services/connectors/calendarColors'

export type { CalendarWeekStart } from '../../../lib/layout/namedLayouts'

export type CalendarAgendaItem =
  | {
      kind: 'event'
      authority: 'ics' | 'google_calendar'
      sourceId: string
      sourceLabel: string
      sourceColor: string
      eventId: string
      title: string
      dateKey: string
      start: number
      end: number
      allDay: boolean
      cal?: number
      eventUrl?: string
      meetUrl?: string
    }
  | {
      kind: 'holiday'
      authority: 'public_holidays'
      sourceId: 'public_holidays'
      sourceLabel: 'Public holidays'
      sourceColor: 'accent'
      title: string
      dateKey: string
      start: number
      end: number
      allDay: true
    }

function validDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
}

function dateOrdinal(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function normalizedTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\blabour\b/g, 'labor')
}

function displayTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function composeCalendarItems({
  events,
  icsCalendars = [],
  googleConfig,
  googleSnapshot,
  holidays,
  includeHolidays,
  now,
  timeZone,
}: {
  events: readonly IcsEvent[]
  icsCalendars?: readonly IcsCalendar[]
  googleConfig?: GoogleCalendarConfig | null
  googleSnapshot?: GoogleCalendarSnapshot | null
  holidays: readonly PublicHoliday[]
  includeHolidays: boolean
  now: number | Date
  timeZone: string
}): CalendarAgendaItem[] {
  const nowMs = now instanceof Date ? now.getTime() : now
  const todayKey = zonedDateKey(nowMs, timeZone)
  const icsItems: CalendarAgendaItem[] = events.flatMap((event, index) => {
    const title = displayTitle(event.summary)
    if (!title || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= nowMs) return []
    return [{
      kind: 'event' as const,
      authority: 'ics' as const,
      sourceId: `ics:${event.cal}`,
      sourceLabel: icsCalendars[event.cal]?.name ?? `Calendar ${event.cal + 1}`,
      sourceColor: calendarColorOf(icsCalendars[event.cal]?.color, event.cal),
      eventId: `ics:${event.cal}:${event.start}:${index}`,
      title,
      dateKey: zonedDateKey(event.start, timeZone),
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      cal: event.cal,
      ...(event.meetUrl ? { meetUrl: event.meetUrl } : {}),
    }]
  })
  const googleAccounts = new Map((googleConfig?.enabled ? googleConfig.accounts : []).map((account) => (
    [account.connectionId, account] as const
  )))
  const googleItems: CalendarAgendaItem[] = (googleSnapshot?.calendars ?? []).flatMap((source) => {
    const account = googleAccounts.get(source.connectionId)
    const calendar = account?.calendars.find((candidate) => candidate.calendarId === source.calendarId)
    if (!account || !calendar) return []
    return source.events.flatMap((event): CalendarAgendaItem[] => {
      const title = displayTitle(event.title)
      const dateKey = event.allDay ? event.startDate : zonedDateKey(event.start, timeZone)
      const stillRelevant = event.allDay
        ? typeof event.endDate === 'string' && event.endDate > todayKey
        : event.end > nowMs
      if (!title || !dateKey || !stillRelevant) return []
      return [{
        kind: 'event',
        authority: 'google_calendar',
        sourceId: `${source.connectionId}\n${source.calendarId}`,
        sourceLabel: `${calendar.name} · ${account.displayEmail}`,
        sourceColor: calendar.color,
        eventId: event.eventId,
        title,
        dateKey,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        ...(event.calendarUrl ? { eventUrl: event.calendarUrl } : {}),
        ...(event.meetUrl ? { meetUrl: event.meetUrl } : {}),
      }]
    })
  })
  const holidayCandidates: CalendarAgendaItem[] = includeHolidays
    ? holidays.flatMap((holiday) => {
        const title = displayTitle(publicHolidayDisplayName(holiday))
        if (!title || !validDateKey(holiday.date) || holiday.date < todayKey) return []
        const start = dateOrdinal(holiday.date)
        return [{
          kind: 'holiday' as const,
          authority: 'public_holidays' as const,
          sourceId: 'public_holidays' as const,
          sourceLabel: 'Public holidays' as const,
          sourceColor: 'accent' as const,
          title,
          dateKey: holiday.date,
          start,
          end: start + 86_400_000,
          allDay: true as const,
        }]
      })
    : []
  const holidayIdentities = new Set(holidayCandidates.map((item) => `${item.dateKey}\n${normalizedTitle(item.title)}`))
  const deduplicatedIcs = includeHolidays
    ? icsItems.filter((item) => !item.allDay || !holidayIdentities.has(`${item.dateKey}\n${normalizedTitle(item.title)}`))
    : icsItems
  const occupied = new Set(deduplicatedIcs.map((item) => `${item.dateKey}\n${normalizedTitle(item.title)}`))
  const holidayItems = holidayCandidates.filter((item) => {
    const identity = `${item.dateKey}\n${normalizedTitle(item.title)}`
    if (occupied.has(identity)) return false
    occupied.add(identity)
    return true
  })

  return [...deduplicatedIcs, ...googleItems, ...holidayItems].sort((left, right) => {
    const dateOrder = left.dateKey.localeCompare(right.dateKey)
    if (dateOrder !== 0) return dateOrder
    const rank = (item: CalendarAgendaItem) => item.kind === 'event' && !item.allDay ? 0 : item.kind === 'event' ? 1 : 2
    const authorityRank = (item: CalendarAgendaItem) => item.authority === 'ics'
      ? 0
      : item.authority === 'google_calendar' ? 1 : 2
    return rank(left) - rank(right)
      || left.start - right.start
      || authorityRank(left) - authorityRank(right)
      || left.sourceId.localeCompare(right.sourceId, 'en-US')
      || left.title.localeCompare(right.title, 'en-US')
      || (left.kind === 'event' && right.kind === 'event' ? left.eventId.localeCompare(right.eventId, 'en-US') : 0)
  })
}

function localeWeekStart(locale: string): 0 | 1 {
  const candidate = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number }
    weekInfo?: { firstDay: number }
  }
  const firstDay = candidate.getWeekInfo?.().firstDay ?? candidate.weekInfo?.firstDay
  if (firstDay === 1) return 1
  if (firstDay === 7) return 0
  const region = candidate.region ?? candidate.maximize().region
  return new Set(['US', 'CA', 'JP', 'PH', 'TW']).has(region ?? '') ? 0 : 1
}

function keyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calendarMonthCells(
  month: Date,
  weekStart: CalendarWeekStart,
  locale: string,
): MonthCell[] {
  const year = month.getFullYear()
  const month0 = month.getMonth()
  const origin = weekStart === 'sunday' ? 0 : weekStart === 'monday' ? 1 : localeWeekStart(locale)
  const first = new Date(year, month0, 1)
  const leading = (first.getDay() - origin + 7) % 7
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, month0, 1 - leading + index)
    return {
      key: keyFromDate(date),
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month0,
    }
  })
}
