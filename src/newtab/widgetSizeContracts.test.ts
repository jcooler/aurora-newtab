import { describe, expect, it } from 'vitest'
import { BLOCK_IDS } from '../lib/layout/types'
import {
  contentConflictFor,
  WIDGET_PRESENTATION_CONTRACTS,
  WIDGET_SIZE_CONTRACTS,
  type SelectedCanvasContent,
} from './widgetSizeContracts'

describe('Canvas widget size contracts', () => {
  it('offers only useful, ordered sizes for connector cards and their primary values', () => {
    expect(WIDGET_SIZE_CONTRACTS.github.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.jira.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.crypto.sizes).toEqual(['compact', 'standard'])
    expect(WIDGET_SIZE_CONTRACTS.timer.sizes).toEqual(['compact'])
    for (const id of ['linear', 'sentry', 'todoist'] as const) {
      expect(WIDGET_SIZE_CONTRACTS[id]).toMatchObject({
        sizes: ['compact', 'standard', 'full'],
        compact: expect.any(String),
        standard: expect.any(String),
        full: expect.any(String),
        docked: expect.any(String),
      })
    }
  })

  it('pins delivered At a glance identities to useful four-tier contracts', () => {
    expect(Object.keys(WIDGET_SIZE_CONTRACTS).slice(-5)).toEqual(['onThisDay', 'publicHolidays', 'auroraKp', 'progress', 'metrics'])
  })

  it('names selected content that needs a larger size instead of inventing a fitting choice', () => {
    const graph: SelectedCanvasContent = { label: 'Contribution graph', minimumSize: 'standard' }
    const pulls: SelectedCanvasContent = { label: 'Pull requests', minimumSize: 'standard' }
    const action: SelectedCanvasContent = { label: 'Actions', minimumSize: 'standard' }
    expect(contentConflictFor('github', 'compact', [graph, pulls])).toBe(
      'Contribution graph and Pull requests need Standard or Full.',
    )
    expect(contentConflictFor('github', 'compact', [pulls])).toBe('Pull requests need Standard or Full.')
    expect(contentConflictFor('jira', 'standard', [graph])).toBeNull()
    expect(contentConflictFor('homeassistant', 'compact', [action])).toBe('Actions need Standard or Full.')
  })
})

describe('Docked tier contracts (NL-P5 batches 1 and 2)', () => {
  it('declares the batch-1 and batch-2 Docked contracts and no others', () => {
    const docked = Object.entries(WIDGET_SIZE_CONTRACTS)
      .filter(([, contract]) => contract.docked !== undefined)
      .map(([id]) => id)
      .sort()
    expect(docked).toEqual([
      'auroraKp', 'bookmarks', 'clock', 'countdown', 'crypto', 'downloads', 'focus', 'github', 'gitlab',
      'habits', 'homeassistant', 'ics', 'jira', 'linear', 'moon', 'notes', 'onThisDay', 'progress', 'publicHolidays', 'readingList',
      'recentlyClosed', 'rss', 'sentry', 'status', 'sun', 'tabGroups', 'tasks', 'metrics',
      'timer', 'todoist', 'vercel', 'weather', 'worldClocks',
    ].sort())
    expect(WIDGET_SIZE_CONTRACTS.weather.docked).toBe('Temperature · location · condition')
    expect(WIDGET_SIZE_CONTRACTS.clock.docked).toBe('Time · date')
    expect(WIDGET_SIZE_CONTRACTS.bookmarks.docked).toBe('Full readable bookmark bar')
    expect(WIDGET_SIZE_CONTRACTS.github.docked).toBe('Selected activity counts')
    expect(WIDGET_SIZE_CONTRACTS.rss.docked).toBe('Top headline')
    expect(WIDGET_SIZE_CONTRACTS.monthCal.docked).toBeUndefined()
    expect(WIDGET_SIZE_CONTRACTS.links.docked).toBeUndefined()
  })

  it('declares every browser-native widget at Compact, Standard, Full, and Docked', () => {
    expect(WIDGET_SIZE_CONTRACTS.readingList).toMatchObject({
      sizes: ['compact', 'standard', 'full'],
      compact: 'Unread count and newest title',
      standard: 'Unread reading queue',
      full: 'Unread and recently read pages',
      docked: 'Unread count and newest title',
    })
    expect(WIDGET_SIZE_CONTRACTS.recentlyClosed).toMatchObject({
      sizes: ['compact', 'standard', 'full'],
      compact: 'Latest closed type and age',
      standard: 'Recently closed session types',
      full: 'All restorable session types by kind',
      docked: 'Closed count and latest type',
    })
    expect(WIDGET_SIZE_CONTRACTS.downloads.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.tabGroups.sizes).toEqual(['compact', 'standard', 'full'])
  })

  it('Month offers only the complete month (batch-2 owner review removed compact)', () => {
    expect(WIDGET_SIZE_CONTRACTS.monthCal.sizes).toEqual(['standard'])
    expect(WIDGET_SIZE_CONTRACTS.monthCal.compact).toBeUndefined()
  })

  it('keeps note contents out of launcher presentation contracts', () => {
    expect(WIDGET_SIZE_CONTRACTS.notes.tiers.compact).toMatchObject({
      purpose: 'Notes action',
      essential: ['note state', 'open action'],
      signature: [],
      supporting: ['updated state'],
      narrowSafety: ['tighten spacing'],
    })
  })

  it('makes canonical Calendar the complete docked-through-Full date composition', () => {
    expect(WIDGET_SIZE_CONTRACTS.ics).toMatchObject({
      sizes: ['compact', 'standard', 'full'],
      stackSizes: ['compact', 'standard', 'full'],
      compact: 'Next date items',
      standard: 'Agenda or complete month',
      full: 'Month and agenda together',
      docked: 'Next relevant date item',
    })
    expect(WIDGET_SIZE_CONTRACTS.ics.tiers.full?.signature).toEqual(['two-region date composition'])
  })
})

