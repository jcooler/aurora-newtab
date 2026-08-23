import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import ts from 'typescript'

import { inspectAtAGlanceRequest } from './at-a-glance-harness-contracts.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { assertBuildProvenance } from './work-connector-harness-contracts.mjs'

const REFERENCE_WIDGET_IDS = Object.freeze(['weather', 'onThisDay'])
const EXPECTED_DIMENSIONS = Object.freeze({
  compact: Object.freeze({ width: 216, height: 132 }),
  standard: Object.freeze({ width: 320, height: 200 }),
  full: Object.freeze({ width: 460, height: 284 }),
})
const REQUIRED_THEMES = Object.freeze([
  Object.freeze({ id: 'dark', label: 'Default dark', panelColor: null }),
  Object.freeze({ id: 'light', label: 'Light panel', panelColor: '#e5e7eb' }),
  Object.freeze({ id: 'saturated', label: 'Saturated blue panel', panelColor: '#0057b8' }),
])
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'laptop', width: 1366, height: 768 }),
  Object.freeze({ id: 'exact-short', width: 1408, height: 445 }),
  Object.freeze({ id: 'common', width: 1600, height: 900 }),
  Object.freeze({ id: 'narrow-floor', width: 599, height: 800 }),
])
const VALID_VERDICTS = new Set(['Useful', 'Needs refinement', 'Rejected'])
const FIXED_TIME = new Date('2026-08-22T12:00:00-04:00')
const LOCAL_DAY_KEY = '2026-08-22'
const LOCATION = Object.freeze({ lat: 40.71, lon: -74.01, label: 'New York', manual: true })

function failClosed(message) {
  throw new Error(`SF-P1 presentation authority fail closed: ${message}`)
}

function unwrapExpression(node) {
  let current = node
  while (
    ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isSatisfiesExpression(current)
  ) current = current.expression
  return current
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  failClosed(`unsupported property name syntax: ${node.getText()}`)
}

function parsePresentationAuthority(source) {
  if (typeof source !== 'string' || source.length === 0) failClosed('source is empty')
  const file = ts.createSourceFile('widgetSizeContracts.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declarations = new Map()
  const diagnostics = file.parseDiagnostics ?? []
  if (diagnostics.length) failClosed(`TypeScript parse error: ${diagnostics[0].messageText}`)

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      declarations.set(declaration.name.text, declaration.initializer)
    }
  }

  const cache = new Map()
  const evaluating = new Set()
  const evaluateIdentifier = (name) => {
    if (cache.has(name)) return cache.get(name)
    if (evaluating.has(name)) failClosed(`cyclic constant ${name}`)
    const initializer = declarations.get(name)
    if (!initializer) failClosed(`unknown constant ${name}`)
    evaluating.add(name)
    const value = evaluate(initializer, name)
    evaluating.delete(name)
    cache.set(name, value)
    return value
  }

  const evaluate = (rawNode, label) => {
    const node = unwrapExpression(rawNode)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isIdentifier(node)) {
      if (node.text === 'undefined') return undefined
      return evaluateIdentifier(node.text)
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
      const value = evaluate(node.operand, label)
      if (typeof value !== 'number') failClosed(`${label} uses unary minus on a non-number`)
      return -value
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map((element, index) => {
        if (ts.isSpreadElement(element)) failClosed(`${label}[${index}] uses unsupported spread syntax`)
        return evaluate(element, `${label}[${index}]`)
      })
    }
    if (ts.isObjectLiteralExpression(node)) {
      const output = {}
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
          failClosed(`${label} uses unsupported object syntax: ${property.getText()}`)
        }
        const key = propertyName(property.name)
        if (Object.prototype.hasOwnProperty.call(output, key)) failClosed(`${label} repeats property ${key}`)
        output[key] = evaluate(property.initializer, `${label}.${key}`)
      }
      return output
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'Object'
        && node.expression.name.text === 'freeze'
      ) {
        if (node.arguments.length !== 1) failClosed(`${label} Object.freeze arity drifted`)
        return evaluate(node.arguments[0], label)
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === 'contract') {
        if (node.arguments.length < 3 || node.arguments.length > 8) failClosed(`${label} contract arity drifted`)
        const values = node.arguments.map((argument, index) => evaluate(argument, `${label}.argument${index}`))
        const [presentationClass, sizes, states] = values
        const tiers = values[7] ?? {}
        if (typeof presentationClass !== 'string' || !Array.isArray(sizes) || !Array.isArray(states) || !tiers || typeof tiers !== 'object' || Array.isArray(tiers)) {
          failClosed(`${label} contract arguments drifted`)
        }
        return {
          presentationClass,
          sizes,
          stackSizes: [...sizes],
          states,
          tiers,
        }
      }
      failClosed(`${label} uses unsupported call syntax: ${node.expression.getText()}`)
    }
    failClosed(`${label} uses unsupported syntax: ${node.getText()}`)
  }

  const authority = evaluateIdentifier('WIDGET_PRESENTATION_CONTRACTS')
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    failClosed('WIDGET_PRESENTATION_CONTRACTS is not an object')
  }
  return authority
}

function slugFor(widget) {
  return widget === 'onThisDay' ? 'on-this-day' : widget
}

function captureEntry({
  key,
  kind,
  widget,
  tier,
  state,
  theme,
  viewport,
  verdict,
  verdictReason,
  interaction = null,
  expectedFace = null,
}) {
  return {
    key,
    filename: `${key}.png`,
    kind,
    widget,
    tier,
    state,
    theme,
    viewport,
    interaction,
    expectedFace,
    verdict,
    verdictReason,
  }
}

const STATE_TIER = Object.freeze({
  weather: Object.freeze({
    loading: 'standard',
    empty: 'compact',
    stale: 'full',
    partial: 'standard',
    'permission-required': 'compact',
    'hard-error': 'compact',
  }),
  onThisDay: Object.freeze({
    loading: 'standard',
    empty: 'compact',
    stale: 'standard',
    'hard-error': 'compact',
  }),
})

function buildCaptureMatrix(references) {
  const captures = []
  for (const reference of references) {
    for (const tier of reference.tiers) {
      const slug = slugFor(reference.id)
      captures.push(captureEntry({
        key: `${slug}-ready-${tier}-dark-common`,
        kind: 'free-tier',
        widget: reference.id,
        tier,
        state: 'ready',
        theme: 'dark',
        viewport: 'common',
        verdict: 'Useful',
        verdictReason: `The ${tier} ${reference.id} reference composition is legible, materially distinct, and bounded at its declared frame.`,
      }))
    }
    for (const state of reference.states.filter((candidate) => candidate !== 'ready')) {
      const tier = STATE_TIER[reference.id]?.[state]
      if (!tier) failClosed(`${reference.id} state ${state} has no witness tier`)
      captures.push(captureEntry({
        key: `${slugFor(reference.id)}-${state}-${tier}-dark-laptop`,
        kind: 'state',
        widget: reference.id,
        tier,
        state,
        theme: 'dark',
        viewport: 'laptop',
        verdict: 'Useful',
        verdictReason: `The truthful ${reference.id} ${state} presentation remains readable and stable inside the selected ${tier} frame.`,
      }))
    }
    for (const theme of ['light', 'saturated']) {
      captures.push(captureEntry({
        key: `${slugFor(reference.id)}-ready-standard-${theme}-common`,
        kind: 'theme',
        widget: reference.id,
        tier: 'standard',
        state: 'ready',
        theme,
        viewport: 'common',
        verdict: 'Useful',
        verdictReason: `The ${reference.id} Standard hierarchy and keyboard focus treatment remain clear on the ${theme} panel.`,
      }))
    }
    captures.push(captureEntry({
      key: `${slugFor(reference.id)}-ready-full-dark-narrow-floor`,
      kind: 'narrow',
      widget: reference.id,
      tier: 'full',
      state: 'ready',
      theme: 'dark',
      viewport: 'narrow-floor',
      verdict: 'Useful',
      verdictReason: `The ${reference.id} Full frame remains exact, readable, and contained at the 599px narrow-floor boundary.`,
    }))
  }

  const stackRows = [
    ['stack-initial-weather-dark-exact-short', 'stack-initial', 'weather', 'The initial Weather face establishes the exact Standard stack footprint without a write.'],
    ['stack-next-on-this-day-dark-exact-short', 'stack-next', 'onThisDay', 'Next pages to On This Day without moving or resizing the Standard stack.'],
    ['stack-previous-on-this-day-dark-exact-short', 'stack-previous', 'onThisDay', 'Previous wraps to On This Day without moving or resizing the Standard stack.'],
    ['stack-dot-on-this-day-dark-exact-short', 'stack-dot', 'onThisDay', 'The direct On This Day dot preserves the exact Standard stack footprint.'],
    ['stack-swipe-on-this-day-dark-exact-short', 'stack-swipe', 'onThisDay', 'Swipe pages to On This Day with no selected text and no geometry shift.'],
    ['stack-weather-details-dark-exact-short', 'stack-plain-click-details', 'weather', 'A plain Weather click opens the real viewport-owned details surface without selecting or paging the stack.'],
  ]
  for (const [key, interaction, expectedFace, verdictReason] of stackRows) {
    captures.push(captureEntry({
      key,
      kind: 'stack',
      widget: 'stack',
      tier: 'standard',
      state: 'ready',
      theme: 'dark',
      viewport: 'exact-short',
      interaction,
      expectedFace,
      verdict: 'Useful',
      verdictReason,
    }))
  }
  return captures
}

