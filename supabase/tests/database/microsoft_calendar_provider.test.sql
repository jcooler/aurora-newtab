begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(38);

select has_column('private', 'provider_connections', 'account_kind',
  'provider connections record the bounded account kind');
select has_function('public', 'tab_two_provider_upsert_connection',
  array['uuid','uuid','text','text','text','text','text','text[]','smallint','text','text','text','timestamp with time zone'],
  'the provider-aware upsert accepts an account kind');

insert into public.tab_two_accounts (id) values
  ('43000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002'),
  ('43000000-0000-4000-8000-000000000003');
insert into private.account_grants (account_id, source, capabilities, starts_at) values
  ('43000000-0000-4000-8000-000000000001', 'complimentary_owner',
    array['multi_account','google_calendar','microsoft_calendar']::private.premium_capability[], now()),
  ('43000000-0000-4000-8000-000000000002', 'complimentary_owner',
    array['multi_account','microsoft_calendar']::private.premium_capability[], now()),
  ('43000000-0000-4000-8000-000000000003', 'complimentary_owner',
    array['multi_account']::private.premium_capability[], now());

set local role authenticated;
select throws_ok('select account_kind from private.provider_connections', '42501', null,
  'authenticated clients cannot read Microsoft provider metadata directly');
reset role;
set local role service_role;

select ok(public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar',
  repeat('A',43), repeat('B',43), 1::smallint, repeat('C',16), repeat('D',80), repeat('F',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar?nonce=' || repeat('E',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000001', now()),
  'an exact Microsoft OAuth transaction is created');
select is((select count(*) from public.tab_two_provider_consume_oauth_transaction(repeat('A',43), now())),
  1::bigint, 'the Microsoft transaction can be consumed once');
select is((select count(*) from public.tab_two_provider_consume_oauth_transaction(repeat('A',43), now())),
  0::bigint, 'the Microsoft callback cannot replay a consumed transaction');
select throws_ok($$select public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar',
  repeat('G',43), repeat('H',43), 1::smallint, repeat('I',16), repeat('J',80), repeat('K',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-calendar?nonce=' || repeat('L',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000002', now())$$,
  '23514', null, 'Microsoft cannot substitute the Google return path');
select throws_ok($$select public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000003',
  '43000000-0000-4000-8000-000000000003', 'microsoft_calendar',
  repeat('M',43), repeat('N',43), 1::smallint, repeat('O',16), repeat('P',80), repeat('Q',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar?nonce=' || repeat('R',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000003', now())$$,
  'P0001', 'provider_entitlement_required', 'an account without Microsoft capability cannot start OAuth');
select throws_ok($$select public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000004',
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar',
  repeat('S',43), repeat('T',43), 1::smallint, repeat('U',16), repeat('V',80), repeat('W',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar?nonce=' || repeat('X',43),
  now() - interval '1 second', '83000000-0000-4000-8000-000000000004', now())$$,
  '23514', null, 'an already-expired Microsoft transaction is rejected');
select throws_ok($$select public.tab_two_provider_create_oauth_transaction(
  '73000000-0000-4000-8000-000000000005',
  '43000000-0000-4000-8000-000000000001', 'outlook',
  repeat('a',43), repeat('b',43), 1::smallint, repeat('c',16), repeat('d',80), repeat('e',43),
  'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar?nonce=' || repeat('f',43),
  now() + interval '10 minutes', '83000000-0000-4000-8000-000000000005', now())$$,
  '22023', 'provider_transaction_invalid', 'an unknown provider name fails closed');

select is(public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', 'microsoft_calendar', 'personal',
  '9188040d-6c67-4c5b-b112-36a304b66dad:62000000-0000-4000-8000-000000000099',
  'alex@outlook.test', 'Alex', array[
    'openid','offline_access',
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Calendars.ReadBasic'
  ], 1::smallint, repeat('g',16), repeat('h',80), repeat('i',43), now()),
  '62000000-0000-4000-8000-000000000001'::uuid,
  'a Personal Microsoft connection is inserted');
