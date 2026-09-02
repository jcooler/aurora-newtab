import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '..')

function source(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

export const SYNC_LOCK_NAME = 'tab-two:encrypted-sync:v1'
export const SYNC_ORIGIN = 'https://ovlobmvxtryitupxwylg.supabase.co'
export const SYNC_QUOTA_BYTES = 2_097_152

export function assertEncryptedSyncSourceContracts(files) {
  assert.match(files.entityPolicy, /export const SYNCED_AURORA_KEYS/u)
  assert.match(files.entityPolicy, /export const EXCLUDED_AURORA_KEYS/u)
  for (const excluded of [
    'timerSession', 'photoPrefs', 'weatherCache', 'connectorSnapshots',
    'refreshPreferences', 'attentionLedger', 'apodCache',
  ]) assert.match(files.entityPolicy, new RegExp(`'${excluded}'`, 'u'))
  assert.match(files.connectorProjection, /export function projectConnectorPreference/u)
  assert.match(files.connectorProjection, /function hasAuthority/u)
  assert.match(files.connectorProjection, /rss[\s\S]*feeds/u)
  assert.match(files.connectorProjection, /calendar[\s\S]*calendars/u)

  assert.match(files.crypto, /getRandomValues\(new Uint8Array\(NONCE_BYTES\)\)/u)
  assert.match(files.crypto, /additionalData: ownedBuffer\(aad\(header\)\)/u)
  assert.equal(files.crypto.match(/\sfalse,\r?\n\s+\['encrypt', 'decrypt'\]/gu)?.length, 2)
  assert.doesNotMatch(files.crypto, /exportKey/u)

  assert.match(files.coordinator, /const MAX_PUSH_BYTES = 256 \* 1_024/u)
  assert.match(files.coordinator, /encodedPushBytes/u)
  assert.match(files.coordinator, /throw new Error\('sync_mutation_too_large'\)/u)
  assert.match(files.coordinator, /const BACKOFF_MS = \[5_000, 30_000, 120_000, 300_000\]/u)
  assert.match(files.coordinator, /applyRemoteBatch/u)
  assert.match(files.coordinator, /pendingPushes/u)

  assert.ok(files.provider.includes(SYNC_LOCK_NAME))
  assert.match(files.provider, /bootstrapFailures/u)
  assert.match(files.provider, /bootstrapped\.kind === 'device_limit'/u)
  assert.match(files.provider, /enabled: false,[\s\S]*registration: 'unregistered'/u)
  assert.match(files.productionConfig, /encryptedSyncEnabled: false/u)
  assert.match(files.localConfig, /encryptedSyncEnabled: true/u)

  assert.match(files.gateway, new RegExp(SYNC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  assert.match(files.gateway, /const MAX_RESPONSE_BYTES = 256 \* 1_024/u)
  assert.match(files.gateway, /importDataKey\(rawKey/u)
  assert.match(files.gateway, /invalidateAuthentication/u)

  for (const table of ['sync_vaults', 'sync_account_keys', 'sync_devices', 'sync_records']) {
    assert.match(files.migration, new RegExp(`create table private\\.${table}`, 'u'))
  }
  assert.match(files.migration, /next_total > 2097152/u)
  assert.match(files.migration, /active_count >= 5/u)
  assert.match(files.migration, /security definer set search_path = ''/u)
  assert.match(files.migration, /revoke all on table private\.sync_records from public, anon, authenticated/u)
  assert.match(files.migration, /grant execute on function public\.tab_two_sync_apply_mutations[\s\S]*to service_role/u)

  for (const functionName of [
    'sync-bootstrap', 'sync-deactivate-device', 'sync-rename-device', 'sync-revoke-device',
    'sync-pull', 'sync-push', 'sync-delete-vault', 'account-delete',
  ]) assert.match(files.supabaseConfig, new RegExp(`\\[functions\\.${functionName}\\]\\s+verify_jwt = true`, 'u'))

  assert.match(files.privacy, /Encrypted sync is optional and starts only after you turn it on/u)
  assert.match(files.privacy, /2,097,152 bytes per account and five\s+active installations/u)
  assert.match(files.privacy, /90 days after encrypted-sync entitlement ends/u)
  assert.match(files.privacy, /not end-to-end encrypted or zero knowledge/u)
  assert.doesNotMatch(files.clientTree, /SYNC_KEK|SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY/u)
}

export function loadEncryptedSyncSources() {
  return {
    entityPolicy: source('src/sync/entityPolicy.ts'),
    connectorProjection: source('src/sync/connectorProjection.ts'),
    crypto: source('src/sync/crypto.ts'),
    coordinator: source('src/sync/coordinator.ts'),
    provider: source('src/sync/SyncProvider.tsx'),
    gateway: source('src/sync/gateway.ts'),
    productionConfig: source('src/account/productionAccountServiceConfig.ts'),
    localConfig: source('src/account/accountServiceConfig.ts'),
    migration: source('supabase/migrations/20260902000500_encrypted_sync_foundation.sql'),
    supabaseConfig: source('supabase/config.toml'),
    privacy: source('PRIVACY.md'),
    clientTree: [
      source('src/sync/crypto.ts'),
      source('src/sync/gateway.ts'),
      source('src/sync/SyncProvider.tsx'),
      source('src/settings/sections/AccountSync.tsx'),
    ].join('\n'),
  }
}

export function main() {
  assertEncryptedSyncSourceContracts(loadEncryptedSyncSources())
  process.stdout.write(`Encrypted sync local source contract PASS (${SYNC_QUOTA_BYTES} bytes, ${SYNC_LOCK_NAME})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
