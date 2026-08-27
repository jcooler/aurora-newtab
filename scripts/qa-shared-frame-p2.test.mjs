import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  applySfP2ReviewedVerdicts,
  assertSfP2BuildContract,
  assertSfP2CaptureMeasurement,
  assertSfP2RequestAudit,
  assertSfP2StorageAudit,
  buildSfP2CapturePlan,
  buildSfP2CaptureFailure,
  buildSfP2EvidenceManifest,
  buildSfP2DomProbe,
  buildSfP2Layouts,
  buildSfP2RuntimeStages,
  formatSfP2Catalog,
  resolveSfP2FixtureState,
  resolveSfP2RuntimeMode,
  shouldIgnoreSfP2BootstrapRequest,
  validateSfP2RuntimeEvidence,
  validateSfP2CapturePlan,
  validateSfP2EvidenceManifest,
} from './qa-shared-frame-p2.mjs'

const contractSource = readFileSync(new URL('../src/newtab/widgetSizeContracts.ts', import.meta.url), 'utf8')

function plan() {
  return buildSfP2CapturePlan(contractSource)
}

function evidence() {
  const capturePlan = plan()
  const verdicts = Object.fromEntries(capturePlan.captures.map(({ key }) => [key, {
    verdict: 'Useful',
    reason: 'Explicit reviewed test fixture.',
  }]))
  return buildSfP2EvidenceManifest(contractSource, verdicts)
}

test('derives every remaining framed widget from the presentation authority', () => {
  const result = plan()
  assert.equal(result.widgets.length, 24)
  assert.equal(result.widgets.some(({ id }) => id === 'weather'), false)
  assert.equal(result.widgets.some(({ id }) => id === 'onThisDay'), false)
  for (const id of ['github', 'linear', 'readingList', 'ics', 'publicHolidays']) {
    assert.ok(result.widgets.some((entry) => entry.id === id), `${id} is missing`)
  }

  const changedSource = contractSource.replace(
    "moon: framedContract(['compact'], ['compact'], READY_STATES",
    "moon: contract('intrinsic', ['compact'], RESOURCE_STATES",
  )
  assert.notEqual(changedSource, contractSource, 'the authority mutation fixture must apply')
  assert.equal(buildSfP2CapturePlan(changedSource).widgets.some(({ id }) => id === 'moon'), false)
})

test('covers every declared ready free tier and stack tier exactly', () => {
  const result = plan()
  for (const widget of result.widgets) {
    for (const tier of widget.tiers) {
      assert.ok(result.captures.some((capture) => capture.kind === 'free-tier'
        && capture.widget === widget.id && capture.tier === tier && capture.state === 'ready'))
    }
    for (const tier of widget.stackTiers) {
      assert.ok(result.captures.some((capture) => capture.kind === 'stack-pair'
        && capture.widget === widget.id && capture.tier === tier && capture.reference === 'weather'))
    }
  }
})

test('covers representative states, interactions, viewports, themes, fixtures, and storage audit', () => {
  const result = plan()
  for (const family of result.stateFamilies) {
    for (const state of family.states) {
      assert.ok(result.captures.some((capture) => capture.family === family.id && capture.state === state))
    }
  }
  for (const family of result.interactionFamilies) {
    for (const interaction of ['stack-initial', 'stack-next', 'stack-previous', 'stack-dot', 'stack-swipe', 'stack-plain-click']) {
      assert.ok(result.captures.some((capture) => capture.family === family.id && capture.interaction === interaction))
    }
  }
  assert.deepEqual(result.viewports.map(({ id }) => id), ['laptop', 'exact-short', 'common', 'narrow-floor', 'planner-boundary'])
  assert.deepEqual(result.themes.map(({ id }) => id), ['dark', 'light', 'saturated'])
  assert.ok(result.captures.every((capture) => typeof capture.fixture === 'string' && capture.fixture.length > 0))
  assert.equal(result.audits.storage.legacyLayoutWrites, 0)
  assert.equal(result.audits.storage.allowedKeys.join(','), 'layouts')
})

test('includes a legacy incompatible stack capture with explicit compatibility copy evidence', () => {
  const result = plan()
  assert.ok(result.captures.some((capture) => capture.kind === 'compatibility'
    && capture.widget === 'moon'
    && capture.reference === 'weather'
    && capture.tier === 'full'))
})

