import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  PAID_MVP_CONNECTOR_MATRIX,
  PAID_MVP_FLOW_MATRIX,
  PAID_MVP_MANUAL_CEILINGS,
  PAID_MVP_WIDGET_MATRIX,
} from './paid-mvp-qa-matrix.mjs'
import * as stabilization from './qa-paid-mvp-stabilization.mjs'

const {
  PAID_MVP_GATES,
  assertPaidMvpEvidenceIndex,
  requireExact,
} = stabilization

const repoRoot = resolve(import.meta.dirname, '..')

function literalIds(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert(start >= 0 && end > start, `could not parse registry between ${startMarker} and ${endMarker}`)
  return [...source.slice(start, end).matchAll(/\bid:\s*'([^']+)'/gu)].map((match) => match[1]).sort()
}

function connectorIds(source) {
  const start = source.indexOf('export const CONNECTOR_IDS = [')
  const end = source.indexOf('] as const', start)
  assert(start >= 0 && end > start, 'could not parse CONNECTOR_IDS')
  return [...source.slice(start, end).matchAll(/'([^']+)'/gu)].map((match) => match[1]).sort()
}

function assertClassified(entries, label) {
  const allowed = new Set(['automated', 'manual-ceiling', 'not-applicable'])
  for (const entry of entries) {
    assert(allowed.has(entry.disposition), `${label} ${entry.id} has an invalid disposition`)
    assert.equal(typeof entry.evidence, 'string', `${label} ${entry.id} lacks an evidence owner`)
    assert(entry.evidence.length > 0, `${label} ${entry.id} has a blank evidence owner`)
    assert.equal(typeof entry.reason, 'string', `${label} ${entry.id} lacks a reason`)
    assert(entry.reason.length > 0, `${label} ${entry.id} has a blank reason`)
  }
}

test('keeps the paid MVP widget and connector matrices in exact registry parity', () => {
  const widgetSource = readFileSync(resolve(repoRoot, 'src/newtab/widgetRegistry.ts'), 'utf8')
  const connectorSource = readFileSync(resolve(repoRoot, 'src/services/connectors/types.ts'), 'utf8')
  const registryWidgetIds = literalIds(widgetSource, 'const SOURCES:', '] as const')
  const registryConnectorIds = connectorIds(connectorSource)
  assert.deepEqual(PAID_MVP_WIDGET_MATRIX.map(({ id }) => id).sort(), registryWidgetIds)
  assert.deepEqual(PAID_MVP_CONNECTOR_MATRIX.map(({ id }) => id).sort(), registryConnectorIds)
})

test('classifies every presentation and state with executable evidence or an honest boundary', () => {
  for (const row of [...PAID_MVP_WIDGET_MATRIX, ...PAID_MVP_CONNECTOR_MATRIX]) {
    assert(row.presentations.length > 0, `${row.id} has no presentation coverage`)
    assert(row.states.some((state) => state.id === 'ready' && state.disposition === 'automated'), `${row.id} lacks ready-state coverage`)
    assertClassified(row.presentations, `${row.id} presentation`)
    assertClassified(row.states, `${row.id} state`)
  }
})

test('owns every required paid MVP interaction family', () => {
  const required = [
    'drag-drop', 'keyboard', 'touch', 'named-layouts', 'stacks', 'docks', 'persistence',
    'account', 'billing', 'sync', 'metrics', 'google-calendar', 'microsoft-calendar',
    'quota', 'conflicts', 'deletion', 'backup', 'data-portability', 'help', 'diagnostics',
  ]
  assert.deepEqual(PAID_MVP_FLOW_MATRIX.map(({ id }) => id), required)
  assertClassified(PAID_MVP_FLOW_MATRIX, 'flow')
})

test('keeps hardware, native, provider, and assistive-technology claims manual', () => {
  assert.deepEqual(PAID_MVP_MANUAL_CEILINGS.map(({ id }) => id), [
    'native-permission-prompts',
    'real-provider-consent-revocation',
    'assistive-technology-speech',
    'physical-touch-trackpad',
    'mixed-dpi-hardware',
    'macbook-behavior',
  ])
  assertClassified(PAID_MVP_MANUAL_CEILINGS, 'manual ceiling')
  assert(PAID_MVP_MANUAL_CEILINGS.every(({ disposition }) => disposition === 'manual-ceiling'))
})

