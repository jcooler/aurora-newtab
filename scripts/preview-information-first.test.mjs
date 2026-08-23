import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COMMON_DISPLAY_STATES,
  COMMON_DISPLAY_VIEWPORTS,
  DEEP_INTERACTION_VIEWPORTS,
  OWNER_CAPTURE_PATHS,
  WEATHER_CORNER_CASES,
  expectedCommonDisplayPaths,
  viewportLabel,
} from './information-first-viewports.mjs'
import { CONNECTOR_SIZE_PROMISES } from './information-first-fixtures.mjs'
import { mergeInformationFirstEvidence } from './information-first-evidence.mjs'
import { SCENARIOS } from './qa-nl-p6-scenarios.mjs'

const exactViewports = [
  [320, 568], [360, 800], [375, 812], [390, 844], [412, 915],
  [768, 1024], [820, 1180], [1024, 600], [1024, 768],
  [1280, 720], [1280, 800], [1280, 1024], [1366, 768], [1440, 900], [1536, 864],
  [1600, 900], [1920, 1080], [1920, 1200], [2560, 1440], [2560, 1600],
  [2560, 1080], [3440, 1440], [3840, 2160],
]

test('common-display catalog is the exact 23 unique DSF-1 CSS viewports', () => {
  assert.deepEqual(COMMON_DISPLAY_VIEWPORTS.map(({ width, height }) => [width, height]), exactViewports)
  assert.equal(new Set(COMMON_DISPLAY_VIEWPORTS.map(viewportLabel)).size, 23)
  assert.ok(COMMON_DISPLAY_VIEWPORTS.every(({ deviceScaleFactor }) => deviceScaleFactor === 1))
})

test('the five exact states expand to 115 stable original image paths', () => {
  assert.deepEqual(COMMON_DISPLAY_STATES, [
    'information-rich-canvas',
    'settings-widgets',
    'settings-connectors',
    'weather-top-right-expanded',
    'arrange-small-inspector',
  ])
  const paths = expectedCommonDisplayPaths('output-root')
  assert.equal(paths.length, 115)
  assert.equal(new Set(paths).size, 115)
  assert.ok(paths.every((path) => path.endsWith('.png')))
})

test('deep interactions use the six written fenceposts', () => {
  assert.deepEqual(DEEP_INTERACTION_VIEWPORTS.map(viewportLabel), [
    '375x812', '1024x768', '1366x768', '1920x1080', '3440x1440', '3840x2160',
  ])
})

test('all nine connector identities enumerate exactly the registry-promised sizes', () => {
  const exact = {
    ics: ['compact', 'standard', 'full'],
    status: ['compact', 'standard'],
    github: ['compact', 'standard', 'full'],
    gitlab: ['compact', 'standard', 'full'],
    jira: ['compact', 'standard', 'full'],
    vercel: ['compact', 'standard', 'full'],
    homeassistant: ['compact', 'standard', 'full'],
    rss: ['compact', 'standard', 'full'],
    crypto: ['compact', 'standard'],
  }
  assert.deepEqual(CONNECTOR_SIZE_PROMISES, exact)
  assert.equal(Object.values(CONNECTOR_SIZE_PROMISES).reduce((total, sizes) => total + sizes.length, 0), 25)

  const source = readFileSync(new URL('../src/newtab/widgetSizeContracts.ts', import.meta.url), 'utf8')
  for (const [id, sizes] of Object.entries(exact)) {
    const escaped = sizes.map((size) => `'${size}'`).join(', ')
    assert.match(source, new RegExp(`\\b${id}: framedContract\\(\\[${escaped}\\]`))
  }
})