select is((select account_kind from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001')
  where connection_id = '62000000-0000-4000-8000-000000000001'), 'personal',
  'metadata includes the non-color Personal account label');
select is((select provider_subject from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001')),
  '9188040d-6c67-4c5b-b112-36a304b66dad:62000000-0000-4000-8000-000000000099',
  'the server-only lookup retains the tenant-qualified subject');
select is((select count(*) from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000001')), 0::bigint,
  'another entitled account cannot traverse a Microsoft connection');

select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002', 'microsoft_calendar', null,
  '62000000-0000-4000-8000-000000000002:62000000-0000-4000-8000-000000000003',
  'null-kind@example.test', null, array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1::smallint, repeat('j',16), repeat('k',80), repeat('l',43), now())$$,
  '23514', null, 'Microsoft requires an account kind');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000003', 'microsoft_calendar', 'consumer',
  '62000000-0000-4000-8000-000000000003:62000000-0000-4000-8000-000000000004',
  'unknown-kind@example.test', null, array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1::smallint, repeat('m',16), repeat('n',80), repeat('o',43), now())$$,
  '23514', null, 'unknown Microsoft account kinds are rejected');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000004', 'google_calendar', 'personal',
  'google-subject-kind', 'google@example.test', null, array[
    'openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'],
  1::smallint, repeat('p',16), repeat('q',80), repeat('r',43), now())$$,
  '23514', null, 'Google requires a null account kind');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000005', 'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000005:62000000-0000-4000-8000-000000000006',
  'wrong-scope@example.test', null, array[
    'openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'],
  1::smallint, repeat('s',16), repeat('t',80), repeat('u',43), now())$$,
  '23514', null, 'Google scopes cannot be attached to Microsoft');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000006', 'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000006:62000000-0000-4000-8000-000000000007',
  'wide@example.test', null, array[
    'openid','offline_access','https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Calendars.ReadBasic','https://graph.microsoft.com/Calendars.Read'],
  1::smallint, repeat('v',16), repeat('w',80), repeat('x',43), now())$$,
  '23514', null, 'broader Microsoft scopes are rejected');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000018', 'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000018:62000000-0000-4000-8000-000000000019',
  'ordered@example.test', null, array[
    'offline_access','openid','https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Calendars.ReadBasic'],
  1::smallint, repeat('L',16), repeat('M',80), repeat('N',43), now())$$,
  '23514', null, 'Microsoft scopes in the wrong order are rejected');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000003',
  '62000000-0000-4000-8000-000000000007', 'microsoft_calendar', 'personal',
  '62000000-0000-4000-8000-000000000007:62000000-0000-4000-8000-000000000008',
  'no-capability@example.test', null, array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1::smallint, repeat('y',16), repeat('z',80), repeat('0',43), now())$$,
  'P0001', 'provider_entitlement_required', 'missing Microsoft capability blocks persistence');

select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '62000000-0000-4000-8000-000000000008', '43000000-0000-4000-8000-000000000001',
  'microsoft_calendar', 'personal', 'not-tenant-qualified', 'subject@example.test', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, repeat('1',16), repeat('2',80), repeat('3',43))$$,
  '23514', null, 'Microsoft subjects must be tenant-qualified UUID pairs');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '62000000-0000-4000-8000-000000000019', '43000000-0000-4000-8000-000000000001',
  'microsoft_calendar', 'personal',
  '9188040d-6c67-4c5b-b112-36a304b66dad:62000000-0000-4000-8000-000000000099',
  'duplicate@example.test', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, repeat('O',16), repeat('P',80), repeat('Q',43))$$,
  '23505', null, 'duplicate account, provider, and subject races are rejected');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '62000000-0000-4000-8000-000000000009', '43000000-0000-4000-8000-000000000001',
  'microsoft_calendar', 'personal',
  '62000000-0000-4000-8000-000000000009:62000000-0000-4000-8000-000000000010',
  ' bad@example.test', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, repeat('4',16), repeat('5',80), repeat('6',43))$$,
  '23514', null, 'malformed Microsoft email labels are rejected');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, display_name, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '62000000-0000-4000-8000-000000000010', '43000000-0000-4000-8000-000000000001',
  'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000010:62000000-0000-4000-8000-000000000011',
  'display@example.test', E'Bad\nName', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, repeat('7',16), repeat('8',80), repeat('9',43))$$,
  '23514', null, 'control characters in display labels are rejected');
