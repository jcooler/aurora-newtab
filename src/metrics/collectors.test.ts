import { describe, expect, it } from 'vitest'
import type { Habit, TodoList } from '../lib/storage/schema'
import type { ConnectorSnapshot } from '../services/connectors/types'
import {
  collectCalendarSeries,
  collectConnectorSeries,
  collectDevelopmentSeries,
  collectFitnessSeries,
  collectHabitSeries,
  collectTaskSeries,
} from './collectors'

function localEpoch(date: string, hour = 0, minute = 0): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute).getTime()
}

describe('habit aggregates', () => {
  it('groups completion, tracked count, and the longest current streak without persisting habit identity', () => {
    const habits: Habit[] = [
      { id: 'private-run-id', name: 'Private morning run', createdAt: localEpoch('2026-08-31'), log: ['2026-08-31', '2026-09-01', '2026-09-02'] },
      { id: 'private-read-id', name: 'Read private book', createdAt: localEpoch('2026-09-02'), log: ['2026-09-02'] },
    ]

    expect(collectHabitSeries(habits, '2026-09-02')).toEqual([
      { date: '2026-08-31', source: 'habits', sourceInstanceId: 'local-habits', values: { kind: 'habits', completed: 1, tracked: 1, streak: 1 } },
      { date: '2026-09-01', source: 'habits', sourceInstanceId: 'local-habits', values: { kind: 'habits', completed: 1, tracked: 1, streak: 2 } },
      { date: '2026-09-02', source: 'habits', sourceInstanceId: 'local-habits', values: { kind: 'habits', completed: 2, tracked: 2, streak: 3 } },
    ])
    expect(JSON.stringify(collectHabitSeries(habits, '2026-09-02'))).not.toMatch(/private|run-id|read-id/i)
  })
})

describe('task aggregates', () => {
  it('counts dated completions and tasks carried into each day without copying task text', () => {
    const lists = [{
      id: 'private-list',
      name: 'Private roadmap',
      items: [
        { id: 'a', text: 'Private launch task', done: true, createdOn: '2026-08-31', completedOn: '2026-09-02' },
        { id: 'b', text: 'Still secret', done: false, createdOn: '2026-09-01' },
        { id: 'legacy', text: 'Undated legacy task', done: false },
      ],
    }] as unknown as TodoList[]

    expect(collectTaskSeries(lists, '2026-09-02')).toEqual([
      { date: '2026-08-31', source: 'tasks', sourceInstanceId: 'local-tasks', values: { kind: 'tasks', completed: 0, carriedForward: 0 } },
      { date: '2026-09-01', source: 'tasks', sourceInstanceId: 'local-tasks', values: { kind: 'tasks', completed: 0, carriedForward: 1 } },
      { date: '2026-09-02', source: 'tasks', sourceInstanceId: 'local-tasks', values: { kind: 'tasks', completed: 1, carriedForward: 2 } },
    ])
    expect(JSON.stringify(collectTaskSeries(lists, '2026-09-02'))).not.toMatch(/private|launch|secret|legacy/i)
  })
})

describe('calendar aggregates', () => {
  it('counts events and merges overlapping spans before calculating busy minutes', () => {
    const events = [
      { summary: 'Private standup', start: localEpoch('2026-09-02', 9), end: localEpoch('2026-09-02', 10), allDay: false, cal: 0, meetUrl: 'https://secret.example' },
      { summary: 'Private overlap', start: localEpoch('2026-09-02', 9, 30), end: localEpoch('2026-09-02', 10, 30), allDay: false, cal: 0 },
      { summary: 'Private later', start: localEpoch('2026-09-02', 12), end: localEpoch('2026-09-02', 12, 15), allDay: false, cal: 0 },
    ]

    expect(collectCalendarSeries(events, 'ics', '2026-09-02')).toEqual([
      { date: '2026-09-02', source: 'calendar', sourceInstanceId: 'ics', values: { kind: 'calendar', events: 3, busyMinutes: 105 } },
    ])
    expect(JSON.stringify(collectCalendarSeries(events, 'ics', '2026-09-02'))).not.toMatch(/private|standup|secret\.example/i)
  })

  it('clips a cross-midnight event into separate local calendar-day totals', () => {
    const events = [{ summary: 'Overnight', start: localEpoch('2026-09-01', 23, 30), end: localEpoch('2026-09-02', 0, 30), allDay: false, cal: 0 }]
    expect(collectCalendarSeries(events, 'ics', '2026-09-02')).toEqual([
      { date: '2026-09-01', source: 'calendar', sourceInstanceId: 'ics', values: { kind: 'calendar', events: 1, busyMinutes: 30 } },
      { date: '2026-09-02', source: 'calendar', sourceInstanceId: 'ics', values: { kind: 'calendar', events: 1, busyMinutes: 30 } },
    ])
  })
})

