import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildSync } from 'esbuild'

const ROOT = resolve(import.meta.dirname, '..')
const PROJECT = 'ovlobmvxtryitupxwylg'
const ORIGIN = `https://${PROJECT}.supabase.co`
const MIGRATION = '20260904000900_account_data_export.sql'
const EXTENSION_ORIGIN = 'chrome-extension://akjalbmacojpmebkgohhcaaiacicpgkh'
const HOUR = 3_600_000

export function assertActivationTarget(target) {
  assert.deepEqual(target, { project: PROJECT, migrations: [MIGRATION], functions: ['account-export'] })
}

export function reserveExportRequest(attempts, now) {
  assert(Number.isSafeInteger(now) && now >= 0)
  if (attempts.filter((at) => now - at < HOUR).length >= 3) throw new Error('hourly_export_budget')
  attempts.push(now)
}

export function assertSafeEvidence(value) {
  const text = JSON.stringify(value)
  if (/"(?:access_token|refresh_token|password|ciphertext|nonce|dataKey|keyMaterial|wrappedDataKey|payload)"\s*:/iu.test(text)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu.test(text)
    || /(?:sb_secret_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/u.test(text)) {
    throw new Error('unsafe_hosted_evidence')
  }
}

function cli(...args) {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/supabase/dist/supabase.js'), ...args], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 12 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error('hosted_cli_failed')
  return result.stdout
}
function sql(value) { return `'${String(value).replaceAll("'", "''")}'` }
function query(statement) {
  const result = JSON.parse(cli('db', 'query', '--linked', '--output-format', 'json', statement))
  assert(Array.isArray(result.rows))
  return result.rows
}
function functions() {
  return JSON.parse(cli('functions', 'list', '--project-ref', PROJECT, '--output', 'json'))
    .map((f) => ({ slug: f.slug, status: f.status, version: f.version, verifyJwt: f.verify_jwt, sha256: f.ezbr_sha256 }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}
async function hash(value) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex')
}
async function loadContracts() {
  const result = buildSync({
    stdin: { contents: `export { createAccountDataExportGateway } from './src/account/dataExportGateway';
      export { createAccountDataExportV1, serializeAccountDataExport } from './src/account/dataExport';
      export { importDataKey, encryptSyncRecord } from './src/sync/crypto';
      export { normalizeAccountExportServiceSnapshot } from './supabase/functions/_shared/accountExportRepository';`,
    resolveDir: ROOT, sourcefile: 'hosted-export-contracts.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}

async function main() {
  assert(process.argv.includes('--exact'), 'hosted activation requires --exact and prior owner approval')
  assert.equal(readFileSync(resolve(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim(), PROJECT)
  assert.match(readFileSync(resolve(ROOT, 'src/account/productionAccountServiceConfig.ts'), 'utf8'), /accountDataExportEnabled: false/)
  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim()
  const run = Date.now().toString(36)
  const output = resolve(ROOT, 'artifacts/qa-data-portability-hosted', sourceCommit, run)
  assert(!existsSync(output), 'hosted evidence must not overwrite an existing run')
  mkdirSync(output, { recursive: true })
  const journalPath = resolve(ROOT, 'artifacts/qa-data-portability-hosted/request-budget.json')
  const attempts = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')).attempts : []
  assert.equal(attempts.filter((at) => Date.now() - at < HOUR).length, 0, 'previous hosted attempts remain in this hour')
  const evidence = {
    result: 'FAIL', project: PROJECT, sourceCommit, startedAt: new Date().toISOString(),
    migration: MIGRATION, deployedFunctions: ['account-export'],
    configurationNames: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TAB_TWO_SYNC_KEK_V1'],
    limits: { exportPostsPerHour: 3, syntheticAccounts: 2, encryptedRecords: 2, providerConnections: 2, maximumResponseBytes: 4_194_304 },
    checks: {}, requests: [], cleanup: {}, rollback: {},
  }
  let phase = 'preflight'
  let deployed = false
  let proofPassed = false
  const accounts = []
  let admin
  const touchedIpRows = []
  const advance = (next) => { phase = next; process.stdout.write(`Task 7: ${next}\n`) }
  const save = () => {
    assertSafeEvidence(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }
  const rateRows = () => query("select * from private.sync_rate_limits where scope_type = 'ip' and action in ('bootstrap','export_account') order by action, scope_key")
  const trackIpChanges = (before) => {
    const after = rateRows()
    for (const row of after) {
      const old = before.find((r) => r.action === row.action && r.scope_key === row.scope_key)
      if (JSON.stringify(old) !== JSON.stringify(row)) touchedIpRows.push({ old, expected: row })
    }
  }
  const call = async (slug, token, body, label) => {
    assert(['account-export', 'sync-bootstrap'].includes(slug))
    if (slug === 'account-export') {
      reserveExportRequest(attempts, Date.now())
      writeFileSync(journalPath, `${JSON.stringify({ attempts })}\n`)
    }
    const before = rateRows()
    try {
      const response = await fetch(`${ORIGIN}/functions/v1/${slug}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: EXTENSION_ORIGIN },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000),
      })
      const text = await response.text()
      evidence.requests.push({ label, slug, status: response.status, bytes: Buffer.byteLength(text), at: new Date().toISOString() })
      save()
      return { response, text, body: JSON.parse(text) }
    } finally { trackIpChanges(before) }
  }
  try {
    const baseline = functions()
    assert(!baseline.some((f) => f.slug === 'account-export'), 'account-export already exists; do not overwrite it')
    evidence.beforeFunctions = baseline
    const pending = JSON.parse(cli('db', 'push', '--dry-run', '--linked'))
    assertActivationTarget({ project: PROJECT, migrations: pending.migrations, functions: ['account-export'] })
    const names = JSON.parse(cli('secrets', 'list', '--project-ref', PROJECT, '--output', 'json')).map((s) => s.name)
    assert(evidence.configurationNames.every((name) => names.includes(name)))
    evidence.checks.existingConfigurationPresent = true
    evidence.beforeMigrations = query('select version from supabase_migrations.schema_migrations order by version').map((r) => r.version)
    save()
    const contracts = await loadContracts()
    // The CLI response stays in memory; no credential values are logged or saved.
    const keys = JSON.parse(cli('projects', 'api-keys', '--project-ref', PROJECT, '--output', 'json'))
    const service = keys.find((key) => key.name === 'service_role')?.api_key
    const anon = keys.find((key) => key.name === 'anon')?.api_key
    assert(service && anon, 'existing API credentials unavailable')
    const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } }
    admin = createClient(ORIGIN, service, options)

    advance('apply-migration-00900')
    const applied = JSON.parse(cli('db', 'push', '--linked', '--yes'))
    assert.deepEqual(applied.migrations, [MIGRATION])
    evidence.afterMigrations = query('select version from supabase_migrations.schema_migrations order by version').map((r) => r.version)
    assert.deepEqual(evidence.afterMigrations, [...evidence.beforeMigrations, '20260904000900'])
    advance('deploy-account-export-only')
    cli('functions', 'deploy', 'account-export', '--project-ref', PROJECT, '--use-api')
    deployed = true
    const installed = functions()
    assert.deepEqual(installed.filter((f) => f.slug !== 'account-export'), baseline)
    const initialExport = installed.find((f) => f.slug === 'account-export')
    assert.equal(initialExport?.status, 'ACTIVE')
    assert.equal(initialExport?.verifyJwt, true)
    evidence.initialExport = initialExport
    save()

    advance('create-two-synthetic-accounts')
    for (const label of ['a', 'b']) {
      const account = { id: crypto.randomUUID(), authId: null, email: `export-${run}-${label}@example.invalid` }
      accounts.push(account)
      const created = await admin.auth.admin.createUser({ email: account.email, email_confirm: true,
        app_metadata: { provider: 'google', providers: ['google'], task7_qa: true } })
      assert(!created.error && created.data.user, 'synthetic_auth_create_failed')
      account.authId = created.data.user.id
      query(`begin;
        insert into public.tab_two_accounts(id) values (${sql(account.id)}::uuid);
        insert into public.tab_two_identities(account_id,auth_user_id,provider,provider_subject,email,display_name)
        values (${sql(account.id)}::uuid,${sql(account.authId)}::uuid,'google',${sql(`export-${run}-${label}`)},${sql(account.email)},'Synthetic export QA');
        commit; select true as created;`)
    }
    const [a, b] = accounts
    const snapshot = async (account) => {
      const result = await admin.rpc('tab_two_account_data_export', { target_account_id: account.id, effective_at: new Date().toISOString() })
      assert(!result.error && result.data, 'hosted_snapshot_failed')
      return contracts.normalizeAccountExportServiceSnapshot(result.data, 'database')
    }
    const empty = await snapshot(b)
    assert.equal(empty.vault.status, 'not_created')
    assert.deepEqual(empty.devices, [])
    assert.deepEqual(empty.entitlement.capabilities, [])
    evidence.checks.hostedNoVaultNoDeviceNoEntitlementSnapshot = true
    const publicClient = createClient(ORIGIN, anon, options)
    const denied = await publicClient.rpc('tab_two_account_data_export', { target_account_id: a.id, effective_at: new Date().toISOString() })
    assert(denied.error)
    const grants = query(`select
      has_function_privilege('anon','public.tab_two_account_data_export(uuid,timestamptz)','execute') as anon_allowed,
      has_function_privilege('authenticated','public.tab_two_account_data_export(uuid,timestamptz)','execute') as authenticated_allowed,
      has_function_privilege('service_role','public.tab_two_account_data_export(uuid,timestamptz)','execute') as service_allowed;`)[0]
    assert.deepEqual(grants, { anon_allowed: false, authenticated_allowed: false, service_allowed: true })
    evidence.checks.hostedServiceOnlySnapshot = true

    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: a.email })
    assert(!generated.error && generated.data.properties?.hashed_token)
    const signedIn = await publicClient.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' })
    assert(!signedIn.error && signedIn.data.session?.access_token)
    const token = signedIn.data.session.access_token
    const authClaims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const authAt = Math.max(...authClaims.amr.map((claim) => claim.timestamp * 1000))
    assert(Number.isSafeInteger(authAt))
    const restored = await admin.auth.admin.updateUserById(a.authId, { app_metadata: { provider: 'google', providers: ['google'], task7_qa: true } })
    assert(!restored.error)
    const device = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
    // Existing sync-bootstrap creates only this synthetic account's encrypted key.
    // It is not redeployed, and the temporary grant is removed before export.
    query(`insert into private.account_grants(account_id,source,capabilities,starts_at,expires_at)
      values (${sql(a.id)}::uuid,'stripe',array['encrypted_sync']::private.premium_capability[],now()-interval '1 minute',now()+interval '15 minutes'); select true as granted;`)
    advance('prepare-bounded-encrypted-fixtures')
    const boot = await call('sync-bootstrap', token, { deviceId: device, friendlyName: 'Synthetic export QA' }, 'synthetic-key-setup')
    assert.equal(boot.response.status, 200)
    const raw = Uint8Array.from(Buffer.from(boot.body.keyMaterial, 'base64url'))
    const key = await contracts.importDataKey(raw)
    raw.fill(0)
    boot.body.keyMaterial = null
    const entity = { schemaVersion: 1, entityType: 'timer_config', entityId: 'singleton', value: { workMinutes: 25, breakMinutes: 5 } }
    const encrypted = await contracts.encryptSyncRecord(key, { envelopeVersion: 1, accountId: a.id, entityType: entity.entityType, entityId: entity.entityId, revision: 1, tombstone: false }, entity)
    const tombstone = await contracts.encryptSyncRecord(key, { envelopeVersion: 1, accountId: a.id, entityType: 'notes', entityId: 'singleton', revision: 1, tombstone: true }, null)
    for (const [i, record] of [encrypted, tombstone].entries()) {
      query(`insert into private.sync_records(account_id,entity_type,entity_id,revision,vault_version,tombstone,nonce,ciphertext,creating_device_id,accepted_at)
        values (${sql(a.id)}::uuid,${sql(record.entityType)},${sql(record.entityId)},1,${i + 1},${record.tombstone},${sql(record.nonce)},${sql(record.ciphertext)},${sql(device)},now()); select true as inserted;`)
    }
    query(`begin;
      update private.sync_vaults set vault_version=2,encoded_size=(select sum(stored_size) from private.sync_records where account_id=${sql(a.id)}::uuid) where account_id=${sql(a.id)}::uuid;
      update private.sync_devices set state='revoked',revoked_at=now() where account_id=${sql(a.id)}::uuid;
      delete from private.account_grants where account_id=${sql(a.id)}::uuid;
      commit; select true as prepared;`)
    for (const provider of ['google_calendar', 'microsoft_calendar']) {
      const google = provider === 'google_calendar'
      const scopes = google ? ['openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly']
        : ['openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic']
      query(`insert into private.provider_connections(id,account_id,provider,provider_subject,email,display_name,granted_scopes,token_key_version,refresh_token_nonce,refresh_token_ciphertext,refresh_token_fingerprint,account_kind)
        values (${sql(crypto.randomUUID())}::uuid,${sql(a.id)}::uuid,${sql(provider)},${sql(google ? `synthetic-${run}` : `${crypto.randomUUID()}:${crypto.randomUUID()}`)},${sql(a.email)},'Synthetic provider metadata',array[${scopes.map(sql)}]::text[],1,${sql('A'.repeat(16))},${sql('B'.repeat(32))},${sql('C'.repeat(43))},${google ? 'null' : "'personal'"}); select true as inserted;`)
    }
    const gateway = (payload, headers = {}) => contracts.createAccountDataExportGateway({
      origin: ORIGIN, allowedOrigins: [ORIGIN], enabled: true,
      getAccessToken: async () => token, invalidateAuthentication: async () => {},
      fetch: async () => new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
      }),
    }).prepare({ accountId: a.id })
    advance('live-export-without-entitlement-or-active-device')
    const exported = await call('account-export', token, { accountId: a.id }, 'populated-export')
    assert.equal(exported.response.status, 200)
    assert.match(exported.response.headers.get('cache-control'), /no-store/)
    assert.equal(exported.response.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN)
    assert.equal(exported.body.connectedAccounts.length, 2)
    assert.deepEqual(exported.body.entitlement.capabilities, [])
    assert(exported.body.devices.every((entry) => entry.state === 'revoked'))
    const readable = await gateway(exported.body)
    assert.equal(readable.ok, true)
    const customerFile = contracts.serializeAccountDataExport(contracts.createAccountDataExportV1(readable.value, Date.now()))
    assert(!/"(?:dataKey|keyMaterial|ciphertext|nonce|wrappedDataKey|refresh_token|access_token|provider_subject|customer_id)"\s*:/u.test(customerFile))
    assert(!customerFile.includes('B'.repeat(32)))
    assert(readable.value.syncedData.records.some((r) => r.deleted))
    assert.deepEqual(readable.value.syncedData.records.find((r) => !r.deleted).value, entity.value)
    evidence.checks.livePopulatedExport = true
    evidence.checks.liveNoEntitlementOrActiveDeviceRequired = true
    evidence.checks.clientReadableRoundTripAndTombstone = true
    evidence.checks.customerFileSecretExclusion = true
    evidence.customerFileBytes = Buffer.byteLength(customerFile)

    advance('live-cross-account-rejection')
    const cross = await call('account-export', token, { accountId: b.id }, 'cross-account')
    assert.equal(cross.response.status, 403)
    assert.deepEqual(cross.body, { error: 'account_not_found' })
    evidence.checks.liveCrossAccountDenied = true

    advance('hosted-database-and-client-boundaries')
    for (const [label, change] of [
      ['missingKey', (p) => { p.dataKey = null }],
      ['wrongKey', (p) => { p.dataKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') }],
      ['tamperedRecord', (p) => { p.vault.records[0].ciphertext = 'A'.repeat(24) }],
      ['foreignRecord', (p) => { p.vault.records[0].accountId = b.id }],
      ['unexpectedSecretField', (p) => { p.refresh_token = 'synthetic-prohibited-field' }],
    ]) {
      const poisoned = structuredClone(exported.body)
      change(poisoned)
      assert.deepEqual(await gateway(poisoned), { ok: false, kind: 'data_unavailable' })
      evidence.checks[`clientRejects_${label}`] = true
    }
    assert.deepEqual(await gateway(exported.body, { 'content-length': '4194305' }), { ok: false, kind: 'data_unavailable' })
    assert.deepEqual(await gateway(' '.repeat(4_194_305)), { ok: false, kind: 'data_unavailable' })
    evidence.checks.clientResponseSizeBounded = true
    const emptyPayload = { version: 1, ...empty, account: { ...empty.account, accountId: a.id }, dataKey: null }
    delete emptyPayload.vault.wrappedDataKey
    assert.equal((await gateway(emptyPayload)).ok, true)
    evidence.checks.hostedNoVaultSnapshotClientAccepted = true
    const snapshotA = await snapshot(a)
    assert.equal(snapshotA.vault.records.length, 2)
    evidence.checks.hostedSnapshotBoundToSyntheticAccount = true
    query(`begin;
      do $proof$ declare allowed boolean; i integer; begin
        for i in 1..3 loop
          allowed := private.consume_sync_rate_limit(${sql(b.id)}::uuid,'export_account',${sql('T'.repeat(43))},now());
          if not allowed then raise exception 'rate_allowed_requests_failed'; end if;
        end loop;
        if private.consume_sync_rate_limit(${sql(b.id)}::uuid,'export_account',${sql('U'.repeat(43))},now()) then raise exception 'account_limit_failed'; end if;
        if private.consume_sync_rate_limit(${sql(a.id)}::uuid,'export_account',${sql('T'.repeat(43))},now()) then raise exception 'ip_limit_failed'; end if;
      end $proof$;
      rollback; select true as rate_proof_rolled_back;`)
    evidence.checks.hostedAccountAndIpRatePolicyRollback = true
    evidence.checks.liveResponseBelowFourMiB = Buffer.byteLength(exported.text) <= 4_194_304
    assert(evidence.checks.liveResponseBelowFourMiB)

    advance('wait-for-real-authentication-to-become-stale')
    while (Date.now() < authAt + 301_000) await new Promise((done) => setTimeout(done, Math.min(30_000, authAt + 301_000 - Date.now())))
    const stale = await call('account-export', token, { accountId: a.id }, 'stale-authentication')
    assert.equal(stale.response.status, 401)
    assert.deepEqual(stale.body, { error: 'fresh_authentication_required' })
    evidence.checks.liveStaleAuthenticationDenied = true
    proofPassed = true

    advance('exercise-endpoint-and-client-rollback')
    cli('functions', 'delete', 'account-export', '--project-ref', PROJECT, '--yes')
    deployed = false
    assert.deepEqual(functions(), baseline)
    const absent = await fetch(`${ORIGIN}/functions/v1/account-export`, { method: 'GET', signal: AbortSignal.timeout(30_000) })
    assert.equal(absent.status, 404)
    evidence.rollback.undeployedHttpStatus = absent.status
    let calls = 0
    const disabled = contracts.createAccountDataExportGateway({ origin: ORIGIN, allowedOrigins: [ORIGIN], enabled: false,
      getAccessToken: async () => { calls++; return token }, invalidateAuthentication: async () => {},
      fetch: async () => { calls++; throw new Error('disabled_export_must_not_request') },
    })
    assert.deepEqual(await disabled.prepare({ accountId: a.id }), { ok: false, kind: 'data_unavailable' })
    assert.equal(calls, 0)
    evidence.rollback.clientDisabledRequests = calls
    evidence.rollback.database = 'migration-retained-forward-only'
    assert.equal(query("select count(*)::int as present from supabase_migrations.schema_migrations where version='20260904000900'")[0].present, 1)
    cli('functions', 'deploy', 'account-export', '--project-ref', PROJECT, '--use-api')
    deployed = true
    const restoredFunctions = functions()
    assert.deepEqual(restoredFunctions.filter((f) => f.slug !== 'account-export'), baseline)
    const restoredExport = restoredFunctions.find((f) => f.slug === 'account-export')
    assert.equal(restoredExport?.status, 'ACTIVE')
    assert.equal(restoredExport?.verifyJwt, true)
    assert.equal(restoredExport?.sha256, initialExport.sha256)
    evidence.restoredExport = restoredExport
    evidence.rollback.restoredSameBundle = true
    evidence.rollback.otherFunctionsUnchanged = true
    evidence.result = 'HOSTED_PASS_CLEANUP_PENDING'
  } catch (error) {
    evidence.failure = { phase, kind: error?.name ?? 'Error' }
    if (deployed) {
      try { cli('functions', 'delete', 'account-export', '--project-ref', PROJECT, '--yes'); deployed = false; evidence.rollback.failedProofEndpointRemoved = true }
      catch { evidence.rollback.failedProofEndpointRemoved = false }
    }
  } finally {
    advance('remove-all-synthetic-fixtures')
    try {
      for (const account of accounts) {
        query(`begin;
          delete from private.sync_records where account_id=${sql(account.id)}::uuid;
          delete from private.sync_rate_limits where scope_type='account' and scope_key=${sql(account.id)};
          delete from public.tab_two_accounts where id=${sql(account.id)}::uuid;
          commit; select true as removed;`)
        if (account.authId) {
          const deleted = await admin.auth.admin.deleteUser(account.authId)
          assert(!deleted.error, 'synthetic_auth_cleanup_failed')
        }
      }
      // Compare-and-restore only IP rows changed by this run; never clear a table.
      for (const { old, expected } of touchedIpRows.reverse()) {
        const current = rateRows().find((r) => r.action === expected.action && r.scope_key === expected.scope_key)
        assert.deepEqual(current, expected, 'concurrent_rate_row_change')
        const where = `scope_type='ip' and scope_key=${sql(expected.scope_key)} and action=${sql(expected.action)}`
        if (old) query(`update private.sync_rate_limits set window_started_at=${sql(old.window_started_at)},request_count=${old.request_count},expires_at=${sql(old.expires_at)} where ${where}; select true as restored;`)
        else query(`delete from private.sync_rate_limits where ${where}; select true as removed;`)
      }
      const ids = accounts.map((a) => `${sql(a.id)}::uuid`).join(',') || 'null'
      const authIds = accounts.filter((a) => a.authId).map((a) => `${sql(a.authId)}::uuid`).join(',') || 'null'
      const counts = query(`select
        (select count(*)::int from auth.users where id in (${authIds})) as auth_users,
        (select count(*)::int from public.tab_two_accounts where id in (${ids})) as accounts,
        (select count(*)::int from public.tab_two_identities where account_id in (${ids})) as identities,
        (select count(*)::int from private.account_grants where account_id in (${ids})) as grants,
        (select count(*)::int from private.provider_connections where account_id in (${ids})) as providers,
        (select count(*)::int from private.sync_vaults where account_id in (${ids})) as vaults,
        (select count(*)::int from private.sync_account_keys where account_id in (${ids})) as account_keys,
        (select count(*)::int from private.sync_devices where account_id in (${ids})) as devices,
        (select count(*)::int from private.sync_records where account_id in (${ids})) as records,
        (select count(*)::int from private.sync_audit_events where account_id in (${ids})) as audits,
        (select count(*)::int from private.sync_rate_limits where scope_type='account' and scope_key in (${accounts.map((a) => sql(a.id)).join(',') || 'null'})) as account_rates;`)[0]
      assert(Object.values(counts).every((n) => n === 0))
      evidence.cleanup.residualSyntheticRows = counts
      evidence.cleanup.ipRateRowsRestored = true
      evidence.cleanup.complete = true
    } catch {
      evidence.cleanup.complete = false
      evidence.result = 'FAIL'
      if (deployed) {
        try { cli('functions', 'delete', 'account-export', '--project-ref', PROJECT, '--yes'); deployed = false; evidence.rollback.cleanupFailureEndpointRemoved = true }
        catch { evidence.rollback.cleanupFailureEndpointRemoved = false }
      }
    }
    if (proofPassed && evidence.result === 'HOSTED_PASS_CLEANUP_PENDING' && evidence.cleanup.complete) evidence.result = 'PASS'
    evidence.exportPosts = evidence.requests.filter((request) => request.slug === 'account-export').length
    evidence.finishedAt = new Date().toISOString()
    evidence.migrationSha256 = await hash(readFileSync(resolve(ROOT, 'supabase/migrations', MIGRATION), 'utf8'))
    save()
  }
  process.stdout.write(`${evidence.result}: ${output}\n`)
  if (evidence.result !== 'PASS') throw new Error(`hosted_proof_failed_at_${evidence.failure?.phase ?? phase}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.message.startsWith('hosted_proof_failed_at_') ? error.message : 'hosted_activation_failed_before_proof'}\n`); process.exitCode = 1 })
}
