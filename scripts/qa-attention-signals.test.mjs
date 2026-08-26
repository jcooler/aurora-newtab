import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  assertBuildCommit,
  assertNoIntersection,
  assertViewportContained,
  requireExact,
} from './qa-attention-signals-contracts.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires an exact invocation', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('rejects a stale build commit', () => {
  assert.throws(
    () => assertBuildCommit({ commit: 'old' }, 'head'),
    /dist provenance does not match HEAD/,
  )
  assert.equal(assertBuildCommit({ commit: 'head' }, 'head'), 'head')
})

test('rejects a context panel outside the viewport', () => {
  assert.throws(
    () => assertViewportContained(
      { left: -1, top: 20, right: 199, bottom: 120 },
      { width: 1600, height: 900 },
      8,
    ),
    /viewport/,
  )
  assert.doesNotThrow(() => assertViewportContained(
    { left: 8, top: 8, right: 200, bottom: 120 },
    { width: 1600, height: 900 },
    8,
  ))
})

test('rejects a context panel that intersects the Clock', () => {
  assert.throws(
    () => assertNoIntersection(
      { left: 600, top: 100, right: 900, bottom: 300 },
      { left: 800, top: 200, right: 1000, bottom: 400 },
      'Clock',
    ),
    /Clock/,
  )
  assert.doesNotThrow(() => assertNoIntersection(
    { left: 10, top: 10, right: 100, bottom: 100 },
    { left: 110, top: 10, right: 200, bottom: 100 },
    'Clock',
  ))
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-attention-signals.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