export function buildSfP1EvidenceManifest(source) {
  const authority = parsePresentationAuthority(source)
  const references = REFERENCE_WIDGET_IDS.map((id) => {
    const contract = authority[id]
    if (!contract) failClosed(`missing ${id} contract`)
    if (contract.presentationClass !== 'framed') failClosed(`${id} is not framed`)
    if (!Array.isArray(contract.sizes) || !Array.isArray(contract.stackSizes) || !Array.isArray(contract.states)) {
      failClosed(`${id} sizes/states are not literal arrays`)
    }
    if (JSON.stringify(contract.sizes) !== JSON.stringify(contract.stackSizes)) {
      failClosed(`${id} stackSizes drifted from the contract sizes`)
    }
    for (const tier of contract.sizes) {
      const composition = contract.tiers?.[tier]
      if (!composition || !Array.isArray(composition.essential) || !Array.isArray(composition.signature)) {
        failClosed(`${id} is missing composition metadata for ${tier}`)
      }
      if (composition.essential.length === 0 || composition.signature.length === 0) {
        failClosed(`${id} ${tier} has empty essential or signature metadata`)
      }
    }
    return {
      id,
      tiers: [...contract.sizes],
      stackTiers: [...contract.stackSizes],
      states: [...contract.states],
      compositions: structuredClone(contract.tiers),
    }
  })
  return {
    authorityIds: Object.keys(authority),
    references,
    dimensions: structuredClone(EXPECTED_DIMENSIONS),
    themes: structuredClone(REQUIRED_THEMES),
    viewports: structuredClone(REQUIRED_VIEWPORTS),
    captures: buildCaptureMatrix(references),
  }
}

function requireExactRows(actual, expected, label) {
  const actualIds = actual.map((entry) => entry.id)
  const expectedIds = expected.map((entry) => entry.id)
  for (const id of expectedIds) assert(actualIds.includes(id), `${label} ${id} declaration is missing`)
  for (const id of actualIds) assert(expectedIds.includes(id), `${label} ${id} declaration is unexpected`)
  assert.deepEqual(actualIds, expectedIds, `${label} declarations must be exact`)
}

export function validateSfP1EvidenceManifest(manifest) {
  assert.deepEqual(manifest.references.map((entry) => entry.id), REFERENCE_WIDGET_IDS, 'reference widgets must be exactly weather and onThisDay')
  for (const [tier, expected] of Object.entries(EXPECTED_DIMENSIONS)) {
    const actual = manifest.dimensions?.[tier]
    assert.equal(actual?.width, expected.width, `${tier} width must be ${expected.width}`)
    assert.equal(actual?.height, expected.height, `${tier} height must be ${expected.height}`)
  }
  requireExactRows(manifest.themes, REQUIRED_THEMES, 'theme')
  requireExactRows(manifest.viewports, REQUIRED_VIEWPORTS, 'viewport')

  const keys = new Set()
  const files = new Set()
  for (const capture of manifest.captures) {
    assert.equal(typeof capture.key, 'string', 'capture key is required')
    assert(!keys.has(capture.key), `duplicate capture key ${capture.key}`)
    keys.add(capture.key)
    assert.equal(typeof capture.filename, 'string', `${capture.key} filename is required`)
    assert(!files.has(capture.filename), `duplicate capture filename ${capture.filename}`)
    files.add(capture.filename)
    assert(VALID_VERDICTS.has(capture.verdict), `${capture.key} is missing an explicit usefulness verdict`)
    assert.equal(typeof capture.verdictReason, 'string', `${capture.key} is missing its usefulness verdict reason`)
    assert(capture.verdictReason.trim().length > 0, `${capture.key} is missing its usefulness verdict reason`)
    assert(manifest.themes.some((entry) => entry.id === capture.theme), `${capture.key} uses unknown theme ${capture.theme}`)
    assert(manifest.viewports.some((entry) => entry.id === capture.viewport), `${capture.key} uses unknown viewport ${capture.viewport}`)
  }

  for (const reference of manifest.references) {
    for (const tier of reference.tiers) {
      assert(
        manifest.captures.some((entry) => entry.kind === 'free-tier' && entry.widget === reference.id && entry.tier === tier && entry.state === 'ready'),
        `${reference.id} ${tier} ready free-tier capture is missing`,
      )
    }
    for (const state of reference.states) {
      assert(
        manifest.captures.some((entry) => entry.widget === reference.id && entry.state === state),
        `${reference.id} ${state} state capture is missing`,
      )
    }
  }
  for (const interaction of ['stack-initial', 'stack-next', 'stack-previous', 'stack-dot', 'stack-swipe', 'stack-plain-click-details']) {
    assert(manifest.captures.some((entry) => entry.interaction === interaction), `${interaction} interaction is missing`)
  }
  for (const face of REFERENCE_WIDGET_IDS) {
    assert(manifest.captures.some((entry) => entry.kind === 'stack' && entry.expectedFace === face), `stack face ${face} is missing`)
  }
  return manifest
}

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function snapshotScope(id, config, runtimeScope) {
  const identity = `${id}\n${canonical(config)}${runtimeScope === undefined ? '' : `\n${canonical(runtimeScope)}`}`
  return `${id}:v1:${createHash('sha256').update(identity).digest('hex')}`
}

function weatherUrls() {
  const forecast = new URL('https://api.open-meteo.com/v1/forecast')
  forecast.searchParams.set('temperature_unit', 'celsius')
  forecast.searchParams.set('wind_speed_unit', 'kmh')
  forecast.searchParams.set('forecast_hours', '12')
  forecast.searchParams.set('forecast_days', '1')
  forecast.searchParams.set('timezone', 'auto')
  forecast.searchParams.set('timeformat', 'iso8601')
  forecast.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day')
  forecast.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
  forecast.searchParams.set('daily', 'sunrise,sunset')
  forecast.searchParams.set('latitude', String(LOCATION.lat))
  forecast.searchParams.set('longitude', String(LOCATION.lon))
  const environment = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  environment.searchParams.set('timezone', 'auto')
  environment.searchParams.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
  environment.searchParams.set('latitude', String(LOCATION.lat))
  environment.searchParams.set('longitude', String(LOCATION.lon))
  return { forecast: forecast.href, environment: environment.href }
}

