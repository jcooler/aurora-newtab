import assert from 'node:assert/strict'
import test from 'node:test'

import { validateExpansionCatalog } from './catalog-schema.mjs'

const KINDS = ['browser-native', 'built-in-provider', 'connector', 'local']
const STATUSES = ['approved-wave', 'researched', 'deferred', 'absorbed', 'blocked']
const WAVES = ['browser-native', 'work', 'at-a-glance', 'broader', 'backlog']
const AUTH_MODES = ['none', 'browser-permission', 'api-token', 'oauth-pkce', 'oauth-secret-required', 'local']
const RISKS = ['low', 'medium', 'high']
const TERMS_RISKS = ['low', 'medium', 'high', 'unknown']

function candidate(index) {
  const authMode = AUTH_MODES[index % AUTH_MODES.length]
  return {
    id: `candidate${index}`,
    label: `Candidate ${index}`,
    kind: KINDS[index % KINDS.length],
    status: STATUSES[index % STATUSES.length],
    wave: WAVES[index % WAVES.length],
    priority: (index % 5) + 1,
    userValue: 'Shows one useful answer at a glance.',
    glanceQuestion: 'What needs attention now?',
    source: {
      provider: 'Official provider',
      docsUrl: `https://example.invalid/docs/${index}`,
      transport: 'HTTPS JSON',
      termsRisk: TERMS_RISKS[index % TERMS_RISKS.length],
    },
    auth: {
      mode: authMode,
      directClientViable: authMode !== 'oauth-secret-required',
      secretHandling: authMode === 'none' || authMode === 'local' || authMode === 'browser-permission'
        ? 'No provider secret.'
        : 'Redact the inert credential from backup.',
    },
    access: {
      chromePermissions: index % 2 === 0 ? [] : ['optional permission'],
      origins: index % 3 === 0 ? [] : ['https://api.example.invalid/*'],
      userWarnings: index % 4 === 0 ? [] : ['Explain access before request.'],
    },
    privacy: {
      sends: index % 2 === 0 ? [] : ['Selected account identifier'],
      receives: ['Summary records'],
      stores: ['Validated snapshot'],
      backup: 'Configuration only.',
      redaction: 'Secrets are removed and re-entry is required.',
    },
    cache: {
      freshness: 'Refresh every 15 minutes.',
      staleBehavior: 'Keep the last validated snapshot with a stale label.',
      refresh: 'Refresh on visibility and explicit user action.',
      failure: 'Keep stale data and show a bounded error.',
    },
    settings: {
      setup: index % 4 === 0 ? [] : ['Choose the source.'],
      controls: index % 5 === 0 ? [] : ['Choose visible facts.'],
      validation: index % 6 === 0 ? [] : ['Reject blank identifiers.'],
    },
    presentation: {
      compact: 'Primary fact.',
      standard: 'Primary fact with context.',
      full: 'All selected useful facts.',
      docked: 'One dense line.',
      interaction: 'Open source context.',
      empty: 'Explain how to add data.',
      loading: 'Keep the content-tight loading label.',
      stale: 'Show the last update time.',
      error: 'Explain the failure and offer retry.',
    },
    maintenance: {
      risk: RISKS[index % RISKS.length],
      drivers: index % 3 === 0 ? [] : ['Provider contract changes.'],
    },
    decision: {
      rationale: 'Distinct glance value with bounded setup.',
      blockers: index % 4 === 0 ? [] : ['Wave-specific acceptance.'],
    },
  }
}

function validCatalog() {
  return {
    catalogVersion: 1,
    verifiedOn: '2026-08-22',
    candidates: Array.from({ length: 36 }, (_, index) => candidate(index + 1)),
  }
}

function errorsOf(value) {
  const result = validateExpansionCatalog(value)
  assert.equal(result.ok, false)
  return result.errors
}

test('accepts and deeply freezes a complete 36-candidate catalog', () => {
  const result = validateExpansionCatalog(validCatalog())

  assert.equal(result.ok, true)
  assert.equal(result.catalog.candidates.length, 36)
  assert.equal(Object.isFrozen(result.catalog), true)
  assert.equal(Object.isFrozen(result.catalog.candidates[0].presentation), true)
})

test('rejects a catalog too small to support the approved research scope', () => {
  assert.deepEqual(
    errorsOf({ catalogVersion: 1, verifiedOn: '2026-08-22', candidates: [] }),
    ['candidates: expected at least 36 candidates'],
  )
})

test('rejects duplicate candidate identities', () => {
  const catalog = validCatalog()
  catalog.candidates[1].id = catalog.candidates[0].id

  assert.equal(
    errorsOf(catalog).includes('candidates[1].id: duplicate "candidate1"'),
    true,
  )
})

test('rejects insecure source documentation URLs', () => {
  const catalog = validCatalog()
  catalog.candidates[3].source.docsUrl = 'http://example.invalid/docs'

  assert.equal(
    errorsOf(catalog).includes('candidates[3].source.docsUrl: expected an HTTPS URL'),
    true,
  )
})

test('rejects insecure or non-pattern runtime origins', () => {
  const catalog = validCatalog()
  catalog.candidates[3].access.origins = ['http://api.example.invalid/*', 'https://api.example.invalid/v1']

  const errors = errorsOf(catalog)
  assert.equal(errors.includes('candidates[3].access.origins[0]: expected an HTTPS Chrome origin pattern'), true)
  assert.equal(errors.includes('candidates[3].access.origins[1]: expected an HTTPS Chrome origin pattern'), true)
})

test('rejects blank presentation promises', () => {
  const catalog = validCatalog()
  catalog.candidates[4].presentation.compact = '   '

  assert.equal(
    errorsOf(catalog).includes('candidates[4].presentation.compact: expected nonblank text'),
    true,
  )
})

test('rejects a secret-required OAuth candidate claimed as direct-client viable', () => {
  const catalog = validCatalog()
  catalog.candidates[5].auth = {
    mode: 'oauth-secret-required',
    directClientViable: true,
    secretHandling: 'A backend would have to hold the client secret.',
  }

  assert.equal(
    errorsOf(catalog).includes('candidates[5].auth.directClientViable: oauth-secret-required cannot be direct-client viable'),
    true,
  )
})

test('reports independent field errors together in lexical order', () => {
  const catalog = validCatalog()
  catalog.verifiedOn = '08/22/2026'
  catalog.candidates[0].id = 'Not-kebab'
  catalog.candidates[0].priority = 7
  catalog.candidates[0].privacy.receives = ['']

  const errors = errorsOf(catalog)
  assert.deepEqual(errors, [...errors].sort())
  assert.equal(errors.includes('verifiedOn: expected an ISO calendar date'), true)
  assert.equal(errors.includes('candidates[0].id: expected lower camel case'), true)
  assert.equal(errors.includes('candidates[0].priority: expected an integer from 1 through 5'), true)
  assert.equal(errors.includes('candidates[0].privacy.receives[0]: expected nonblank text'), true)
})
