import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { createDeviceId, encodeBase64Url, redactIdentifier } from './qa-encrypted-sync-hosted.mjs'

const PROJECT_REF = 'ovlobmvxtryitupxwylg'
const ORIGIN = `https://${PROJECT_REF}.supabase.co`
const EXTENSION_ORIGIN = 'chrome-extension://akjalbmacojpmebkgohhcaaiacicpgkh'
const MIGRATION = '20260902000600'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function validDateKey(value) {
  const match = DATE_KEY.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
}

export function createMetricBucketEntity({ bucketId, installationId, date }) {
  if (!UUID.test(bucketId) || !UUID.test(installationId) || !validDateKey(date)) {
    throw new Error('metric_fixture_invalid')
  }
  return {
    schemaVersion: 1,
    entityType: 'metric_bucket',
    entityId: bucketId,
    value: {
      schemaVersion: 1,
      date,
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      installationId,
      sequence: 1,
      values: { kind: 'tasks', completed: 2, carriedForward: 1 },
    },
  }
}

export function assertSafeHostedMetricsEvidence(evidence) {
  const serialized = JSON.stringify(evidence)
  if (/(?:ciphertext|keyMaterial|access_token|refresh_token|password|service[_-]?role|anon[_-]?key|email)\s*[":=]/iu.test(serialized)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(serialized)
    || /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/u.test(serialized)) {
    throw new Error('hosted_metrics_evidence_unsafe')
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
  }
  return value
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function sqlLiteral(value) {
  assert.equal(typeof value, 'string')
  return `'${value.replaceAll("'", "''")}'`
}

function supabaseCli(...args) {
  const cli = resolve(repoRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error('hosted_metrics_cli_failed')
  return result.stdout
}

function dbQuery(sql) {
  const parsed = JSON.parse(supabaseCli('db', 'query', '--linked', '--output-format', 'json', sql))
  assert(Array.isArray(parsed.rows))
  return parsed.rows
}

function functionMetadata() {
  const parsed = JSON.parse(supabaseCli('functions', 'list', '--project-ref', PROJECT_REF, '--output', 'json'))
  return parsed
    .filter((entry) => ['sync-pull', 'sync-push'].includes(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      status: entry.status,
      version: entry.version,
      verifyJwt: entry.verify_jwt,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

async function importDataKey(keyMaterial) {
  const raw = Uint8Array.from(Buffer.from(keyMaterial, 'base64url'))
  assert.equal(raw.byteLength, 32)
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  } finally {
    raw.fill(0)
  }
}

async function encryptEntity(dataKey, accountId, entity, revision, tombstone = false) {
  const header = {
    envelopeVersion: 1,
    accountId,
    entityType: entity.entityType,
    entityId: entity.entityId,
    revision,
    tombstone,
  }
  const plaintext = tombstone ? null : entity
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv: nonce,
    additionalData: new TextEncoder().encode(canonicalJson(header)),
    tagLength: 128,
  }, dataKey, new TextEncoder().encode(canonicalJson(plaintext)))
  return {
    envelopeVersion: 1,
    entityType: entity.entityType,
    entityId: entity.entityId,
    revision,
    tombstone,
    nonce: encodeBase64Url(nonce),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  }
}

async function main() {
  if (process.argv[2] !== '--exact') throw new Error('Run with --exact only after the approved PM-P5 hosted gate.')
  const serviceRoleKey = requiredEnvironment('TAB_TWO_QA_SERVICE_KEY')
  const anonKey = requiredEnvironment('TAB_TWO_QA_ANON_KEY')
  assert.equal(requiredEnvironment('TAB_TWO_QA_SUPABASE_URL'), ORIGIN)

  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).stdout.trim()
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u)

  const admin = createClient(ORIGIN, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  const evidence = {
    result: 'FAIL',
    project: PROJECT_REF,
    sourceCommit,
    migration: MIGRATION,
    run: await redactIdentifier(runId),
    account: null,
    functions: [],
    interactions: {},
    usage: { functionInvocations: 0, responseEgressBytes: 0 },
    database: {},
    cleanup: { account: false, authUser: false, residualSyntheticRows: null },
    requests: [],
  }
  const artifactPath = resolve(repoRoot, 'artifacts', 'qa-metrics-sync-hosted', sourceCommit, 'evidence.json')
  let accountId = null
  let authUserId = null
  let email = null

  async function callFunction(slug, token, body) {
    const response = await fetch(`${ORIGIN}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        authorization: token ? `Bearer ${token}` : '',
        accept: 'application/json',
        'content-type': 'application/json',
        origin: EXTENSION_ORIGIN,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
    })
    const text = await response.text()
    evidence.usage.functionInvocations += 1
    evidence.usage.responseEgressBytes += Buffer.byteLength(text)
    evidence.requests.push({ slug, status: response.status, bytes: Buffer.byteLength(text) })
    let bodyValue = null
    try { bodyValue = JSON.parse(text) } catch { /* asserted by the caller */ }
    return { status: response.status, body: bodyValue }
  }

  async function push(token, deviceId, record, expectedRevision) {
    return callFunction('sync-push', token, {
      deviceId,
      mutations: [{
        idempotencyId: crypto.randomUUID(),
        envelopeVersion: record.envelopeVersion,
        entityType: record.entityType,
        entityId: record.entityId,
        expectedRevision,
        revision: record.revision,
        tombstone: record.tombstone,
        nonce: record.nonce,
        ciphertext: record.ciphertext,
      }],
    })
  }

  try {
    evidence.functions = functionMetadata()
    assert.equal(evidence.functions.length, 2)
    assert(evidence.functions.every((entry) => entry.status === 'ACTIVE' && entry.verifyJwt === true))

    const baseline = dbQuery(`select
      (select count(*)::int from supabase_migrations.schema_migrations where version = ${sqlLiteral(MIGRATION)}) as migration_count,
      (select count(*)::int from private.sync_records where entity_type = 'metric_bucket') as metric_records;`)[0]
    assert.equal(baseline.migration_count, 1)
    evidence.database.baselineMetricRecords = baseline.metric_records
    evidence.database.migrationPresent = true

    email = `pm-p5-${runId}@example.invalid`
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'], pm_p5_qa: true },
      user_metadata: { qa_alias: 'metrics-sync' },
    })
    if (created.error || !created.data.user) throw new Error('hosted_metrics_auth_create_failed')
    authUserId = created.data.user.id
    accountId = crypto.randomUUID()
    evidence.account = await redactIdentifier(accountId)

    dbQuery(`begin;
      insert into public.tab_two_accounts (id) values (${sqlLiteral(accountId)}::uuid);
      insert into public.tab_two_identities (
        account_id, auth_user_id, provider, provider_subject, email, display_name
      ) values (
        ${sqlLiteral(accountId)}::uuid, ${sqlLiteral(authUserId)}::uuid, 'google',
        ${sqlLiteral(`pm-p5-qa:${runId}`)}, ${sqlLiteral(email)}, 'PM-P5 Metrics QA'
      );
      insert into private.account_grants (
        account_id, source, capabilities, starts_at, expires_at
      ) values (
        ${sqlLiteral(accountId)}::uuid, 'stripe',
        array['encrypted_sync','metrics_history']::private.premium_capability[],
        now() - interval '1 minute', now() + interval '2 hours'
      );
      insert into private.entitlement_audit_events (
        account_id, event_type, actor, reason, details
      ) values (
        ${sqlLiteral(accountId)}::uuid, 'pm_p5_hosted_qa_grant', 'codex',
        'Approved PM-P5 hosted Metrics matrix', '{}'::jsonb
      );
      commit;
      select true as provisioned;`)

    const client = createClient(ORIGIN, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })
    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (generated.error || !generated.data.properties?.hashed_token) throw new Error('hosted_metrics_auth_link_failed')
    const signedIn = await client.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: 'magiclink',
    })
    if (signedIn.error || !signedIn.data.session?.access_token) throw new Error('hosted_metrics_auth_sign_in_failed')
    const token = signedIn.data.session.access_token
    const restoredProvider = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: { provider: 'google', providers: ['google'], pm_p5_qa: true },
    })
    if (restoredProvider.error) throw new Error('hosted_metrics_auth_provider_failed')

    const deviceId = createDeviceId()
    const bootstrap = await callFunction('sync-bootstrap', token, { deviceId, friendlyName: 'Metrics QA' })
    assert.equal(bootstrap.status, 200)
    assert.equal(typeof bootstrap.body?.keyMaterial, 'string')
    const dataKey = await importDataKey(bootstrap.body.keyMaterial)
    evidence.interactions.bootstrap = true

    const installationId = crypto.randomUUID()
    const bucketId = crypto.randomUUID()
    const entity = createMetricBucketEntity({ bucketId, installationId, date: '2026-09-03' })
    const firstRecord = await encryptEntity(dataKey, accountId, entity, 1)
    const firstPush = await push(token, deviceId, firstRecord, 0)
    assert.equal(firstPush.status, 200)
    assert.equal(firstPush.body?.outcomes?.[0]?.status, 'accepted')
    assert.equal(firstPush.body.outcomes[0].entityType, 'metric_bucket')
    assert.equal(firstPush.body.outcomes[0].entityId, bucketId)
    evidence.interactions.aggregatePush = true

    const malformed = { ...entity, entityId: 'tasks:today' }
    const malformedRecord = await encryptEntity(dataKey, accountId, malformed, 1)
    const malformedPush = await push(token, deviceId, malformedRecord, 0)
    assert.equal(malformedPush.status, 400)
    assert.deepEqual(malformedPush.body, { error: 'invalid_request' })
    evidence.interactions.malformedIdRejected = true

    const wrongDevice = await callFunction('sync-pull', token, {
      deviceId: createDeviceId(), afterVaultVersion: 0, cursor: 0, limit: 100, acknowledgeVaultVersion: null,
    })
    assert.equal(wrongDevice.status, 404)
    assert.deepEqual(wrongDevice.body, { error: 'device_not_found' })
    evidence.interactions.deviceIsolation = true

    const pulled = await callFunction('sync-pull', token, {
      deviceId, afterVaultVersion: 0, cursor: 0, limit: 100, acknowledgeVaultVersion: null,
    })
    assert.equal(pulled.status, 200)
    assert(Array.isArray(pulled.body?.records))
    const pulledMetric = pulled.body.records.find((record) => record.entityType === 'metric_bucket' && record.entityId === bucketId)
    assert(pulledMetric)
    assert.equal(pulledMetric.revision, 1)
    assert.equal(pulledMetric.tombstone, false)
    evidence.interactions.aggregatePullMetadata = true

    const tombstone = await encryptEntity(dataKey, accountId, entity, 2, true)
    const deleted = await push(token, deviceId, tombstone, 1)
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body?.outcomes?.[0]?.status, 'accepted')
    assert.equal(deleted.body.outcomes[0].revision, 2)
    evidence.interactions.tombstone = true

    const hostedState = dbQuery(`select
      count(*)::int as metric_records,
      count(*) filter (where tombstone)::int as tombstones,
      min(revision)::int as minimum_revision,
      max(revision)::int as maximum_revision
      from private.sync_records
      where account_id = ${sqlLiteral(accountId)}::uuid and entity_type = 'metric_bucket';`)[0]
    assert.deepEqual(hostedState, { metric_records: 1, tombstones: 1, minimum_revision: 2, maximum_revision: 2 })
    evidence.database.syntheticState = hostedState
    evidence.interactions.metadataOnlyInspection = true
    assert(evidence.usage.functionInvocations <= 8)
    assert(evidence.usage.responseEgressBytes < 1024 * 1024)
    evidence.result = 'PASS'
  } catch (error) {
    evidence.failure = error instanceof Error
      ? error.message
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, '[redacted-id]')
      : 'unknown'
    throw error
  } finally {
    if (accountId) {
      try {
        dbQuery(`begin;
          delete from private.sync_rate_limits where scope_key = ${sqlLiteral(accountId)};
          delete from public.tab_two_accounts where id = ${sqlLiteral(accountId)}::uuid;
          commit;
          select
            (select count(*)::int from private.sync_vaults where account_id = ${sqlLiteral(accountId)}::uuid) as vaults,
            (select count(*)::int from private.sync_devices where account_id = ${sqlLiteral(accountId)}::uuid) as devices,
            (select count(*)::int from private.sync_records where account_id = ${sqlLiteral(accountId)}::uuid) as records,
            (select count(*)::int from public.tab_two_accounts where id = ${sqlLiteral(accountId)}::uuid) as accounts;`)
        evidence.cleanup.account = true
      } catch {
        evidence.cleanup.databaseError = 'cleanup_failed'
      }
    }
    if (authUserId) {
      const deleted = await admin.auth.admin.deleteUser(authUserId)
      evidence.cleanup.authUser = !deleted.error || /not found/iu.test(deleted.error.message)
    }
    try {
      const residual = accountId
        ? dbQuery(`select
            (select count(*)::int from private.sync_vaults where account_id = ${sqlLiteral(accountId)}::uuid) as vaults,
            (select count(*)::int from private.sync_devices where account_id = ${sqlLiteral(accountId)}::uuid) as devices,
            (select count(*)::int from private.sync_records where account_id = ${sqlLiteral(accountId)}::uuid) as records,
            (select count(*)::int from public.tab_two_accounts where id = ${sqlLiteral(accountId)}::uuid) as accounts;`)[0]
        : { vaults: 0, devices: 0, records: 0, accounts: 0 }
      evidence.cleanup.residualSyntheticRows = residual
      const after = dbQuery(`select count(*)::int as metric_records
        from private.sync_records where entity_type = 'metric_bucket';`)[0]
      evidence.database.afterMetricRecords = after.metric_records
    } catch {
      evidence.cleanup.residualSyntheticRows = 'unavailable'
    }
    assertSafeHostedMetricsEvidence(evidence)
    mkdirSync(dirname(artifactPath), { recursive: true })
    writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }

  assert.equal(evidence.result, 'PASS')
  assert.equal(evidence.cleanup.account, true)
  assert.equal(evidence.cleanup.authUser, true)
  assert.deepEqual(evidence.cleanup.residualSyntheticRows, { vaults: 0, devices: 0, records: 0, accounts: 0 })
  assert.equal(evidence.database.afterMetricRecords, evidence.database.baselineMetricRecords)
  process.stdout.write(`PASS: hosted Metrics encrypted-sync matrix (${sourceCommit})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'hosted Metrics sync QA failed'}\n`)
    process.exitCode = 1
  })
}
