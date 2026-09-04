import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8')

const files = Object.freeze({
  readme: read('README.md'),
  privacy: read('PRIVACY.md'),
  terms: read('TERMS.md'),
  threat: read('docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md'),
  ownerQa: read('docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md'),
})

test('customer-facing docs describe the complete paid MVP without a fitness connector', () => {
  assert.match(files.readme, /Settings is organized into seven tabs/)
  assert.match(files.readme, /Google Calendar.*Microsoft Calendar/s)
  assert.match(files.readme, /Help.*local diagnostic report/s)
  assert.match(files.readme, /2 MB account quota/)

  for (const [name, contents] of Object.entries(files).filter(([name]) => name !== 'threat')) {
    assert.doesNotMatch(contents, /\bStrava\b/i, `${name} still presents Strava as paid MVP scope`)
  }
})

test('privacy disclosure covers both premium calendar providers and private diagnostics', () => {
  assert.match(files.privacy, /premium Google Calendar and Microsoft Calendar connectors/i)
  assert.match(files.privacy, /https:\/\/graph\.microsoft\.com\/\*/)
  assert.match(files.privacy, /Calendars\.ReadBasic/)
  assert.match(files.privacy, /diagnostic report.*assembled locally.*never.*automatically/s)
  assert.match(files.privacy, /2,097,152 bytes per account/)
})

test('terms disclose provider boundaries, deletion consequences, and support level', () => {
  assert.match(files.terms, /Google Calendar and Microsoft Calendar/)
  assert.match(files.terms, /best-effort/i)
  assert.match(files.terms, /does\s+not erase local data/i)
})

test('threat model and final owner checklist match the implemented support boundary', () => {
  assert.match(files.threat, /Google and Microsoft APIs/)
  assert.match(files.threat, /historical wire values `strava` and `fitness` remain parseable/i)
  assert.match(files.threat, /downloaded only after an explicit user action/i)
  assert.match(files.ownerQa, /Help and diagnostics/i)
  assert.match(files.ownerQa, /never sends the report automatically/i)
  assert.match(files.ownerQa, /subscription status converges automatically/i)
})
