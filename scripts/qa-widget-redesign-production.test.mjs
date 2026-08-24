import assert from 'node:assert/strict'
import test from 'node:test'

import { MIXED_STACKS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import {
  APPROVED_TARGET_IDS,
  OWNER_VISIBLE_CANVAS_CASE,
  PRODUCTION_CASES,
  assertProductionCoverage,
  buildOwnerVisibleLayout,
  parseBuildCommit,
} from './qa-widget-redesign-production.mjs'
import * as productionQa from './qa-widget-redesign-production.mjs'

test('pins every approved target and required mixed stack', () => {
  assert.deepEqual(APPROVED_TARGET_IDS, TARGET_WIDGETS.map(({ id }) => id))
  assert.deepEqual(
    PRODUCTION_CASES.filter(({ kind }) => kind === 'mixed-stack').map(({ key }) => key).sort(),
    MIXED_STACKS.map(({ id }) => id).sort(),
  )
  assert.deepEqual(
    PRODUCTION_CASES.filter(({ kind }) => kind === 'owner-visible-canvas'),
    [OWNER_VISIBLE_CANVAS_CASE],
  )
  assert.doesNotThrow(() => assertProductionCoverage(PRODUCTION_CASES))
})

test('builds one real free-canvas layout with the reviewed exceptions and redesigned faces together', () => {
  assert.deepEqual(
    OWNER_VISIBLE_CANVAS_CASE.intrinsic,
    ['bookmarks', 'clock', 'focus', 'greeting', 'quote', 'status'],
  )
  const document = buildOwnerVisibleLayout(OWNER_VISIBLE_CANVAS_CASE.members)
  const layout = document.layouts[0]
  assert.equal(document.activeLayoutId, layout.id)
  assert.equal(layout.widgets.bookmarks.kind, 'free')
  assert.equal(layout.widgets.greeting.kind, 'free')
  assert.equal(layout.widgets.links.tier, 'standard')
  assert.equal(layout.widgets.ics.tier, 'standard')
  assert.equal(layout.widgets.tasks.tier, 'compact')
  assert.deepEqual(layout.stacks, [])
})

test('rejects an incomplete target or mixed-stack inventory', () => {
  assert.throws(() => assertProductionCoverage(PRODUCTION_CASES.slice(1)), /approved target/i)
  assert.throws(
    () => assertProductionCoverage(PRODUCTION_CASES.filter(({ key }) => key !== 'jira-sentry')),
    /mixed stack/i,
  )
  assert.throws(
    () => assertProductionCoverage(PRODUCTION_CASES.filter(({ kind }) => kind !== 'owner-visible-canvas')),
    /owner-visible canvas/i,
  )
})

test('reads exact reviewed dist provenance', () => {
  assert.equal(parseBuildCommit('{"commit":"abc123"}'), 'abc123')
  assert.throws(() => parseBuildCommit('{}'), /commit/i)
  assert.throws(() => parseBuildCommit('not json'), /provenance/i)
})

test('rejects a fitting owner-visible frame with a visible internal scroll owner', () => {
  assert.equal(typeof productionQa.measureOwnerVisibleFrame, 'function', 'owner-visible frame measurement is missing')
  assert.equal(typeof productionQa.assertOwnerVisibleFrameMeasurement, 'function', 'owner-visible frame guard is missing')

  const scrollingChild = {
    getBoundingClientRect: () => ({ width: 120, height: 40 }),
  }
  const frame = {
    scrollWidth: 318,
    scrollHeight: 198,
    getBoundingClientRect: () => ({ width: 320, height: 200 }),
    querySelectorAll: () => [scrollingChild],
  }
  const measurement = productionQa.measureOwnerVisibleFrame(frame, (node) => (
    node === scrollingChild
      ? { display: 'block', visibility: 'visible', overflowX: 'auto', overflowY: 'hidden' }
      : { display: 'flex', visibility: 'visible', overflowX: 'hidden', overflowY: 'hidden' }
  ))

  assert.equal(measurement.internalScrollOwners, 1)
  assert.throws(
    () => productionQa.assertOwnerVisibleFrameMeasurement('search', 'standard', measurement),
    /internal scroll owner/i,
  )
})
