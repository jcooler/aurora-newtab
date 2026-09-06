import type { DailyMetricSummary, MetricRange, MetricSummary } from '../../../metrics/types'

const INTERVAL_DAYS: Record<MetricRange, number> = { '7d': 1, '30d': 5, '90d': 7, '365d': 28 }

function isActive(day: DailyMetricSummary): boolean {
  return day.habits.completed > 0 || day.habits.tracked > 0
    || day.focus.sessions > 0 || day.focus.minutes > 0
    || day.tasks.completed > 0 || day.tasks.carriedForward > 0
    || day.calendar.events > 0 || day.calendar.busyMinutes > 0
    || Object.values(day.development).some((value) => value > 0)
    || day.fitness.activities > 0 || day.fitness.durationMinutes > 0 || day.fitness.distanceMeters > 0
}

export function activeDayCount(summary: MetricSummary): number {
  return summary.days.filter(isActive).length
}

export function activityIntervals(summary: MetricSummary) {
  const width = INTERVAL_DAYS[summary.range]
  const intervals: { start: string; end: string; dayCount: number; activeDays: number }[] = []
  for (let offset = 0; offset < summary.days.length; offset += width) {
    const days = summary.days.slice(offset, offset + width)
    intervals.push({ start: days[0].date, end: days.at(-1)!.date, dayCount: days.length, activeDays: days.filter(isActive).length })
  }
  return intervals
}
