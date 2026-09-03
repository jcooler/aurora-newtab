begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(47);

select has_table('private', 'provider_connections', 'provider connections are server-only');
select has_table('private', 'provider_oauth_transactions', 'OAuth transactions are server-only');
select has_table('private', 'provider_rate_limits', 'provider rate limits are server-only');
select has_function('public', 'tab_two_provider_create_oauth_transaction',
  array['uuid','uuid','text','text','text','smallint','text','text','text','text','timestamp with time zone','uuid','timestamp with time zone'],
  'the transaction creation RPC exists');
select has_function('public', 'tab_two_provider_consume_oauth_transaction',
  array['text','timestamp with time zone'], 'the one-use transaction RPC exists');
select has_function('public', 'tab_two_provider_upsert_connection',
  array['uuid','uuid','text','text','text','text','text[]','smallint','text','text','text','timestamp with time zone'],
  'the connection upsert RPC exists');
select has_function('public', 'tab_two_provider_list_connections', array['uuid'],
  'the bounded metadata list RPC exists');
select has_function('public', 'tab_two_provider_get_connection', array['uuid','uuid'],
  'the private token lookup RPC exists');
select has_function('public', 'tab_two_provider_find_connection_by_subject', array['uuid','text','text'],
  'the duplicate-subject lookup RPC exists');
select has_function('public', 'tab_two_provider_delete_connection',
  array['uuid','uuid','timestamp with time zone'], 'the account-bound deletion RPC exists');
select has_function('public', 'tab_two_consume_provider_rate_limit',
  array['uuid','text','text','timestamp with time zone'], 'the dual account/IP rate-limit RPC exists');

insert into public.tab_two_accounts (id) values
  ('43000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002');
insert into private.account_grants (account_id, source, capabilities, starts_at) values
  ('43000000-0000-4000-8000-000000000001', 'complimentary_owner',
    array['multi_account','google_calendar']::private.premium_capability[], now()),
  ('43000000-0000-4000-8000-000000000002', 'complimentary_owner',
    array['multi_account','google_calendar']::private.premium_capability[], now());

set local role anon;
select throws_ok('select * from private.provider_connections', '42501', null,
  'anonymous clients cannot enter the private provider schema');
select throws_ok($$select public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001')$$, '42501', null,
  'anonymous clients cannot call provider metadata RPCs');

set local role authenticated;
select throws_ok('select * from private.provider_oauth_transactions', '42501', null,
  'authenticated clients cannot read OAuth transactions');
select throws_ok($$select public.tab_two_provider_delete_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', now())$$, '42501', null,
  'authenticated clients cannot mutate provider connections directly');

reset role;
set local role service_role;

insert into private.provider_oauth_transactions (
  id, account_id, provider, state_hash, client_nonce_hash, pkce_key_version,
  pkce_verifier_nonce, pkce_verifier_ciphertext, pkce_verifier_fingerprint,
  final_redirect, expires_at, correlation_id, created_at
) values (
  '73000000-0000-4000-8000-000000000099',
  '43000000-0000-4000-8000-000000000001', 'google_calendar',
  repeat('z',43), repeat('y',43), 1, repeat('x',16), repeat('w',80), repeat('v',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-calendar?nonce=' || repeat('u',43),
  now() - interval '2 days', '83000000-0000-4000-8000-000000000099',
  now() - interval '2 days 10 minutes'
);
select ok(public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001', 'google_calendar',
  repeat('A',43), repeat('B',43), 1::smallint, repeat('C',16), repeat('D',80), repeat('F',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-calendar?nonce=' || repeat('E',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000001', now()),
  'an exact encrypted one-use OAuth transaction is created');
select is((select count(*) from private.provider_oauth_transactions
  where id = '73000000-0000-4000-8000-000000000099'), 0::bigint,
  'transaction creation removes expired state beyond bounded retention');
select is((select count(*) from public.tab_two_provider_consume_oauth_transaction(repeat('A',43), now())),
  1::bigint, 'the exact state hash consumes one transaction');
select is((select count(*) from public.tab_two_provider_consume_oauth_transaction(repeat('A',43), now())),
  0::bigint, 'a callback replay cannot consume the transaction twice');
select throws_ok($$select public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001', 'google_calendar',
  repeat('F',43), repeat('G',43), 1::smallint, repeat('H',16), repeat('I',80), repeat('K',43),
  'https://evil.example/google-calendar?nonce=' || repeat('J',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000002', now())$$,
  '23514', null, 'a substituted final redirect is rejected');

select is(public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', 'google_calendar', 'google-subject-a',
  'alex@example.test', 'Alex', array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ], 1::smallint, repeat('K',16), repeat('L',80), repeat('M',43), now()),
  '63000000-0000-4000-8000-000000000001'::uuid,
  'the first encrypted connection is inserted');
