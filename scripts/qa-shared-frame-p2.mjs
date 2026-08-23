import assert from 'node:assert/strict'

import { parsePresentationAuthority } from './qa-shared-frame-p1.mjs'
import { SF_P2_REVIEWED_VERDICTS } from './qa-shared-frame-p2-reviewed-verdicts.mjs'

const REFERENCE_IDS = new Set(['weather', 'onThisDay'])
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
  Object.freeze({ id: 'planner-boundary', width: 600, height: 800 }),
])
const VALID_VERDICTS = new Set(['Useful', 'Needs refinement', 'Rejected'])
const REQUIRED_ASSERTIONS = Object.freeze([
  'frame-dimensions',
  'no-clipping',
  'no-internal-scroll',
  'text-floors',
  'signature-content',
  'one-data-owner',
  'storage-audit',
])
const STACK_INTERACTIONS = Object.freeze([
  'stack-initial',
  'stack-next',
  'stack-previous',
  'stack-dot',
  'stack-swipe',
  'stack-plain-click',
])

const FAMILY_IDS = Object.freeze({
  'developer-service': Object.freeze(['status', 'github', 'gitlab', 'jira', 'vercel']),
  connected: Object.freeze(['linear', 'sentry', 'todoist', 'homeassistant', 'rss', 'crypto']),
  'browser-native': Object.freeze(['readingList', 'recentlyClosed', 'downloads', 'tabGroups']),
  'calendar-local': Object.freeze(['ics', 'monthCal', 'sun', 'moon', 'habits', 'timer', 'tasks', 'notes']),
  public: Object.freeze(['publicHolidays', 'auroraKp']),
})

const STATE_REFERENCES = Object.freeze({
  'developer-service': 'status',
  connected: 'linear',
  'browser-native': 'readingList',
  'calendar-local': 'ics',
  public: 'publicHolidays',
})

function familyFor(id) {
  for (const [family, ids] of Object.entries(FAMILY_IDS)) {
    if (ids.includes(id)) return family
  }
  throw new Error(`SF-P2 has no family for framed widget ${id}`)
}

function preferredTier(widget, preferred = 'standard') {
  if (widget.tiers.includes(preferred)) return preferred
  return widget.tiers[0]
}

function capture({ key, kind, widget, tier, state = 'ready', family, theme = 'dark', viewport = 'common', fixture, reference = null, interaction = null }) {
  return {
    key,
    filename: `${key}.png`,
    kind,
    widget,
    tier,
    state,
    family,
    theme,
    viewport,
    fixture,
    reference,
    interaction,
    assertions: [...REQUIRED_ASSERTIONS],
  }
}

function readyCaptures(widgets) {
  return widgets.flatMap((widget) => widget.tiers.map((tier) => capture({
    key: `${widget.id}-ready-${tier}-dark-common`,
    kind: 'free-tier',
    widget: widget.id,
    tier,
    family: widget.family,
    fixture: `${widget.id}:ready:max-data`,
  })))
}

function stackPairCaptures(widgets) {
  return widgets.flatMap((widget) => widget.stackTiers.map((tier) => capture({
    key: `${widget.id}-stack-${tier}-weather-dark-exact-short`,
    kind: 'stack-pair',
    widget: widget.id,
    tier,
    family: widget.family,
    viewport: 'exact-short',
    fixture: `${widget.id}:ready:max-data`,
    reference: 'weather',
  })))
}

function stateCaptures(widgets, stateFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return stateFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    return family.states.map((state) => capture({
      key: `${widget.id}-${state}-${preferredTier(widget)}-dark-laptop`,
      kind: 'family-state',
      widget: widget.id,
      tier: preferredTier(widget),
      state,
      family: family.id,
      viewport: 'laptop',
      fixture: `${widget.id}:${state}`,
    }))
  })
}

function interactionCaptures(widgets, interactionFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return interactionFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    const tier = widget.stackTiers.includes('standard') ? 'standard' : widget.stackTiers[0]
    return STACK_INTERACTIONS.map((interaction) => capture({
      key: `${widget.id}-${interaction}-${tier}-weather-dark-exact-short`,
      kind: 'family-interaction',
      widget: widget.id,
      tier,
      family: family.id,
      viewport: 'exact-short',
      fixture: `${widget.id}:ready:max-data`,
      reference: 'weather',
      interaction,
    }))
  })
}

