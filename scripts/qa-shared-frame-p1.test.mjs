import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildSfP1EvidenceManifest,
  validateSfP1EvidenceManifest,
} from './qa-shared-frame-p1.mjs'

const contractSource = readFileSync(new URL('../src/newtab/widgetSizeContracts.ts', import.meta.url), 'utf8')

function clone(value) {
  return structuredClone(value)
}

function manifest() {
  return buildSfP1EvidenceManifest(contractSource)
}

test('derives the exact Weather and On This Day matrix from the committed presentation authority', () => {
  const result = manifest()

  assert.deepEqual(result.references.map((entry) => entry.id), ['weather', 'onThisDay'])
  assert.deepEqual(result.references[0].tiers, ['compact', 'standard', 'full'])
  assert.deepEqual(result.references[0].states, [
    'loading',
    'ready',
    'empty',
    'stale',
    'partial',
    'permission-required',
    'hard-error',
  ])
  assert.deepEqual(result.references[1].tiers, ['compact', 'standard', 'full'])
  assert.deepEqual(result.references[1].states, ['loading', 'ready', 'empty', 'stale', 'hard-error'])

  const changedSource = contractSource.replace(
    "weather: contract('framed', ['compact', 'standard', 'full'], WEATHER_STATES",
    "weather: contract('framed', ['standard', 'full'], WEATHER_STATES",
  )
  assert.notEqual(changedSource, contractSource, 'the source mutation fixture must apply')
  assert.deepEqual(
    buildSfP1EvidenceManifest(changedSource).references[0].tiers,
    ['standard', 'full'],
    'the evidence tier matrix must follow the authority instead of a mirrored list',
  )

  const changedStates = contractSource.replace(
    "'partial', 'permission-required', 'hard-error'",
    "'partial', 'hard-error'",
  )
  assert.notEqual(changedStates, contractSource, 'the state mutation fixture must apply')
  assert.deepEqual(
    buildSfP1EvidenceManifest(changedStates).references[0].states,
    ['loading', 'ready', 'empty', 'stale', 'partial', 'hard-error'],
    'the evidence state matrix must follow the authority instead of a mirrored list',
  )
})

test('fails closed when presentation-contract syntax can no longer be evaluated', () => {
  const driftedSource = contractSource.replace(
    "const WEATHER_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'] as const",
    'const WEATHER_STATES = makeWeatherStates()',
  )
  assert.notEqual(driftedSource, contractSource, 'the syntax-drift fixture must apply')
  assert.throws(
    () => buildSfP1EvidenceManifest(driftedSource),
    /WEATHER_STATES|unsupported|fail closed/i,
  )
})

test('accepts the complete scalable evidence manifest', () => {
  assert.doesNotThrow(() => validateSfP1EvidenceManifest(manifest()))
})

test('rejects a missing declared ready tier capture', () => {
  const broken = clone(manifest())
  broken.captures = broken.captures.filter((entry) => !(
    entry.widget === 'weather'
    && entry.state === 'ready'
    && entry.tier === 'full'
    && entry.kind === 'free-tier'
  ))
  assert.throws(() => validateSfP1EvidenceManifest(broken), /weather.*full.*ready|ready.*weather.*full/i)
})

test('rejects a missing applicable presentation state', () => {
  const broken = clone(manifest())
  broken.captures = broken.captures.filter((entry) => !(
    entry.widget === 'onThisDay' && entry.state === 'hard-error'
  ))
  assert.throws(() => validateSfP1EvidenceManifest(broken), /onThisDay.*hard-error|hard-error.*onThisDay/i)
})

test('rejects a missing required theme', () => {
  const broken = clone(manifest())
  broken.themes = broken.themes.filter((entry) => entry.id !== 'saturated')
  assert.throws(() => validateSfP1EvidenceManifest(broken), /theme.*saturated|saturated.*theme/i)
})

for (const interaction of ['stack-next', 'stack-previous', 'stack-dot']) {
  test(`rejects a missing ${interaction} interaction`, () => {
    const broken = clone(manifest())
    broken.captures = broken.captures.filter((entry) => entry.interaction !== interaction)
    assert.throws(() => validateSfP1EvidenceManifest(broken), new RegExp(interaction, 'i'))
  })
}

test('rejects a missing required viewport', () => {
  const broken = clone(manifest())
  broken.viewports = broken.viewports.filter((entry) => entry.id !== 'exact-short')
  assert.throws(() => validateSfP1EvidenceManifest(broken), /viewport.*exact-short|exact-short.*viewport/i)
})

test('rejects a capture without an explicit usefulness verdict', () => {
  const broken = clone(manifest())
  broken.captures[0].verdict = null
  assert.throws(() => validateSfP1EvidenceManifest(broken), /usefulness verdict/i)
})

test('rejects a drifted exact frame dimension', () => {
  const broken = clone(manifest())
  broken.dimensions.standard.width = 319
  assert.throws(() => validateSfP1EvidenceManifest(broken), /standard.*320|320.*standard/i)
})
