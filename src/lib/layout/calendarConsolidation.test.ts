import { describe, expect, it, vi } from 'vitest'
import { createStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import type { NamedLayout } from './namedLayouts'
import {
  consolidateCalendarLayout,
  detectLegacyCalendarPlacements,
  layoutRevision,
  saveCalendarConsolidation,
  updateCalendarLayoutPreference,
} from './calendarConsolidation'

function layout(): NamedLayout {
  return {
    id: 'work',
    name: 'Work',
    widgets: {
      ics: { kind: 'free', anchor: 'left', offsetX: 2, offsetY: 3, tier: 'compact', layer: 1 },
      monthCal: { kind: 'docked', dock: 'top', order: 2, x: 28, y: 45, tier: 'standard' },
      publicHolidays: { kind: 'free', anchor: 'right', offsetX: -4, offsetY: 6, tier: 'standard', layer: 4 },
      github: { kind: 'free', anchor: 'bottom-right', offsetX: -8, offsetY: -8, tier: 'full', layer: 7 },
    },
  }
}

describe('legacy Calendar placement detection', () => {
  it('reports standalone and stack membership without changing the layout', () => {
    const source = layout()
    source.stacks = [{
      id: 'dates',
      members: ['monthCal', 'quote'],
      facing: 'monthCal',
      anchor: 'center',
      offsetX: 0,
      offsetY: 0,
      tier: 'standard',
      layer: 3,
    }]
    const copy = structuredClone(source)
    expect(detectLegacyCalendarPlacements(source)).toEqual([
      expect.objectContaining({ id: 'ics', kind: 'standalone' }),
      expect.objectContaining({ id: 'monthCal', kind: 'stack', stackId: 'dates', index: 0 }),
      expect.objectContaining({ id: 'publicHolidays', kind: 'standalone' }),
    ])
    expect(source).toEqual(copy)
  })
})

describe('consolidateCalendarLayout', () => {
  it('keeps the chosen placement and hides only the other date placements', () => {
    const source = layout()
    const next = consolidateCalendarLayout(source, {
      expectedRevision: layoutRevision(source),
      keep: 'monthCal',
    })
    expect(next.widgets.ics).toEqual(source.widgets.monthCal)
    expect(next.widgets.monthCal).toEqual({ kind: 'hidden' })
    expect(next.widgets.publicHolidays).toEqual({ kind: 'hidden' })
    expect(next.widgets.github).toEqual(source.widgets.github)
    expect(source.widgets.ics).not.toEqual(next.widgets.ics)
  })

  it('replaces a chosen stack member in place and preserves facing', () => {
    const source = layout()
    source.stacks = [{
      id: 'dates',
      members: ['github', 'monthCal', 'quote'],
      facing: 'monthCal',
      anchor: 'center', offsetX: 5, offsetY: -4, tier: 'standard', layer: 9,
    }]
    const next = consolidateCalendarLayout(source, {
      expectedRevision: layoutRevision(source),
      keep: 'monthCal',
    })
    expect(next.stacks?.[0]).toMatchObject({
      members: ['github', 'ics', 'quote'],
      facing: 'ics',
    })
  })

  it('rejects a stale preview and leaves the source unchanged', () => {
    const source = layout()
    const copy = structuredClone(source)
    expect(() => consolidateCalendarLayout(source, {
      expectedRevision: 'stale',
      keep: 'ics',
    })).toThrow(/changed in another tab/i)
    expect(source).toEqual(copy)
  })
})

describe('Calendar consolidation storage boundary', () => {
  it('atomically writes the layout and its companion preference after revalidating ownership', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await storage.init()
    const source = layout()
    await storage.set('layouts', { version: 1, activeLayoutId: source.id, layouts: [source] })
    const write = vi.spyOn(driver, 'write')
    write.mockClear()

    await saveCalendarConsolidation(storage, {
      layoutId: source.id,
      expectedRevision: layoutRevision(source),
      keep: 'monthCal',
      defaultView: 'month',
      includePublicHolidays: true,
    })

    expect(write).toHaveBeenCalledTimes(1)
    expect(Object.keys(write.mock.calls[0]?.[0] ?? {}).sort()).toEqual(['calendarPreferences', 'layouts'])
    expect((await storage.get('calendarPreferences')).work).toEqual({ defaultView: 'month', includePublicHolidays: true })
  })

  it('performs zero writes for a stale preview', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await storage.init()
    const source = layout()
    await storage.set('layouts', { version: 1, activeLayoutId: source.id, layouts: [source] })
    const write = vi.spyOn(driver, 'write')
    write.mockClear()

    await expect(saveCalendarConsolidation(storage, {
      layoutId: source.id,
      expectedRevision: 'stale',
      keep: 'ics',
      defaultView: 'agenda',
      includePublicHolidays: false,
    })).rejects.toThrow(/changed in another tab/i)
    expect(write).not.toHaveBeenCalled()
  })

  it('ordinary view switching writes only the companion preference key', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await storage.init()
    const write = vi.spyOn(driver, 'write')
    write.mockClear()

    await updateCalendarLayoutPreference(storage, 'work', { defaultView: 'month' })
    expect(write).toHaveBeenCalledTimes(1)
    expect(Object.keys(write.mock.calls[0]?.[0] ?? {})).toEqual(['calendarPreferences'])
    expect((await storage.get('calendarPreferences')).work).toEqual({ defaultView: 'month', includePublicHolidays: true })
  })
})