function themeCaptures(widgets, interactionFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return interactionFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    const tier = preferredTier(widget)
    return ['light', 'saturated'].map((theme) => capture({
      key: `${widget.id}-ready-${tier}-${theme}-common`,
      kind: 'family-theme',
      widget: widget.id,
      tier,
      family: family.id,
      theme,
      fixture: `${widget.id}:ready:max-data`,
    }))
  })
}

function viewportCaptures(widgets) {
  const widget = widgets.find(({ id }) => id === 'github') ?? widgets[0]
  const tier = widget.tiers.includes('full') ? 'full' : widget.tiers[0]
  return ['narrow-floor', 'planner-boundary'].map((viewport) => capture({
    key: `${widget.id}-ready-${tier}-dark-${viewport}`,
    kind: 'viewport-boundary',
    widget: widget.id,
    tier,
    family: widget.family,
    viewport,
    fixture: `${widget.id}:ready:max-data`,
  }))
}

export function buildSfP2CapturePlan(source) {
  const authority = parsePresentationAuthority(source)
  const widgets = Object.entries(authority)
    .filter(([id, contract]) => contract.presentationClass === 'framed' && !REFERENCE_IDS.has(id))
    .map(([id, contract]) => {
      assert(Array.isArray(contract.sizes) && contract.sizes.length > 0, `${id} has no ready tiers`)
      assert(Array.isArray(contract.stackSizes) && contract.stackSizes.length > 0, `${id} has no stack tiers`)
      assert(Array.isArray(contract.states) && contract.states.length > 0, `${id} has no states`)
      for (const tier of contract.sizes) {
        const composition = contract.tiers?.[tier]
        assert(composition, `${id} is missing ${tier} composition`)
        assert(Array.isArray(composition.essential) && composition.essential.length > 0, `${id} ${tier} has no essential content`)
        assert(Array.isArray(composition.signature) && composition.signature.length > 0, `${id} ${tier} has no signature content`)
      }
      for (const tier of contract.stackSizes) assert(contract.sizes.includes(tier), `${id} stack tier ${tier} lacks a free presentation`)
      return {
        id,
        family: familyFor(id),
        tiers: [...contract.sizes],
        stackTiers: [...contract.stackSizes],
        states: [...contract.states],
        compositions: structuredClone(contract.tiers),
      }
    })

  const stateFamilies = Object.entries(STATE_REFERENCES).map(([id, widget]) => {
    const contract = widgets.find((entry) => entry.id === widget)
    assert(contract, `${id} state reference ${widget} is missing`)
    return { id, widget, states: [...contract.states] }
  })
  const interactionFamilies = Object.entries(STATE_REFERENCES).map(([id, widget]) => ({ id, widget }))
  const captures = [
    ...readyCaptures(widgets),
    ...stackPairCaptures(widgets),
    ...stateCaptures(widgets, stateFamilies),
    ...interactionCaptures(widgets, interactionFamilies),
    ...themeCaptures(widgets, interactionFamilies),
    ...viewportCaptures(widgets),
  ]

  return {
    authorityIds: Object.keys(authority),
    widgets,
    stateFamilies,
    interactionFamilies,
    dimensions: structuredClone(EXPECTED_DIMENSIONS),
    themes: structuredClone(REQUIRED_THEMES),
    viewports: structuredClone(REQUIRED_VIEWPORTS),
    audits: { storage: { allowedKeys: ['layouts'], legacyLayoutWrites: 0 } },
    captures,
  }
}

export function applySfP2ReviewedVerdicts(plan, reviewedVerdicts) {
  assert(reviewedVerdicts && typeof reviewedVerdicts === 'object' && !Array.isArray(reviewedVerdicts), 'reviewed verdict map is required')
  const keys = new Set(plan.captures.map(({ key }) => key))
  for (const key of Object.keys(reviewedVerdicts)) assert(keys.has(key), `reviewed verdict ${key} has no capture`)
  return {
    ...structuredClone(plan),
    captures: plan.captures.map((entry) => {
      const reviewed = reviewedVerdicts[entry.key]
      assert(reviewed, `${entry.key} is missing a reviewed verdict`)
      assert(VALID_VERDICTS.has(reviewed.verdict), `${entry.key} has invalid reviewed verdict ${reviewed.verdict}`)
      assert.equal(typeof reviewed.reason, 'string', `${entry.key} is missing a reviewed verdict reason`)
      assert(reviewed.reason.trim().length > 0, `${entry.key} is missing a reviewed verdict reason`)
      return { ...entry, verdict: reviewed.verdict, verdictReason: reviewed.reason }
    }),
  }
}

