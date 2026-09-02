import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SYNC_LOCK_NAME,
  SYNC_ORIGIN,
  SYNC_QUOTA_BYTES,
  assertEncryptedSyncSourceContracts,
  loadEncryptedSyncSources,
} from './qa-encrypted-sync.mjs'

test('pins the reviewed encrypted sync authority and limits', () => {
  assert.equal(SYNC_LOCK_NAME, 'tab-two:encrypted-sync:v1')
  assert.equal(SYNC_ORIGIN, 'https://ovlobmvxtryitupxwylg.supabase.co')
  assert.equal(SYNC_QUOTA_BYTES, 2_097_152)
})

test('keeps encrypted sync behind the complete local source contract', () => {
  assert.doesNotThrow(() => assertEncryptedSyncSourceContracts(loadEncryptedSyncSources()))
})

test('rejects disabling production sync after the hosted PM-P4 gate', () => {
  const files = loadEncryptedSyncSources()
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    productionConfig: files.productionConfig.replace('encryptedSyncEnabled: true', 'encryptedSyncEnabled: false'),
  }))
})

test('rejects removal of a secret-bearing local category', () => {
  const files = loadEncryptedSyncSources()
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    entityPolicy: files.entityPolicy.replace("  'photoPrefs',\n", ''),
  }))
})

test('rejects a deterministic nonce or extractable account data key', () => {
  const files = loadEncryptedSyncSources()
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    crypto: files.crypto.replace('getRandomValues(new Uint8Array(NONCE_BYTES))', 'new Uint8Array(NONCE_BYTES)'),
  }))
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    crypto: files.crypto.replace(/    false,\r?\n    \['encrypt', 'decrypt'\],/u, "    true,\n    ['encrypt', 'decrypt'],"),
  }))
})

test('rejects oversized-mutation preflight removal', () => {
  const files = loadEncryptedSyncSources()
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    coordinator: files.coordinator.replace("throw new Error('sync_mutation_too_large')", 'return batches'),
  }))
})

test('rejects a public sync table or unprotected sync function', () => {
  const files = loadEncryptedSyncSources()
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    migration: files.migration.replace(
      'revoke all on table private.sync_records from public, anon, authenticated',
      'grant select on table private.sync_records to authenticated',
    ),
  }))
  assert.throws(() => assertEncryptedSyncSourceContracts({
    ...files,
    supabaseConfig: files.supabaseConfig.replace('[functions.sync-push]\nverify_jwt = true', '[functions.sync-push]\nverify_jwt = false'),
  }))
})
