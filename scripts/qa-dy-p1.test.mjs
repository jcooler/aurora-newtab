import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