export function buildSfP2EvidenceManifest(source, reviewedVerdicts = SF_P2_REVIEWED_VERDICTS) {
  return applySfP2ReviewedVerdicts(buildSfP2CapturePlan(source), reviewedVerdicts)
}

function requireExactRows(actual, expected, label) {
  assert.deepEqual(actual.map(({ id }) => id), expected.map(({ id }) => id), `${label} declarations must be exact`)
}

function validate(manifest, requireVerdicts) {
  assert.equal(manifest.widgets.length, 25, 'SF-P2 must contain exactly 25 remaining framed widgets')
  assert.equal(new Set(manifest.widgets.map(({ id }) => id)).size, manifest.widgets.length, 'widget declarations must be unique')
  assert.equal(manifest.widgets.some(({ id }) => REFERENCE_IDS.has(id)), false, 'SF-P1 references must not re-enter SF-P2')
  for (const [tier, expected] of Object.entries(EXPECTED_DIMENSIONS)) {
    assert.equal(manifest.dimensions?.[tier]?.width, expected.width, `${tier} width must be ${expected.width}`)
    assert.equal(manifest.dimensions?.[tier]?.height, expected.height, `${tier} height must be ${expected.height}`)
  }
  requireExactRows(manifest.themes, REQUIRED_THEMES, 'theme')
  requireExactRows(manifest.viewports, REQUIRED_VIEWPORTS, 'viewport')
  assert.deepEqual(manifest.audits?.storage, { allowedKeys: ['layouts'], legacyLayoutWrites: 0 }, 'storage audit contract drifted')

  const keys = new Set()
  const files = new Set()
  for (const entry of manifest.captures) {
    assert.equal(typeof entry.key, 'string', 'capture key is required')
    assert(!keys.has(entry.key), `duplicate capture key ${entry.key}`)
    keys.add(entry.key)
    assert(!files.has(entry.filename), `duplicate capture filename ${entry.filename}`)
    files.add(entry.filename)
    assert.equal(typeof entry.fixture, 'string', `${entry.key} fixture is required`)
    assert(entry.fixture.length > 0, `${entry.key} fixture is required`)
    assert.deepEqual(entry.assertions, REQUIRED_ASSERTIONS, `${entry.key} assertions drifted`)
    if (requireVerdicts) {
      assert(VALID_VERDICTS.has(entry.verdict), `${entry.key} is missing an explicit usefulness verdict`)
      assert.equal(typeof entry.verdictReason, 'string', `${entry.key} is missing its usefulness verdict reason`)
      assert(entry.verdictReason.trim().length > 0, `${entry.key} is missing its usefulness verdict reason`)
    } else {
      assert(!('verdict' in entry), `${entry.key} planning must not manufacture verdicts`)
      assert(!('verdictReason' in entry), `${entry.key} planning must not manufacture verdict reasons`)
    }
  }

  for (const widget of manifest.widgets) {
    for (const tier of widget.tiers) {
      assert(manifest.captures.some((entry) => entry.kind === 'free-tier' && entry.widget === widget.id && entry.tier === tier && entry.state === 'ready'), `${widget.id} ${tier} ready capture is missing`)
    }
    for (const tier of widget.stackTiers) {
      assert(manifest.captures.some((entry) => entry.kind === 'stack-pair' && entry.widget === widget.id && entry.tier === tier && entry.reference === 'weather'), `${widget.id} ${tier} stack pair is missing`)
    }
  }
  for (const family of manifest.stateFamilies) {
    for (const state of family.states) assert(manifest.captures.some((entry) => entry.family === family.id && entry.state === state), `${family.id} ${state} state is missing`)
  }
  for (const family of manifest.interactionFamilies) {
    for (const interaction of STACK_INTERACTIONS) assert(manifest.captures.some((entry) => entry.family === family.id && entry.interaction === interaction), `${family.id} ${interaction} is missing`)
  }
  for (const theme of REQUIRED_THEMES) assert(manifest.captures.some((entry) => entry.theme === theme.id), `theme ${theme.id} has no capture`)
  for (const viewport of REQUIRED_VIEWPORTS) assert(manifest.captures.some((entry) => entry.viewport === viewport.id), `viewport ${viewport.id} has no capture`)
  return manifest
}

export function validateSfP2CapturePlan(manifest) {
  return validate(manifest, false)
}

export function validateSfP2EvidenceManifest(manifest) {
  return validate(manifest, true)
}
