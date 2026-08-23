import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  applySfP2ReviewedVerdicts,
  buildSfP2CapturePlan,
  buildSfP2EvidenceManifest,
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
  assert.equal(result.widgets.length, 25)
  assert.equal(result.widgets.some(({ id }) => id === 'weather'), false)
  assert.equal(result.widgets.some(({ id }) => id === 'onThisDay'), false)
  for (const id of ['github', 'linear', 'readingList', 'ics', 'publicHolidays']) {
    assert.ok(result.widgets.some((entry) => entry.id === id), `${id} is missing`)
  }

  const changedSource = contractSource.replace(
    "moon: framedContract(['compact'], ['compact'], RESOURCE_STATES",
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
