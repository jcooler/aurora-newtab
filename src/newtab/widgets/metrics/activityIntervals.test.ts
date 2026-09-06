import { describe, expect, it } from 'vitest'

import { emptyMetricsHistory, summarizeMetrics } from '../../../metrics/history'
import type { MetricRange } from '../../../metrics/types'
import { activityIntervals, activeDayCount } from './activityIntervals'

const installationId = '11111111-1111-4111-8111-111111111111'

describe('active-day chart intervals', () => {
  it('counts a date once regardless of how many categories were active', () => {
    const summary = summarizeMetrics(emptyMetricsHistory(installationId), '7d', '2026-09-05')
    summary.days[0].tasks.completed = 3
    summary.days[0].focus.minutes = 90
    summary.days[0].habits.completed = 2
    summary.days[6].development.commits = 1
    expect(activeDayCount(summary)).toBe(2)
    expect(activityIntervals(summary).map((interval) => interval.activeDays)).toEqual([1, 0, 0, 0, 0, 0, 1])
  })

  it.each([
    ['7d', 7, '2026-08-30', '2026-08-30', '2026-09-05', 1],
    ['30d', 6, '2026-08-07', '2026-08-11', '2026-09-01', 5],
    ['90d', 13, '2026-06-08', '2026-06-14', '2026-08-31', 6],
    ['365d', 14, '2025-09-06', '2025-10-03', '2026-09-05', 1],
  ] as const)('keeps exact boundaries and short final intervals for %s', (range, count, firstStart, firstEnd, lastStart, lastDays) => {
    const summary = summarizeMetrics(emptyMetricsHistory(installationId), range as MetricRange, '2026-09-05')
    summary.days.at(-1)!.tasks.completed = 1
    const intervals = activityIntervals(summary)
    expect(intervals).toHaveLength(count)
    expect(intervals[0]).toMatchObject({ start: firstStart, end: firstEnd, activeDays: 0 })
    expect(intervals.at(-1)).toEqual({ start: lastStart, end: '2026-09-05', dayCount: lastDays, activeDays: 1 })
  })

  it('counts historical legacy activity consistently without exposing a new Fitness category', () => {
    const summary = summarizeMetrics(emptyMetricsHistory(installationId), '7d', '2026-09-05')
    summary.days[1].fitness.activities = 1
    expect(activeDayCount(summary)).toBe(1)
    expect(activityIntervals(summary)[1].activeDays).toBe(1)
  })
})