describe('shared frame presentation contracts', () => {
  const idsFor = (presentationClass: 'bar' | 'framed' | 'intrinsic') =>
    Object.entries(WIDGET_PRESENTATION_CONTRACTS)
      .filter(([, contract]) => contract.presentationClass === presentationClass)
      .map(([id]) => id)
      .sort()

  it('declares the Weather and On This Day reference-pair contracts', () => {
    expect(WIDGET_PRESENTATION_CONTRACTS.weather).toMatchObject({
      presentationClass: 'framed',
      sizes: ['compact', 'standard', 'full'],
      stackSizes: ['compact', 'standard', 'full'],
      states: ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'],
    })
    expect(WIDGET_PRESENTATION_CONTRACTS.onThisDay).toMatchObject({
      presentationClass: 'framed',
      sizes: ['compact', 'standard', 'full'],
      stackSizes: ['compact', 'standard', 'full'],
      states: ['loading', 'ready', 'empty', 'stale', 'hard-error'],
    })
    expect(WIDGET_PRESENTATION_CONTRACTS.weather.tiers.standard).toEqual({
      purpose: 'Current conditions and forecast context',
      essential: ['temperature', 'condition', 'location'],
      signature: ['forecast trend'],
      supporting: ['feels like', 'wind', 'humidity'],
      narrowSafety: ['tighten spacing', 'shorten location', 'truncate condition'],
      overflow: { kind: 'details', label: 'Weather details' },
    })
    expect(WIDGET_PRESENTATION_CONTRACTS.onThisDay.tiers.standard).toEqual({
      purpose: 'Three historical events for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event list'],
      supporting: ['provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summaries'],
      overflow: { kind: 'provider', label: 'Read more on Wikipedia' },
    })
  })

  it('classifies every known identity and only allows declared stack sizes', () => {
    expect(WIDGET_PRESENTATION_CONTRACTS.bookmarks.presentationClass).toBe('bar')
    expect(WIDGET_PRESENTATION_CONTRACTS.clock.presentationClass).toBe('intrinsic')
    expect(WIDGET_PRESENTATION_CONTRACTS.greeting.presentationClass).toBe('intrinsic')
    expect(WIDGET_PRESENTATION_CONTRACTS.quote.presentationClass).toBe('intrinsic')
    expect(WIDGET_PRESENTATION_CONTRACTS.focus.presentationClass).toBe('intrinsic')
    expect(WIDGET_PRESENTATION_CONTRACTS.status.presentationClass).toBe('intrinsic')
    expect(WIDGET_PRESENTATION_CONTRACTS.bookmarks.presentationClass).toBe('bar')
    for (const id of BLOCK_IDS) {
      const contract = WIDGET_PRESENTATION_CONTRACTS[id]
      expect(contract.stackSizes.every((tier) => contract.sizes.includes(tier)), id).toBe(true)
    }
    expect(idsFor('bar')).toEqual(['bookmarks'])
    expect(idsFor('intrinsic')).toEqual([
      'clock', 'countdown', 'focus', 'greeting', 'links', 'progress', 'quote', 'search', 'status', 'worldClocks',
    ])
    expect(idsFor('framed')).toEqual([
      'auroraKp', 'crypto', 'downloads', 'github', 'gitlab', 'habits', 'homeassistant',
      'ics', 'jira', 'linear', 'metrics', 'monthCal', 'moon', 'notes', 'onThisDay', 'publicHolidays',
      'readingList', 'recentlyClosed', 'rss', 'sentry', 'sun', 'tabGroups',
      'tasks', 'timer', 'todoist', 'vercel', 'weather',
    ])
  })

  it('keeps Progress intrinsic, Compact-only, stack-capable, and local-data-only', () => {
    expect(WIDGET_PRESENTATION_CONTRACTS.progress).toEqual({
      presentationClass: 'intrinsic',
      sizes: ['compact'],
      stackSizes: ['compact'],
      states: ['ready'],
      compact: 'Daily progress rail',
      standard: undefined,
      full: undefined,
      docked: 'Daily progress values',
      tiers: {},
    })
  })

  it('gives Metrics the approved framed history contract at every tier', () => {
    expect(WIDGET_PRESENTATION_CONTRACTS.metrics).toMatchObject({
      presentationClass: 'framed',
      sizes: ['compact', 'standard', 'full'],
      stackSizes: ['compact', 'standard', 'full'],
      states: ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'],
      compact: 'Seven-day active rhythm',
      standard: 'Thirty-day activity overview',
      full: 'Range-selectable private history',
      docked: 'Active days, Focus, and Tasks',
    })
    expect(WIDGET_PRESENTATION_CONTRACTS.metrics.tiers.full?.signature).toEqual(['activity rhythm'])
    expect(WIDGET_PRESENTATION_CONTRACTS.metrics.tiers.full?.supporting).toEqual([
      'Focus', 'Tasks', 'Habits', 'Calendar', 'Development',
    ])
    expect(WIDGET_PRESENTATION_CONTRACTS.metrics.tiers.full?.supporting).not.toContain('Fitness')
  })

  it('gives every framed free and stack tier an authored composition contract', () => {
    const framed = Object.entries(WIDGET_PRESENTATION_CONTRACTS)
      .filter(([, contract]) => contract.presentationClass === 'framed')

    expect(framed).toHaveLength(27)
    for (const [id, contract] of framed) {
      expect(contract.stackSizes.every((tier) => contract.sizes.includes(tier)), `${id}/stack subset`).toBe(true)
      expect(contract.stackSizes).not.toBe(contract.sizes)
      for (const tier of new Set([...contract.sizes, ...contract.stackSizes])) {
        const composition = contract.tiers[tier]
        expect(composition, `${id}/${tier}`).toBeTruthy()
        expect(composition?.purpose.trim().length, `${id}/${tier}/purpose`).toBeGreaterThan(0)
        expect(composition?.essential.length, `${id}/${tier}/essential`).toBeGreaterThan(0)
        expect(Array.isArray(composition?.signature), `${id}/${tier}/signature`).toBe(true)
        expect(composition?.narrowSafety.length, `${id}/${tier}/narrow safety`).toBeGreaterThan(0)
        expect(composition?.overflow.kind, `${id}/${tier}/overflow`).toMatch(/^(none|details|settings|provider)$/)
      }
    }
  })

  it('declares only applicable states for synchronous local-data frames', () => {
    for (const id of ['monthCal', 'sun', 'moon'] as const) {
      expect(WIDGET_PRESENTATION_CONTRACTS[id].states, id).toEqual(['ready'])
    }
  })

  it('declares every reachable setup or permission-required frame state', () => {
    for (const id of ['readingList', 'recentlyClosed', 'downloads', 'tabGroups', 'linear', 'sentry', 'todoist', 'publicHolidays'] as const) {
      expect(WIDGET_PRESENTATION_CONTRACTS[id].states, id).toContain('permission-required')
    }
  })

  it('keeps simple connector states narrow while Calendar models independent source failures', () => {
    expect(WIDGET_PRESENTATION_CONTRACTS.status.states).toEqual(['loading', 'ready', 'empty', 'stale'])
    expect(WIDGET_PRESENTATION_CONTRACTS.status.tiers.compact?.overflow).toEqual({ kind: 'none' })
    expect(WIDGET_PRESENTATION_CONTRACTS.status.tiers.standard?.overflow).toEqual({ kind: 'none' })
    expect(WIDGET_PRESENTATION_CONTRACTS.ics.states).toEqual([
      'loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error',
    ])
  })

  it('freezes the single authoritative contract map and its identity rows', () => {
    expect(WIDGET_SIZE_CONTRACTS).toBe(WIDGET_PRESENTATION_CONTRACTS)
    expect(Object.isFrozen(WIDGET_PRESENTATION_CONTRACTS)).toBe(true)
    for (const contract of Object.values(WIDGET_PRESENTATION_CONTRACTS)) {
      expect(Object.isFrozen(contract)).toBe(true)
      expect(Object.isFrozen(contract.sizes)).toBe(true)
      expect(Object.isFrozen(contract.stackSizes)).toBe(true)
      expect(Object.isFrozen(contract.states)).toBe(true)
      expect(Object.isFrozen(contract.tiers)).toBe(true)
    }
  })
})
