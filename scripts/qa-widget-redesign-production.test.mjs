import assert from 'node:assert/strict'
import test from 'node:test'

import { MIXED_STACKS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import {
  APPROVED_TARGET_IDS,
  PRODUCTION_CASES,
  assertProductionCoverage,
  parseBuildCommit,
} from './qa-widget-redesign-production.mjs'

test('pins every approved target and required mixed stack', () => {
  assert.deepEqual(APPROVED_TARGET_IDS, TARGET_WIDGETS.map(({ id }) => id))
  assert.deepEqual(
    PRODUCTION_CASES.filter(({ kind }) => kind === 'mixed-stack').map(({ key }) => key).sort(),
    MIXED_STACKS.map(({ id }) => id).sort(),
  )
  assert.doesNotThrow(() => assertProductionCoverage(PRODUCTION_CASES))
})

test('rejects an incomplete target or mixed-stack inventory', () => {
  assert.throws(() => assertProductionCoverage(PRODUCTION_CASES.slice(1)), /approved target/i)
  assert.throws(
    () => assertProductionCoverage(PRODUCTION_CASES.filter(({ key }) => key !== 'jira-sentry')),
    /mixed stack/i,
  )
})

test('reads exact reviewed dist provenance', () => {
  assert.equal(parseBuildCommit('{"commit":"abc123"}'), 'abc123')
  assert.throws(() => parseBuildCommit('{}'), /commit/i)
  assert.throws(() => parseBuildCommit('not json'), /provenance/i)
})
