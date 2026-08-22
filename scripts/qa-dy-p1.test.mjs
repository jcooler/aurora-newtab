import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepareDyOutputDir } from './qa-dy-p1-output.mjs'

test('DY output accepts only its phase-specific ignored scratch root', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-dy-output-'))
  try {
    assert.equal(
      prepareDyOutputDir([], root, 'baseline'),
      resolve(root, '.qa-dy-p1-baseline'),
    )
    assert.equal(
      prepareDyOutputDir([], root, 'after'),
      resolve(root, '.qa-dy-p1-after'),
    )
    assert.throws(
      () => prepareDyOutputDir(['--out=docs/superpowers/qa/nl-p6'], root, 'after'),
      /unsafe/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DY output rejects phase mismatches and paths outside the repository root', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-dy-output-'))
  try {
    assert.throws(
      () => prepareDyOutputDir(['--out=.qa-dy-p1-after'], root, 'baseline'),
      /unsafe/i,
    )
    assert.throws(
      () => prepareDyOutputDir(['--out=../.qa-dy-p1-baseline'], root, 'baseline'),
      /unsafe/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DY output rejects a scratch-named symbolic link or junction', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-dy-output-'))
  const accepted = join(root, 'accepted-evidence')
  const redirected = join(root, '.qa-dy-p1-baseline')
  mkdirSync(accepted)
  symlinkSync(accepted, redirected, 'junction')
  try {
    assert.throws(
      () => prepareDyOutputDir([], root, 'baseline'),
      /symbolic link or junction/i,
    )
  } finally {
    rmSync(redirected, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('DY output rejects every controlled target under the frozen NL-P6 evidence tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-dy-output-'))
  try {
    for (const target of [
      'docs/superpowers/qa/nl-p6',
      'docs/superpowers/qa/nl-p6/dy-p1',
      resolve(root, 'docs/superpowers/qa/nl-p6/dy-p1-evidence'),
    ]) {
      assert.throws(
        () => prepareDyOutputDir([`--out=${target}`], root, 'after'),
        /unsafe/i,
        target,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function describeScript(script) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), script), '--describe'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `${script}: ${result.stderr || result.stdout}`)
  return JSON.parse(result.stdout)
}

test('the runnable deterministic manifest names every viewport, behavior, and build provenance', () => {
  const manifest = describeScript('scripts/qa-dy-p1.mjs')
  assert.deepEqual(manifest.viewports, [
    { width: 1366, height: 768 },
    { width: 1408, height: 445 },
    { width: 1600, height: 900 },
    { width: 599, height: 800 },
    { width: 600, height: 800 },
  ])
  const required = [
    'return-tier',
    'pointer-cancel',
    'alt-bypass',
    'top-to-bottom',
    'bottom-to-top',
    'legacy-baseline',
    'byte-stable-layouts',
    'legacy-layout-write-rejection',
    'legacy-screenshot-equality',
    'hidden-widget-recovery',
    'explicit-edge-clamp',
    'mixed-dock-reading-order',
  ]
  assert.deepEqual(required.filter((id) => !manifest.behaviors.includes(id)), [])
  assert.deepEqual(manifest.provenance, {
    build: 'git-head-preview-build',
    recordsCommit: true,
    rejectsDirtyTrackedSource: true,
    verifiesBuiltCommit: true,
  })
})

test('the deterministic runner rejects dirty tracked source and verifies its emitted build provenance', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/qa-dy-p1.mjs'), 'utf8')
  assert.match(source, /assertCleanTrackedStatus/)
  assert.match(source, /git['"], \['status', '--porcelain', '--untracked-files=no'\]/)
  assert.match(source, /assertBuildProvenance/)
  assert.match(source, /build-provenance\.json/)
})

test('screenshot comparison fails closed on a changed legacy capture', async () => {
  const contracts = await import('./qa-dy-p1-output.mjs')
  assert.equal(typeof contracts.assertLegacyScreenshotEquality, 'function')
  assert.doesNotThrow(() => contracts.assertLegacyScreenshotEquality(
    [{ viewport: { width: 1408, height: 445 }, screenshotSha256: 'same' }],
    [{ viewport: { width: 1408, height: 445 }, screenshotSha256: 'same' }],
  ))
  assert.throws(() => contracts.assertLegacyScreenshotEquality(
    [{ viewport: { width: 1408, height: 445 }, screenshotSha256: 'before' }],
    [{ viewport: { width: 1408, height: 445 }, screenshotSha256: 'after' }],
  ), /screenshot/i)
})

test('the runnable real-window manifest requires the caller-reviewed dist and real OS geometry', () => {
  const manifest = describeScript('scripts/qa-dy-p1-window.mjs')
  assert.equal(manifest.viewport, null)
  assert.equal(manifest.targetFamily, '1408x445')
  assert.deepEqual(manifest.provenance, {
    build: 'caller-provided-exact-dist',
    distArgumentRequired: true,
    mutatesBuild: false,
  })
  for (const id of ['fresh-profile-bootstrap', 'return-tier', 'pointer-cancel', 'top-to-bottom', 'byte-stable-layouts']) {
    assert.equal(manifest.behaviors.includes(id), true, id)
  }
})
