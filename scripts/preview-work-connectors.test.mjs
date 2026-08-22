import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import {
  assertAllowedStorageChange,
  assertBuildProvenance,
  assertOperationCounts,
  authorizeRequestFailure,
  inspectProviderRequest,
  isExpectedRequestFailure,
  requestFailureKey,
} from './work-connector-harness-contracts.mjs'

const TOKENS = { linear: 'linear-fake', sentry: 'sentry-fake', todoist: 'todoist-fake' }

function request(overrides = {}) {
  return {
    method: 'GET',
    url: 'https://api.todoist.com/api/v1/projects?limit=200',
    authorization: `Bearer ${TOKENS.todoist}`,
    contentType: null,
    body: null,
    ...overrides,
  }
}

test('accepts only the five exact provider request contracts', () => {
  assert.equal(inspectProviderRequest(request(), TOKENS).operation, 'todoist-projects')
  assert.equal(inspectProviderRequest(request({ url: 'https://api.todoist.com/api/v1/tasks?limit=200' }), TOKENS).operation, 'todoist-tasks')
  assert.equal(inspectProviderRequest(request({ method: 'POST', url: 'https://api.todoist.com/api/v1/tasks/task-1/close' }), TOKENS).operation, 'todoist-close')
  assert.equal(inspectProviderRequest(request({
    method: 'POST',
    url: 'https://api.linear.app/graphql',
    authorization: TOKENS.linear,
    contentType: 'application/json',
    body: JSON.stringify({ query: 'query AuroraLinearWork($filter: IssueFilter) { viewer { assignedIssues(first: 50, filter: $filter) { nodes { id } } } }', variables: { filter: null } }),
  }), TOKENS).operation, 'linear-work')
  assert.equal(inspectProviderRequest(request({
    url: 'https://us.sentry.io/api/0/organizations/acme-labs/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25',
    authorization: `Bearer ${TOKENS.sentry}`,
  }), TOKENS).operation, 'sentry-issues')
  assert.equal(inspectProviderRequest(request({
    url: 'https://us.sentry.io/api/0/organizations/acme-labs/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25&project=api',
    authorization: `Bearer ${TOKENS.sentry}`,
  }), TOKENS).operation, 'sentry-issues')
})

test('rejects broad-route false positives and malformed request bodies', () => {
  assert.throws(() => inspectProviderRequest(request({ url: 'https://api.todoist.com/anything' }), TOKENS), /Unexpected Todoist/)
  assert.throws(() => inspectProviderRequest(request({ url: 'https://api.todoist.com/api/v1/tasks?limit=20' }), TOKENS), /Unexpected Todoist/)
  assert.throws(() => inspectProviderRequest(request({ authorization: 'Bearer wrong' }), TOKENS), /authorization/)
  assert.throws(() => inspectProviderRequest(request({
    method: 'POST', url: 'https://api.linear.app/graphql', authorization: TOKENS.linear,
    contentType: 'application/json', body: JSON.stringify({ query: 'query Other { viewer { id } }' }),
  }), TOKENS), /operation/)
  assert.throws(() => inspectProviderRequest(request({
    url: 'https://us.sentry.io/api/0/organizations/other/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25',
    authorization: `Bearer ${TOKENS.sentry}`,
  }), TOKENS), /Unexpected Sentry/)
  assert.throws(() => inspectProviderRequest(request({
    url: 'https://us.sentry.io/api/0/organizations/acme-labs/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25&project=unknown',
    authorization: `Bearer ${TOKENS.sentry}`,
  }), TOKENS), /Unexpected Sentry/)
})

test('requires the scenario-selected Linear team filter exactly', () => {
  const base = {
    method: 'POST',
    url: 'https://api.linear.app/graphql',
    authorization: TOKENS.linear,
    contentType: 'application/json',
  }
  const query = 'query AuroraLinearWork($filter: IssueFilter) { viewer { assignedIssues(first: 50, filter: $filter) { nodes { id } } } }'
  assert.throws(() => inspectProviderRequest(request({
    ...base,
    body: JSON.stringify({ query, variables: { filter: null } }),
  }), TOKENS, { linearTeamIds: ['ops'] }), /Linear work filter/)
  assert.equal(inspectProviderRequest(request({
    ...base,
    body: JSON.stringify({ query, variables: { filter: { team: { id: { in: ['ops'] } } } } }),
  }), TOKENS, { linearTeamIds: ['ops'] }).operation, 'linear-work')
})

