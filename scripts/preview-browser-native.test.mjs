import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('pins the deterministic built-extension browser-native witness', async () => {
  const source = await readFile(new URL('./preview-browser-native.mjs', import.meta.url), 'utf8')
  for (const token of [
    "resolve('dist')",
    '__auroraBrowserNativeHarnessApi',
    'page.addInitScript',
    "width: 1408, height: 445",
    "width: 1600, height: 900",
    "'compact', 'standard', 'full', 'docked'",
    "'permission-required', 'empty', 'error'",
    'data-browser-dock-detail',
    'data-editing',
    'updateEntry',
    'removeEntry',
    'restore',
    'pause',
    'resume',
    'cancel',
    'show',
    'windows.update',
    'tabGroups.update',
    'external request',
    'browser content leaked into storage',
    'storage changed after seed',
    'browserContentTokens',
    'EXPECTED_ACTION_CALLS',
    'unexpected native API call',
    'tier text duplicated',
    'data-browser-widget-scroll',
    'scrollHeight',
    'dock-state',
    'evidenceCommit',
    'apiCalls',
    'storageWrites',
    'runtimeErrors',
    'failedRequests',
    'usefulness',
    'screenshot({ path:',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('requires every identity across tiers, states, dock detail, edit, and actions', async () => {
  const source = await readFile(new URL('./preview-browser-native.mjs', import.meta.url), 'utf8')
  for (const id of ['readingList', 'recentlyClosed', 'downloads', 'tabGroups']) {
    assert.match(source, new RegExp(`id: '${id}'`))
  }
  for (const scenario of ['tiers', 'permission-required', 'empty', 'error', 'dock-detail', 'edit', 'actions']) {
    assert.match(source, new RegExp(`kind: '${scenario}'`))
  }
})
