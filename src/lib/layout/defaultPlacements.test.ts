import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_POINTS, defaultFreePlacement } from './defaultPlacements'

// The composition contract the NL-P6 QA gate derived (2026-08-19): these
// pins encode WHY the numbers are what they are, so a future re-tune that
// silently reintroduces the short-height strike-throughs fails loudly.
describe('DEFAULT_WIDGET_POINTS composition contract (QA F1-F5)', () => {
  it('the greeting clears the full clock block at the 1408x445 family (>=22 points below the clock)', () => {
    expect(DEFAULT_WIDGET_POINTS.greeting.y - DEFAULT_WIDGET_POINTS.clock.y).toBeGreaterThanOrEqual(22)
  })

  it('the center ritual column stays strictly ordered top to bottom', () => {
    const column = ['bookmarks', 'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'quote'] as const
    for (let i = 1; i < column.length; i++) {
      expect(
        DEFAULT_WIDGET_POINTS[column[i]].y,
        `${column[i]} must sit below ${column[i - 1]}`,
      ).toBeGreaterThan(DEFAULT_WIDGET_POINTS[column[i - 1]].y)
    }
  })

  it('the focus prompt clears the search pill (>=8 points, the pill is ~9% of a 445px viewport)', () => {
    expect(DEFAULT_WIDGET_POINTS.focus.y - DEFAULT_WIDGET_POINTS.search.y).toBeGreaterThanOrEqual(8)
  })

  it('tasks sits above the fixed badge/gear band (y <= 86) while notes keeps its corner', () => {
    expect(DEFAULT_WIDGET_POINTS.tasks.y).toBeLessThanOrEqual(86)
    expect(DEFAULT_WIDGET_POINTS.notes.y).toBe(91)
  })

  it('sun and moon sit below the month card at short heights (sun >= 68, moon >= 82)', () => {
    expect(DEFAULT_WIDGET_POINTS.sun.y).toBeGreaterThanOrEqual(68)
    expect(DEFAULT_WIDGET_POINTS.moon.y).toBeGreaterThanOrEqual(82)
  })

  it('work-column connectors default to their compact glance tier; clock leads Full; others Standard', () => {
    for (const id of ['status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto'] as const) {
      expect(defaultFreePlacement(id, 0).tier, `${id} defaults compact`).toBe('compact')
    }
    expect(defaultFreePlacement('clock', 0).tier).toBe('full')
    expect(defaultFreePlacement('greeting', 0).tier).toBe('standard')
    expect(defaultFreePlacement('monthCal', 0).tier).toBe('standard')
  })
})