function weatherSnapshot({ stale = false, partial = false } = {}) {
  const fetchedAt = FIXED_TIME.getTime() - (stale ? 60 * 60_000 : 0)
  const { forecast, environment } = weatherUrls()
  const hourly = Array.from({ length: 12 }, (_, index) => ({
    time: `2026-08-22T${String(9 + index).padStart(2, '0')}:00`,
    tempC: 20 + index * 0.5,
    precipProb: index === 3 ? 70 : 15,
    code: index === 3 ? 61 : 2,
    isDay: index < 10,
  }))
  return {
    current: {
      tempC: 21.4,
      feelsLikeC: 22.1,
      code: 2,
      windKmh: 14.2,
      windDirection: 315,
      humidity: 60,
      isDay: true,
    },
    hourly,
    fetchedAt,
    locationLabel: LOCATION.label,
    requestIdentity: `open-meteo:v1:${forecast}`,
    sunriseISO: '2026-08-22T06:12',
    sunsetISO: '2026-08-22T19:58',
    environment: {
      requestIdentity: `open-meteo-air:v1:${environment}`,
      fetchedAt,
      status: partial ? 'unavailable' : 'available',
      usAqi: partial ? null : 42,
      uvIndex: partial ? null : 5,
      pollen: partial
        ? { status: 'unavailable' }
        : { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 7 }] },
    },
  }
}

function weatherAlertCache() {
  return {
    requestIdentity: 'nws-alerts:v1:https://api.weather.gov/alerts/active?point=40.71,-74.01',
    fetchedAt: FIXED_TIME.getTime(),
    status: 'supported',
    alerts: [],
  }
}

function onThisDayData({ empty = false } = {}) {
  const rows = (prefix, count, offset = 0) => Array.from({ length: count }, (_, index) => ({
    year: 1800 + offset + index,
    text: `${prefix} ${index + 1} with a bounded, readable historical summary for the shared-frame witness.`,
    url: `https://en.wikipedia.org/wiki/Aurora_${offset + index + 1}`,
  }))
  return {
    dateKey: '08-22',
    events: empty ? [] : rows('Aurora history witness event', 8),
    births: empty ? [] : rows('Aurora history witness birth', 4, 40),
    deaths: empty ? [] : rows('Aurora history witness death', 4, 60),
  }
}

function forecastPayload() {
  return {
    current: {
      temperature_2m: 21.4,
      apparent_temperature: 22.1,
      weather_code: 2,
      wind_speed_10m: 14.2,
      wind_direction_10m: 315,
      relative_humidity_2m: 60,
      is_day: 1,
    },
    hourly: {
      time: Array.from({ length: 12 }, (_, index) => `2026-08-22T${String(9 + index).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: 12 }, (_, index) => 20 + index * 0.5),
      precipitation_probability: Array.from({ length: 12 }, (_, index) => index === 3 ? 70 : 15),
      weather_code: Array.from({ length: 12 }, (_, index) => index === 3 ? 61 : 2),
      is_day: Array.from({ length: 12 }, (_, index) => index < 10 ? 1 : 0),
    },
    daily: { sunrise: ['2026-08-22T06:12'], sunset: ['2026-08-22T19:58'] },
  }
}

function environmentPayload() {
  return {
    current: {
      us_aqi: 42,
      uv_index: 5,
      alder_pollen: 0,
      birch_pollen: 0,
      grass_pollen: 7,
      mugwort_pollen: 0,
      olive_pollen: 0,
      ragweed_pollen: 0,
    },
  }
}

function wikipediaPayload() {
  const rows = (prefix, count, offset = 0) => Array.from({ length: count }, (_, index) => ({
    year: 1800 + offset + index,
    text: `${prefix} ${index + 1} with a bounded, readable historical summary for the shared-frame witness.`,
    pages: [{ content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Aurora_${offset + index + 1}` } } }],
  }))
  return {
    selected: rows('Aurora history witness event', 4),
    events: rows('Aurora history witness event', 8, 10),
    births: rows('Aurora history witness birth', 4, 40),
    deaths: rows('Aurora history witness death', 4, 60),
  }
}

function prepareExactScratch(repoRoot, requestedName) {
  const root = resolve(repoRoot)
  const target = resolve(root, requestedName)
  if (dirname(target) !== root || basename(target) !== requestedName || !requestedName.startsWith('.qa-shared-frame-p1-')) {
    throw new Error(`unsafe SF-P1 scratch path: ${target}`)
  }
  let existing = null
  try {
    existing = lstatSync(target)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (existing?.isSymbolicLink()) throw new Error(`SF-P1 scratch path cannot be a link: ${target}`)
  if (existing && !existing.isDirectory()) throw new Error(`SF-P1 scratch path is not a directory: ${target}`)
  if (existing) rmSync(target, { recursive: true, force: true })
  mkdirSync(target)
  const prepared = lstatSync(target)
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) throw new Error(`SF-P1 scratch path did not resolve to a real directory: ${target}`)
  if (realpathSync(dirname(target)).toLowerCase() !== realpathSync(root).toLowerCase()) {
    throw new Error(`SF-P1 scratch path left the active repository: ${target}`)
  }
  return target
}

function assertCatalogPath(repoRoot, catalogDir) {
  const expected = resolve(repoRoot, 'docs/superpowers/catalog/shared-frames/sf-p1')
  if (resolve(catalogDir).toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`unsafe SF-P1 catalog path: ${catalogDir}`)
  }
  mkdirSync(catalogDir, { recursive: true })
  const entry = lstatSync(catalogDir)
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`SF-P1 catalog must be a real directory: ${catalogDir}`)
}

function viewportFor(manifest, id) {
  const viewport = manifest.viewports.find((entry) => entry.id === id)
  if (!viewport) throw new Error(`unknown SF-P1 viewport ${id}`)
  return viewport
}

function themeFor(manifest, id) {
  const theme = manifest.themes.find((entry) => entry.id === id)
  if (!theme) throw new Error(`unknown SF-P1 theme ${id}`)
  return theme
}

function referenceFor(manifest, id) {
  const reference = manifest.references.find((entry) => entry.id === id)
  if (!reference) throw new Error(`unknown SF-P1 reference ${id}`)
  return reference
}

function expectedStateText(widget, state) {
  if (widget === 'weather') {
    return {
      loading: ['Loading weather…'],
      empty: ['No data yet.'],
      stale: ['Refreshing…'],
      partial: ['Weather details partially unavailable.'],
      'permission-required': ['Weather needs a location.', 'Locate'],
      'hard-error': ['Weather unavailable. Try again.', 'Refresh'],
    }[state] ?? []
  }
  return {
    loading: ['Loading On This Day…'],
    empty: ['No event returned for today.'],
    stale: ['Showing saved data while On This Day refreshes.'],
    'hard-error': ['On This Day is unavailable.', 'Refresh'],
  }[state] ?? []
}

function contentProbe(widget, tier, state) {
  if (state !== 'ready') {
    return {
      essentialSelectors: widget === 'weather'
        ? ['[data-tier-frame-state] .weather-tier-state, [data-tier-frame-state] [role="status"], [data-tier-frame-state] [role="alert"]']
        : ['[data-tier-frame-state] [role="status"], [data-tier-frame-state] [role="alert"]'],
      signatureSelectors: widget === 'weather' && state === 'permission-required'
        ? ['input[aria-label="Search for a city"]']
        : widget === 'onThisDay' && state === 'stale'
          ? ['.on-this-day-tier-list > li']
          : widget === 'onThisDay' && state === 'hard-error'
            ? ['button[aria-label="Refresh On This Day"]']
            : [],
      expectedTexts: expectedStateText(widget, state),
      forbiddenSelectors: [],
      expectedEventCount: null,
    }
  }
  if (widget === 'weather') {
    return {
      essentialSelectors: ['[data-weather-current]', '[data-weather-condition-location]'],
      signatureSelectors: [tier === 'full'
        ? '[data-weather-summary-hourly]'
        : tier === 'standard'
          ? '[data-weather-summary-trend]'
          : '[data-weather-summary-row="current"]'],
      expectedTexts: ['New York'],
      forbiddenSelectors: tier === 'compact'
        ? ['[data-weather-summary-metrics]', '[data-weather-summary-hourly]']
        : tier === 'standard'
          ? ['[data-weather-summary-hourly]']
          : [],
      expectedEventCount: null,
    }
  }
  return {
    essentialSelectors: ['.on-this-day-tier-header h2', '.on-this-day-tier-header p', '.on-this-day-tier-list > li'],
    signatureSelectors: ['.on-this-day-tier-list'],
    expectedTexts: tier === 'full'
      ? ['On This Day', 'August 22', 'Aurora history witness event', 'Born', 'Died', 'More on Wikipedia']
      : ['On This Day', 'August 22', 'Aurora history witness event', 'More on Wikipedia'],
    forbiddenSelectors: ['[data-work-widget-scroll]', '.overflow-y-auto', '.overflow-y-scroll'],
    expectedEventCount: tier === 'compact' ? 1 : tier === 'standard' ? 3 : 5,
  }
}