test('checks complete storage snapshots against an explicit allowed-key set', () => {
  const before = { settings: { widgets: {} }, connectors: {}, layouts: { version: 1 }, layout: { frozen: true } }
  const after = { ...before, connectors: { linear: { enabled: true } } }
  assert.deepEqual(assertAllowedStorageChange(before, after, ['connectors']), ['connectors'])
  assert.throws(
    () => assertAllowedStorageChange(before, { ...after, layout: { frozen: false } }, ['connectors']),
    /layout/,
  )
})

test('requires exact dist provenance and exact request-instance failure authorization', () => {
  assert.doesNotThrow(() => assertBuildProvenance(JSON.stringify({ commit: 'abc123' }), 'abc123'))
  assert.throws(() => assertBuildProvenance(JSON.stringify({ commit: 'stale' }), 'abc123'), /stale/)
  const expected = request({ url: 'https://api.todoist.com/api/v1/tasks?limit=200' })
  const unexpected = request({ url: 'https://api.todoist.com/api/v1/projects?limit=200' })
  const authorized = new Map()
  authorizeRequestFailure(authorized, expected)
  authorizeRequestFailure(authorized, expected)
  assert.equal(isExpectedRequestFailure(expected, 'net::ERR_ABORTED', authorized), true)
  assert.equal(isExpectedRequestFailure(expected, 'net::ERR_ABORTED', authorized), true)
  assert.equal(isExpectedRequestFailure(expected, 'net::ERR_ABORTED', authorized), false)
  assert.equal(isExpectedRequestFailure(unexpected, 'net::ERR_ABORTED', authorized), false)
  authorizeRequestFailure(authorized, expected)
  assert.equal(isExpectedRequestFailure(expected, 'net::ERR_CONNECTION_REFUSED', authorized), false)
  assert.equal(authorized.get(requestFailureKey(expected)), 1)
})

test('requires the exact provider operation totals', () => {
  const log = [
    { bodyKind: 'linear-identity' },
    { bodyKind: 'linear-work' },
    { bodyKind: 'linear-work' },
  ]
  assert.doesNotThrow(() => assertOperationCounts(log, { 'linear-identity': 1, 'linear-work': 2 }))
  assert.throws(() => assertOperationCounts(log, { 'linear-identity': 1, 'linear-work': 1 }), /linear-work/)
  assert.throws(() => assertOperationCounts([...log, { bodyKind: 'unexpected' }], { 'linear-identity': 1, 'linear-work': 2 }), /unexpected/)
})

test('the production build emits a commit provenance artifact', async () => {
  const source = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(source, /build-provenance\.json/)
  assert.match(source, /generateBundle/)
})

test('the normal Vite development server can load without build provenance', async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  )
  assert.ok(loaded?.config)
})

test('an attributable build refuses tracked worktree changes', () => {
  assert.doesNotThrow(() => assertCleanTrackedStatus(''))
  assert.throws(
    () => assertCleanTrackedStatus(' M src/newtab/App.tsx\n'),
    /clean tracked worktree/,
  )
})

test('declares every provider, tier, degraded state, settings path, and Todoist mutation scenario', async () => {
  const source = await readFile(new URL('./preview-work-connectors.mjs', import.meta.url), 'utf8')
  for (const id of ['linear', 'sentry', 'todoist']) assert.match(source, new RegExp(`id: '${id}'`))
  for (const scenario of ['tiers', 'degraded', 'dock-detail', 'settings', 'deep-link', 'todoist-completion']) {
    assert.match(source, new RegExp(`kind: '${scenario}'`))
  }
  assert.match(source, /width: 1408, height: 445/)
  assert.match(source, /width: 1600, height: 900/)
})
