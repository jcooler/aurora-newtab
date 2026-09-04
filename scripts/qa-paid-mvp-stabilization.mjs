import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

export const PAID_MVP_GATES = Object.freeze([
  Object.freeze({ command: 'qa:free-baseline', evidence: (sha) => `artifacts/qa-free-baseline/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:widget-redesign-production', evidence: () => 'docs/superpowers/catalog/widget-redesign/production/evidence.json' }),
  Object.freeze({ command: 'qa:canvas-polish', evidence: () => 'docs/superpowers/qa/canvas-polish/acceptance/evidence.json' }),
  Object.freeze({ command: 'qa:tab-two-v2-connectors', evidence: () => 'docs/superpowers/qa/tab-two-v2-connectors/acceptance/evidence.json' }),
  Object.freeze({ command: 'qa:tab-two-v2-progress', evidence: (sha) => `artifacts/qa-tab-two-v2-progress/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:account-auth-production', exact: true, ownerAssisted: true, evidence: (sha) => `artifacts/qa-account-auth-production/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:stripe-billing', sourceContract: true, evidence: () => null }),
  Object.freeze({ command: 'qa:account-sync-shell', exact: true, evidence: (sha) => `artifacts/qa-account-sync-shell/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:tab-two-metrics', evidence: (sha) => `artifacts/qa-tab-two-metrics/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:google-calendar', evidence: (sha) => `docs/superpowers/qa/google-calendar/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:microsoft-calendar', evidence: (sha) => `docs/superpowers/qa/microsoft-calendar/${sha}/evidence.json` }),
  Object.freeze({ command: 'qa:paid-mvp-support', exact: true, evidence: (sha) => `artifacts/qa-paid-mvp-support/${sha}/evidence.json` }),
])

const INDEX_KEYS = Object.freeze([
  'command', 'result', 'sourceCommit', 'buildCommit', 'evidencePath', 'screenshotCount', 'ledgerTotals',
])
const TOTAL_KEYS = Object.freeze(['requests', 'storageWrites', 'consoleErrors', 'pageErrors', 'failedRequests'])
const FORBIDDEN_KEY = /(?:token|secret|password|payload|storageValue|providerData|screenshotData|email|accountId|deviceId)/iu

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two paid MVP stabilization QA requires --exact')
}

export function planPaidMvpGateExecutions(args) {
  const includeOwnerAssisted = args.includes('--include-owner-assisted')
  return PAID_MVP_GATES.map((gate) => ({
    ...gate,
    disposition: gate.ownerAssisted && !includeOwnerAssisted ? 'DEFERRED_OWNER_QA' : 'RUN',
  }))
}

function assertNoForbiddenKeys(value, path = 'index') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert(!FORBIDDEN_KEY.test(key), `forbidden evidence key at ${path}.${key}`)
    assertNoForbiddenKeys(nested, `${path}.${key}`)
  }
}

export function assertPaidMvpEvidenceIndex(index) {
  assertNoForbiddenKeys(index)
  assert.equal(index.schemaVersion, 1, 'evidence index schema is not supported')
  assert(
    ['PASS', 'AUTOMATED_PASS_OWNER_QA_PENDING'].includes(index.result),
    'evidence index is not an accepted pass state',
  )
  assert.equal(typeof index.sourceCommit, 'string', 'evidence source commit is missing')
  assert.equal(index.buildCommit, index.sourceCommit, 'evidence provenance does not match source')
  assert.deepEqual(
    index.entries?.map(({ command }) => command),
    PAID_MVP_GATES.map(({ command }) => command),
    'evidence command list does not match the approved gate order',
  )
  for (const [indexPosition, entry] of index.entries.entries()) {
    const gate = PAID_MVP_GATES[indexPosition]
    assert.deepEqual(Object.keys(entry).sort(), [...INDEX_KEYS].sort(), `${entry.command} index keys are not redacted and exact`)
    assert(
      entry.result === 'PASS' || (gate.ownerAssisted && entry.result === 'DEFERRED_OWNER_QA'),
      `${entry.command} did not pass or declare its owner-QA boundary`,
    )
    assert.equal(entry.sourceCommit, index.sourceCommit, `${entry.command} source commit drifted`)
    assert.equal(entry.buildCommit, index.buildCommit, `${entry.command} build commit drifted`)
    assert(entry.evidencePath === null || (
      typeof entry.evidencePath === 'string'
        && !entry.evidencePath.includes('..')
        && !/^[A-Za-z]:[\\/]/u.test(entry.evidencePath)
    ), `${entry.command} evidence path is not repository-relative`)
    assert(Number.isSafeInteger(entry.screenshotCount) && entry.screenshotCount >= 0, `${entry.command} screenshot count is invalid`)
    assert.deepEqual(Object.keys(entry.ledgerTotals).sort(), [...TOTAL_KEYS].sort(), `${entry.command} ledger keys are not exact`)
    for (const total of Object.values(entry.ledgerTotals)) {
      assert(Number.isSafeInteger(total) && total >= 0, `${entry.command} ledger total is invalid`)
    }
  }
  const deferred = index.entries.filter(({ result }) => result === 'DEFERRED_OWNER_QA')
  assert.equal(
    index.result,
    deferred.length === 0 ? 'PASS' : 'AUTOMATED_PASS_OWNER_QA_PENDING',
    'evidence result does not match its deferred owner-QA entries',
  )
  return index
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0
}

