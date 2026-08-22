import { describe, expect, it } from 'vitest'

import { WIDGET_CONTROL_KEYS } from '../../settings/sections/Widgets'
import { migrations } from './migrations'
import { defaults, type WidgetToggles } from './schema'
import { WIDGET_TOGGLE_INTRO_VERSIONS } from './widgetToggleVersions'

const EXPECTED_INTRO_VERSIONS = {
  search: 1,
  weather: 1,
  links: 1,
  todo: 1,
  timer: 1,
  quote: 1,
  bookmarks: 2,
  notes: 2,
  clocks: 2,
  countdown: 2,
  habits: 7,
  monthCal: 7,
  sun: 9,
  moon: 9,
} as const satisfies Record<keyof WidgetToggles, number>

const ORIGINAL_V1_KEYS = ['links', 'quote', 'search', 'timer', 'todo', 'weather'] as const

function sorted(values: readonly string[]) {
  return [...values].sort()
}

describe('widget toggle introduction versions', () => {
  it('keeps the immutable ledger equal to the reviewed version map', () => {
    expect(WIDGET_TOGGLE_INTRO_VERSIONS).toEqual(EXPECTED_INTRO_VERSIONS)
  })

  it('keeps ledger, defaults, and Settings controls in exact key parity', () => {
    const expected = sorted(Object.keys(EXPECTED_INTRO_VERSIONS))
    expect(sorted(Object.keys(WIDGET_TOGGLE_INTRO_VERSIONS))).toEqual(expected)
    expect(sorted(Object.keys(defaults().settings.widgets))).toEqual(expected)
    expect(sorted(WIDGET_CONTROL_KEYS)).toEqual(expected)
  })

  it('pins the literal original keys to version 1 and current boolean defaults', () => {
    const versionOne = Object.entries(WIDGET_TOGGLE_INTRO_VERSIONS)
      .filter(([, introduced]) => introduced === 1)
      .map(([key]) => key)
    expect(sorted(versionOne)).toEqual([...ORIGINAL_V1_KEYS])
    for (const key of ORIGINAL_V1_KEYS) expect(typeof defaults().settings.widgets[key]).toBe('boolean')
  })

  it.each(
    Object.entries(EXPECTED_INTRO_VERSIONS).filter(([, introduced]) => introduced > 1),
  )('backfills %s in its exact declared v%s migration step', (key, introducedIn) => {
    const widgets = { ...defaults().settings.widgets } as Record<string, boolean>
    delete widgets[key]
    const migrated = migrations[introducedIn - 1]({
      ...defaults(),
      settings: { ...defaults().settings, widgets },
    }) as unknown as ReturnType<typeof defaults>
    expect(Object.hasOwn(migrated.settings.widgets, key)).toBe(true)
    expect(typeof migrated.settings.widgets[key as keyof WidgetToggles]).toBe('boolean')
  })
})