select throws_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) values (
  '62000000-0000-4000-8000-000000000011', '43000000-0000-4000-8000-000000000001',
  'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000011:62000000-0000-4000-8000-000000000012',
  'token@example.test', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, 'bad!', repeat('A',80), repeat('B',43))$$,
  '23514', null, 'malformed encrypted token envelopes are rejected');

select lives_ok($$insert into private.provider_connections (
  id, account_id, provider, account_kind, provider_subject, email, status, granted_scopes,
  token_key_version, refresh_token_nonce, refresh_token_ciphertext, refresh_token_fingerprint
) select
  ('62000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar', 'work_or_school',
  ('62000000-0000-4000-8000-' || lpad((value + 100)::text, 12, '0')) || ':' ||
    ('62000000-0000-4000-8000-' || lpad((value + 200)::text, 12, '0')),
  'work-' || value || '@example.test', 'active', array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1, repeat('C',16), repeat('D',80), repeat('E',43)
from generate_series(12, 15) as value$$,
  'four additional Microsoft rows fill its five-connection limit');
select throws_ok($$select public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000016', 'microsoft_calendar', 'work_or_school',
  '62000000-0000-4000-8000-000000000016:62000000-0000-4000-8000-000000000017',
  'six@example.test', null, array[
    'openid','offline_access','https://graph.microsoft.com/User.Read','https://graph.microsoft.com/Calendars.ReadBasic'],
  1::smallint, repeat('F',16), repeat('G',80), repeat('H',43), now())$$,
  'P0001', 'provider_connection_limit', 'a sixth Microsoft connection is rejected');

select is(public.tab_two_provider_upsert_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000020', 'google_calendar', 'google-subject-preserved',
  'google@example.test', null, array[
    'openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'],
  1::smallint, repeat('I',16), repeat('J',80), repeat('K',43), now()),
  '62000000-0000-4000-8000-000000000020'::uuid,
  'the existing Google upsert signature remains compatible');
select is((select account_kind from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001')
  where connection_id = '62000000-0000-4000-8000-000000000020'), null,
  'Google metadata keeps a null account kind');
select is((select count(*) from public.tab_two_provider_find_connection_by_subject(
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar',
  '9188040d-6c67-4c5b-b112-36a304b66dad:62000000-0000-4000-8000-000000000099')), 1::bigint,
  'the provider-specific subject lookup finds only the Microsoft row');
select is((select account_kind from public.tab_two_provider_find_connection_by_subject(
  '43000000-0000-4000-8000-000000000001', 'microsoft_calendar',
  '9188040d-6c67-4c5b-b112-36a304b66dad:62000000-0000-4000-8000-000000000099')), 'personal',
  'the private subject lookup retains Microsoft account kind');
select is((select count(*) from public.tab_two_provider_list_connections(
  '43000000-0000-4000-8000-000000000001') where provider = 'microsoft_calendar'), 5::bigint,
  'Microsoft listing stays bounded to five active connections');
select is(public.tab_two_provider_delete_connection(
  '43000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000001', now()), false,
  'another account cannot delete a Microsoft connection');
select is(public.tab_two_provider_delete_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001', now()), true,
  'the owner can delete the Microsoft connection');
select is((select count(*) from public.tab_two_provider_get_connection(
  '43000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001')), 0::bigint,
  'deleted Microsoft token authority is no longer retrievable');
select is((select count(*) from private.provider_connections where refresh_token_ciphertext like '%secret%'),
  0::bigint, 'Microsoft fixtures store no plaintext refresh token');
select is((select count(*) from private.provider_oauth_transactions where pkce_verifier_ciphertext like '%verifier%'),
  0::bigint, 'Microsoft fixtures store no plaintext PKCE verifier');

select * from finish();
rollback;