test('pins the approved specialist command order and exact entry point', () => {
  assert.deepEqual(PAID_MVP_GATES.map(({ command }) => command), [
    'qa:free-baseline',
    'qa:widget-redesign-production',
    'qa:canvas-polish',
    'qa:tab-two-v2-connectors',
    'qa:tab-two-v2-progress',
    'qa:stripe-billing',
    'qa:account-sync-shell',
    'qa:data-portability',
    'qa:account-auth-production',
    'qa:tab-two-metrics',
    'qa:google-calendar',
    'qa:microsoft-calendar',
    'qa:paid-mvp-support',
  ])
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['qa:paid-mvp-stabilization'], 'node scripts/qa-paid-mvp-stabilization.mjs')
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('defers owner-assisted browser work unless the caller opts in explicitly', () => {
  assert.equal(typeof stabilization.planPaidMvpGateExecutions, 'function')

  const defaultPlan = stabilization.planPaidMvpGateExecutions(['--exact'])
  assert.equal(
    defaultPlan.find(({ command }) => command === 'qa:account-auth-production')?.disposition,
    'DEFERRED_OWNER_QA',
  )
  assert(defaultPlan.filter(({ disposition }) => disposition === 'RUN').every(({ ownerAssisted }) => !ownerAssisted))

  const ownerPlan = stabilization.planPaidMvpGateExecutions(['--exact', '--include-owner-assisted'])
  assert(ownerPlan.every(({ disposition }) => disposition === 'RUN'))
})

test('invokes npm through its JavaScript CLI on Windows-safe child process boundaries', () => {
  assert.equal(typeof stabilization.npmInvocation, 'function')
  assert.deepEqual(
    stabilization.npmInvocation(['run', 'qa:free-baseline'], 'C:/node/npm-cli.js'),
    {
      executable: process.execPath,
      args: ['C:/node/npm-cli.js', 'run', 'qa:free-baseline'],
    },
  )
})

test('passes exact mode to every specialist gate from the exact orchestrator', () => {
  assert.equal(typeof stabilization.gateNpmInvocation, 'function')
  assert.deepEqual(
    stabilization.gateNpmInvocation({ command: 'qa:free-baseline' }, 'C:/node/npm-cli.js'),
    {
      executable: process.execPath,
      args: ['C:/node/npm-cli.js', 'run', 'qa:free-baseline', '--', '--exact'],
    },
  )
})

test('prepares each specialist with the build mode its fixtures require', () => {
  assert.equal(typeof stabilization.buildArgsForGate, 'function')
  assert.deepEqual(
    PAID_MVP_GATES.map((gate) => [gate.command, stabilization.buildArgsForGate(gate)]),
    [
      ['qa:free-baseline', []],
      ['qa:widget-redesign-production', ['--mode=preview']],
      ['qa:canvas-polish', null],
      ['qa:tab-two-v2-connectors', null],
      ['qa:tab-two-v2-progress', null],
      ['qa:stripe-billing', null],
      ['qa:account-sync-shell', ['--mode=preview']],
      ['qa:data-portability', null],
      ['qa:account-auth-production', []],
      ['qa:tab-two-metrics', ['--mode=preview']],
      ['qa:google-calendar', ['--mode=preview']],
      ['qa:microsoft-calendar', ['--mode=preview']],
      ['qa:paid-mvp-support', []],
    ],
  )
})

test('retains tracked specialist evidence under the exact untracked PM-P9 artifact', () => {
  assert.equal(typeof stabilization.retainedEvidencePath, 'function')
  const widgetGate = PAID_MVP_GATES.find(({ command }) => command === 'qa:widget-redesign-production')
  const freeGate = PAID_MVP_GATES.find(({ command }) => command === 'qa:free-baseline')

  assert.equal(
    stabilization.retainedEvidencePath(widgetGate, 'abc123'),
    'artifacts/qa-paid-mvp-stabilization/abc123/specialists/qa-widget-redesign-production/evidence.json',
  )
  assert.equal(
    stabilization.retainedEvidencePath(freeGate, 'abc123'),
    'artifacts/qa-free-baseline/abc123/evidence.json',
  )
})

test('accepts only a provenance-bound, redacted evidence index', () => {
  const commands = PAID_MVP_GATES.map(({ command }) => command)
  const index = {
    schemaVersion: 1,
    sourceCommit: 'abc123',
    buildCommit: 'abc123',
    result: 'PASS',
    entries: commands.map((command) => ({
      command,
      result: 'PASS',
      sourceCommit: 'abc123',
      buildCommit: 'abc123',
      evidencePath: command === 'qa:stripe-billing' ? null : `artifacts/${command}/evidence.json`,
      screenshotCount: 2,
      ledgerTotals: { requests: 0, storageWrites: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0 },
    })),
  }
  assert.doesNotThrow(() => assertPaidMvpEvidenceIndex(index))
  assert.throws(() => assertPaidMvpEvidenceIndex({ ...index, accessToken: 'secret' }), /forbidden/i)
  assert.throws(() => assertPaidMvpEvidenceIndex({ ...index, buildCommit: 'different' }), /provenance/i)
  assert.throws(() => assertPaidMvpEvidenceIndex({ ...index, entries: index.entries.slice(1) }), /command list/i)
})

test('accepts an honest automated-pass index with owner QA deferred', () => {
  const index = {
    schemaVersion: 1,
    sourceCommit: 'abc123',
    buildCommit: 'abc123',
    result: 'AUTOMATED_PASS_OWNER_QA_PENDING',
    entries: PAID_MVP_GATES.map(({ command, ownerAssisted }) => ({
      command,
      result: ownerAssisted ? 'DEFERRED_OWNER_QA' : 'PASS',
      sourceCommit: 'abc123',
      buildCommit: 'abc123',
      evidencePath: ownerAssisted ? null : `artifacts/${command}/evidence.json`,
      screenshotCount: ownerAssisted ? 0 : 2,
      ledgerTotals: { requests: 0, storageWrites: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0 },
    })),
  }

  assert.doesNotThrow(() => assertPaidMvpEvidenceIndex(index))
})
