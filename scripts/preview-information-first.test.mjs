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
    ics: ['compact', 'standard'],
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
  assert.equal(Object.values(CONNECTOR_SIZE_PROMISES).reduce((total, sizes) => total + sizes.length, 0), 24)

  const source = readFileSync(new URL('../src/newtab/widgetSizeContracts.ts', import.meta.url), 'utf8')
  for (const [id, sizes] of Object.entries(exact)) {
    const escaped = sizes.map((size) => `'${size}'`).join(', ')
    assert.match(source, new RegExp(`\\b${id}: contract\\(\\[${escaped}\\]`))
  }
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
