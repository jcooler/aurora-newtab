import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareWeatherOutputDir, resolveWeatherOutputDir } from './qa-weather-enrichment.mjs'

const repoRoot = resolve('fixture-repo')

test('accepts only one explicit direct weather scratch output', () => {
  assert.equal(
    resolveWeatherOutputDir(['--out-dir=.qa-weather-enrichment-run'], repoRoot),
    resolve(repoRoot, '.qa-weather-enrichment-run'),
  )
  assert.throws(() => resolveWeatherOutputDir([], repoRoot), /required/)
  assert.throws(
    () => resolveWeatherOutputDir(['--out-dir=docs/superpowers/qa/weather'], repoRoot),
    /scratch output/,
  )
  assert.throws(
    () => resolveWeatherOutputDir(['--out-dir=../outside'], repoRoot),
    /scratch output/,
  )
  assert.throws(
    () => resolveWeatherOutputDir(['--out-dir=.qa-weather-enrichment-run/nested'], repoRoot),
    /scratch output/,
  )
})

test('rejects a scratch-named symbolic link or junction before writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'aurora-weather-qa-'))
  const accepted = join(root, 'accepted-evidence')
  const redirected = join(root, '.qa-weather-enrichment-redirected')
  mkdirSync(accepted)
  symlinkSync(accepted, redirected, 'junction')
  try {
    assert.throws(
      () => prepareWeatherOutputDir(['--out-dir=.qa-weather-enrichment-redirected'], root),
      /symbolic link or junction/,
    )
  } finally {
    rmSync(redirected, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('pins the built-extension Weather witness coverage', () => {
  const source = readFileSync(new URL('./qa-weather-enrichment.mjs', import.meta.url), 'utf8')
  for (const token of [
    "resolve('dist')",
    'api.open-meteo.com/v1/forecast',
    'air-quality-api.open-meteo.com/v1/air-quality',
    "state: 'available'",
    "state: 'pollen-unavailable'",
    "state: 'environment-failure'",
    "anchor: 'top-left'",
    "anchor: 'top-right'",
    "anchor: 'bottom-left'",
    "anchor: 'bottom-right'",
    'width: 1408, height: 445',
    'width: 1600, height: 900',
    'chrome.permissions.getAll()',
    'aurora:origin-permission-lifecycle:v1',
    "get('layouts')",
    "get('weatherCache')",
    'data-weather-environment',
    'Loading environmental data',
    'Pollen unavailable here',
    'Environmental data unavailable.',
    'CAMS ENSEMBLE via Open-Meteo',
    "getByRole('button', { name: 'Refresh' })",
    "getByRole('dialog', { name: 'Weather details' })",
    "getByRole('navigation', { name: 'Bottom bar' })",
    "storageWrites.includes('layout')",
    'requestLog',
    'failedRequests',
    'runtimeErrors',
    'document.documentElement.scrollWidth',
    'document.documentElement.clientWidth',
    'screenshot({ path:',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  assert.match(source, /WeatherWidget\.tsx[\s\S]*chrome\.permissions/)
  assert.match(source, /page\.reload/)
  assert.match(source, /environmentRequestIdentity/)
})
