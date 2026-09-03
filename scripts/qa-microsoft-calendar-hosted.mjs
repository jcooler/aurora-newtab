import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { redactIdentifier } from './qa-encrypted-sync-hosted.mjs'

const PROJECT_REF = 'ovlobmvxtryitupxwylg'
const ORIGIN = `https://${PROJECT_REF}.supabase.co`
const EXTENSION_ID = 'akjalbmacojpmebkgohhcaaiacicpgkh'
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`
const CALLBACK_URL = `${ORIGIN}/functions/v1/microsoft-calendar-oauth-callback`
const MIGRATION = '20260903000800'
const MICROSOFT_SCOPES = Object.freeze([
  'openid',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadBasic',
])
const MICROSOFT_FUNCTIONS = Object.freeze([
  'microsoft-calendar-oauth-start',
  'microsoft-calendar-oauth-callback',
  'microsoft-calendar-connections',
  'microsoft-calendar-session',
  'microsoft-calendar-disconnect',
])
const REQUIRED_SECRET_NAMES = Object.freeze([
  'MICROSOFT_CALENDAR_OAUTH_CLIENT_ID',
  'MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET',
  'TAB_TWO_MICROSOFT_TOKEN_KEK_V1',
])
const REQUIRED_INTERACTIONS = Object.freeze([
  'gatewayJwtRequired',
  'redirectBindingRejected',
  'entitlementDenied',
  'exactAuthorizationBoundary',
  'organizationApprovalMapped',
  'stateReplayRejected',
  'personalAndWorkMetadata',
  'scopeMismatchRejected',
  'crossAccountAccessRejected',
  'hostedTokenRotationMetadata',
  'rateLimitEnforced',
  'revokeFailureStillDisconnects',
  'perAccountProviderHistoryDeleted',
])
const MAX_FUNCTION_INVOCATIONS = 14
const MAX_RESPONSE_EGRESS_BYTES = 64 * 1024
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/u
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function unsafeEvidenceKey(key) {
  return /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|service[_-]?role|authorization[_-]?url|provider[_-]?subject|tenant[_-]?id|object[_-]?id|ciphertext|fingerprint|pkce|nonce|email|id[_-]?token|api[_-]?key)/iu.test(key)
}

export function assertSafeHostedMicrosoftEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || !['PASS', 'FAIL'].includes(evidence.result)
    || evidence.dataClassification !== 'synthetic-metadata-only'
    || evidence.ownerDataPresent !== false
    || !evidence.usage
    || !Number.isSafeInteger(evidence.usage.functionInvocations)
    || evidence.usage.functionInvocations < 0
    || evidence.usage.functionInvocations > MAX_FUNCTION_INVOCATIONS
    || !Number.isSafeInteger(evidence.usage.responseEgressBytes)
    || evidence.usage.responseEgressBytes < 0
    || evidence.usage.responseEgressBytes >= MAX_RESPONSE_EGRESS_BYTES
  ) throw new Error('hosted_microsoft_evidence_unsafe')
  if (evidence.result === 'PASS' && REQUIRED_INTERACTIONS.some(
    (name) => evidence.interactions?.[name] !== true,
  )) throw new Error('hosted_microsoft_evidence_unsafe')

  const visit = (value) => {
    if (typeof value === 'string') {
      if (
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)
        || /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/u.test(value)
        || /https?:\/\//iu.test(value)
        || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(value)
      ) throw new Error('hosted_microsoft_evidence_unsafe')
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (unsafeEvidenceKey(key)) throw new Error('hosted_microsoft_evidence_unsafe')
      visit(child)
    }
  }
  visit(evidence)
}

export function readHostedMicrosoftAuthorizationState(authorizationUrl, clientNonce) {
  try {
    const url = new URL(authorizationUrl)
    const expectedKeys = [
      'client_id', 'code_challenge', 'code_challenge_method', 'nonce', 'prompt',
      'redirect_uri', 'response_mode', 'response_type', 'scope', 'state',
    ].sort()
    const actualKeys = [...url.searchParams.keys()].sort()
    const scopes = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean)
    const clientId = url.searchParams.get('client_id') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const challenge = url.searchParams.get('code_challenge') ?? ''
    const valid = url.protocol === 'https:'
      && url.hostname === 'login.microsoftonline.com'
      && url.pathname === '/common/oauth2/v2.0/authorize'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hash === ''
      && actualKeys.length === expectedKeys.length
      && actualKeys.every((key, index) => key === expectedKeys[index])
      && GUID.test(clientId)
      && url.searchParams.get('redirect_uri') === CALLBACK_URL
      && url.searchParams.get('response_type') === 'code'
      && url.searchParams.get('response_mode') === 'query'
      && scopes.length === MICROSOFT_SCOPES.length
      && new Set(scopes).size === scopes.length
      && MICROSOFT_SCOPES.every((scope) => scopes.includes(scope))
      && BASE64URL_32.test(state)
      && url.searchParams.get('nonce') === clientNonce
      && BASE64URL_32.test(challenge)
      && url.searchParams.get('code_challenge_method') === 'S256'
      && url.searchParams.get('prompt') === 'select_account'
    if (!valid) throw new Error('hosted_microsoft_authorization_invalid')
    return state
  } catch (error) {
    if (error instanceof Error && error.message === 'hosted_microsoft_authorization_invalid') throw error
    throw new Error('hosted_microsoft_authorization_invalid')
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
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
  if (result.status !== 0) throw new Error('hosted_microsoft_cli_failed')
  return result.stdout
}

function dbQuery(sql) {
  const parsed = JSON.parse(supabaseCli('db', 'query', '--linked', '--output-format', 'json', sql))
  assert(Array.isArray(parsed.rows))
  return parsed.rows
}

function functionMetadata() {
  const wanted = new Set(MICROSOFT_FUNCTIONS)
  return JSON.parse(supabaseCli('functions', 'list', '--project-ref', PROJECT_REF, '--output', 'json'))
    .filter((entry) => wanted.has(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      status: entry.status,
      version: entry.version,
      verifyJwt: entry.verify_jwt,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function secretNames() {
  const wanted = new Set(REQUIRED_SECRET_NAMES)
  return JSON.parse(supabaseCli('secrets', 'list', '--project-ref', PROJECT_REF, '--output', 'json'))
    .map((entry) => entry.name)
    .filter((name) => wanted.has(name))
    .sort()
}

function encodeRandom32() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function safeFailure(error) {
  if (!(error instanceof Error)) return 'hosted_microsoft_matrix_failed'
  return error.message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/https?:\/\/\S+/giu, '[redacted-url]')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, '[redacted-id]')
    .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, '[redacted-token]')
    .slice(0, 240)
}

async function main() {
  if (process.argv[2] !== '--exact') {
    throw new Error('Run with --exact only after the approved PM-P7 hosted gate.')
  }
  const serviceRoleKey = requiredEnvironment('TAB_TWO_QA_SERVICE_KEY')
  const publishableKey = requiredEnvironment('TAB_TWO_QA_ANON_KEY')
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
  const runStartedAt = new Date(Date.now() - 1_000).toISOString()
  const accounts = []
  const requests = []
  const evidence = {
    result: 'FAIL',
    project: PROJECT_REF,
    sourceCommit,
    migration: MIGRATION,
    run: await redactIdentifier(runId),
    dataClassification: 'synthetic-metadata-only',
    ownerDataPresent: false,
    accounts: [],
    functions: [],
    configuration: { requiredNames: [] },
    interactions: {},
    usage: { functionInvocations: 0, responseEgressBytes: 0 },
    database: {},
    cleanup: { accounts: false, authUsers: false, residualSyntheticRows: null },
    requests: [],
  }
  const artifactPath = resolve(
    repoRoot, 'artifacts', 'qa-microsoft-calendar-hosted', sourceCommit, 'evidence.json',
  )

  async function callFunction(slug, { method = 'POST', token = null, body = null, query = '' } = {}) {
    const headers = { accept: 'application/json', origin: EXTENSION_ORIGIN }
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== null) headers['content-type'] = 'application/json'
    const response = await fetch(`${ORIGIN}/functions/v1/${slug}${query}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    })
    const text = await response.text()
    evidence.usage.functionInvocations += 1
    evidence.usage.responseEgressBytes += Buffer.byteLength(text)
    requests.push({ slug, status: response.status, bytes: Buffer.byteLength(text) })
    assert(evidence.usage.functionInvocations <= MAX_FUNCTION_INVOCATIONS)
    assert(evidence.usage.responseEgressBytes < MAX_RESPONSE_EGRESS_BYTES)
    return { status: response.status, body: parseJson(text), headers: response.headers }
  }

  async function provision(alias, entitled) {
    const syntheticEmail = `pm-p7-${runId}-${alias}@example.invalid`
    const created = await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'], pm_p7_qa: true },
      user_metadata: { pm_p7_qa: true, qa_alias: alias },
    })
    if (created.error || !created.data.user) throw new Error(`hosted_microsoft_auth_create_failed:${alias}`)
    const authUserId = created.data.user.id
    const accountId = crypto.randomUUID()
    accounts.push({ alias, authUserId, accountId })
    const grant = entitled
      ? `insert into private.account_grants (
          account_id, source, capabilities, starts_at, expires_at
        ) values (
          ${sqlLiteral(accountId)}::uuid, 'stripe',
          array['multi_account','microsoft_calendar']::private.premium_capability[],
          now() - interval '1 minute', now() + interval '2 hours'
        );`
      : ''
    dbQuery(`begin;
      insert into public.tab_two_accounts (id) values (${sqlLiteral(accountId)}::uuid);
      insert into public.tab_two_identities (
        account_id, auth_user_id, provider, provider_subject, email, display_name
      ) values (
        ${sqlLiteral(accountId)}::uuid, ${sqlLiteral(authUserId)}::uuid, 'google',
        ${sqlLiteral(`pm-p7-qa:${runId}:${alias}`)}, ${sqlLiteral(syntheticEmail)},
        ${sqlLiteral(`PM-P7 ${alias}`)}
      );
      ${grant}
      commit;
      select true as provisioned;`)

    const client = createClient(ORIGIN, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })
    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: syntheticEmail })
    if (generated.error || !generated.data.properties?.hashed_token) {
      throw new Error(`hosted_microsoft_auth_link_failed:${alias}`)
    }
    const signedIn = await client.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: 'magiclink',
    })
    if (signedIn.error || !signedIn.data.session?.access_token) {
      throw new Error(`hosted_microsoft_auth_sign_in_failed:${alias}`)
    }
    const restored = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: { provider: 'google', providers: ['google'], pm_p7_qa: true },
    })
    if (restored.error) throw new Error(`hosted_microsoft_auth_provider_failed:${alias}`)
    evidence.accounts.push({
      alias,
      account: await redactIdentifier(accountId),
      authUser: await redactIdentifier(authUserId),
      entitled,
    })
    return { accountId, token: signedIn.data.session.access_token }
  }

  function seedConnection(accountId, connectionId, accountKind, tenantId, objectId, syntheticEmail, displayName, scopes = MICROSOFT_SCOPES) {
    const scopeSql = scopes.map((scope) => sqlLiteral(scope)).join(',')
    const rows = dbQuery(`select public.tab_two_provider_upsert_connection(
      ${sqlLiteral(accountId)}::uuid,
      ${sqlLiteral(connectionId)}::uuid,
      'microsoft_calendar',
      ${sqlLiteral(accountKind)},
      ${sqlLiteral(`${tenantId}:${objectId}`)},
      ${sqlLiteral(syntheticEmail)},
      ${sqlLiteral(displayName)},
      array[${scopeSql}]::text[],
      1::smallint,
      'AAAAAAAAAAAAAAAA',
      'AAAAAAAAAAAAAAAAAAAAAAAA',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      now()
    )::text as connection_id;`)
    return rows[0]?.connection_id
  }

  try {
    evidence.functions = functionMetadata()
    assert.equal(evidence.functions.length, MICROSOFT_FUNCTIONS.length)
    assert(evidence.functions.every((entry) => entry.status === 'ACTIVE'))
    assert.equal(evidence.functions.find(
      (entry) => entry.slug === 'microsoft-calendar-oauth-callback',
    )?.verifyJwt, false)
    assert(evidence.functions
      .filter((entry) => entry.slug !== 'microsoft-calendar-oauth-callback')
      .every((entry) => entry.verifyJwt === true))
    evidence.configuration.requiredNames = secretNames()
    assert.deepEqual(evidence.configuration.requiredNames, [...REQUIRED_SECRET_NAMES].sort())

    const baseline = dbQuery(`select
      (select count(*)::int from supabase_migrations.schema_migrations
        where version = ${sqlLiteral(MIGRATION)}) as migration_count,
      (select count(*)::int from pg_catalog.pg_constraint
        where conname in (
          'provider_connections_scopes_exact',
          'provider_connections_account_kind_by_provider',
          'provider_connections_subject_by_provider',
          'provider_oauth_redirect_exact'
        )) as required_constraints,
      (select count(*)::int from pg_catalog.pg_attribute attribute
        join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'private'
          and relation.relname = 'provider_connections'
          and attribute.attname = 'account_kind'
          and not attribute.attisdropped) as account_kind_columns,
      (select count(*)::int from pg_catalog.pg_enum enum_value
        join pg_catalog.pg_type enum_type on enum_type.oid = enum_value.enumtypid
        join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
        where namespace.nspname = 'private'
          and enum_type.typname = 'provider_id'
          and enum_value.enumlabel = 'microsoft_calendar') as provider_labels,
      (select count(*)::int from private.provider_connections
        where provider::text = 'microsoft_calendar') as microsoft_connections,
      (select count(*)::int from private.provider_oauth_transactions
        where provider::text = 'microsoft_calendar') as microsoft_transactions,
      (select count(*)::int from auth.users
        where raw_user_meta_data ->> 'pm_p7_qa' = 'true') as qa_auth_users;`)[0]
    assert.deepEqual(baseline, {
      migration_count: 1,
      required_constraints: 4,
      account_kind_columns: 1,
      provider_labels: 1,
      microsoft_connections: 0,
      microsoft_transactions: 0,
      qa_auth_users: 0,
    })
    evidence.database.baselineEmpty = true
    evidence.database.migrationPresent = true
    evidence.database.providerConstraintsPresent = true

    const accountA = await provision('entitled-a', true)
    const accountB = await provision('entitled-b', true)
    const accountC = await provision('unentitled', false)

    const unauthenticated = await callFunction('microsoft-calendar-connections', { method: 'GET' })
    assert.equal(unauthenticated.status, 401)
    evidence.interactions.gatewayJwtRequired = true

    const nonceA = encodeRandom32()
    const finalRedirectA = `https://${EXTENSION_ID}.chromiumapp.org/microsoft-calendar?nonce=${nonceA}`
    const redirectSubstitution = await callFunction('microsoft-calendar-oauth-start', {
      token: accountA.token,
      body: { clientNonce: nonceA, finalRedirect: `https://attacker.example/microsoft-calendar?nonce=${nonceA}` },
    })
    assert.equal(redirectSubstitution.status, 400)
    assert.deepEqual(redirectSubstitution.body, { error: 'provider_request_invalid' })
    evidence.interactions.redirectBindingRejected = true

    const entitlementNonce = encodeRandom32()
    const deniedWithValidRedirect = await callFunction('microsoft-calendar-oauth-start', {
      token: accountC.token,
      body: {
        clientNonce: entitlementNonce,
        finalRedirect: `https://${EXTENSION_ID}.chromiumapp.org/microsoft-calendar?nonce=${entitlementNonce}`,
      },
    })
    assert.equal(deniedWithValidRedirect.status, 403)
    assert.deepEqual(deniedWithValidRedirect.body, { error: 'provider_entitlement_required' })
    evidence.interactions.entitlementDenied = true

    const started = await callFunction('microsoft-calendar-oauth-start', {
      token: accountA.token,
      body: { clientNonce: nonceA, finalRedirect: finalRedirectA },
    })
    assert.equal(started.status, 200)
    assert.equal(typeof started.body?.authorizationUrl, 'string')
    const state = readHostedMicrosoftAuthorizationState(started.body.authorizationUrl, nonceA)
    evidence.interactions.exactAuthorizationBoundary = true

    const deniedCallback = await callFunction('microsoft-calendar-oauth-callback', {
      method: 'GET',
      query: `?state=${encodeURIComponent(state)}&error=admin_consent_required&error_description=AADSTS65001`,
    })
    assert.equal(deniedCallback.status, 302)
    const callbackLocation = new URL(deniedCallback.headers.get('location'))
    assert.equal(callbackLocation.origin, `https://${EXTENSION_ID}.chromiumapp.org`)
    assert.equal(callbackLocation.pathname, '/microsoft-calendar')
    assert.equal(callbackLocation.searchParams.get('nonce'), nonceA)
    assert.equal(callbackLocation.searchParams.get('result'), 'organization_approval_required')
    assert.deepEqual([...callbackLocation.searchParams.keys()].sort(), ['nonce', 'result'])
    evidence.interactions.organizationApprovalMapped = true

    const replayed = await callFunction('microsoft-calendar-oauth-callback', {
      method: 'GET',
      query: `?state=${encodeURIComponent(state)}&error=admin_consent_required`,
    })
    assert.equal(replayed.status, 400)
    assert.deepEqual(replayed.body, { error: 'provider_state_invalid' })
    evidence.interactions.stateReplayRejected = true

    const connectionA1 = crypto.randomUUID()
    const connectionA2 = crypto.randomUUID()
    const connectionB1 = crypto.randomUUID()
    assert.equal(seedConnection(
      accountA.accountId, connectionA1, 'personal', crypto.randomUUID(), crypto.randomUUID(),
      `personal-${runId}@example.invalid`, 'Personal calendar',
    ), connectionA1)
    assert.equal(seedConnection(
      accountA.accountId, connectionA2, 'work_or_school', crypto.randomUUID(), crypto.randomUUID(),
      `work-${runId}@example.invalid`, 'Work calendar',
    ), connectionA2)
    assert.equal(seedConnection(
      accountB.accountId, connectionB1, 'work_or_school', crypto.randomUUID(), crypto.randomUUID(),
      `other-${runId}@example.invalid`, 'Other calendar',
    ), connectionB1)

    const listed = await callFunction('microsoft-calendar-connections', {
      method: 'GET', token: accountA.token,
    })
    assert.equal(listed.status, 200)
    assert.equal(listed.body?.connections?.length, 2)
    assert.deepEqual(listed.body.connections.map((entry) => entry.id), [connectionA1, connectionA2])
    assert.deepEqual(listed.body.connections.map((entry) => entry.accountKind).sort(), [
      'personal', 'work_or_school',
    ])
    assert(listed.body.connections.every((entry) => Object.keys(entry).sort().join(',') === [
      'accountKind', 'createdAt', 'displayName', 'email', 'grantedScopes', 'id',
      'provider', 'status', 'updatedAt',
    ].join(',')))
    const listedText = JSON.stringify(listed.body)
    assert(!listedText.includes('providerSubject'))
    assert(!listedText.includes('tenantId'))
    assert(!listedText.includes('objectId'))
    assert(!listedText.includes('refreshToken'))
    assert(!listedText.includes('ciphertext'))
    evidence.interactions.personalAndWorkMetadata = true

    assert.throws(() => seedConnection(
      accountA.accountId, crypto.randomUUID(), 'personal', crypto.randomUUID(), crypto.randomUUID(),
      `scope-${runId}@example.invalid`, 'Broader scope',
      [...MICROSOFT_SCOPES, 'https://graph.microsoft.com/Calendars.Read'],
    ), /hosted_microsoft_cli_failed/u)
    evidence.interactions.scopeMismatchRejected = true

    const crossAccount = await callFunction('microsoft-calendar-disconnect', {
      token: accountB.token,
      body: { confirmation: 'disconnect', connectionId: connectionA1 },
    })
    assert.equal(crossAccount.status, 404)
    assert.deepEqual(crossAccount.body, { error: 'provider_connection_not_found' })
    evidence.interactions.crossAccountAccessRejected = true

    const rotated = dbQuery(`select public.tab_two_provider_rotate_refresh_token(
      ${sqlLiteral(accountA.accountId)}::uuid,
      ${sqlLiteral(connectionA2)}::uuid,
      1::smallint,
      'BBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      now() + interval '1 second'
    ) as rotated;`)[0]
    assert.equal(rotated.rotated, true)
    const rotationMetadata = dbQuery(`select
      count(*)::int as matching,
      bool_and(last_successful_token_refresh_at is not null) as refresh_recorded
      from private.provider_connections
      where account_id = ${sqlLiteral(accountA.accountId)}::uuid
        and id = ${sqlLiteral(connectionA2)}::uuid;`)[0]
    assert.deepEqual(rotationMetadata, { matching: 1, refresh_recorded: true })
    evidence.interactions.hostedTokenRotationMetadata = true

    const rate = dbQuery(`select
      count(*) filter (where admitted)::int as admitted,
      count(*) filter (where not admitted)::int as denied
      from (
        select public.tab_two_consume_provider_rate_limit(
          ${sqlLiteral(accountA.accountId)}::uuid,
          'session',
          ${sqlLiteral(`pm-p7-${runId}`)},
          now()
        ) as admitted
        from generate_series(1, 61)
      ) attempts;`)[0]
    assert.deepEqual(rate, { admitted: 60, denied: 1 })
    evidence.interactions.rateLimitEnforced = true

    const disconnected = await callFunction('microsoft-calendar-disconnect', {
      token: accountB.token,
      body: { confirmation: 'disconnect', connectionId: connectionB1 },
    })
    assert.equal(disconnected.status, 200)
    assert.deepEqual(disconnected.body, { disconnected: true, revocationConfirmed: false })
    evidence.interactions.revokeFailureStillDisconnects = true

    const deletedHistory = dbQuery(`delete from public.tab_two_accounts
      where id = ${sqlLiteral(accountA.accountId)}::uuid;
      select
        (select count(*)::int from private.provider_connections
          where account_id = ${sqlLiteral(accountA.accountId)}::uuid) as connections,
        (select count(*)::int from private.provider_oauth_transactions
          where account_id = ${sqlLiteral(accountA.accountId)}::uuid) as transactions;`)[0]
    assert.deepEqual(deletedHistory, { connections: 0, transactions: 0 })
    evidence.interactions.perAccountProviderHistoryDeleted = true

    evidence.result = 'PASS'
  } catch (error) {
    evidence.failure = safeFailure(error)
    throw error
  } finally {
    try {
      if (accounts.length > 0) {
        const accountIds = accounts.map((account) => `${sqlLiteral(account.accountId)}::uuid`).join(',')
        const accountKeys = accounts.map((account) => sqlLiteral(account.accountId)).join(',')
        dbQuery(`begin;
          delete from private.provider_rate_limits
          where (scope_type = 'account' and scope_key in (${accountKeys}))
             or (scope_type = 'ip' and scope_key = ${sqlLiteral(`pm-p7-${runId}`)})
             or (scope_type = 'ip'
               and window_started_at >= ${sqlLiteral(runStartedAt)}::timestamptz
               and action in ('start','callback_failure','disconnect'));
          delete from public.tab_two_accounts where id in (${accountIds});
          commit;
          select true as cleaned;`)
        evidence.cleanup.accounts = true
      }
    } catch {
      evidence.cleanup.databaseError = 'cleanup_failed'
    }

    let authCleanup = true
    for (const account of accounts) {
      const deleted = await admin.auth.admin.deleteUser(account.authUserId)
      if (deleted.error && !/not found/iu.test(deleted.error.message)) authCleanup = false
    }
    evidence.cleanup.authUsers = authCleanup

    try {
      const accountSet = accounts.length > 0
        ? accounts.map((entry) => `${sqlLiteral(entry.accountId)}::uuid`).join(',')
        : "'00000000-0000-4000-8000-000000000000'::uuid"
      evidence.cleanup.residualSyntheticRows = dbQuery(`select
        (select count(*)::int from private.provider_connections
          where account_id in (${accountSet})) as connections,
        (select count(*)::int from private.provider_oauth_transactions
          where account_id in (${accountSet})) as transactions,
        (select count(*)::int from private.provider_rate_limits
          where (scope_type = 'account' and scope_key in (${accounts.length > 0 ? accounts.map((entry) => sqlLiteral(entry.accountId)).join(',') : "'00000000-0000-4000-8000-000000000000'"}))
             or (scope_type = 'ip' and scope_key = ${sqlLiteral(`pm-p7-${runId}`)})
             or (scope_type = 'ip'
               and window_started_at >= ${sqlLiteral(runStartedAt)}::timestamptz
               and action in ('start','callback_failure','disconnect'))) as rate_limits,
        (select count(*)::int from public.tab_two_accounts account
          where account.id in (${accountSet})) as accounts,
        (select count(*)::int from auth.users
          where raw_user_meta_data ->> 'pm_p7_qa' = 'true') as qa_auth_users;`)[0]
    } catch {
      evidence.cleanup.residualSyntheticRows = 'unavailable'
    }
    evidence.requests = requests
    assertSafeHostedMicrosoftEvidence(evidence)
    mkdirSync(dirname(artifactPath), { recursive: true })
    writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }

  assert.equal(evidence.result, 'PASS')
  assert.equal(evidence.cleanup.accounts, true)
  assert.equal(evidence.cleanup.authUsers, true)
  assert.deepEqual(evidence.cleanup.residualSyntheticRows, {
    connections: 0,
    transactions: 0,
    rate_limits: 0,
    accounts: 0,
    qa_auth_users: 0,
  })
  process.stdout.write(`PASS: hosted Microsoft Calendar sandbox boundary matrix (${sourceCommit})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${safeFailure(error)}\n`)
    process.exitCode = 1
  })
}