test('Weather QA fixtures mirror the live Open-Meteo current-field contract', () => {
  const currentFields = [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'relative_humidity_2m',
    'is_day',
  ].join(',')
  const production = readFileSync(new URL('../src/services/weather/identity.ts', import.meta.url), 'utf8')

  for (const field of currentFields.split(',')) {
    assert.match(production, new RegExp(`['\"]${field}['\"]`), `production contract must include ${field}`)
  }

  for (const fixturePath of ['./qa-nl-p6-scenarios.mjs', './information-first-fixtures.mjs']) {
    const fixture = readFileSync(new URL(fixturePath, import.meta.url), 'utf8')
    assert.match(fixture, new RegExp(`params\\.set\\(['\"]current['\"], ['\"]${currentFields}['\"]\\)`),
      `${fixturePath} must seed the exact production current-field identity`)
  }
})

test('Weather QA fixtures seed fresh environmental enrichment for stack witnesses', () => {
  const fixture = readFileSync(new URL('./information-first-fixtures.mjs', import.meta.url), 'utf8')
  assert.match(fixture, /const environmentUrl = \(lat, lon\) =>/)
  assert.match(fixture, /requestIdentity:\s*`open-meteo-air:v1:\$\{environmentUrl\(location\.lat, location\.lon\)\}`/)
  assert.match(fixture, /pollen:\s*\{\s*status:\s*'available'/)
})

test('Weather exercises all four legal corners and owner gate names all eight originals', () => {
  assert.deepEqual(WEATHER_CORNER_CASES.map(({ corner }) => corner), [
    'top-left', 'top-right', 'bottom-left', 'bottom-right',
  ])
  assert.equal(OWNER_CAPTURE_PATHS.length, 8)
  assert.equal(new Set(OWNER_CAPTURE_PATHS).size, 8)
  for (const path of OWNER_CAPTURE_PATHS) assert.ok(path.endsWith('.png'))
})

test('a green focused rerun can resume without repeating its viewport', () => {
  const primary = {
    states: [{ viewport: '1024x600', state: 'information-rich-canvas', marker: 'primary' }],
    deepInteractions: [], weatherCorners: [], connectorSizes: [], connectorStates: [],
    runtimeErrors: [], failedRequests: [], unexpectedExternalRequests: [], expectedFixtureRequests: [],
  }
  const focused = {
    states: [
      { viewport: '1024x600', state: 'information-rich-canvas', marker: 'focused' },
      { viewport: '1024x768', state: 'information-rich-canvas', marker: 'focused' },
    ],
    deepInteractions: [{ viewport: '1024x768' }], weatherCorners: [], connectorSizes: [], connectorStates: [],
    runtimeErrors: [], failedRequests: [], unexpectedExternalRequests: [], expectedFixtureRequests: [],
  }

  const merged = mergeInformationFirstEvidence(primary, focused)
  assert.equal(merged.states.length, 2)
  assert.equal(merged.states[0].marker, 'focused')
  assert.deepEqual(merged.deepInteractions, [{ viewport: '1024x768' }])
})

test('Flow and widget stacks are first-class NL-P6 scenarios', () => {
  assert.deepEqual(SCENARIOS.map(({ id }) => id), [
    'fresh',
    'legacy-v1',
    'named-saved',
    'connectors',
    'connectors-default',
    'flow',
    'stacks',
  ])

  const scenarios = readFileSync(new URL('./qa-nl-p6-scenarios.mjs', import.meta.url), 'utf8')
  for (const token of ['timerSession', 'flow: true', 'focus:', 'todoLists:']) {
    assert.match(scenarios, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const sweep = readFileSync(new URL('./qa-nl-p6.mjs', import.meta.url), 'utf8')
  for (const token of [
    '[data-canvas-surface], [data-flow-screen]',
    'flow screen missing',
    'dashboard leaked into Flow',
    'edit chord changed Flow',
    'Flow rendered with storage writes',
    'vOverflow: doc.scrollHeight > doc.clientHeight',
    'flowRect.bottom <= window.innerHeight + 1',
    'Flow target escaped the viewport',
  ]) assert.match(sweep, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const windowWitness = readFileSync(new URL('./qa-nl-p6-window.mjs', import.meta.url), 'utf8')
  for (const token of [
    'window-flow-second-tab',
    'countdowns differ by',
    'Pause timer',
    'dashboard did not restore',
  ]) assert.match(windowWitness, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
