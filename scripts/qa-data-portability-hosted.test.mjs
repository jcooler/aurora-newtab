import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeEvidence, reserveExportRequest, assertActivationTarget } from './qa-data-portability-hosted.mjs'

test('the hosted gate accepts only the linked project, migration, and function', () => {
  const target = { project: 'ovlobmvxtryitupxwylg', migrations: ['20260904000900_account_data_export.sql'], functions: ['account-export'] }
  assert.doesNotThrow(() => assertActivationTarget(target))
  for (const changed of [
    { ...target, project: 'another-project' },
    { ...target, migrations: [...target.migrations, 'earlier.sql'] },
    { ...target, functions: ['sync-pull'] },
  ]) assert.throws(() => assertActivationTarget(changed))
})

test('all attempted export POSTs share a three-per-hour budget, including failures', () => {
  const attempts = []
  for (let i = 0; i < 3; i++) reserveExportRequest(attempts, 1_000 + i)
  assert.throws(() => reserveExportRequest(attempts, 4_000), /hourly_export_budget/)
  assert.equal(attempts.length, 3)
  reserveExportRequest(attempts, 3_601_003)
  assert.equal(attempts.length, 4)
})

test('evidence excludes credentials, payloads, emails, and raw synthetic identifiers', () => {
  assert.doesNotThrow(() => assertSafeEvidence({ result: 'PASS', status: 200, account: 'sha256:abcd', bytes: 300 }))
  for (const unsafe of [
    { access_token: 'hidden' }, { ciphertext: 'hidden' }, { dataKey: 'hidden' },
    { details: 'someone@example.invalid' },
    { account: '50a7ce15-b3c0-489b-a7e1-0b3af8bc09e1' },
    { error: 'sb_secret_do_not_print' },
  ]) assert.throws(() => assertSafeEvidence(unsafe), /unsafe_hosted_evidence/)
})
