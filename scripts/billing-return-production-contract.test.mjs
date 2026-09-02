import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const exactOrigin = 'https://tab-two-billing-return.pages.dev/*'
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

function buildManifest(mode) {
  const output = mkdtempSync(path.join(tmpdir(), `tab-two-${mode}-manifest-`))
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', mode, '--outDir', output, '--emptyOutDir'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, AURORA_BUILD_COMMIT: commit } },
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'))
  rmSync(output, { recursive: true, force: true })
  return manifest
}

test('production alone exposes the exact static return origin to a background bridge', () => {
  const production = buildManifest('production')
  assert.deepEqual(production.externally_connectable, { matches: [exactOrigin] })
  assert.equal(typeof production.background?.service_worker, 'string')
  assert.equal(production.background.service_worker.length > 0, true)
  assert.equal(production.background.type, 'module')
  assert.equal('content_scripts' in production, false)
  assert.deepEqual(production.host_permissions, ['https://ovlobmvxtryitupxwylg.supabase.co/*'])
  assert.deepEqual(production.permissions, ['storage', 'favicon', 'geolocation', 'search', 'identity'])
})

test('preview and account-local builds do not accept external web messages', () => {
  const preview = buildManifest('preview')
  const accountLocal = buildManifest('account-local')
  for (const manifest of [preview, accountLocal]) {
    assert.equal('externally_connectable' in manifest, false)
    assert.equal('background' in manifest, false)
    assert.equal('content_scripts' in manifest, false)
  }
  assert.deepEqual(accountLocal.host_permissions, ['http://127.0.0.1/*'])
  assert.deepEqual(accountLocal.permissions, ['storage', 'favicon', 'geolocation', 'search', 'identity'])
  assert.deepEqual(preview.permissions, ['storage', 'favicon', 'bookmarks', 'readingList', 'sessions', 'downloads', 'tabGroups', 'geolocation', 'search'])
})
