import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  assertBuildCommit,
  assertSingleColumnGrid,
  assertTwoColumnGrid,
  assertViewportContained,
  requireExact,
} from './qa-tab-two-v2-connectors.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact production provenance', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  assert.throws(() => assertBuildCommit({ commit: 'stale' }, 'head'), /does not match HEAD/)
  assert.equal(assertBuildCommit({ commit: 'head' }, 'head'), 'head')
})

test('rejects connector galleries that do not match the intended responsive column count', () => {
  assert.doesNotThrow(() => assertTwoColumnGrid([
    { left: 0, top: 0, width: 300 },
    { left: 308, top: 0, width: 300 },
  ]))
  assert.throws(() => assertTwoColumnGrid([
    { left: 0, top: 0, width: 300 },
    { left: 0, top: 180, width: 300 },
  ]), /two columns/)

  assert.doesNotThrow(() => assertSingleColumnGrid([
    { left: 0, top: 0, width: 300 },
    { left: 0, top: 180, width: 300 },
  ]))
  assert.throws(() => assertSingleColumnGrid([
    { left: 0, top: 0, width: 145 },
    { left: 153, top: 0, width: 145 },
  ]), /one column/)
})

test('rejects a connector surface outside its viewport', () => {
  assert.doesNotThrow(() => assertViewportContained(
    { left: 8, top: 8, right: 952, bottom: 892 },
    { width: 1600, height: 900 },
  ))
  assert.throws(() => assertViewportContained(
    { left: -1, top: 0, right: 375, bottom: 812 },
    { width: 375, height: 812 },
  ), /viewport/)
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-tab-two-v2-connectors.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