function ledgerTotals(evidence) {
  return {
    requests: arrayLength(evidence.requests) + arrayLength(evidence.requestLedger) + arrayLength(evidence.externalRequests) + arrayLength(evidence.unexpectedRequests),
    storageWrites: arrayLength(evidence.storageWrites),
    consoleErrors: arrayLength(evidence.consoleErrors),
    pageErrors: arrayLength(evidence.pageErrors),
    failedRequests: arrayLength(evidence.failedRequests),
  }
}

function evidenceResult(evidence) {
  if (typeof evidence.result === 'string') return evidence.result
  return 'PASS'
}

function evidenceBuildCommit(evidence, fallback) {
  return evidence.build?.commit
    ?? evidence.builds?.production?.commit
    ?? evidence.buildCommit
    ?? evidence.commit
    ?? evidence.sourceSha
    ?? fallback
}

export function npmInvocation(args, npmExecPath = process.env.npm_execpath) {
  assert.equal(typeof npmExecPath, 'string', 'npm JavaScript CLI path is unavailable')
  assert(npmExecPath.length > 0, 'npm JavaScript CLI path is unavailable')
  return { executable: process.execPath, args: [npmExecPath, ...args] }
}

export function gateNpmInvocation(gate, npmExecPath = process.env.npm_execpath) {
  return npmInvocation(['run', gate.command, '--', '--exact'], npmExecPath)
}

function runGate(repoRoot, gate) {
  const invocation = gateNpmInvocation(gate)
  execFileSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}

export async function runPaidMvpStabilization(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const provenancePath = resolve(repoRoot, 'dist/build-provenance.json')
  assert(existsSync(provenancePath), 'paid MVP stabilization requires an exact production build first')
  const build = JSON.parse(readFileSync(provenancePath, 'utf8'))
  assert.equal(build.commit, sourceCommit, 'paid MVP production build provenance does not match HEAD')

  const output = resolve(repoRoot, 'artifacts/qa-paid-mvp-stabilization', sourceCommit)
  mkdirSync(output, { recursive: true })
  const index = {
    schemaVersion: 1,
    sourceCommit,
    buildCommit: build.commit,
    result: 'FAIL',
    entries: [],
  }

  try {
    for (const gate of planPaidMvpGateExecutions(args)) {
      if (gate.disposition === 'DEFERRED_OWNER_QA') {
        process.stdout.write(`${gate.command}: deferred to the cumulative owner QA handoff\n`)
        index.entries.push({
          command: gate.command,
          result: 'DEFERRED_OWNER_QA',
          sourceCommit,
          buildCommit: build.commit,
          evidencePath: null,
          screenshotCount: 0,
          ledgerTotals: { requests: 0, storageWrites: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0 },
        })
        continue
      }
      if (gate.ownerAssisted) process.stdout.write(`${gate.command}: owner-assisted browser checkpoint starting\n`)
      runGate(repoRoot, gate)
      const relativeEvidence = gate.evidence(sourceCommit)
      let evidence = {}
      if (relativeEvidence !== null) {
        const absoluteEvidence = resolve(repoRoot, relativeEvidence)
        assert(existsSync(absoluteEvidence), `${gate.command} did not produce its evidence JSON`)
        evidence = JSON.parse(readFileSync(absoluteEvidence, 'utf8'))
        assert.equal(evidenceResult(evidence), 'PASS', `${gate.command} evidence is not PASS`)
      }
      index.entries.push({
        command: gate.command,
        result: 'PASS',
        sourceCommit,
        buildCommit: evidenceBuildCommit(evidence, build.commit),
        evidencePath: relativeEvidence,
        screenshotCount: arrayLength(evidence.screenshots),
        ledgerTotals: ledgerTotals(evidence),
      })
    }
    index.result = index.entries.some(({ result }) => result === 'DEFERRED_OWNER_QA')
      ? 'AUTOMATED_PASS_OWNER_QA_PENDING'
      : 'PASS'
    assertPaidMvpEvidenceIndex(index)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(index, null, 2)}\n`)
    process.stdout.write(`PASS: Tab Two paid MVP stabilization (${sourceCommit})\n`)
    return index
  } catch (error) {
    index.failure = String(error?.message ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(index, null, 2)}\n`)
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPaidMvpStabilization()
}
