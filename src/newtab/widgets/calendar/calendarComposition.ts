import { zonedDateKey } from '../../../lib/dates'
import type { MonthCell } from '../../../lib/monthGrid'
import type { IcsEvent } from '../../../services/connectors/ics'
import type { PublicHoliday } from '../../../services/connectors/publicHolidays'
import type { CalendarWeekStart } from '../../../lib/layout/namedLayouts'

export type { CalendarWeekStart } from '../../../lib/layout/namedLayouts'

export type CalendarAgendaItem =
  | {
      kind: 'event'
      title: string
      dateKey: string
      start: number
      end: number
      allDay: boolean
      cal: number
      meetUrl?: string
    }
  | {
      kind: 'holiday'
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
}

function displayTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function composeCalendarItems({
  events,
  holidays,
  includeHolidays,
  now,
  timeZone,
}: {
  events: readonly IcsEvent[]
  holidays: readonly PublicHoliday[]
  includeHolidays: boolean
  now: number | Date
  timeZone: string
}): CalendarAgendaItem[] {
  const nowMs = now instanceof Date ? now.getTime() : now
  const todayKey = zonedDateKey(nowMs, timeZone)
  const eventItems: CalendarAgendaItem[] = events.flatMap((event) => {
    const title = displayTitle(event.summary)
    if (!title || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= nowMs) return []
    return [{
      kind: 'event' as const,
      title,
      dateKey: zonedDateKey(event.start, timeZone),
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      cal: event.cal,
      ...(event.meetUrl ? { meetUrl: event.meetUrl } : {}),
    }]
  })
  const occupied = new Set(eventItems.map((item) => `${item.dateKey}\n${normalizedTitle(item.title)}`))
  const holidayItems: CalendarAgendaItem[] = includeHolidays
    ? holidays.flatMap((holiday) => {
        const title = displayTitle(holiday.name || holiday.localName || '')
        if (!title || !validDateKey(holiday.date) || holiday.date < todayKey) return []
        const identity = `${holiday.date}\n${normalizedTitle(title)}`
        if (occupied.has(identity)) return []
        occupied.add(identity)
        const start = dateOrdinal(holiday.date)
        return [{ kind: 'holiday' as const, title, dateKey: holiday.date, start, end: start + 86_400_000, allDay: true as const }]
      })
    : []

  return [...eventItems, ...holidayItems].sort((left, right) => {
    const dateOrder = left.dateKey.localeCompare(right.dateKey)
    if (dateOrder !== 0) return dateOrder
    const rank = (item: CalendarAgendaItem) => item.kind === 'event' && !item.allDay ? 0 : item.kind === 'event' ? 1 : 2
    return rank(left) - rank(right) || left.start - right.start || left.title.localeCompare(right.title)
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
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month0, 1 - leading + index)
    return {
      key: keyFromDate(date),
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month0,
    }
  })
}