test('fails closed for incomplete evidence dimensions and reviewed verdicts', () => {
  const missingReady = structuredClone(evidence())
  const target = missingReady.widgets.find((widget) => widget.id === 'github')
  missingReady.captures = missingReady.captures.filter((capture) => !(
    capture.kind === 'free-tier' && capture.widget === 'github' && capture.tier === target.tiers[0]
  ))
  assert.throws(() => validateSfP2EvidenceManifest(missingReady), /github.*ready|ready.*github/i)

  const driftedDimension = structuredClone(evidence())
  driftedDimension.dimensions.full.height = 283
  assert.throws(() => validateSfP2EvidenceManifest(driftedDimension), /full.*284|284.*full/i)

  const missingVerdict = structuredClone(evidence())
  missingVerdict.captures[0].verdict = null
  assert.throws(() => validateSfP2EvidenceManifest(missingVerdict), /usefulness verdict/i)
})

test('capture planning never manufactures verdicts and reviewed evidence requires all of them', () => {
  const capturePlan = validateSfP2CapturePlan(plan())
  assert.ok(capturePlan.captures.every((capture) => !('verdict' in capture)))
  assert.throws(() => applySfP2ReviewedVerdicts(capturePlan, {}), /missing a reviewed verdict/i)
})

test('preliminary working-tree mode is capture-only and reviewed catalog generation is a separate action', () => {
  assert.deepEqual(resolveSfP2RuntimeMode(['--preliminary-working-tree']), {
    headed: false,
    preliminaryWorkingTree: true,
    captureOnly: true,
    catalogFromCapture: false,
  })
  assert.deepEqual(resolveSfP2RuntimeMode(['--catalog-from-capture']), {
    headed: false,
    preliminaryWorkingTree: false,
    captureOnly: false,
    catalogFromCapture: true,
  })
  assert.throws(
    () => resolveSfP2RuntimeMode(['--capture-only', '--catalog-from-capture']),
    /capture-only.*catalog-from-capture/i,
  )
})

test('ignores external requests only during the unseeded bootstrap navigation', () => {
  assert.equal(shouldIgnoreSfP2BootstrapRequest({ navigating: true, activeCapture: null }), true)
  assert.equal(shouldIgnoreSfP2BootstrapRequest({ navigating: false, activeCapture: null }), false)
  assert.equal(shouldIgnoreSfP2BootstrapRequest({ navigating: true, activeCapture: { key: 'github-ready' } }), false)
})

test('exact mode rejects dirty or stale dist while preliminary mode records dirty source truthfully', () => {
  const input = {
    commit: 'abc123',
    expectedCommit: 'abc123',
    provenanceText: JSON.stringify({ commit: 'abc123', builtAt: '2026-08-23T12:00:00.000Z' }),
    trackedStatus: ' M src/newtab/widgets/status/StatusWidget.tsx\n',
  }
  assert.throws(
    () => assertSfP2BuildContract({ ...input, preliminaryWorkingTree: false }),
    /clean tracked worktree/i,
  )
  assert.throws(
    () => assertSfP2BuildContract({ ...input, trackedStatus: '', provenanceText: '{"commit":"old"}', preliminaryWorkingTree: false }),
    /provenance.*stale/i,
  )
  assert.deepEqual(assertSfP2BuildContract({ ...input, preliminaryWorkingTree: true }), {
    provenance: { commit: 'abc123', builtAt: '2026-08-23T12:00:00.000Z' },
    preliminaryWorkingTree: true,
    trackedStatus: input.trackedStatus,
  })
})

