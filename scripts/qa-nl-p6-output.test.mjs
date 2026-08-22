import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareQaOutputDir, resolveQaOutputDir } from './qa-nl-p6-output.mjs'

const repoRoot = resolve('fixture-repo')

test('accepts one direct repository scratch output', () => {
  assert.equal(
    resolveQaOutputDir(['--out-dir=.qa-nl-p6-baseline-out'], repoRoot),
    resolve(repoRoot, '.qa-nl-p6-baseline-out'),
  )
})

test('requires an explicit output flag', () => {
  assert.throws(
    () => resolveQaOutputDir([], repoRoot),
    /required/,
  )
})

test('rejects the accepted canonical evidence directory', () => {
  assert.throws(
    () => resolveQaOutputDir(['--out-dir=docs/superpowers/qa/nl-p6'], repoRoot),
    /scratch output/,
  )
})

test('rejects paths outside the repository', () => {
  assert.throws(
    () => resolveQaOutputDir(['--out-dir=../outside'], repoRoot),
    /scratch output/,
  )
})

test('rejects nested or empty scratch names', () => {
  assert.throws(
    () => resolveQaOutputDir(['--out-dir=.qa-nl-p6-run/nested'], repoRoot),
    /scratch output/,
  )
  assert.throws(
    () => resolveQaOutputDir(['--out-dir=.qa-nl-p6-'], repoRoot),
    /scratch output/,
  )
})

test('rejects a scratch-named symbolic link or junction before writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-qa-output-'))
  const accepted = join(root, 'accepted-evidence')
  const redirected = join(root, '.qa-nl-p6-redirected')
  mkdirSync(accepted)
  symlinkSync(accepted, redirected, 'junction')
  try {
    assert.throws(
      () => prepareQaOutputDir(['--out-dir=.qa-nl-p6-redirected'], root),
      /symbolic link or junction/,
    )
  } finally {
    rmSync(redirected, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})