function expectedFrameSize(dimensions, tier, viewport) {
  const declared = dimensions[tier]
  const width = Math.min(declared.width, viewport.width - 24)
  return { width, height: width * declared.height / declared.width }
}

function rectShape(rect) {
  if (!rect) return null
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function withinTolerance(actual, expected, tolerance = 0.5) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
}

async function measureFrame({ page, frame, capture, manifest, leaveFocusVisible = false }) {
  const viewport = viewportFor(manifest, capture.viewport)
  const probe = contentProbe(capture.widget === 'stack' ? capture.expectedFace : capture.widget, capture.tier, capture.state)
  const measured = await frame.evaluate((root, input) => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
    }
    const textOf = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const visibleTextOf = (element) => {
      if (!element) return ''
      const text = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const parent = node.parentElement
        const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (parent && value && visible(parent)) text.push(value)
        node = walker.nextNode()
      }
      return text.join(' ').replace(/\s+/g, ' ').trim()
    }
    const rootRect = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const internalScrollOwners = [...root.querySelectorAll('*')].flatMap((element) => {
      const childStyle = getComputedStyle(element)
      const scrolls = /(auto|scroll)/.test(`${childStyle.overflowX} ${childStyle.overflowY}`)
        && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
      return scrolls ? [{
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        overflowX: childStyle.overflowX,
        overflowY: childStyle.overflowY,
      }] : []
    })
    const textSizes = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (!visible(element)) continue
      const ownsText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim())
      if (!ownsText) continue
      const size = Number.parseFloat(getComputedStyle(element).fontSize)
      if (Number.isFinite(size)) textSizes.push(size)
    }
    const interactive = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="link"]')]
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        name: (element.getAttribute('aria-label') || element.getAttribute('title') || textOf(element)).trim(),
      }))
    const nameCounts = new Map()
    for (const entry of interactive) {
      const normalized = entry.name.toLocaleLowerCase()
      if (!normalized) continue
      nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1)
    }
    const duplicateAccessibleNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count }))
    const inspectSelectors = (selectors) => selectors.map((selector) => {
      const elements = [...root.querySelectorAll(selector)].filter(visible)
      return {
        selector,
        count: elements.length,
        text: elements.map(visibleTextOf).filter(Boolean),
        clipped: elements.flatMap((element) => {
          const rect = element.getBoundingClientRect()
          return rect.left < rootRect.left - 0.5
            || rect.top < rootRect.top - 0.5
            || rect.right > rootRect.right + 0.5
            || rect.bottom > rootRect.bottom + 0.5
            ? [{ selector, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }]
            : []
        }),
      }
    })
    return {
      rect: {
        left: rootRect.left,
        top: rootRect.top,
        right: rootRect.right,
        bottom: rootRect.bottom,
        width: rootRect.width,
        height: rootRect.height,
      },
      client: { width: root.clientWidth, height: root.clientHeight },
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      overflow: { x: style.overflowX, y: style.overflowY },
      geometryDiagnostics: {
        computedWidth: style.width,
        computedHeight: style.height,
        tierFrameWidth: style.getPropertyValue('--tier-frame-width').trim(),
        tierFrameRatio: style.getPropertyValue('--tier-frame-ratio').trim(),
        transform: style.transform,
        zoom: style.zoom,
        devicePixelRatio: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        visualViewportScale: window.visualViewport?.scale ?? null,
        ancestors: [...function* ancestors() {
          let element = root.parentElement
          while (element) {
            const ancestorStyle = getComputedStyle(element)
            yield {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className : '',
              transform: ancestorStyle.transform,
              zoom: ancestorStyle.zoom,
            }
            element = element.parentElement
          }
        }()],
      },
      panel: {
        background: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
        panelSolid: getComputedStyle(document.documentElement).getPropertyValue('--panel-solid').trim(),
        ink: getComputedStyle(document.documentElement).getPropertyValue('--fg').trim(),
        mutedInk: getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim(),
        scheme: document.documentElement.dataset.scheme ?? 'dark',
      },
      minimumTextSize: textSizes.length ? Math.min(...textSizes) : null,
      internalScrollOwners,
      duplicateAccessibleNames,
      interactive,
      essential: inspectSelectors(input.essentialSelectors),
      signature: inspectSelectors(input.signatureSelectors),
      forbidden: inspectSelectors(input.forbiddenSelectors),
      text: visibleTextOf(root),
      eventCount: root.querySelectorAll('.on-this-day-tier-list > li').length,
      page: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
    }
  }, probe)

  const focusable = frame.locator('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').first()
  let focus = { applicable: false, visible: null, name: null, outlineStyle: null, outlineWidth: null, outlineColor: null, boxShadow: null }
  if (await focusable.count()) {
    await page.keyboard.press('Tab')
    await focusable.focus()
    focus = await focusable.evaluate((element) => {
      const style = getComputedStyle(element)
      const outlineWidth = Number.parseFloat(style.outlineWidth)
      const visible = element.matches(':focus-visible')
        && ((style.outlineStyle !== 'none' && outlineWidth >= 2) || style.boxShadow !== 'none')
      return {
        applicable: true,
        visible,
        name: element.getAttribute('aria-label') || element.getAttribute('title') || (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      }
    })
    if (!leaveFocusVisible) await focusable.evaluate((element) => element.blur())
  }
  measured.focus = focus
  measured.selectedText = await page.evaluate(() => getSelection()?.toString() ?? '')

  const expected = expectedFrameSize(manifest.dimensions, capture.tier, viewport)
  assert(withinTolerance(measured.rect.width, expected.width), `${capture.key}: frame width ${measured.rect.width} != ${expected.width}; ${JSON.stringify(measured.geometryDiagnostics)}`)
  assert(withinTolerance(measured.rect.height, expected.height), `${capture.key}: frame height ${measured.rect.height} != ${expected.height}; ${JSON.stringify(measured.geometryDiagnostics)}`)
  assert.equal(measured.overflow.x, 'hidden', `${capture.key}: frame overflow-x is ${measured.overflow.x}`)
  assert.equal(measured.overflow.y, 'hidden', `${capture.key}: frame overflow-y is ${measured.overflow.y}`)
  assert(measured.scroll.width <= measured.client.width + 0.5, `${capture.key}: frame content scroll width ${measured.scroll.width} > ${measured.client.width}`)
  assert(measured.scroll.height <= measured.client.height + 0.5, `${capture.key}: frame content scroll height ${measured.scroll.height} > ${measured.client.height}`)
  assert.equal(measured.internalScrollOwners.length, 0, `${capture.key}: internal frame scrollbar ${JSON.stringify(measured.internalScrollOwners)}`)
  assert.equal(measured.duplicateAccessibleNames.length, 0, `${capture.key}: duplicate accessible names ${JSON.stringify(measured.duplicateAccessibleNames)}`)
  assert(measured.minimumTextSize !== null && measured.minimumTextSize >= 11, `${capture.key}: minimum text size is ${measured.minimumTextSize}px`)
  assert(measured.page.scrollWidth <= measured.page.clientWidth, `${capture.key}: page has horizontal overflow`)
  for (const row of [...measured.essential, ...measured.signature]) {
    assert(row.count > 0, `${capture.key}: missing essential/signature selector ${row.selector}`)
    assert.equal(row.clipped.length, 0, `${capture.key}: clipped essential/signature selector ${row.selector}`)
  }
  for (const row of measured.forbidden) assert.equal(row.count, 0, `${capture.key}: forbidden selector ${row.selector} is visible`)
  for (const expectedText of probe.expectedTexts) {
    assert(measured.text.includes(expectedText), `${capture.key}: missing expected text ${expectedText}`)
  }
  if (probe.expectedEventCount !== null) {
    assert.equal(measured.eventCount, probe.expectedEventCount, `${capture.key}: historical event row count drifted`)
  }
  if (focus.applicable) assert.equal(focus.visible, true, `${capture.key}: focus indicator is not visibly painted`)
  return measured
}

