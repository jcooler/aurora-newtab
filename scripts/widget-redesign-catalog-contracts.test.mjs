import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEGACY_TARGET_MAP,
  MIXED_STACKS,
  SOURCE_WIDGET_IDS,
  TARGET_WIDGETS,
} from '../mockups/widget-redesign/catalog-model.mjs'
import {
  expectedCatalogCaptures,
  validateCatalogModel,
} from './widget-redesign-catalog-contracts.mjs'

const EXPECTED_SOURCE_IDS = [
  'auroraKp', 'bookmarks', 'clock', 'countdown', 'crypto', 'downloads', 'focus',
  'github', 'gitlab', 'greeting', 'habits', 'homeassistant', 'ics', 'jira',
  'linear', 'links', 'monthCal', 'moon', 'notes', 'onThisDay', 'publicHolidays',
  'quote', 'readingList', 'recentlyClosed', 'rss', 'search', 'sentry', 'status',
  'sun', 'tabGroups', 'tasks', 'timer', 'todoist', 'vercel', 'weather',
  'worldClocks',
]

test('maps all 36 live identities into 34 target identities exactly once', () => {
  assert.equal(SOURCE_WIDGET_IDS.length, 36)
  assert.equal(new Set(SOURCE_WIDGET_IDS).size, 36)
  assert.deepEqual([...SOURCE_WIDGET_IDS].sort(), EXPECTED_SOURCE_IDS)

  assert.equal(TARGET_WIDGETS.length, 34)
  assert.equal(new Set(TARGET_WIDGETS.map(({ id }) => id)).size, 34)
  assert.deepEqual(LEGACY_TARGET_MAP, Object.freeze({
    ics: 'calendar',
    monthCal: 'calendar',
    publicHolidays: 'calendar',
  }))
  assert.deepEqual(validateCatalogModel({
    sourceIds: SOURCE_WIDGET_IDS,
    targets: TARGET_WIDGETS,
    legacyTargetMap: LEGACY_TARGET_MAP,
    mixedStacks: MIXED_STACKS,
  }), [])
})

test('pins unified Calendar presentations and the required mixed stacks', () => {
  const calendar = TARGET_WIDGETS.find(({ id }) => id === 'calendar')
  assert.ok(calendar)
  assert.deepEqual(calendar.sourceIds, ['ics', 'monthCal', 'publicHolidays'])
  assert.deepEqual(calendar.tiers, ['docked', 'compact', 'standard', 'full'])
  assert.deepEqual(calendar.stackTiers, ['compact', 'standard', 'full'])
  assert.deepEqual(calendar.standardViews, ['agenda', 'month'])

  assert.deepEqual(MIXED_STACKS.map(({ members }) => members), [
    ['weather', 'onThisDay'],
    ['github', 'calendar'],
    ['tasks', 'notes'],
    ['clock', 'quote'],
    ['jira', 'sentry'],
  ])
})

test('expands every declared tier, primary theme, state, stack face, and special board', () => {
  const captures = expectedCatalogCaptures({
    targets: TARGET_WIDGETS,
    mixedStacks: MIXED_STACKS,
  })
  const keys = captures.map(({ key }) => key)
  assert.equal(new Set(keys).size, keys.length)

  for (const target of TARGET_WIDGETS) {
    for (const tier of target.tiers) {
      assert.ok(keys.includes(`${target.id}-${tier}-ready-dark`), `${target.id} ${tier} dark ready missing`)
    }
    assert.ok(keys.includes(`${target.id}-${target.primaryTier}-ready-light`), `${target.id} light missing`)
    assert.ok(keys.includes(`${target.id}-${target.primaryTier}-ready-pink`), `${target.id} saturated missing`)
    for (const state of target.states) {
      assert.ok(keys.includes(`${target.id}-${target.primaryTier}-${state}-dark`), `${target.id} ${state} missing`)
    }
    for (const tier of target.stackTiers) {
      assert.ok(keys.includes(`${target.id}-${tier}-stack-ready-dark`), `${target.id} ${tier} stack missing`)
    }
  }

  assert.ok(keys.includes('comparison-calendar-standard-agenda-month'))
  assert.ok(keys.includes('migration-calendar-consolidation'))
  for (const stack of MIXED_STACKS) assert.ok(keys.includes(`mixed-stack-${stack.id}`))
})

test('rejects duplicate sources, uncovered sources, unsafe output names, and invalid stack tiers', () => {
  const brokenTargets = TARGET_WIDGETS.map((target) => ({ ...target }))
  brokenTargets[0] = { ...brokenTargets[0], sourceIds: ['clock', 'clock'] }
  const errors = validateCatalogModel({
    sourceIds: SOURCE_WIDGET_IDS,
    targets: brokenTargets,
    legacyTargetMap: LEGACY_TARGET_MAP,
    mixedStacks: [{ id: '../escape', tier: 'full', members: ['tasks', 'notes'] }],
  })
  assert.ok(errors.some((message) => /duplicate source.*clock/i.test(message)))
  assert.ok(errors.some((message) => /unsafe.*escape/i.test(message)))
  assert.ok(errors.some((message) => /tasks.*full/i.test(message)))
})
