import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  applySfP1ReviewedVerdicts,
  buildSfP1CapturePlan,
  buildSfP1EvidenceManifest,
  formatSfP1Catalog,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
  setSfP1ScenarioViewport,
  validateSfP1EvidenceManifest,
} from './qa-shared-frame-p1.mjs'

const contractSource = readFileSync(new URL('../src/newtab/widgetSizeContracts.ts', import.meta.url), 'utf8')

function clone(value) {
  return structuredClone(value)
}

function manifestFor(source) {
  const plan = buildSfP1CapturePlan(source)
  const verdicts = Object.fromEntries(plan.captures.map(({ key }) => [key, {
    verdict: 'Useful',
    reason: 'Explicit reviewed test fixture.',
  }]))
  return buildSfP1EvidenceManifest(source, verdicts)
}

function manifest() {
  return manifestFor(contractSource)
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
    "weather: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], WEATHER_STATES",
    "weather: framedContract(['standard', 'full'], ['standard', 'full'], WEATHER_STATES",
  )
  assert.notEqual(changedSource, contractSource, 'the source mutation fixture must apply')
  assert.deepEqual(
    manifestFor(changedSource).references[0].tiers,
    ['standard', 'full'],
    'the evidence tier matrix must follow the authority instead of a mirrored list',
  )

  const changedStates = contractSource.replace(
    "const WEATHER_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'] as const",
    "const WEATHER_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'hard-error'] as const",
  )
  assert.notEqual(changedStates, contractSource, 'the state mutation fixture must apply')
  assert.deepEqual(
    manifestFor(changedStates).references[0].states,
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

test('fails closed when any capture lacks a separate reviewed verdict', () => {
  const plan = buildSfP1CapturePlan(contractSource)
  const verdicts = Object.fromEntries(plan.captures.slice(1).map(({ key }) => [key, {
    verdict: 'Useful',
    reason: 'Explicit reviewed test fixture.',
  }]))
  assert.throws(
    () => applySfP1ReviewedVerdicts(plan, verdicts),
    new RegExp(plan.captures[0].key),
  )
  assert.ok(plan.captures.every((capture) => !('verdict' in capture)), 'capture planning must never manufacture verdicts')
})

test('labels a reviewed catalog generated from dirty preliminary evidence', () => {
  const catalog = formatSfP1Catalog({
    build: {
      commit: 'candidate-commit',
      provenance: { commit: 'candidate-commit' },
      preliminaryWorkingTree: true,
    },
    browser: { name: 'chromium', version: 'test' },
    captures: [],
  })

  assert.match(catalog, /preliminary working-tree witness/i)
  assert.match(catalog, /not final exact-reviewed proof/i)
  assert.equal(catalog.endsWith('\n\n'), false)
})

test('covers black, light, saturated blue, and bright pink panels plus true proportional narrow scaling', () => {
  const result = manifest()
  assert.deepEqual(result.themes.map(({ id }) => id), ['dark', 'light', 'saturated', 'bright-pink'])
  assert.ok(result.viewports.some(({ width, height }) => width === 599 && height === 800))
  assert.ok(result.viewports.some(({ width, height }) => width === 600 && height === 800))
  assert.ok(result.viewports.some(({ width, height }) => width === 412 && height === 915))
  for (const widget of ['weather', 'onThisDay']) {
    assert.ok(result.captures.some((capture) => capture.widget === widget && capture.tier === 'full' && capture.viewport === 'phone-narrow'))
  }
})

test('real-window mode requires headed viewport:null and cannot call page.setViewportSize', async () => {
  assert.throws(() => resolveSfP1BrowserMode(['--real-window']), /headed/i)
  const mode = resolveSfP1BrowserMode(['--headed', '--real-window'])
  assert.equal(mode.contextViewport, null)
  assert.equal(mode.emulatesViewport, false)
  assert.equal('deviceScaleFactor' in resolveSfP1ContextOptions(mode, 'dist'), false)
  const page = { setViewportSize: async () => assert.fail('real-window mode attempted emulation') }
  await setSfP1ScenarioViewport(page, { width: 412, height: 915 }, mode)

  const emulated = resolveSfP1BrowserMode([])
  assert.equal(resolveSfP1ContextOptions(emulated, 'dist').deviceScaleFactor, 1)
  let received = null
  await setSfP1ScenarioViewport({ setViewportSize: async (viewport) => { received = viewport } }, { width: 412, height: 915 }, emulated)
  assert.deepEqual(received, { width: 412, height: 915 })
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