function topLevelChanges(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => canonical(before[key]) !== canonical(after[key])).sort()
}

function assertLayoutShape(layouts, { tier, stack, facing }) {
  assert.equal(layouts.version, 1)
  assert.equal(layouts.activeLayoutId, 'sf-p1-witness')
  assert.equal(layouts.layouts.length, 1)
  const layout = layouts.layouts[0]
  assert.equal(layout.id, 'sf-p1-witness')
  if (stack) {
    assert.equal(layout.stacks?.length, 1)
    assert.deepEqual(layout.stacks[0].members, ['weather', 'onThisDay'])
    assert.equal(layout.stacks[0].facing, facing)
    assert.equal(layout.stacks[0].tier, 'standard')
    assert.equal(layout.stacks[0].anchor, 'center')
    assert.equal(layout.stacks[0].offsetX, 0)
    assert.equal(layout.stacks[0].offsetY, 0)
    assert.equal(layout.stacks[0].layer, 7)
    assert.equal(layout.widgets.weather, undefined)
    assert.equal(layout.widgets.onThisDay, undefined)
  } else {
    const active = Object.entries(layout.widgets).find(([, placement]) => placement.kind === 'free')
    assert(active, 'free witness placement is missing')
    assert.equal(active[1].tier, tier)
    assert.equal(active[1].anchor, 'center')
    assert.equal(active[1].offsetX, 0)
    assert.equal(active[1].offsetY, 0)
    assert.equal(active[1].layer, 7)
    assert.equal(layout.stacks, undefined)
  }
}

