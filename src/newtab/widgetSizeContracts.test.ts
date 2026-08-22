import { describe, expect, it } from 'vitest'
import { contentConflictFor, WIDGET_SIZE_CONTRACTS, type SelectedCanvasContent } from './widgetSizeContracts'

describe('Canvas widget size contracts', () => {
  it('offers only useful, ordered sizes for connector cards and their primary values', () => {
    expect(WIDGET_SIZE_CONTRACTS.github.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.jira.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.crypto.sizes).toEqual(['compact', 'standard'])
    expect(WIDGET_SIZE_CONTRACTS.timer.sizes).toEqual(['compact'])
    for (const id of ['linear', 'sentry', 'todoist'] as const) {
      expect(WIDGET_SIZE_CONTRACTS[id]).toEqual({
        sizes: ['compact', 'standard', 'full'],
        compact: expect.any(String),
        standard: expect.any(String),
        full: expect.any(String),
        docked: expect.any(String),
      })
    }
  })

  it('pins delivered At a glance identities to useful four-tier contracts', () => {
    expect(Object.keys(WIDGET_SIZE_CONTRACTS).slice(-3)).toEqual(['onThisDay', 'publicHolidays', 'auroraKp'])
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
      'habits', 'homeassistant', 'ics', 'jira', 'linear', 'moon', 'notes', 'onThisDay', 'publicHolidays', 'readingList',
      'recentlyClosed', 'rss', 'sentry', 'status', 'sun', 'tabGroups', 'tasks',
      'timer', 'todoist', 'vercel', 'weather', 'worldClocks',
    ])
    expect(WIDGET_SIZE_CONTRACTS.weather.docked).toBe('Temperature · location · condition')
    expect(WIDGET_SIZE_CONTRACTS.clock.docked).toBe('Time · date')
    expect(WIDGET_SIZE_CONTRACTS.bookmarks.docked).toBe('Full readable bookmark bar')
    expect(WIDGET_SIZE_CONTRACTS.github.docked).toBe('Selected activity counts')
    expect(WIDGET_SIZE_CONTRACTS.rss.docked).toBe('Top headline')
    expect(WIDGET_SIZE_CONTRACTS.monthCal.docked).toBeUndefined()
    expect(WIDGET_SIZE_CONTRACTS.links.docked).toBeUndefined()
  })

  it('declares every browser-native widget at Compact, Standard, Full, and Docked', () => {
    expect(WIDGET_SIZE_CONTRACTS.readingList).toEqual({
      sizes: ['compact', 'standard', 'full'],
      compact: 'Unread count and newest title',
      standard: 'Unread reading queue',
      full: 'Unread and recently read pages',
      docked: 'Unread count and newest title',
    })
    expect(WIDGET_SIZE_CONTRACTS.recentlyClosed).toEqual({
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
})
