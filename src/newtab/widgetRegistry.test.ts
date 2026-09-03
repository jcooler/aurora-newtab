import { describe, expect, it } from 'vitest'
import { BLOCK_IDS, type WidgetVariant } from '../lib/layout/types'
import { defaults, type Settings, type WidgetToggles } from '../lib/storage/schema'
import { CONNECTOR_IDS, type ConnectorConfig, type ConnectorId, type JiraConfig, type RssConfig } from '../services/connectors/types'
import { resolveWidgetRenderer, WIDGET_RENDERER_KEYS } from './widgetRenderers'
import { includeExplicitLayoutCalendar, WIDGET_REGISTRY, selectActiveWidgetRegistry, type WidgetRegistryEntry } from './widgetRegistry'
import { contentConflictFor, WIDGET_PRESENTATION_CONTRACTS, WIDGET_SIZE_CONTRACTS } from './widgetSizeContracts'

const EXPECTED = [
  ['weather', 'Weather', 'day', 0, 'automatic', ['day'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['ics', 'Calendar', 'day', 1, 'automatic', ['day', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['monthCal', 'Month', 'day', 2, 'automatic', ['day', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['sun', 'Sun times', 'day', 3, 'automatic', ['day', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['moon', 'Moon phase', 'day', 4, 'automatic', ['day', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['quote', 'Quote', 'day', 5, 'automatic', ['day', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['clock', 'Clock', 'now', 0, 'pinned', ['now'], 'expanded', { compact: [2, 2], standard: [2, 2], expanded: [3, 2] }],
  ['greeting', 'Greeting', 'now', 1, 'automatic', ['now'], 'standard', { compact: [2, 1], standard: [2, 1], expanded: [2, 2] }],
  ['worldClocks', 'World clocks', 'now', 2, 'automatic', ['now', 'day'], 'standard', { compact: [1, 1], standard: [2, 1], expanded: [2, 2] }],
  ['countdown', 'Countdown', 'now', 3, 'automatic', ['now', 'day'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['search', 'Search', 'now', 4, 'automatic', ['now'], 'standard', { compact: [2, 1], standard: [2, 1] }],
  ['focus', 'Focus', 'now', 5, 'automatic', ['now'], 'standard', { compact: [2, 1], standard: [2, 1] }],
  ['links', 'Links', 'now', 6, 'automatic', ['now', 'dock'], 'standard', { compact: [1, 1], standard: [2, 1] }],
  ['habits', 'Habits', 'now', 7, 'automatic', ['now', 'day', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['bookmarks', 'Bookmarks', 'now', 8, 'automatic', ['now', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['status', 'Service status', 'pulse', 0, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['github', 'GitHub', 'pulse', 1, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['gitlab', 'GitLab', 'pulse', 2, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['jira', 'Jira', 'pulse', 3, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['vercel', 'Deploys', 'pulse', 4, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['homeassistant', 'Home Assistant', 'pulse', 5, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['rss', 'Headlines', 'pulse', 6, 'automatic', ['pulse', 'dock'], 'standard', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['crypto', 'Crypto', 'pulse', 7, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 1] }],
  ['readingList', 'Reading List', 'pulse', 8, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['recentlyClosed', 'Recently Closed', 'pulse', 9, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['downloads', 'Downloads', 'pulse', 10, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['tabGroups', 'Tab Groups', 'pulse', 11, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['timer', 'Timer', 'dock', 0, 'dock', ['dock'], 'compact', { compact: [1, 1] }],
  ['tasks', 'Tasks', 'dock', 1, 'dock', ['dock'], 'compact', { compact: [1, 1] }],
  ['notes', 'Notes', 'dock', 2, 'dock', ['dock'], 'compact', { compact: [1, 1] }],
  ['linear', 'Linear', 'pulse', 12, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['sentry', 'Sentry', 'pulse', 13, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['todoist', 'Todoist', 'pulse', 14, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['onThisDay', 'On This Day', 'pulse', 15, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['publicHolidays', 'Public Holidays', 'pulse', 16, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['auroraKp', 'Aurora & Kp', 'pulse', 17, 'automatic', ['pulse', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
  ['progress', 'Progress', 'now', 9, 'automatic', ['now', 'day', 'dock'], 'compact', { compact: [1, 1] }],
  ['metrics', 'Metrics', 'now', 10, 'automatic', ['now', 'day', 'dock'], 'compact', { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }],
] as const

const ALL_WIDGETS_OFF: WidgetToggles = {
  search: false, weather: false, links: false, todo: false, timer: false, quote: false,
  bookmarks: false, notes: false, clocks: false, countdown: false, habits: false,
  monthCal: false, sun: false, moon: false,
  readingList: false, recentlyClosed: false, downloads: false, tabGroups: false,
  progress: false,
  metrics: false,
}

const TOGGLE_MAPPING = [
  ['search', 'search'], ['weather', 'weather'], ['links', 'links'], ['tasks', 'todo'],
  ['timer', 'timer'], ['quote', 'quote'], ['bookmarks', 'bookmarks'], ['notes', 'notes'],
  ['worldClocks', 'clocks'], ['countdown', 'countdown'], ['habits', 'habits'],
  ['monthCal', 'monthCal'], ['sun', 'sun'], ['moon', 'moon'],
  ['readingList', 'readingList'], ['recentlyClosed', 'recentlyClosed'],
  ['downloads', 'downloads'], ['tabGroups', 'tabGroups'],
  ['progress', 'progress'],
  ['metrics', 'metrics'],
] as const

function settingsWith(widgets: WidgetToggles): Settings {
  return { ...defaults().settings, widgets: { ...widgets } }
}

function connector(enabled: boolean): ConnectorConfig {
  return { enabled } as ConnectorConfig
}

function ids(rows: readonly WidgetRegistryEntry[]): string[] {
  return rows.map((row) => row.id)
}

function selectedContent(id: ConnectorId, config: ConnectorConfig) {
  const entry = selectActiveWidgetRegistry(settingsWith(ALL_WIDGETS_OFF), { [id]: config })
    .find((row) => row.id === id)
  if (!entry?.selectedContent) throw new Error(`Missing ${id} selected content`)
  return entry.selectedContent
}

describe('source-owned widget registry', () => {
  it('declares the Weather expansion footprint exactly once (named-layouts spec 2.6)', () => {
    for (const entry of WIDGET_REGISTRY) {
      if (entry.id === 'weather') {
        expect(entry.expandedFootprint).toEqual({ width: 352, height: 430 })
      } else {
        expect(entry.expandedFootprint, `${entry.id} must not declare a footprint`).toBeUndefined()
      }
    }
  })

  it('contains the exact BLOCK_IDS set once in deterministic semantic source order', () => {
    const actualIds = ids(WIDGET_REGISTRY)
    expect(actualIds).toEqual(EXPECTED.map(([id]) => id))
    expect(new Set(actualIds).size).toBe(actualIds.length)
    expect([...actualIds].sort()).toEqual([...BLOCK_IDS].sort())
    expect(WIDGET_REGISTRY.map((row) => row.sourceOrder)).toEqual(EXPECTED.map((_, index) => index))
  })

  it('owns every exact safe label, default, eligibility list, variant, footprint, and renderer key', () => {
    expect(WIDGET_REGISTRY.map((row) => ({
      id: row.id,
      label: row.label,
      zone: row.defaultPlacements.standard.zone,
      order: row.defaultPlacements.standard.order,
      priority: row.defaultPlacements.standard.priority,
      eligibleZones: row.eligibleZones,
      defaultVariant: row.defaultPlacements.standard.variant,
      footprints: Object.fromEntries(Object.entries(row.footprints).map(([variant, span]) => [variant, [span?.colSpan, span?.rowSpan]])),
      rendererKey: row.rendererKey,
    }))).toEqual(EXPECTED.map(([id, label, zone, order, priority, eligibleZones, defaultVariant, footprints]) => ({
      id, label, zone, order, priority, eligibleZones, defaultVariant, footprints, rendererKey: id,
    })))
  })

  it('derives all four profile defaults from exact allowed source footprints', () => {
    for (const [index, expected] of EXPECTED.entries()) {
      const [id, , zone, order, priority, , standardVariant, footprints] = expected
      const row = WIDGET_REGISTRY[index]
      expect(row.canvasSizes, `${id}/canvas sizes`).toEqual(WIDGET_SIZE_CONTRACTS[id].sizes)
      for (const profile of ['compact', 'standard', 'display', 'ultrawide'] as const) {
        const target: WidgetVariant = profile === 'compact' ? 'compact' : profile === 'standard' ? standardVariant : 'expanded'
        const allowed = Object.keys(footprints) as WidgetVariant[]
        const desired = allowed.includes(target) ? target : allowed.includes('standard') ? 'standard' : 'compact'
        const [colSpan, rowSpan] = footprints[desired as keyof typeof footprints]!
        expect(row.defaultPlacements[profile], `${id}/${profile}`).toEqual({ zone, order, colSpan, rowSpan, variant: desired, priority })
      }
    }
    expect(WIDGET_REGISTRY.find((row) => row.id === 'clock')?.protectedClock).toBe(true)
  })

  it('uses the content contract rather than legacy footprint variants to offer Canvas sizes', () => {
    for (const row of WIDGET_REGISTRY) {
      expect(row.canvasSizes, row.id).toBe(WIDGET_PRESENTATION_CONTRACTS[row.id].sizes)
      expect(row.presentationContract).toBe(WIDGET_PRESENTATION_CONTRACTS[row.id])
      expect(row.contentContract).toBe(row.presentationContract)
      expect(row.contentContract).toBe(WIDGET_SIZE_CONTRACTS[row.id])
      expect(row.supportsDocked).toBe(row.presentationContract.docked !== undefined)
    }
  })

  it('freezes registry identity, availability, defaults, zone arrays, and footprints', () => {
    expect(Object.isFrozen(WIDGET_REGISTRY)).toBe(true)
    for (const row of WIDGET_REGISTRY) {
      expect(Object.isFrozen(row)).toBe(true)
      expect(Object.isFrozen(row.availability)).toBe(true)
      expect(Object.isFrozen(row.eligibleZones)).toBe(true)
      expect(Object.isFrozen(row.allowedVariants)).toBe(true)
      expect(Object.isFrozen(row.canvasSizes)).toBe(true)
      expect(Object.isFrozen(row.presentationContract)).toBe(true)
      expect(Object.isFrozen(row.footprints)).toBe(true)
      expect(Object.isFrozen(row.defaultPlacements)).toBe(true)
      for (const placement of Object.values(row.defaultPlacements)) expect(Object.isFrozen(placement)).toBe(true)
    }
  })

  it('maps every exact widget toggle and leaves only Clock, Greeting, and Focus always active', () => {
    const empty = settingsWith(ALL_WIDGETS_OFF)
    expect(ids(selectActiveWidgetRegistry(empty, {}))).toEqual(['clock', 'greeting', 'focus'])
    for (const [id, toggle] of TOGGLE_MAPPING) {
      const active = ids(selectActiveWidgetRegistry(settingsWith({ ...ALL_WIDGETS_OFF, [toggle]: true }), {}))
      expect(active).toEqual(EXPECTED.map(([candidate]) => candidate).filter((candidate) =>
        candidate === 'clock' || candidate === 'greeting' || candidate === 'focus' || candidate === id))
    }
  })

  it('maps every delivered connector widget by enabled alone, including incomplete setup/data', () => {
    const settings = settingsWith(ALL_WIDGETS_OFF)
    const delivered = CONNECTOR_IDS.filter((id) => id !== 'auroraKp' && id !== 'googleCalendar')
    for (const connectorId of delivered) {
      const enabled = { [connectorId]: connector(true) } as Partial<Record<ConnectorId, ConnectorConfig>>
      const disabled = { [connectorId]: connector(false) } as Partial<Record<ConnectorId, ConnectorConfig>>
      expect(ids(selectActiveWidgetRegistry(settings, enabled))).toContain(connectorId)
      expect(ids(selectActiveWidgetRegistry(settings, disabled))).not.toContain(connectorId)
    }
  })

  it('recomputes pure availability from changed settings/config without stale output or mutation', () => {
    const settingsA = settingsWith({ ...ALL_WIDGETS_OFF, weather: true })
    const connectorsA = { rss: connector(true) }
    const first = selectActiveWidgetRegistry(settingsA, connectorsA)
    const second = selectActiveWidgetRegistry(settingsWith({ ...ALL_WIDGETS_OFF, notes: true }), {
      rss: connector(false), github: connector(true),
    })
    expect(ids(first)).toEqual(['weather', 'clock', 'greeting', 'focus', 'rss'])
    expect(ids(second)).toEqual(['clock', 'greeting', 'focus', 'github', 'notes'])
    expect(settingsA.widgets).toEqual({ ...ALL_WIDGETS_OFF, weather: true })
    expect(connectorsA.rss.enabled).toBe(true)
  })

  it('keeps a consolidated Calendar mounted even when no ICS connector is enabled', () => {
    const base = selectActiveWidgetRegistry(settingsWith(ALL_WIDGETS_OFF), {})
    const layouts = {
      version: 1,
      activeLayoutId: 'work',
      layouts: [{ id: 'work', name: 'Work', widgets: { ics: { kind: 'hidden' } }, stacks: [{ id: 'dates', anchor: 'top-left', offsetX: 0, offsetY: 0, tier: 'standard', layer: 1, members: ['ics', 'clock'], facing: 'ics' }] }],
    }
    expect(ids(includeExplicitLayoutCalendar(base, layouts))).toEqual(['ics', 'clock', 'greeting', 'focus'])
  })

  it('does not invent Calendar for an unconsolidated Month-only layout', () => {
    const base = selectActiveWidgetRegistry(settingsWith({ ...ALL_WIDGETS_OFF, monthCal: true }), {})
    const layouts = {
      version: 1,
      activeLayoutId: 'work',
      layouts: [{ id: 'work', name: 'Work', widgets: { monthCal: { kind: 'free' } } }],
    }
    expect(ids(includeExplicitLayoutCalendar(base, layouts))).toEqual(['monthCal', 'clock', 'greeting', 'focus'])
  })

  it('models Jira and RSS size conflicts from the actual selected configuration', () => {
    const jira = (views: JiraConfig['views']): JiraConfig => ({
      enabled: true, email: 'jon@example.test', apiToken: 'token', site: 'https://acme.atlassian.net', displayName: 'Jon', views,
    })
    const rss = (shownCount: number): RssConfig => ({ enabled: true, feeds: ['https://example.test/feed.xml'], shownCount })

    expect(contentConflictFor('jira', 'standard', selectedContent('jira', jira({ assigned: false, dueSoon: true, statusChips: false })))).toBeNull()
    expect(contentConflictFor('jira', 'standard', selectedContent('jira', jira({ assigned: true, dueSoon: true, statusChips: false })))).toBe('Due soon needs Full.')

    expect(contentConflictFor('rss', 'compact', selectedContent('rss', rss(2)))).toBeNull()
    expect(contentConflictFor('rss', 'compact', selectedContent('rss', rss(3)))).toBe('1 additional configured headline needs Standard or Full.')
    expect(contentConflictFor('rss', 'standard', selectedContent('rss', rss(6)))).toBeNull()
    expect(contentConflictFor('rss', 'compact', selectedContent('rss', rss(7)))).toBe('5 additional configured headlines need Standard or Full. 1 remaining configured headline needs Full.')
    expect(contentConflictFor('rss', 'standard', selectedContent('rss', rss(10)))).toBe('4 remaining configured headlines need Full.')
  })

  it('resolves every registry renderer exhaustively with exact key set equality', () => {
    const registryKeys = WIDGET_REGISTRY.map((row) => row.rendererKey)
    expect(WIDGET_RENDERER_KEYS).toEqual(registryKeys)
    expect(new Set(WIDGET_RENDERER_KEYS).size).toBe(38)
    for (const key of registryKeys) expect(typeof resolveWidgetRenderer(key), key).toBe('function')
  })
})

describe('supportsDocked (NL-P5 batch 1)', () => {
  it('exposes supportsDocked from the size contracts', () => {
    const byId = Object.fromEntries(WIDGET_REGISTRY.map((entry) => [entry.id, entry]))
    expect(byId.weather.supportsDocked).toBe(true)
    expect(byId.clock.supportsDocked).toBe(true)
    expect(byId.bookmarks.supportsDocked).toBe(true)
    expect(byId.quote.supportsDocked).toBe(false)
    expect(byId.search.supportsDocked).toBe(false)
  })
})