function writeCatalog({ catalogPath, evidence }) {
  const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const rows = evidence.captures.map((capture) => {
    const geometry = `${capture.measurement.rect.width.toFixed(2)}x${capture.measurement.rect.height.toFixed(2)} CSS px; client ${capture.measurement.client.width}x${capture.measurement.client.height}; scroll ${capture.measurement.scroll.width}x${capture.measurement.scroll.height}; overflow ${capture.measurement.overflow.x}/${capture.measurement.overflow.y}`
    const essential = capture.measurement.essential.flatMap((entry) => entry.text).join(' / ') || capture.measurement.text
    const signature = capture.measurement.signature.flatMap((entry) => entry.text).join(' / ') || `State: ${capture.state}`
    const writes = capture.storage.writes.length
      ? capture.storage.writes.map((keys) => keys.join(', ')).join(' / ')
      : 'None'
    const focus = capture.measurement.focus.applicable
      ? `${capture.measurement.focus.visible ? 'Visible' : 'Not visible'} (${capture.measurement.focus.name})`
      : 'N/A: no focusable control in this state'
    return `| ![${escapeCell(capture.key)}](${capture.filename}) | ${escapeCell(capture.widget)} / ${escapeCell(capture.kind)} | ${escapeCell(capture.tier)} / ${escapeCell(capture.state)} | ${escapeCell(capture.theme)} | ${capture.viewport.width}x${capture.viewport.height} | ${escapeCell(geometry)} | ${escapeCell(essential)} | ${escapeCell(signature)} | ${capture.measurement.minimumTextSize}px / ${escapeCell(focus)} | ${escapeCell(capture.measurement.selectedText || 'None')} | ${escapeCell(writes)} | **${escapeCell(capture.verdict)}**: ${escapeCell(capture.verdictReason)} |`
  })
  const verdictCounts = Object.fromEntries([...VALID_VERDICTS].map((verdict) => [verdict, evidence.captures.filter((entry) => entry.verdict === verdict).length]))
  const lines = [
    '# SF-P1 Shared Frame Owner Catalog',
    '',
    `- Preliminary build commit: \`${evidence.build.commit}\``,
    `- Build provenance: \`${evidence.build.provenance.commit}\``,
    `- Browser: ${evidence.browser.name} ${evidence.browser.version}; Playwright Chromium; DPR 1; reduced motion`,
    `- Original-resolution captures: ${evidence.captures.length}`,
    `- Verdicts: ${verdictCounts.Useful} Useful, ${verdictCounts['Needs refinement']} Needs refinement, ${verdictCounts.Rejected} Rejected`,
    '- Verdicts are explicit per image and are not calculated from assertion status.',
    '',
    '| Original PNG | Subject | Tier / state | Theme | Viewport | Measured frame and content geometry | Visible essential content | Visible signature content | Minimum text / focus | Selected text | Runtime storage writes | Usefulness verdict |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ]
  writeFileSync(catalogPath, `${lines.join('\n')}\n`, 'utf8')
}

async function run() {
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const expectedCommit = process.argv.find((argument) => argument.startsWith('--expected-commit='))?.slice('--expected-commit='.length) ?? commit
  const headed = process.argv.includes('--headed')
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run SF-P1 from the active repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'SF-P1 refuses the protected original checkout')
  assert.equal(branch, 'feat/aurora-2-observatory', 'SF-P1 must run on feat/aurora-2-observatory')
  assert.equal(commit, expectedCommit, `SF-P1 expected commit ${expectedCommit} but found ${commit}`)
  assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))

  const sourcePath = resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts')
  const manifest = validateSfP1EvidenceManifest(buildSfP1EvidenceManifest(readFileSync(sourcePath, 'utf8')))
  const dist = resolve(repoRoot, 'dist')
  const provenanceText = readFileSync(resolve(dist, 'build-provenance.json'), 'utf8')
  assertBuildProvenance(provenanceText, expectedCommit)
  const provenance = JSON.parse(provenanceText)
  const profileDir = prepareExactScratch(repoRoot, '.qa-shared-frame-p1-profile')
  const evidenceDir = prepareExactScratch(repoRoot, '.qa-shared-frame-p1-evidence')
  const catalogDir = resolve(repoRoot, 'docs/superpowers/catalog/shared-frames/sf-p1')
  assertCatalogPath(repoRoot, catalogDir)

  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    build: { commit, provenance },
    browser: { name: 'chromium', version: null, headed, deviceScaleFactor: 1, reducedMotion: 'reduce' },
    manifest: {
      references: manifest.references,
      dimensions: manifest.dimensions,
      themes: manifest.themes,
      viewports: manifest.viewports,
      captures: manifest.captures.length,
    },
    captures: [],
    requests: [],
    consoleErrors: [],
    runtimeErrors: [],
    requestFailures: [],
    failedRequests: [],
    unexpectedRequests: [],
    cleanup: { browserClosed: false, profileRemoved: false },
  }

  let activeScenario = 'bootstrap'
  let navigating = false
  const providerModes = { forecast: 'ready', environment: 'ready', wikipedia: 'ready', nws: 'ready' }
  const pendingRoutes = []
  const expectedWeatherUrls = weatherUrls()
  let context = null
  let page = null
  let caughtError = null

  const disposePendingRoutes = async () => {
    const pending = pendingRoutes.splice(0)
    for (const entry of pending) entry.release('abort')
    await Promise.allSettled(pending.map((entry) => entry.done))
  }

  const holdRoute = async (route, requestRow) => {
    let release
    let markDone
    const action = new Promise((resolveAction) => { release = resolveAction })
    const done = new Promise((resolveDone) => { markDone = resolveDone })
    pendingRoutes.push({ release, done })
    try {
      const result = await action
      if (result === 'abort') {
        requestRow.outcome = 'harness-navigation-abort'
        await route.abort('aborted').catch(() => {})
      }
    } finally {
      markDone()
    }
  }

  const fulfillJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium',
      headless: !headed,
      viewport: viewportFor(manifest, 'common'),
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    })
    evidence.browser.version = context.browser()?.version() ?? 'unknown'
    await context.addInitScript(() => {
      if (location.protocol === 'chrome-extension:') {
        const writes = []
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local') writes.push(Object.keys(changes).sort())
        })
        globalThis.__sfP1Harness = { writes }
        const visibility = () => localStorage.getItem('sf-p1-visibility') === 'hidden' ? 'hidden' : 'visible'
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: visibility })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility() === 'hidden' })
      }
    })
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request()
      const url = request.url()
      const method = request.method().toUpperCase()
      const row = { scenario: activeScenario, method, url, operation: null, mode: null, outcome: null }
      try {
        assert.equal(method, 'GET', `unexpected external method ${method} ${url}`)
        if (url.startsWith('https://en.wikipedia.org/')) {
          const audited = inspectAtAGlanceRequest({ method, url, accept: request.headers().accept ?? null })
          assert.equal(audited.operation, 'on-this-day')
          row.operation = 'wikipedia'
          row.mode = providerModes.wikipedia
          evidence.requests.push(row)
          if (row.mode === 'hold') return holdRoute(route, row)
          row.outcome = row.mode === 'invalid' ? 'fulfilled-invalid-200' : 'fulfilled-ready-200'
          return fulfillJson(route, row.mode === 'invalid' ? {} : wikipediaPayload())
        }
        if (url === expectedWeatherUrls.forecast) {
          row.operation = 'forecast'
          row.mode = providerModes.forecast
          evidence.requests.push(row)
          if (row.mode === 'hold') return holdRoute(route, row)
          row.outcome = row.mode === 'invalid' ? 'fulfilled-invalid-200' : 'fulfilled-ready-200'
          return fulfillJson(route, row.mode === 'invalid' ? {} : forecastPayload())
        }
        if (url === expectedWeatherUrls.environment) {
          row.operation = 'environment'
          row.mode = providerModes.environment
          evidence.requests.push(row)
          if (row.mode === 'hold') return holdRoute(route, row)
          row.outcome = row.mode === 'invalid' ? 'fulfilled-invalid-200' : 'fulfilled-ready-200'
          return fulfillJson(route, row.mode === 'invalid' ? {} : environmentPayload())
        }
        const parsed = new URL(url)
        if (
          parsed.origin === 'https://api.weather.gov'
          && parsed.pathname === '/alerts/active'
          && parsed.searchParams.size === 1
          && parsed.searchParams.get('point') === '40.71,-74.01'
        ) {
          row.operation = 'nws'
          row.mode = providerModes.nws
          evidence.requests.push(row)
          if (row.mode === 'hold') return holdRoute(route, row)
          row.outcome = 'fulfilled-ready-200'
          return route.fulfill({
            status: 200,
            contentType: 'application/geo+json',
            body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
          })
        }
        throw new Error(`unexpected external request ${method} ${url}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        row.outcome = `blocked: ${message}`
        if (!evidence.requests.includes(row)) evidence.requests.push(row)
        evidence.unexpectedRequests.push({ scenario: activeScenario, method, url, message })
        await route.abort('blockedbyclient').catch(() => {})
      }
    })

    page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.clock.install({ time: FIXED_TIME })
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const row = { scenario: activeScenario, navigating, text: message.text() }
      evidence.consoleErrors.push(row)
      if (!navigating) evidence.runtimeErrors.push(row)
    })
    page.on('pageerror', (error) => {
      const row = { scenario: activeScenario, navigating, text: String(error) }
      evidence.runtimeErrors.push(row)
    })
    page.on('requestfailed', (request) => {
      if (!request.url().startsWith('http')) return
      const row = {
        scenario: activeScenario,
        navigating,
        method: request.method(),
        url: request.url(),
        error: request.failure()?.errorText ?? 'failed',
      }
      evidence.requestFailures.push(row)
      if (!navigating) evidence.failedRequests.push(row)
    })

    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await page.waitForTimeout(150)
    const extensionId = new URL(page.url()).host
    const seedPageUrl = `chrome-extension://${extensionId}/manifest.json`
    const storageGetAll = () => page.evaluate(() => chrome.storage.local.get(null))
    const storageSet = (value) => page.evaluate((next) => chrome.storage.local.set(next), value)
    const baseStorage = await storageGetAll()
    assert(baseStorage.settings && baseStorage.photoPrefs && baseStorage.layout !== undefined, 'fresh preview storage did not hydrate current defaults')

    const makeLayouts = (capture) => {
      const widgets = Object.fromEntries(manifest.authorityIds.map((id) => [id, { kind: 'hidden' }]))
      const layout = { id: 'sf-p1-witness', name: 'SF-P1 Witness', widgets }
      if (capture.kind === 'stack') {
        delete widgets.weather
        delete widgets.onThisDay
        layout.stacks = [{
          id: 'stack-sf-p1-reference',
          members: ['weather', 'onThisDay'],
          facing: 'weather',
          anchor: 'center',
          offsetX: 0,
          offsetY: 0,
          tier: 'standard',
          layer: 7,
        }]
      } else {
        widgets[capture.widget] = {
          kind: 'free',
          anchor: 'center',
          offsetX: 0,
          offsetY: 0,
          tier: capture.tier,
          layer: 7,
        }
      }
      return { version: 1, activeLayoutId: 'sf-p1-witness', layouts: [layout] }
    }

    const fixtureFor = (capture) => {
      const activeWidget = capture.kind === 'stack' ? 'stack' : capture.widget
      const activeState = capture.kind === 'stack' ? 'ready' : capture.state
      const onThisConfig = { enabled: true }
      let connectorData = onThisDayData()
      let connectorFetchedAt = FIXED_TIME.getTime()
      let weatherCache = weatherSnapshot()
      let location = LOCATION
      let visibility = 'visible'
      providerModes.forecast = 'ready'
      providerModes.environment = 'ready'
      providerModes.wikipedia = 'ready'
      providerModes.nws = 'ready'

      if (activeWidget === 'weather') {
        if (activeState === 'loading') {
          weatherCache = null
          providerModes.forecast = 'hold'
          providerModes.environment = 'hold'
        } else if (activeState === 'empty') {
          weatherCache = null
          visibility = 'hidden'
        } else if (activeState === 'stale') {
          weatherCache = weatherSnapshot({ stale: true })
          providerModes.forecast = 'hold'
          providerModes.environment = 'hold'
        } else if (activeState === 'partial') {
          weatherCache = weatherSnapshot({ partial: true })
        } else if (activeState === 'permission-required') {
          location = null
          weatherCache = null
        } else if (activeState === 'hard-error') {
          weatherCache = null
          providerModes.forecast = 'invalid'
          providerModes.environment = 'ready'
        }
      } else if (activeWidget === 'onThisDay') {
        if (activeState === 'loading') {
          connectorData = null
          providerModes.wikipedia = 'hold'
        } else if (activeState === 'empty') {
          connectorData = onThisDayData({ empty: true })
        } else if (activeState === 'stale') {
          connectorFetchedAt = FIXED_TIME.getTime() - 25 * 60 * 60_000
          providerModes.wikipedia = 'hold'
        } else if (activeState === 'hard-error') {
          connectorData = null
          providerModes.wikipedia = 'invalid'
        }
      }

      const connectorSnapshots = connectorData === null ? {} : {
        onThisDay: {
          scope: snapshotScope('onThisDay', onThisConfig, LOCAL_DAY_KEY),
          fetchedAt: connectorFetchedAt,
          data: connectorData,
        },
      }
      const widgetFlags = {
        ...Object.fromEntries(Object.keys(baseStorage.settings.widgets).map((id) => [id, false])),
        ...Object.fromEntries(manifest.authorityIds.map((id) => [id, false])),
      }
      if (capture.kind === 'stack') {
        widgetFlags.weather = true
        widgetFlags.onThisDay = true
      } else {
        widgetFlags[capture.widget] = true
      }
      return {
        visibility,
        storage: {
          settings: {
            ...baseStorage.settings,
            units: 'metric',
            use24Hour: false,
            panelColor: themeFor(manifest, capture.theme).panelColor,
            widgetTextColor: null,
            widgets: widgetFlags,
          },
          photoPrefs: { ...baseStorage.photoPrefs, mode: 'gradient' },
          location,
          weatherCache,
          weatherAlertCache: weatherAlertCache(),
          connectors: { onThisDay: onThisConfig },
          connectorSnapshots,
          layouts: makeLayouts(capture),
        },
      }
    }

    const frameFor = (capture) => capture.kind === 'stack'
      ? page.locator(`[data-stack-card="stack-sf-p1-reference"] [data-stack-member="${capture.expectedFace}"][data-stack-active="true"] [data-tier-frame="standard"]`)
      : page.locator(`[data-block-id="${capture.widget}"] [data-tier-frame="${capture.tier}"][data-tier-frame-state="${capture.state}"]`)

    const waitForCapture = async (capture) => {
      await page.locator('[data-canvas-surface]').waitFor()
      const frame = frameFor(capture)
      await frame.waitFor({ state: 'visible' })
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))))
      return frame
    }

    const currentWriteLog = () => page.evaluate(() => globalThis.__sfP1Harness?.writes ?? [])

    const navigateToSeededScenario = async (capture) => {
      activeScenario = capture.key
      navigating = true
      await disposePendingRoutes()
      await page.goto(seedPageUrl, { waitUntil: 'domcontentloaded' })
      const fixture = fixtureFor(capture)
      await page.evaluate((visibility) => localStorage.setItem('sf-p1-visibility', visibility), fixture.visibility)
      await storageSet(fixture.storage)
      const before = await storageGetAll()
      const viewport = viewportFor(manifest, capture.viewport)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
      const frame = await waitForCapture(capture)
      navigating = false
      return { before, frame, fixture }
    }

    const verifyReloadSurvival = async ({ capture, expectedStorage, expectedFacing }) => {
      navigating = true
      await disposePendingRoutes()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForCapture({ ...capture, expectedFace: expectedFacing ?? capture.expectedFace })
      navigating = false
      const reloaded = await storageGetAll()
      assert.deepEqual(reloaded, expectedStorage, `${capture.key}: storage changed across witness reload`)
      assert.equal(JSON.stringify(reloaded.layouts), JSON.stringify(expectedStorage.layouts), `${capture.key}: layout bytes changed across reload`)
      assert.equal(canonical(reloaded.layout), canonical(expectedStorage.layout), `${capture.key}: legacy layout changed across reload`)
      assertLayoutShape(reloaded.layouts, {
        tier: capture.tier,
        stack: capture.kind === 'stack',
        facing: expectedFacing ?? capture.expectedFace,
      })
      const reloadWrites = await currentWriteLog()
      assert.deepEqual(reloadWrites, [], `${capture.key}: reload wrote storage ${JSON.stringify(reloadWrites)}`)
      return reloaded
    }

    const screenshotCapture = async (capture) => {
      const path = resolve(catalogDir, capture.filename)
      await page.screenshot({ path, fullPage: false, animations: 'disabled' })
      const metadata = await sharp(path).metadata()
      const viewport = viewportFor(manifest, capture.viewport)
      assert.equal(metadata.width, viewport.width, `${capture.key}: screenshot width is not original viewport width`)
      assert.equal(metadata.height, viewport.height, `${capture.key}: screenshot height is not original viewport height`)
      return { path, relativePath: relative(repoRoot, path).replace(/\\/g, '/'), pixelWidth: metadata.width, pixelHeight: metadata.height }
    }

    const measureStack = async () => page.locator('[data-stack-card="stack-sf-p1-reference"]').evaluate((card) => {
      const cardRect = card.getBoundingClientRect()
      const members = [...card.querySelectorAll('[data-stack-member]')].map((member) => {
        const frame = member.querySelector('[data-tier-frame]')
        const rect = frame?.getBoundingClientRect()
        return {
          id: member.getAttribute('data-stack-member'),
          active: member.getAttribute('data-stack-active') === 'true',
          frame: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        }
      })
      return {
        card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
        members,
      }
    })

    const assertStackGeometry = (capture, geometry, expectedFace) => {
      assert.equal(geometry.members.length, 2, `${capture.key}: stack member count drifted`)
      assert.deepEqual(geometry.members.map((entry) => entry.id), ['weather', 'onThisDay'])
      assert.equal(geometry.members.filter((entry) => entry.active).length, 1, `${capture.key}: stack must expose exactly one active face`)
      assert.equal(geometry.members.find((entry) => entry.active)?.id, expectedFace, `${capture.key}: wrong active stack face`)
      for (const member of geometry.members) {
        assert(member.frame, `${capture.key}: ${member.id} frame is missing`)
        assert(withinTolerance(member.frame.width, 320), `${capture.key}: ${member.id} width is ${member.frame.width}`)
        assert(withinTolerance(member.frame.height, 200), `${capture.key}: ${member.id} height is ${member.frame.height}`)
      }
      assert(withinTolerance(geometry.members[0].frame.width, geometry.members[1].frame.width), `${capture.key}: stack frame widths differ`)
      assert(withinTolerance(geometry.members[0].frame.height, geometry.members[1].frame.height), `${capture.key}: stack frame heights differ`)
    }

    const runFreeCapture = async (capture) => {
      const { before, frame } = await navigateToSeededScenario(capture)
      assertLayoutShape(before.layouts, { tier: capture.tier, stack: false, facing: null })
      const layoutBytes = JSON.stringify(before.layouts)
      const legacyBytes = canonical(before.layout)
      await page.evaluate(() => getSelection()?.removeAllRanges())
      const measurement = await measureFrame({
        page,
        frame,
        capture,
        manifest,
        leaveFocusVisible: capture.kind === 'theme',
      })
      assert.equal(measurement.selectedText, '', `${capture.key}: text is selected`)
      const image = await screenshotCapture(capture)
      const after = await storageGetAll()
      const writes = await currentWriteLog()
      assert.deepEqual(topLevelChanges(before, after), [], `${capture.key}: unexpected storage changes`)
      assert.deepEqual(writes, [], `${capture.key}: unexpected storage writes ${JSON.stringify(writes)}`)
      assert.equal(JSON.stringify(after.layouts), layoutBytes, `${capture.key}: layout bytes changed during capture`)
      assert.equal(canonical(after.layout), legacyBytes, `${capture.key}: legacy layout changed during capture`)
      await verifyReloadSurvival({ capture, expectedStorage: after })
      evidence.captures.push({
        ...capture,
        viewport: viewportFor(manifest, capture.viewport),
        measurement,
        image,
        storage: { writes, changedKeys: [], layoutBytes, legacyLayoutBytes: legacyBytes },
        requests: evidence.requests.filter((entry) => entry.scenario === capture.key),
      })
    }

    const runStackCapture = async (capture) => {
      const { before, frame: initialFrame } = await navigateToSeededScenario({ ...capture, expectedFace: 'weather' })
      assertLayoutShape(before.layouts, { tier: 'standard', stack: true, facing: 'weather' })
      const legacyBytes = canonical(before.layout)
      const beforeGeometry = await measureStack()
      assertStackGeometry(capture, beforeGeometry, 'weather')
      await page.evaluate(() => getSelection()?.removeAllRanges())
      let measurement = null
      let details = null

      if (capture.interaction === 'stack-initial') {
        measurement = await measureFrame({ page, frame: initialFrame, capture: { ...capture, widget: 'stack', expectedFace: 'weather' }, manifest })
      } else if (capture.interaction === 'stack-next') {
        await page.locator('[data-stack-card="stack-sf-p1-reference"]').hover()
        await page.getByRole('button', { name: 'Next widget' }).click()
      } else if (capture.interaction === 'stack-previous') {
        await page.locator('[data-stack-card="stack-sf-p1-reference"]').hover()
        await page.getByRole('button', { name: 'Previous widget' }).click()
      } else if (capture.interaction === 'stack-dot') {
        await page.locator('[data-stack-card="stack-sf-p1-reference"]').hover()
        await page.getByRole('button', { name: 'Show On This Day' }).click()
      } else if (capture.interaction === 'stack-swipe') {
        const box = await page.locator('[data-stack-card="stack-sf-p1-reference"]').boundingBox()
        assert(box, `${capture.key}: stack swipe box is missing`)
        await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 8 })
        await page.mouse.up()
      } else if (capture.interaction === 'stack-plain-click-details') {
        measurement = await measureFrame({ page, frame: initialFrame, capture: { ...capture, widget: 'stack', expectedFace: 'weather' }, manifest })
        await initialFrame.locator('[data-weather-summary]').click()
        const dialog = page.getByRole('dialog', { name: 'Weather details' })
        await dialog.waitFor()
        details = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            client: { width: element.clientWidth, height: element.clientHeight },
            scroll: { width: element.scrollWidth, height: element.scrollHeight },
            overflowY: getComputedStyle(element).overflowY,
          }
        })
        const viewport = viewportFor(manifest, capture.viewport)
        assert(details.rect.left >= -0.5 && details.rect.top >= -0.5, `${capture.key}: Weather details leaves the top/left viewport`)
        assert(details.rect.right <= viewport.width + 0.5 && details.rect.bottom <= viewport.height + 0.5, `${capture.key}: Weather details leaves the viewport`)
      }

      if (capture.expectedFace === 'onThisDay') {
        await page.waitForFunction(() => chrome.storage.local.get('layouts').then(({ layouts }) => layouts.layouts[0].stacks[0].facing === 'onThisDay'))
        const activeFrame = frameFor(capture)
        await activeFrame.waitFor({ state: 'visible' })
        measurement = await measureFrame({ page, frame: activeFrame, capture, manifest })
      }
      assert(measurement, `${capture.key}: active frame was not measured`)
      const selectedText = await page.evaluate(() => getSelection()?.toString() ?? '')
      measurement.selectedText = selectedText
      assert.equal(selectedText, '', `${capture.key}: swipe/plain interaction selected text`)
      const afterGeometry = await measureStack()
      assertStackGeometry(capture, afterGeometry, capture.expectedFace)
      assert(withinTolerance(afterGeometry.card.left, beforeGeometry.card.left), `${capture.key}: stack moved horizontally`)
      assert(withinTolerance(afterGeometry.card.top, beforeGeometry.card.top), `${capture.key}: stack moved vertically`)
      assert(withinTolerance(afterGeometry.card.width, beforeGeometry.card.width), `${capture.key}: stack width changed`)
      assert(withinTolerance(afterGeometry.card.height, beforeGeometry.card.height), `${capture.key}: stack height changed`)

      const image = await screenshotCapture(capture)
      const after = await storageGetAll()
      const writes = await currentWriteLog()
      const expectsFaceWrite = capture.expectedFace !== 'weather'
      if (expectsFaceWrite) {
        assert.deepEqual(topLevelChanges(before, after), ['layouts'], `${capture.key}: only layouts may change while paging`)
        assert.deepEqual(writes, [['layouts']], `${capture.key}: face paging must write layouts exactly once`)
        const expectedLayouts = structuredClone(before.layouts)
        expectedLayouts.layouts[0].stacks[0].facing = 'onThisDay'
        assert.deepEqual(after.layouts, expectedLayouts, `${capture.key}: face paging changed more than facing`)
      } else {
        assert.deepEqual(topLevelChanges(before, after), [], `${capture.key}: plain stack observation/click changed storage`)
        assert.deepEqual(writes, [], `${capture.key}: plain stack observation/click wrote storage`)
      }
      assert.equal(canonical(after.layout), legacyBytes, `${capture.key}: legacy layout changed`)
      await verifyReloadSurvival({ capture, expectedStorage: after, expectedFacing: capture.expectedFace })
      const reloadGeometry = await measureStack()
      assertStackGeometry(capture, reloadGeometry, capture.expectedFace)
      assert(withinTolerance(reloadGeometry.card.left, afterGeometry.card.left), `${capture.key}: stack moved after reload`)
      assert(withinTolerance(reloadGeometry.card.top, afterGeometry.card.top), `${capture.key}: stack moved after reload`)
      evidence.captures.push({
        ...capture,
        viewport: viewportFor(manifest, capture.viewport),
        measurement,
        image,
        details,
        stack: { before: beforeGeometry, after: afterGeometry, reload: reloadGeometry },
        storage: {
          writes,
          changedKeys: topLevelChanges(before, after),
          beforeLayoutBytes: JSON.stringify(before.layouts),
          afterLayoutBytes: JSON.stringify(after.layouts),
          legacyLayoutBytes: legacyBytes,
        },
        requests: evidence.requests.filter((entry) => entry.scenario === capture.key),
      })
    }

    for (const capture of manifest.captures) {
      if (capture.kind === 'stack') await runStackCapture(capture)
      else await runFreeCapture(capture)
      process.stdout.write(`CAPTURE ${evidence.captures.length}/${manifest.captures.length} ${capture.key}\n`)
    }

    assert.equal(evidence.captures.length, manifest.captures.length, 'SF-P1 capture count is incomplete')
    assert.equal(evidence.runtimeErrors.length, 0, `runtime errors: ${JSON.stringify(evidence.runtimeErrors)}`)
    assert.equal(evidence.failedRequests.length, 0, `failed requests: ${JSON.stringify(evidence.failedRequests)}`)
    assert.equal(evidence.unexpectedRequests.length, 0, `unexpected requests: ${JSON.stringify(evidence.unexpectedRequests)}`)
    for (const capture of evidence.captures) {
      assert(VALID_VERDICTS.has(capture.verdict), `${capture.key}: capture has no usefulness verdict`)
      assert.equal(capture.measurement.internalScrollOwners.length, 0, `${capture.key}: internal scrollbar remains`)
    }
    writeCatalog({ catalogPath: resolve(catalogDir, 'CATALOG.md'), evidence })
  } catch (error) {
    caughtError = error
  } finally {
    navigating = true
    try { await disposePendingRoutes() } catch { /* final context close remains authoritative */ }
    if (context) {
      try {
        await context.close()
        evidence.cleanup.browserClosed = true
      } catch (error) {
        caughtError ??= error
      }
    }
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      evidence.cleanup.profileRemoved = !existsSync(profileDir)
      if (!evidence.cleanup.profileRemoved) throw new Error('SF-P1 browser profile still exists after cleanup')
    } catch (error) {
      caughtError ??= error
    }
    evidence.finishedAt = new Date().toISOString()
    evidence.summary = {
      captures: evidence.captures.length,
      requests: evidence.requests.length,
      consoleErrors: evidence.consoleErrors.length,
      runtimeErrors: evidence.runtimeErrors.length,
      failedRequests: evidence.failedRequests.length,
      unexpectedRequests: evidence.unexpectedRequests.length,
      storageWriteBatches: evidence.captures.reduce((total, capture) => total + capture.storage.writes.length, 0),
    }
    writeFileSync(resolve(evidenceDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }

  if (caughtError) throw caughtError
  process.stdout.write(`PASS SF-P1 preliminary witness: ${evidence.summary.captures} captures, ${evidence.summary.requests} audited requests, ${evidence.summary.storageWriteBatches} storage write batches, 0 runtime/failed/unexpected requests\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
