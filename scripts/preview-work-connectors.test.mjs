import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('pins the guarded built-extension Work connector witness', async () => {
  const source = await readFile(new URL('./preview-work-connectors.mjs', import.meta.url), 'utf8')
  for (const token of [
    "resolve('dist')",
    "width: 1408, height: 445",
    "width: 1600, height: 900",
    "'compact', 'standard', 'full', 'docked'",
    "'setup', 'loading', 'empty', 'hard-error', 'retained-error', 'stale'",
    'data-work-widget-scroll',
    'data-work-dock-detail',
    'scrollHeight',
    'expected-commit',
    'dirty tracked worktree',
    'unexpected external request',
    'live-looking credential',
    'legacy layout write',
    'storage mutation outside expected keys',
    'authorization',
    'api.linear.app/graphql',
    'organizations/acme-labs/issues',
    'api/v1/projects',
    'api/v1/tasks',
    'api/v1/tasks/task-1/close',
    'runtimeErrors',
    'failedRequests',
    'storageWrites',
    'requestLog',
    'usefulness',
    'page.screenshot({ path',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('declares every provider, tier, degraded state, settings path, and Todoist mutation scenario', async () => {
  const source = await readFile(new URL('./preview-work-connectors.mjs', import.meta.url), 'utf8')
  for (const id of ['linear', 'sentry', 'todoist']) {
    assert.match(source, new RegExp(`id: '${id}'`))
  }
  for (const scenario of ['tiers', 'degraded', 'dock-detail', 'settings', 'deep-link', 'todoist-completion']) {
    assert.match(source, new RegExp(`kind: '${scenario}'`))
  }
})

test('checks the manifest wildcard while policing legacy layout writes through the write log', async () => {
  const source = await readFile(new URL('./preview-work-connectors.mjs', import.meta.url), 'utf8')
  assert.ok(source.includes("optional_host_permissions?.includes('https://*/*')"))
  assert.ok(source.includes("stored.writes.some((keys) => keys.includes('layout'))"))
  assert.ok(source.includes("getByRole('button', { name: `Reconnect ${widget.title}` }).click()"))
})

test('waits for live resize state and isolates expected fault injection from real browser errors', async () => {
  const source = await readFile(new URL('./preview-work-connectors.mjs', import.meta.url), 'utf8')
  assert.ok(source.includes("import { CATALOG_BATCHES } from './widget-catalog-manifest.mjs'"))
  assert.ok(source.includes("Object.fromEntries(allWidgetIds.map((widgetId) => [widgetId, { kind: 'hidden' }]))"))
  assert.ok(source.includes('await page.waitForFunction(({ height }) =>'))
  assert.ok(source.includes('expectedFaultSignals'))
  assert.ok(source.includes('expectedFailedRequests.has(request)'))
  assert.ok(source.includes('markHarnessNavigation()'))
  assert.ok(source.includes('async function resetForSettings(widget)'))
  assert.ok(source.includes("widgets[id] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: 0 }"))
})
