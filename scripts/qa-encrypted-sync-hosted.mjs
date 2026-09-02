import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const PROJECT_REF = 'ovlobmvxtryitupxwylg'
const ORIGIN = `https://${PROJECT_REF}.supabase.co`
const EXTENSION_ORIGIN = 'chrome-extension://akjalbmacojpmebkgohhcaaiacicpgkh'
const MAX_VAULT_BYTES = 2_097_152
const MAX_QA_EGRESS_BYTES = 100 * 1024 * 1024
const MAX_QA_INVOCATIONS = 1_000
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

export function createDeviceId(cryptoImplementation = globalThis.crypto) {
  return encodeBase64Url(cryptoImplementation.getRandomValues(new Uint8Array(16)))
}

function base64UrlLength(bytes) {
  const padding = bytes % 3 === 0 ? 0 : 3 - bytes % 3
  return ((bytes + padding) / 3) * 4 - padding
}

export function findEncryptedRecordShape(targetStoredSize, {
  entityType,
  deviceId,
  entityIdPrefix,
}) {
  assert(Number.isSafeInteger(targetStoredSize) && targetStoredSize > 0)
  for (let entityIdLength = entityIdPrefix.length; entityIdLength <= 256; entityIdLength += 1) {
    const ciphertextLength = targetStoredSize
      - Buffer.byteLength(entityType)
      - entityIdLength
      - 16
      - deviceId.length
      - 41
    if (ciphertextLength < 22 || ciphertextLength > 261_700) continue
    const entityId = entityIdPrefix + 'x'.repeat(entityIdLength - entityIdPrefix.length)
    const emptyPlaintextBytes = Buffer.byteLength(canonicalJson({
      schemaVersion: 1, entityType, entityId, value: { payload: '' },
    }))
    const approximatePayload = Math.floor(ciphertextLength * 3 / 4) - 16 - emptyPlaintextBytes
    for (let payloadLength = Math.max(0, approximatePayload - 4); payloadLength <= approximatePayload + 4; payloadLength += 1) {
      const plaintextBytes = Buffer.byteLength(canonicalJson({
        schemaVersion: 1, entityType, entityId, value: { payload: 'x'.repeat(payloadLength) },
      }))
      const ciphertextBytes = plaintextBytes + 16
      if (base64UrlLength(ciphertextBytes) !== ciphertextLength) continue
      return {
        entityId,
        payloadLength,
        ciphertextBytes,
        ciphertextLength,
        storedSize: targetStoredSize,
      }
    }
  }
  throw new Error('hosted_quota_shape_unavailable')
}

export async function redactIdentifier(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Buffer.from(digest).toString('hex').slice(0, 12)}`
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

function decodeBase64Url(value) {
  return Uint8Array.from(Buffer.from(value, 'base64url'))
}

async function importDataKey(keyMaterial) {
  const raw = decodeBase64Url(keyMaterial)
  assert.equal(raw.byteLength, 32)
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  } finally {
    raw.fill(0)
  }
}

async function encryptRecord(dataKey, accountId, entityType, entityId, revision, value, tombstone = false) {
  const header = { envelopeVersion: 1, accountId, entityType, entityId, revision, tombstone }
  const entity = tombstone ? null : { schemaVersion: 1, entityType, entityId, value }
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv: nonce,
    additionalData: new TextEncoder().encode(canonicalJson(header)),
    tagLength: 128,
  }, dataKey, new TextEncoder().encode(canonicalJson(entity)))
  return {
    envelopeVersion: 1,
    accountId,
    entityType,
    entityId,
    revision,
    tombstone,
    nonce: encodeBase64Url(nonce),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  }
}

async function decryptRecord(dataKey, accountId, record) {
  const header = {
    envelopeVersion: 1,
    accountId,
    entityType: record.entityType,
    entityId: record.entityId,
    revision: record.revision,
    tombstone: record.tombstone,
  }
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: decodeBase64Url(record.nonce),
    additionalData: new TextEncoder().encode(canonicalJson(header)),
    tagLength: 128,
  }, dataKey, decodeBase64Url(record.ciphertext))
  return JSON.parse(new TextDecoder().decode(plaintext))
}

function sqlLiteral(value) {
  assert.equal(typeof value, 'string')
  return `'${value.replaceAll("'", "''")}'`
}