test('capture measurement fails closed on geometry, clipping, scroll, text, signatures, ownership, selection, and compatibility copy', () => {
  const capture = { key: 'github-ready-standard', tier: 'standard', kind: 'free-tier' }
  const valid = {
    frame: { width: 320.25, height: 199.75 },
    clippedElements: [],
    internalScrollOwners: [],
    textRuns: [
      { text: 'Pull requests', role: 'routine', fontSize: 14 },
      { text: 'Updated now', role: 'metadata', fontSize: 11 },
    ],
    missingEssentialSelectors: [],
    missingSignatureSelectors: [],
    mountedOwners: 1,
    selectedText: '',
    compatibilityCopy: null,
  }
  assert.equal(assertSfP2CaptureMeasurement(capture, valid, { standard: { width: 320, height: 200 } }), valid)

  const mutations = [
    ['frame width', { frame: { width: 321, height: 200 } }, /width/i],
    ['clipping', { clippedElements: ['Contribution graph'] }, /clipp/i],
    ['scroll', { internalScrollOwners: ['section'] }, /scroll/i],
    ['routine floor', { textRuns: [{ text: 'Pull requests', role: 'routine', fontSize: 13.9 }] }, /14px/i],
    ['metadata floor', { textRuns: [{ text: 'Updated now', role: 'metadata', fontSize: 10.9 }] }, /11px/i],
    ['essential selector', { missingEssentialSelectors: ['[data-work-summary]'] }, /essential/i],
    ['signature selector', { missingSignatureSelectors: ['[data-contribution-graph]'] }, /signature/i],
    ['owner count', { mountedOwners: 2 }, /one mounted owner/i],
    ['selected text', { selectedText: 'Pull requests' }, /selected text/i],
  ]
  for (const [label, change, pattern] of mutations) {
    const broken = { ...structuredClone(valid), ...change }
    assert.throws(() => assertSfP2CaptureMeasurement(capture, broken, { standard: { width: 320, height: 200 } }), pattern, label)
  }
  assert.throws(
    () => assertSfP2CaptureMeasurement(capture, {
      ...structuredClone(valid),
      frame: { width: 157.828125, height: 96.46875 },
      geometryDiagnostics: {
        computedWidth: '216px',
        computedHeight: '132px',
        innerWidth: 1366,
        visualViewport: { width: 1366, scale: 1 },
        ancestors: [{ tag: 'div', transform: 'matrix(0.73, 0, 0, 0.73, 0, 0)', zoom: '1' }],
      },
    }, { standard: { width: 320, height: 200 } }),
    /computedWidth.*216px.*matrix\(0\.73/s,
  )
  assert.throws(
    () => assertSfP2CaptureMeasurement(
      { ...capture, kind: 'compatibility' },
      { ...structuredClone(valid), compatibilityCopy: '' },
      { standard: { width: 320, height: 200 } },
    ),
    /compatibility copy/i,
  )
})

test('storage audit permits only one exact facing write and always rejects legacy layout writes', () => {
  const before = {
    layout: { version: 3, marker: 'legacy' },
    layouts: { version: 1, layouts: [{ stacks: [{ id: 'stack-p2', facing: 'weather', members: ['weather', 'status'] }] }] },
    settings: { name: 'Aurora' },
  }
  const after = structuredClone(before)
  after.layouts.layouts[0].stacks[0].facing = 'status'
  assert.deepEqual(
    assertSfP2StorageAudit({
      capture: { key: 'status-stack-next', interaction: 'stack-next', widget: 'status' },
      before,
      after,
      writeCalls: [['layouts']],
    }),
    { changedKeys: ['layouts'], writeCalls: [['layouts']], facingChanged: true },
  )
  assert.throws(
    () => assertSfP2StorageAudit({
      capture: { key: 'status-ready', interaction: null, widget: 'status' },
      before,
      after: before,
      writeCalls: [['layout']],
    }),
    /legacy layout/i,
  )
  const wrong = structuredClone(after)
  wrong.layouts.layouts[0].stacks[0].tier = 'full'
  assert.throws(
    () => assertSfP2StorageAudit({
      capture: { key: 'status-stack-next', interaction: 'stack-next', widget: 'status' },
      before,
      after: wrong,
      writeCalls: [['layouts']],
    }),
    /more than facing/i,
  )
  assert.throws(
    () => assertSfP2StorageAudit({
      capture: { key: 'status-ready', interaction: null, widget: 'status' },
      before,
      after: { ...before, settings: { name: 'Changed' } },
      writeCalls: [['settings']],
    }),
    /unexpected storage/i,
  )
})

test('request audit accepts only explicit method and URL pairs and rejects every failed request', () => {
  const approvedRequests = new Set([
    'GET https://api.github.com/user',
    'POST https://api.linear.app/graphql',
  ])
  assert.deepEqual(assertSfP2RequestAudit({
    requests: [
      { method: 'GET', url: 'https://api.github.com/user', status: 200 },
      { method: 'POST', url: 'https://api.linear.app/graphql', status: 200 },
      { method: 'GET', url: 'https://api.github.com/user', status: null, outcome: 'held-approved' },
    ],
    failedRequests: [],
    unexpectedRequests: [],
    approvedRequests,
  }), { approved: 3, failed: 0, unexpected: 0 })
  assert.throws(() => assertSfP2RequestAudit({
    requests: [{ method: 'GET', url: 'https://tracker.invalid/pixel', status: 200 }],
    failedRequests: [],
    unexpectedRequests: [],
    approvedRequests,
  }), /unapproved request/i)
  assert.throws(() => assertSfP2RequestAudit({
    requests: [],
    failedRequests: [{ method: 'GET', url: 'https://api.github.com/user', error: 'net::ERR_FAILED' }],
    unexpectedRequests: [],
    approvedRequests,
  }), /failed request/i)
})

test('runtime evidence requires one real row per planned capture and catalog generation requires reviewed verdicts', () => {
  const manifest = evidence()
  const captures = manifest.captures.map((capture) => ({
    ...capture,
    image: { relativePath: `docs/superpowers/catalog/shared-frames/sf-p2/${capture.filename}`, pixelWidth: 1600, pixelHeight: 900 },
    measurement: {
      frame: structuredClone(manifest.dimensions[capture.tier]),
      clippedElements: [],
      internalScrollOwners: [],
      textRuns: [],
      missingEssentialSelectors: [],
      missingSignatureSelectors: [],
      mountedOwners: 1,
      selectedText: '',
      compatibilityCopy: capture.kind === 'compatibility' ? 'Moon is not available at Full. Choose Compact.' : null,
    },
    storage: { changedKeys: [], writeCalls: [], facingChanged: false },
    requestAudit: { approved: 0, failed: 0, unexpected: 0 },
  }))
  const runtime = {
    schemaVersion: 1,
    build: { commit: 'abc123', provenance: { commit: 'abc123' }, preliminaryWorkingTree: true },
    browser: { name: 'chromium', version: 'test' },
    manifest,
    captures,
    runtimeErrors: [],
    failedRequests: [],
    unexpectedRequests: [],
  }
  assert.equal(validateSfP2RuntimeEvidence(runtime), runtime)
  const catalog = formatSfP2Catalog(runtime)
  assert.match(catalog, /preliminary working-tree witness/i)
  assert.match(catalog, /not final exact-reviewed proof/i)
  assert.match(catalog, /github-ready-compact-dark-common\.png/)
  assert.match(catalog, /Useful/)

  const incomplete = structuredClone(runtime)
  incomplete.captures.pop()
  assert.throws(() => validateSfP2RuntimeEvidence(incomplete), /missing runtime capture/i)

  const pending = structuredClone(runtime)
  delete pending.captures[0].verdict
  assert.throws(() => formatSfP2Catalog(pending), /usefulness verdict/i)
})

test('capture failures retain exact scenario identity without inventing evidence', () => {
  assert.deepEqual(
    buildSfP2CaptureFailure(
      { key: 'github-ready-compact-dark-common', family: 'developer-service', widget: 'github' },
      new Error('frame width drifted'),
    ),
    {
      key: 'github-ready-compact-dark-common',
      family: 'developer-service',
      widget: 'github',
      message: 'frame width drifted',
    },
  )
})

test('runtime stages assign every capture exactly once to a concrete family adapter', () => {
  const capturePlan = plan()
  const stages = buildSfP2RuntimeStages(capturePlan)
  assert.deepEqual(stages.map(({ id }) => id), [
    'developer-service',
    'connected',
    'browser-native',
    'calendar-local',
    'public',
  ])
  assert.ok(stages.every((stage) => stage.adapter === stage.id && stage.captures.length > 0))
  const assigned = stages.flatMap((stage) => stage.captures.map(({ key }) => key))
  assert.equal(assigned.length, capturePlan.captures.length)
  assert.equal(new Set(assigned).size, assigned.length)
})

test('every ready widget and compatibility face has an explicit DOM signature probe', () => {
  const capturePlan = plan()
  for (const capture of capturePlan.captures.filter((entry) => entry.state === 'ready')) {
    const probe = buildSfP2DomProbe(capture)
    assert.ok(probe.essentialSelectors.length > 0, `${capture.key} has no essentials`)
    assert.ok(probe.signatureSelectors.length > 0, `${capture.key} has no signatures`)
  }
  for (const widget of ['github', 'gitlab']) {
    assert.deepEqual(
      buildSfP2DomProbe(capturePlan.captures.find((entry) => entry.widget === widget && entry.kind === 'free-tier' && entry.tier === 'compact'))
        .signatureSelectors,
      ['[data-contribution-summary]'],
    )
    assert.deepEqual(
      buildSfP2DomProbe(capturePlan.captures.find((entry) => entry.widget === widget && entry.kind === 'free-tier' && entry.tier === 'standard'))
        .signatureSelectors,
      ['[role="img"][aria-label*="contribution" i]'],
    )
  }
  assert.deepEqual(
    buildSfP2DomProbe(capturePlan.captures.find((entry) => entry.widget === 'linear' && entry.kind === 'free-tier' && entry.tier === 'standard'))
      .signatureSelectors,
    ['a[href^="https://linear.app/"]'],
  )
  assert.deepEqual(
    buildSfP2DomProbe(capturePlan.captures.find((entry) => entry.widget === 'todoist' && entry.kind === 'free-tier' && entry.tier === 'standard'))
      .signatureSelectors,
    ['li'],
  )
  assert.deepEqual(
    buildSfP2DomProbe(capturePlan.captures.find((entry) => entry.kind === 'compatibility')).signatureSelectors,
    ['.stack-compatibility-face'],
  )
})

test('ready probes follow each authored tier instead of demanding larger-tier rows from Compact', () => {
  const compact = (widget) => buildSfP2DomProbe({
    key: `${widget}-compact`, widget, tier: 'compact', state: 'ready', kind: 'free-tier',
  }).signatureSelectors

  for (const widget of ['jira', 'vercel']) assert.deepEqual(compact(widget), ['[data-work-pulse-summary]'])
  for (const widget of ['linear', 'sentry', 'todoist']) assert.deepEqual(compact(widget), ['strong'])
  for (const widget of ['readingList', 'recentlyClosed', 'downloads', 'tabGroups']) {
    assert.deepEqual(compact(widget), ['header + div span'])
  }
  assert.deepEqual(compact('sun'), ['[aria-label="Sun times"]'])
  assert.deepEqual(compact('moon'), ['strong'])
  assert.deepEqual(compact('auroraKp'), ['p.text-xl'])
  assert.deepEqual(compact('crypto'), ['[data-crypto-row]'])
})

test('runtime probes include the frame root, click the stack member, and map Tasks to its settings key', () => {
  const source = readFileSync(new URL('./qa-shared-frame-p2.mjs', import.meta.url), 'utf8')
  assert.match(source, /root\.matches\(selector\)/)
  assert.match(source, /data-stack-member="\$\{capture\.widget\}"\]\[data-stack-active="true"\].*\.click/s)
  assert.match(source, /tasks:\s*'todo'/)
})

