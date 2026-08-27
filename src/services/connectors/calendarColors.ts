export const CALENDAR_COLORS = ['accent', 'sky', 'emerald', 'amber', 'fuchsia'] as const
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

const COLOR_CLASSES: Readonly<Record<CalendarColor, string>> = Object.freeze({
  accent: 'bg-accent',
  sky: 'bg-sky-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  fuchsia: 'bg-fuchsia-400',
})

export function isCalendarColor(value: unknown): value is CalendarColor {
  return typeof value === 'string' && (CALENDAR_COLORS as readonly string[]).includes(value)
}

/** Resolves legacy/malformed values at read time without writing an Auto value. */
export function calendarColorOf(value: unknown, index: number): CalendarColor {
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0
  const normalizedIndex = ((safeIndex % CALENDAR_COLORS.length) + CALENDAR_COLORS.length) % CALENDAR_COLORS.length
  return isCalendarColor(value) ? value : CALENDAR_COLORS[normalizedIndex]!
}

export function calendarColorClass(color: CalendarColor): string {
  return COLOR_CLASSES[color]
}