function dbQuery(sql) {
  const cli = resolve(repoRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
  const result = spawnSync(process.execPath, [
    cli, 'db', 'query', '--linked', '--output-format', 'json', sql,
  ], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  if (result.status !== 0) {
    const diagnostic = `${result.error?.message ?? ''} ${(result.stderr || result.stdout || '').trim()}`.trim()
    throw new Error(`hosted_db_query_failed:${diagnostic.slice(-500)}`)
  }
  const parsed = JSON.parse(result.stdout)
  assert(Array.isArray(parsed.rows))
  return parsed.rows
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

async function main() {
  if (process.argv[2] !== '--exact') throw new Error('Run with --exact only after the approved PM-P4 hosted gate.')
  const serviceRoleKey = requiredEnvironment('TAB_TWO_QA_SERVICE_KEY')
  const anonKey = requiredEnvironment('TAB_TWO_QA_ANON_KEY')
  const configuredOrigin = requiredEnvironment('TAB_TWO_QA_SUPABASE_URL')
  assert.equal(configuredOrigin, ORIGIN)

  const admin = createClient(ORIGIN, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  const accounts = []
  const requests = []
  const evidence = {
    result: 'FAIL',
    project: PROJECT_REF,
    sourceCommit: process.env.TAB_TWO_QA_SOURCE_COMMIT ?? 'unknown',
    run: await redactIdentifier(runId),
    accounts: [],
    interactions: {},
    limits: { maximumVaultBytes: MAX_VAULT_BYTES, maximumInvocations: MAX_QA_INVOCATIONS, maximumEgressBytes: MAX_QA_EGRESS_BYTES },
    usage: { functionInvocations: 0, responseEgressBytes: 0, peakTrackedVaultBytes: 0 },
    database: {},
    requests: [],
    cleanup: { accounts: false, authUsers: false, residualSyncRows: null },
  }
  const artifactPath = resolve(repoRoot, 'artifacts', 'qa-encrypted-sync-hosted', evidence.sourceCommit, 'evidence.json')

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
    requests.push({ slug, status: response.status, bytes: Buffer.byteLength(text) })
    let parsed = null
    try { parsed = JSON.parse(text) } catch { /* asserted by callers where needed */ }
    return { status: response.status, headers: response.headers, body: parsed }
  }

  async function provision(alias) {
    const email = `pm-p4-${runId}-${alias}@example.invalid`
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'], pm_p4_qa: true },
      user_metadata: { qa_alias: alias },
    })
    if (created.error || !created.data.user) throw new Error(`hosted_auth_create_failed:${alias}`)
    const authUserId = created.data.user.id
    const accountId = crypto.randomUUID()
    accounts.push({ alias, authUserId, accountId, email })
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    dbQuery(`
      begin;
      insert into public.tab_two_accounts (id) values (${sqlLiteral(accountId)}::uuid);
      insert into public.tab_two_identities (
        account_id, auth_user_id, provider, provider_subject, email, display_name
      ) values (
        ${sqlLiteral(accountId)}::uuid, ${sqlLiteral(authUserId)}::uuid, 'google',
        ${sqlLiteral(`pm-p4-qa:${runId}:${alias}`)}, ${sqlLiteral(email)}, ${sqlLiteral(`PM-P4 ${alias}`)}
      );
      insert into private.account_grants (
        account_id, source, capabilities, starts_at, expires_at
      ) values (
        ${sqlLiteral(accountId)}::uuid, 'stripe',
        array['encrypted_sync']::private.premium_capability[], now() - interval '1 minute',
        ${sqlLiteral(expiresAt)}::timestamptz
      );
      insert into private.entitlement_audit_events (
        account_id, event_type, actor, reason, details
      ) values (
        ${sqlLiteral(accountId)}::uuid, 'pm_p4_hosted_qa_grant', 'codex',
        'Approved PM-P4 hosted sandbox matrix', jsonb_build_object('alias', ${sqlLiteral(alias)})
      );
      commit;
      select true as provisioned;
    `)
    const client = createClient(ORIGIN, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })
    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (generated.error || !generated.data.properties?.hashed_token) {
      throw new Error(`hosted_auth_link_failed:${alias}:${generated.error?.message ?? 'missing_token'}`)
    }
    const signedIn = await client.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: 'magiclink',
    })
    if (signedIn.error || !signedIn.data.session?.access_token) {
      throw new Error(`hosted_auth_sign_in_failed:${alias}:${signedIn.error?.message ?? 'missing_session'}`)
    }
    const token = signedIn.data.session.access_token
    const restoredProvider = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: { provider: 'google', providers: ['google'], pm_p4_qa: true },
    })
    if (restoredProvider.error) throw new Error(`hosted_auth_provider_failed:${alias}`)
    const verifiedUser = await admin.auth.getUser(token)
    if (verifiedUser.error
      || verifiedUser.data.user?.app_metadata?.provider !== 'google'
      || !verifiedUser.data.user.app_metadata.providers?.includes?.('google')) {
      throw new Error(`hosted_auth_provider_failed:${alias}`)
    }
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    const authenticationTimes = Array.isArray(payload.amr)
      ? payload.amr
        .filter((entry) => entry?.method !== 'token_refresh' && Number.isSafeInteger(entry?.timestamp))
        .map((entry) => entry.timestamp)
      : []
    assert(authenticationTimes.some((timestamp) => Date.now() - timestamp * 1_000 <= 5 * 60_000),
      `fresh authentication claim missing for ${alias}`)
    evidence.accounts.push({ alias, account: await redactIdentifier(accountId), authUser: await redactIdentifier(authUserId) })
    return { alias, accountId, authUserId, token }
  }

  async function bootstrap(account, deviceId, friendlyName) {
    const response = await callFunction('sync-bootstrap', account.token, { deviceId, friendlyName })
    assert.equal(response.status, 200, `${account.alias} bootstrap ${friendlyName}`)
    assert.equal(response.body?.keyVersion, 1)
    assert.equal(response.body?.summary?.currentDeviceId, deviceId)
    assert.equal(typeof response.body?.keyMaterial, 'string')
    return { key: await importDataKey(response.body.keyMaterial), summary: response.body.summary }
  }

  async function push(account, deviceId, mutation) {
    const response = await callFunction('sync-push', account.token, {
      deviceId,
      mutations: [{
        idempotencyId: mutation.idempotencyId,
        envelopeVersion: mutation.record.envelopeVersion,
        entityType: mutation.record.entityType,
        entityId: mutation.record.entityId,
        expectedRevision: mutation.expectedRevision,
        revision: mutation.record.revision,
        tombstone: mutation.record.tombstone,
        nonce: mutation.record.nonce,
        ciphertext: mutation.record.ciphertext,
      }],
    })
    assert.equal(response.status, 200, `${account.alias} push`)
    assert.equal(response.body?.outcomes?.length, 1)
    return response.body.outcomes[0]
  }

  async function pull(account, deviceId, afterVaultVersion, cursor, limit, acknowledgeVaultVersion = null) {
    const response = await callFunction('sync-pull', account.token, {
      deviceId, afterVaultVersion, cursor, limit, acknowledgeVaultVersion,
    })
    assert.equal(response.status, 200, `${account.alias} pull`)
    assert(Array.isArray(response.body?.records))
    return response.body
  }

  async function pullAllAndAcknowledge(account, deviceId) {
    let cursor = 0
    let page
    do {
      page = await pull(account, deviceId, 0, cursor, 100, null)
      cursor = page.nextCursor ?? 0
    } while (page.nextCursor !== null)
    await pull(account, deviceId, page.vaultVersion, 0, 100, page.vaultVersion)
    return page.vaultVersion
  }

  try {
    const baseline = dbQuery(`select
      (select count(*)::int from private.sync_vaults) as vaults,
      (select count(*)::int from private.sync_devices) as devices,
      (select count(*)::int from private.sync_records) as records;`)[0]
    evidence.database.baseline = baseline
    assert.equal(baseline.vaults, 0, 'hosted sync vault baseline must be empty before the dedicated matrix')

    const matrix = await provision('sync-matrix')
    const vaultDelete = await provision('vault-delete')
    const accountDelete = await provision('account-delete')

    const unauthorized = await callFunction('sync-bootstrap', null, {
      deviceId: createDeviceId(), friendlyName: 'Unauthorized',
    })
    assert.equal(unauthorized.status, 401)
    evidence.interactions.jwtBoundary = true

    const matrixDevices = [
      ['Matrix Studio', createDeviceId()],
      ['Matrix Laptop', createDeviceId()],
      ['Matrix Office', createDeviceId()],
      ['Matrix Tablet', createDeviceId()],
      ['Matrix Phone', createDeviceId()],
    ]
    const first = await bootstrap(matrix, matrixDevices[0][1], matrixDevices[0][0])
    const matrixKeys = [first.key]
    for (const [name, id] of matrixDevices.slice(1)) matrixKeys.push((await bootstrap(matrix, id, name)).key)
    assert.equal(first.summary.devices.length, 1)

    const sixth = await callFunction('sync-bootstrap', matrix.token, {
      deviceId: createDeviceId(), friendlyName: 'Matrix Sixth',
    })
    assert.equal(sixth.status, 409)
    assert.deepEqual(sixth.body, { error: 'device_limit' })
    evidence.interactions.fiveDeviceConcurrency = true
    evidence.interactions.sixthDeviceRejected = true

    const sharedProbe = await encryptRecord(matrixKeys[0], matrix.accountId, 'settings', 'key-probe', 1, { shared: true })
    assert.deepEqual(await decryptRecord(matrixKeys[1], matrix.accountId, sharedProbe), {
      entityId: 'key-probe', entityType: 'settings', schemaVersion: 1, value: { shared: true },
    })
    evidence.interactions.sharedWrappedKey = true

    const renamed = await callFunction('sync-rename-device', matrix.token, {
      deviceId: matrixDevices[1][1], friendlyName: 'Matrix Laptop Renamed',
    })
    assert.equal(renamed.status, 200)
    assert(renamed.body.summary.devices.some((device) => device.friendlyName === 'Matrix Laptop Renamed'))
    const deactivated = await callFunction('sync-deactivate-device', matrix.token, { deviceId: matrixDevices[4][1] })
    assert.equal(deactivated.status, 200)
    assert(deactivated.body.summary.devices.some((device) => device.deviceId === matrixDevices[4][1] && device.state === 'inactive'))
    await bootstrap(matrix, matrixDevices[4][1], matrixDevices[4][0])
    const revoked = await callFunction('sync-revoke-device', matrix.token, {
      currentDeviceId: matrixDevices[0][1], targetDeviceId: matrixDevices[3][1],
    })
    assert.equal(revoked.status, 200)
    const revokedPull = await callFunction('sync-pull', matrix.token, {
      deviceId: matrixDevices[3][1], afterVaultVersion: 0, cursor: 0, limit: 100, acknowledgeVaultVersion: null,
    })
    assert.equal(revokedPull.status, 404)
    evidence.interactions.deviceLifecycle = true

    const settingsV1 = await encryptRecord(matrixKeys[0], matrix.accountId, 'settings', 'general', 1, { theme: 'dark' })
    const noteV1 = await encryptRecord(matrixKeys[1], matrix.accountId, 'notes', 'scratchpad', 1, { text: 'synthetic note' })
    const linkV1 = await encryptRecord(matrixKeys[2], matrix.accountId, 'quick_link', 'docs', 1, { label: 'Docs' })
    assert.equal((await push(matrix, matrixDevices[0][1], { idempotencyId: crypto.randomUUID(), expectedRevision: 0, record: settingsV1 })).status, 'accepted')
    assert.equal((await push(matrix, matrixDevices[1][1], { idempotencyId: crypto.randomUUID(), expectedRevision: 0, record: noteV1 })).status, 'accepted')
    const retryId = crypto.randomUUID()
    const firstRetry = await push(matrix, matrixDevices[2][1], { idempotencyId: retryId, expectedRevision: 0, record: linkV1 })
    const secondRetry = await push(matrix, matrixDevices[2][1], { idempotencyId: retryId, expectedRevision: 0, record: linkV1 })
    assert.deepEqual(secondRetry, firstRetry)
    evidence.interactions.independentRecords = true
    evidence.interactions.idempotentRetry = true

    const settingsA = await encryptRecord(matrixKeys[0], matrix.accountId, 'settings', 'general', 2, { theme: 'midnight' })
    const settingsB = await encryptRecord(matrixKeys[1], matrix.accountId, 'settings', 'general', 2, { theme: 'paper' })
    assert.equal((await push(matrix, matrixDevices[0][1], { idempotencyId: crypto.randomUUID(), expectedRevision: 1, record: settingsA })).status, 'accepted')
    const stale = await push(matrix, matrixDevices[1][1], { idempotencyId: crypto.randomUUID(), expectedRevision: 1, record: settingsB })
    assert.equal(stale.status, 'stale')
    assert.deepEqual((await decryptRecord(matrixKeys[1], matrix.accountId, stale.winner)).value, { theme: 'midnight' })
    evidence.interactions.sameRecordConflict = true

    const mismatchedRetry = await callFunction('sync-push', matrix.token, {
      deviceId: matrixDevices[2][1],
      mutations: [{
        idempotencyId: retryId,
        envelopeVersion: linkV1.envelopeVersion,
        entityType: linkV1.entityType,
        entityId: linkV1.entityId,
        expectedRevision: 0,
        revision: 1,
        tombstone: linkV1.tombstone,
        nonce: linkV1.nonce,
        ciphertext: encodeBase64Url(crypto.getRandomValues(new Uint8Array(32))),
      }],
    })
    assert.equal(mismatchedRetry.status, 503)
    evidence.interactions.idempotencyDigestMismatch = true

    const firstPage = await pull(matrix, matrixDevices[1][1], 0, 0, 1)
    assert.equal(firstPage.records.length, 1)
    assert.notEqual(firstPage.nextCursor, null)
    evidence.interactions.pullPagination = true

    const noteTombstone = await encryptRecord(matrixKeys[0], matrix.accountId, 'notes', 'scratchpad', 2, null, true)
    assert.equal((await push(matrix, matrixDevices[0][1], {
      idempotencyId: crypto.randomUUID(), expectedRevision: 1, record: noteTombstone,
    })).status, 'accepted')
    for (const index of [1, 2, 4]) await pullAllAndAcknowledge(matrix, matrixDevices[index][1])
    const compacted = dbQuery(`select public.tab_two_sync_compact_tombstones(
      ${sqlLiteral(matrix.accountId)}::uuid, now()
    )::int as compacted;`)[0].compacted
    assert.equal(compacted, 1)
    const resurrection = await encryptRecord(matrixKeys[1], matrix.accountId, 'notes', 'scratchpad', 2, { text: 'stale resurrection' })
    const resurrectionOutcome = await push(matrix, matrixDevices[1][1], {
      idempotencyId: crypto.randomUUID(), expectedRevision: 1, record: resurrection,
    })
    assert.equal(resurrectionOutcome.status, 'stale')
    assert.equal(resurrectionOutcome.revision, 0)
    assert.equal(resurrectionOutcome.winner, null)
    evidence.interactions.tombstoneCompaction = true
    evidence.interactions.tombstoneNonResurrection = true

    let summary = (await bootstrap(matrix, matrixDevices[0][1], matrixDevices[0][0])).summary
    let remaining = MAX_VAULT_BYTES - summary.encodedSize
    let quotaIndex = 0
    while (remaining > 0) {
      const target = Math.min(250_000, remaining)
      const shape = findEncryptedRecordShape(target, {
        entityType: 'notes', deviceId: matrixDevices[0][1], entityIdPrefix: `quota:${quotaIndex}:`,
      })
      const quotaRecord = await encryptRecord(
        matrixKeys[0], matrix.accountId, 'notes', shape.entityId, 1,
        { payload: 'x'.repeat(shape.payloadLength) },
      )
      assert.equal(quotaRecord.ciphertext.length, shape.ciphertextLength)
      const outcome = await push(matrix, matrixDevices[0][1], {
        idempotencyId: crypto.randomUUID(),
        expectedRevision: 0,
        record: quotaRecord,
      })
      assert.equal(outcome.status, 'accepted')
      remaining -= target
      quotaIndex += 1
    }
    summary = (await bootstrap(matrix, matrixDevices[0][1], matrixDevices[0][0])).summary
    assert.equal(summary.encodedSize, MAX_VAULT_BYTES)
    evidence.usage.peakTrackedVaultBytes = summary.encodedSize
    const overQuota = await encryptRecord(matrixKeys[0], matrix.accountId, 'notes', 'over-quota', 1, { text: 'one byte too many' })
    const quotaOutcome = await push(matrix, matrixDevices[0][1], {
      idempotencyId: crypto.randomUUID(), expectedRevision: 0, record: overQuota,
    })
    assert.equal(quotaOutcome.status, 'quota')
    assert.equal(quotaOutcome.encodedSize, MAX_VAULT_BYTES)
    assert.equal(quotaOutcome.limit, MAX_VAULT_BYTES)
    evidence.interactions.exactQuotaBoundary = true

    const vaultDevices = [
      ['Vault Source', createDeviceId()],
      ['Vault Peer', createDeviceId()],
    ]
    const vaultFirst = await bootstrap(vaultDelete, vaultDevices[0][1], vaultDevices[0][0])
    await bootstrap(vaultDelete, vaultDevices[1][1], vaultDevices[1][0])
    const retainedLocal = { text: 'local value remains available' }
    const vaultNote = await encryptRecord(vaultFirst.key, vaultDelete.accountId, 'notes', 'local-proof', 1, retainedLocal)
    assert.equal((await push(vaultDelete, vaultDevices[0][1], {
      idempotencyId: crypto.randomUUID(), expectedRevision: 0, record: vaultNote,
    })).status, 'accepted')
    const deletedVault = await callFunction('sync-delete-vault', vaultDelete.token, {
      accountId: vaultDelete.accountId, deviceId: vaultDevices[0][1], confirmation: 'DELETE',
    })
    assert.equal(deletedVault.status, 200)
    assert.deepEqual(retainedLocal, { text: 'local value remains available' })
    const vaultAfter = dbQuery(`select
      (select count(*)::int from private.sync_vaults where account_id = ${sqlLiteral(vaultDelete.accountId)}::uuid) as vaults,
      (select count(*)::int from public.tab_two_accounts where id = ${sqlLiteral(vaultDelete.accountId)}::uuid and deleted_at is null) as accounts,
      (select count(*)::int from private.account_grants where account_id = ${sqlLiteral(vaultDelete.accountId)}::uuid and revoked_at is null) as grants;`)[0]
    assert.deepEqual(vaultAfter, { vaults: 0, accounts: 1, grants: 1 })
    evidence.interactions.vaultDeletion = true

    const deletionDevice = createDeviceId()
    const deletionFirst = await bootstrap(accountDelete, deletionDevice, 'Deletion Device')
    const deletionRecord = await encryptRecord(deletionFirst.key, accountDelete.accountId, 'notes', 'delete-me', 1, { text: 'synthetic deletion data' })
    assert.equal((await push(accountDelete, deletionDevice, {
      idempotencyId: crypto.randomUUID(), expectedRevision: 0, record: deletionRecord,
    })).status, 'accepted')
    const testFingerprint = 'A'.repeat(43)
    for (let count = 0; count < 5; count += 1) dbQuery(`select public.tab_two_consume_sync_rate_limit(
      ${sqlLiteral(accountDelete.accountId)}::uuid, 'delete_account', ${sqlLiteral(testFingerprint)}, now()
    ) as allowed;`)
    const interruptedDeletion = await callFunction('account-delete', accountDelete.token, {
      accountId: accountDelete.accountId, confirmation: 'DELETE',
    })
    assert.equal(interruptedDeletion.status, 429)
    const pending = dbQuery(`select state from private.account_deletion_operations
      where account_id = ${sqlLiteral(accountDelete.accountId)}::uuid;`)[0]
    assert.equal(pending.state, 'pending_stripe')
    dbQuery(`delete from private.sync_rate_limits
      where scope_type = 'account' and scope_key = ${sqlLiteral(accountDelete.accountId)}
        and action = 'delete_account'; select true as cleared;`)
    const resumedDeletion = await callFunction('account-delete', accountDelete.token, {
      accountId: accountDelete.accountId, confirmation: 'DELETE',
    })
    assert.equal(resumedDeletion.status, 200)
    const deletedAccount = dbQuery(`select
      (select count(*)::int from public.tab_two_identities where account_id = ${sqlLiteral(accountDelete.accountId)}::uuid) as identities,
      (select count(*)::int from private.account_grants where account_id = ${sqlLiteral(accountDelete.accountId)}::uuid) as grants,
      (select count(*)::int from private.sync_vaults where account_id = ${sqlLiteral(accountDelete.accountId)}::uuid) as vaults,
      (select state from private.account_deletion_operations where account_id = ${sqlLiteral(accountDelete.accountId)}::uuid) as operation_state,
      (select deleted_at is not null from public.tab_two_accounts where id = ${sqlLiteral(accountDelete.accountId)}::uuid) as account_deleted;`)[0]
    assert.deepEqual(deletedAccount, {
      identities: 0, grants: 0, vaults: 0, operation_state: 'completed', account_deleted: true,
    })
    evidence.interactions.resumableAccountDeletion = true

    assert(evidence.usage.functionInvocations < MAX_QA_INVOCATIONS)
    assert(evidence.usage.responseEgressBytes < MAX_QA_EGRESS_BYTES)
    evidence.result = 'PASS'
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message.replace(/[A-Za-z0-9_-]{24,}/gu, '[redacted]') : 'unknown'
    throw error
  } finally {
    try {
      if (accounts.length > 0) {
        const accountIds = accounts.map((account) => `${sqlLiteral(account.accountId)}::uuid`).join(',')
        dbQuery(`
          delete from private.sync_rate_limits where scope_type = 'ip' and scope_key = ${sqlLiteral('A'.repeat(43))} and action = 'delete_account';
          delete from public.tab_two_accounts where id in (${accountIds});
          select
            (select count(*)::int from private.sync_vaults where account_id in (${accountIds})) as vaults,
            (select count(*)::int from private.sync_devices where account_id in (${accountIds})) as devices,
            (select count(*)::int from private.sync_records where account_id in (${accountIds})) as records,
            (select count(*)::int from public.tab_two_accounts where id in (${accountIds})) as accounts;
        `)
        evidence.cleanup.accounts = true
      }
    } catch (cleanupError) {
      evidence.cleanup.databaseError = cleanupError instanceof Error ? cleanupError.message : 'unknown'
    }
    let authCleanup = true
    for (const account of accounts) {
      const deleted = await admin.auth.admin.deleteUser(account.authUserId)
      if (deleted.error && !/not found/iu.test(deleted.error.message)) authCleanup = false
    }
    evidence.cleanup.authUsers = authCleanup
    try {
      evidence.cleanup.residualSyncRows = dbQuery(`select
        (select count(*)::int from private.sync_vaults) as vaults,
        (select count(*)::int from private.sync_devices) as devices,
        (select count(*)::int from private.sync_records) as records;`)[0]
    } catch {
      evidence.cleanup.residualSyncRows = 'unavailable'
    }
    evidence.requests = requests
    mkdirSync(dirname(artifactPath), { recursive: true })
    writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    serviceRoleKey.replaceAll(/./gu, '0')
  }

  assert.equal(evidence.result, 'PASS')
  assert.equal(evidence.cleanup.accounts, true)
  assert.equal(evidence.cleanup.authUsers, true)
  assert.deepEqual(evidence.cleanup.residualSyncRows, evidence.database.baseline)
  process.stdout.write(`PASS: hosted encrypted sync sandbox matrix (${evidence.sourceCommit})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'hosted encrypted sync QA failed'}\n`)
    process.exitCode = 1
  })
}