test('state-family captures contain only states their selected identity can actually render', () => {
  const result = plan()
  expectFamily('developer-service', ['loading', 'ready', 'empty', 'stale', 'partial', 'hard-error'])
  expectFamily('connected', ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'])
  expectFamily('browser-native', ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'])
  expectFamily('calendar-local', ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'])
  expectFamily('public', ['loading', 'ready', 'empty', 'stale', 'permission-required', 'hard-error'])

  function expectFamily(id, expected) {
    const family = result.stateFamilies.find((entry) => entry.id === id)
    assert.deepEqual(family?.states, expected)
  }
})

test('interaction evidence uses a real action per framed family and measures swipe selection before cleanup', () => {
  const result = plan()
  const clickWidgets = Object.fromEntries(result.captures
    .filter((capture) => capture.interaction === 'stack-plain-click')
    .map((capture) => [capture.family, capture.widget]))
  assert.deepEqual(clickWidgets, {
    'developer-service': 'github',
    connected: 'linear',
    'browser-native': 'readingList',
    'calendar-local': 'tasks',
    public: 'publicHolidays',
  })

  const source = readFileSync(new URL('./qa-shared-frame-p2.mjs', import.meta.url), 'utf8')
  const clearSelection = source.indexOf('getSelection()?.removeAllRanges()')
  const runInteraction = source.indexOf('await runInteraction(capture)')
  const measureFrame = source.indexOf('await measureFrame(capture, frame)')
  assert.ok(clearSelection >= 0 && clearSelection < runInteraction, 'selection must be cleared before the gesture')
  assert.ok(runInteraction < measureFrame, 'selection must be measured after the gesture')
  assert.doesNotMatch(source.slice(runInteraction, measureFrame), /removeAllRanges/)

  const interactionBody = source.slice(source.indexOf('const runInteraction'), source.indexOf('const screenshotCapture'))
  assert.doesNotMatch(interactionBody, /position:\s*\{\s*x:\s*6,\s*y:\s*6\s*\}/)
  assert.doesNotMatch(interactionBody, /Service status details/)
  assert.match(interactionBody, /https:\/\/github\.com\//)
  assert.match(interactionBody, /readingList\.updateEntry/)
  assert.match(interactionBody, /getByRole\('button', \{ name: 'Tasks' \}\)/)
  assert.match(interactionBody, /date\.nager\.at/)
})

test('Public Holidays probes rows below Full and grouped months only at Full', () => {
  assert.deepEqual(
    buildSfP2DomProbe({ key: 'publicHolidays-standard', widget: 'publicHolidays', tier: 'standard', state: 'ready', kind: 'free-tier' }).signatureSelectors,
    ['li'],
  )
  assert.deepEqual(
    buildSfP2DomProbe({ key: 'publicHolidays-full', widget: 'publicHolidays', tier: 'full', state: 'ready', kind: 'free-tier' }).signatureSelectors,
    ['section[aria-label$="holidays"]'],
  )
})

test('layout seeding preserves exact free tiers and builds manual Weather stack pairs without legacy layout data', () => {
  const ids = plan().authorityIds
  const free = buildSfP2Layouts(ids, { key: 'github-full', kind: 'free-tier', widget: 'github', tier: 'full' })
  assert.deepEqual(free.layouts[0].widgets.github, {
    kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'full', layer: 7,
  })
  assert.equal(free.layouts[0].stacks, undefined)

  const pair = buildSfP2Layouts(ids, { key: 'github-pair', kind: 'stack-pair', widget: 'github', tier: 'standard' })
  assert.deepEqual(pair.layouts[0].stacks, [{
    id: 'stack-sf-p2-github',
    members: ['weather', 'github'],
    facing: 'github',
    anchor: 'center',
    offsetX: 0,
    offsetY: 0,
    tier: 'standard',
    layer: 7,
  }])
  assert.equal(pair.layouts[0].widgets.weather, undefined)
  assert.equal(pair.layouts[0].widgets.github, undefined)

  const compatibility = buildSfP2Layouts(ids, { key: 'moon-compat', kind: 'compatibility', widget: 'moon', tier: 'full' })
  assert.equal(compatibility.layouts[0].stacks[0].facing, 'moon')
  assert.equal(compatibility.layouts[0].stacks[0].tier, 'full')
})

test('fixture-state routing distinguishes fresh, held, invalid, retained, and browser transition states', () => {
  assert.deepEqual(resolveSfP2FixtureState({ family: 'developer-service', state: 'ready' }), {
    snapshot: 'fresh', network: 'ready', renderedState: 'ready', transition: null,
  })
  assert.deepEqual(resolveSfP2FixtureState({ family: 'connected', state: 'loading' }), {
    snapshot: 'none', network: 'hold', renderedState: 'loading', transition: null,
  })
  assert.deepEqual(resolveSfP2FixtureState({ family: 'public', state: 'partial' }), {
    snapshot: 'stale', network: 'invalid', renderedState: 'partial', transition: null,
  })
  assert.deepEqual(resolveSfP2FixtureState({ family: 'browser-native', state: 'stale' }), {
    snapshot: 'native', network: 'ready', renderedState: 'stale', transition: 'hold',
  })
  assert.deepEqual(resolveSfP2FixtureState({ family: 'browser-native', state: 'partial' }), {
    snapshot: 'native', network: 'ready', renderedState: 'partial', transition: 'error',
  })
  assert.deepEqual(resolveSfP2FixtureState({ family: 'browser-native', state: 'permission-required' }), {
    snapshot: 'native', network: 'permission-required', renderedState: 'permission-required', transition: null,
  })
})

test('browser-native permission fixtures grant ordinary states and deny only permission-required', () => {
  const source = readFileSync(new URL('./qa-shared-frame-p2.mjs', import.meta.url), 'utf8')
  assert.match(source, /globalThis\.__auroraPermissionsHarnessApi = permissionApi/)
  assert.match(source, /contains: async \(details\) => \{/)
  assert.match(source, /if \(details\.permissions\?\.includes\(configured\.permission\)\) return modeFor\(configured\.target\) !== 'permission-required'/)
  assert.doesNotMatch(source, /chrome\.permissions\.contains =/)
})