select is((select count(*) from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001')), 1::bigint,
  'the owner receives one metadata-only connection');
select is((select email from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001') limit 1), 'alex@example.test',
  'the metadata result includes bounded display identity');
select is((select refresh_token_fingerprint from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001')), repeat('M',43),
  'the server-only lookup can retrieve encrypted token authority');
select is((select count(*) from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000001')), 0::bigint,
  'another account cannot traverse into a connection');
select is(public.tab_two_provider_delete_connection(
  '43000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000001', now()), false,
  'another account cannot delete a connection');

select is(public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000099', 'google_calendar', 'google-subject-a',
  'alex+updated@example.test', null, array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ], null, null, null, null, now()),
  '63000000-0000-4000-8000-000000000001'::uuid,
  'a duplicate provider subject deterministically updates the existing row');
select is((select refresh_token_fingerprint from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001')), repeat('M',43),
  'reconnect without a refresh token preserves existing encrypted authority');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '63000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001', 'google_calendar', 'google-subject-wide',
  'wide@example.test', 'active', array['openid','email','https://www.googleapis.com/auth/calendar.readonly'],
  1, repeat('N',16), repeat('O',80), repeat('P',43))$$,
  '23514', null, 'scope widening is rejected by the table constraint');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '63000000-0000-4000-8000-000000000003',
  '43000000-0000-4000-8000-000000000001', 'google_calendar', 'google-subject-a',
  'duplicate@example.test', 'active', array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'],
  1, repeat('Q',16), repeat('R',80), repeat('S',43))$$,
  '23505', null, 'the database rejects duplicate account/provider/subject races');

select is(public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000098', 'google_calendar', 'google-subject-a',
  'race@example.test', null, array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ], 1::smallint, repeat('X',16), repeat('Y',80), repeat('Z',43), now()),
  '63000000-0000-4000-8000-000000000001'::uuid,
  'a racing duplicate preserves the canonical connection identity');
select is((select refresh_token_fingerprint from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001')), repeat('M',43),
  'a racing ciphertext bound to another UUID cannot replace the canonical token');

select lives_ok($$insert into private.provider_connections (
  id, account_id, provider, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) select
  ('63000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '43000000-0000-4000-8000-000000000001', 'google_calendar', 'google-subject-' || value,
  'account-' || value || '@example.test', 'active', array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'],
  1, repeat('a',16), repeat('b',80), repeat('c',43)
from generate_series(4, 7) as value$$,
  'four additional connections fill the five-account limit');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000008', 'google_calendar', 'google-subject-six',
  'six@example.test', null, array[
    'openid','email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ], 1::smallint, repeat('d',16), repeat('e',80), repeat('f',43), now())$$,
  'P0001', 'provider_connection_limit', 'a sixth active provider connection is rejected');

select ok(public.tab_two_provider_rotate_refresh_token(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', 1::smallint,
  repeat('T',16), repeat('U',80), repeat('V',43), now()),
  'an account-bound refresh rotation succeeds under row lock');
select is((select refresh_token_fingerprint from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001')), repeat('V',43),
  'refresh rotation replaces the encrypted authority atomically');
select ok(public.tab_two_provider_mark_reconnect_required(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', now()),
  'an invalid grant is marked reconnect-required');
select is((select status from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001')
  where connection_id = '63000000-0000-4000-8000-000000000001'), 'reconnect_required',
  'the reconnect state is visible without exposing token fields');

insert into private.provider_rate_limits (
  scope_type, scope_key, action, window_started_at, request_count, expires_at
) values ('ip', repeat('q',43), 'start', now() - interval '3 days', 1, now() - interval '2 days');
select ok(public.tab_two_consume_provider_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'start', repeat('W',43), now()),
  'the first bounded account/IP action is admitted');
select is((select count(*) from private.provider_rate_limits where scope_key = repeat('q',43)),
  0::bigint, 'rate-limit consumption removes expired rows beyond bounded retention');
select ok((select bool_and(public.tab_two_consume_provider_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'start', repeat('W',43), now()))
  from generate_series(1, 4)), 'the first five start attempts fit the window');
select is(public.tab_two_consume_provider_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'start', repeat('W',43), now()), false,
  'the sixth start attempt is rejected');
select throws_ok($$select public.tab_two_consume_provider_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'unknown', repeat('W',43), now())$$,
  '22023', 'provider_rate_limit_invalid', 'unknown provider actions fail closed');

select is(public.tab_two_provider_delete_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', now()), true,
  'the owner deletes the exact connection authority');
select is((select count(*) from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001')), 0::bigint,
  'revoked token authority is no longer retrievable');
select is((select count(*) from private.provider_connections where refresh_token_ciphertext like '%secret%'),
  0::bigint, 'the fixture stores no plaintext provider secret');
select is((select count(*) from private.provider_oauth_transactions where pkce_verifier_ciphertext like '%verifier%'),
  0::bigint, 'the fixture stores no plaintext PKCE verifier');

select * from finish();
rollback;