describe('development and fitness aggregates', () => {
  it('groups only dated development signals into restricted numeric measures', () => {
    expect(collectDevelopmentSeries({
      sourceInstanceId: 'github',
      contributions: [{ date: '2026-09-02', count: 4 }],
      reviews: [{ at: localEpoch('2026-09-02', 10) }],
      issues: [{ at: localEpoch('2026-09-02', 11) }],
      deployments: [
        { at: localEpoch('2026-09-02', 12), failed: false },
        { at: localEpoch('2026-09-02', 13), failed: true },
      ],
    }, '2026-09-02')).toEqual([
      { date: '2026-09-02', source: 'development', sourceInstanceId: 'github', values: { kind: 'development', commits: 4, reviews: 1, issues: 1, deployments: 2, failures: 1 } },
    ])
  })

  it('maps arbitrary fitness labels to six approved activity classes and drops raw details', () => {
    const series = collectFitnessSeries('strava', [{
      date: '2026-09-02',
      activityType: 'TrailRun',
      durationMinutes: 35,
      distanceMeters: 6_400,
      elevationMeters: 180,
      name: 'Private route name',
      route: 'encoded-gps-route',
      media: ['private-photo'],
    }], '2026-09-02')

    expect(series).toEqual([{ date: '2026-09-02', source: 'fitness', sourceInstanceId: 'strava', values: {
      kind: 'fitness', activities: 1, durationMinutes: 35, distanceMeters: 6_400, elevationMeters: 180,
      types: { run: 1, ride: 0, walk: 0, hike: 0, swim: 0, other: 0 },
    } }])
    expect(JSON.stringify(series)).not.toMatch(/private|route|photo/i)
  })
})

describe('existing connector snapshot adapters', () => {
  it('reads valid ICS, GitHub, GitLab, and Vercel aggregates without retaining their private payload fields', () => {
    const snapshots: Partial<Record<'ics' | 'github' | 'gitlab' | 'vercel', ConnectorSnapshot>> = {
      ics: { fetchedAt: localEpoch('2026-09-02', 15), data: { events: [{ summary: 'Private meeting', start: localEpoch('2026-09-02', 9), end: localEpoch('2026-09-02', 10), allDay: false, cal: 0 }] } },
      github: { fetchedAt: localEpoch('2026-09-02', 15), data: { prs: [{ title: 'Private PR' }], issues: [], notifications: 0, etags: { secret: 'etag' }, contributions: { total: 3, days: [{ date: '2026-09-02', count: 3 }] } } },
      gitlab: { fetchedAt: localEpoch('2026-09-02', 15), data: { mrs: [], reviewMrs: [{ title: 'Private MR' }], todos: 0, contributions: { total: 2, days: [{ date: '2026-09-02', count: 2 }] } } },
      vercel: { fetchedAt: localEpoch('2026-09-02', 15), data: { deployments: [{ project: 'private-project', state: 'ERROR', url: 'https://secret.example', createdAt: localEpoch('2026-09-02', 12) }] } },
    }

    const series = collectConnectorSeries(snapshots, '2026-09-02')
    expect(series).toContainEqual({ date: '2026-09-02', source: 'calendar', sourceInstanceId: 'ics', values: { kind: 'calendar', events: 1, busyMinutes: 60 } })
    expect(series).toContainEqual({ date: '2026-09-02', source: 'development', sourceInstanceId: 'github', values: { kind: 'development', commits: 3, reviews: 0, issues: 0, deployments: 0, failures: 0 } })
    expect(series).toContainEqual({ date: '2026-09-02', source: 'development', sourceInstanceId: 'gitlab', values: { kind: 'development', commits: 2, reviews: 0, issues: 0, deployments: 0, failures: 0 } })
    expect(series).toContainEqual({ date: '2026-09-02', source: 'development', sourceInstanceId: 'vercel', values: { kind: 'development', commits: 0, reviews: 0, issues: 0, deployments: 1, failures: 1 } })
    expect(JSON.stringify(series)).not.toMatch(/private|secret|etag|meeting|project/i)
  })

  it('ignores malformed snapshots rather than manufacturing zero activity', () => {
    expect(collectConnectorSeries({
      ics: { fetchedAt: Date.now(), data: { events: [{ summary: 'bad', start: 'today' }] } },
      github: { fetchedAt: Date.now(), data: { contributions: { days: [{ date: 'not-a-day', count: 9 }] } } },
    }, '2026-09-02')).toEqual([])
  })
})
