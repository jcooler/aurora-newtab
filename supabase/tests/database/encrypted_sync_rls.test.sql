begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select has_table('private', 'sync_vaults', 'encrypted vault totals are private');
select has_table('private', 'sync_account_keys', 'wrapped account keys are private');
select has_table('private', 'sync_devices', 'sync device registry is private');
select has_table('private', 'sync_records', 'encrypted records are private');
select has_table('private', 'sync_mutation_receipts', 'idempotency receipts are private');
select has_table('private', 'sync_rate_limits', 'sync abuse limits are private');
select has_table('private', 'sync_audit_events', 'sync audit events are private');
select has_table('private', 'account_deletion_operations', 'resumable account deletion state is private');

select hasnt_column('private', 'sync_records', 'value', 'record storage has no plaintext value');
select hasnt_column('private', 'sync_records', 'plaintext', 'record storage has no plaintext field');
select hasnt_column('private', 'sync_account_keys', 'raw_dek', 'key storage has no raw data key');
select hasnt_column('private', 'sync_devices', 'email', 'device storage has no user email');
select hasnt_column('private', 'sync_devices', 'session', 'device storage has no auth session');
select hasnt_column('private', 'sync_mutation_receipts', 'raw_request', 'receipts have no raw requests');
select has_column('private', 'sync_mutation_receipts', 'expires_at', 'idempotency receipts have bounded expiry');

select has_function('public', 'tab_two_sync_register_device',
  array['uuid', 'text', 'text', 'timestamp with time zone'], 'service device registration RPC exists');
select has_function('public', 'tab_two_sync_account_key',
  array['uuid', 'text'], 'service wrapped-key acquisition RPC exists');
select has_function('public', 'tab_two_sync_summary',
  array['uuid', 'text'], 'service device and vault summary RPC exists');
select has_function('public', 'tab_two_consume_sync_rate_limit',
  array['uuid', 'text', 'text', 'timestamp with time zone'], 'dual-scope sync rate-limit RPC exists');
select has_function('public', 'tab_two_sync_apply_mutations',
  array['uuid', 'text', 'jsonb', 'timestamp with time zone'], 'service optimistic mutation RPC exists');
select has_function('public', 'tab_two_sync_pull_records',
  array['uuid', 'text', 'bigint', 'bigint', 'integer'], 'service bounded pull RPC exists');
select has_function('public', 'tab_two_sync_acknowledge_pull',
  array['uuid', 'text', 'bigint', 'timestamp with time zone'], 'service acknowledgement RPC exists');
select has_function('public', 'tab_two_sync_compact_tombstones',
  array['uuid', 'timestamp with time zone'], 'service tombstone compaction RPC exists');
select has_function('public', 'tab_two_sync_delete_vault',
  array['uuid', 'text', 'text', 'timestamp with time zone'], 'service vault deletion RPC exists');
select has_function('public', 'tab_two_account_data_export',
  array['uuid', 'timestamp with time zone'], 'service account data export RPC exists');
select has_function('public', 'tab_two_record_account_export_event',
  array['uuid', 'text', 'integer', 'integer', 'timestamp with time zone'],
  'service account export audit RPC exists');
select function_privs_are(
  'public', 'tab_two_account_data_export', array['uuid', 'timestamp with time zone'],
  'service_role', array['EXECUTE'], 'account export RPC is service role only');
select function_privs_are(
  'public', 'tab_two_record_account_export_event',
  array['uuid', 'text', 'integer', 'integer', 'timestamp with time zone'],
  'service_role', array['EXECUTE'], 'account export audit RPC is service role only');

insert into public.tab_two_accounts (id) values
  ('43000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002'),
  ('43000000-0000-4000-8000-000000000003');

insert into private.account_grants (account_id, source, capabilities, starts_at)
values
  ('43000000-0000-4000-8000-000000000001', 'complimentary_owner',
   array['encrypted_sync']::private.premium_capability[], '2026-09-02 12:00:00+00'),
  ('43000000-0000-4000-8000-000000000002', 'complimentary_owner',
   array['encrypted_sync']::private.premium_capability[], '2026-09-02 12:00:00+00'),
  ('43000000-0000-4000-8000-000000000003', 'complimentary_owner',
   array['encrypted_sync']::private.premium_capability[], '2026-09-02 12:00:00+00');

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '34000000-0000-4000-8000-000000000011',
   'authenticated', 'authenticated', 'export-one@example.test',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   '2026-09-02 12:00:00+00', '2026-09-02 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', '34000000-0000-4000-8000-000000000012',
   'authenticated', 'authenticated', 'export-two@example.test',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   '2026-09-02 12:00:00+00', '2026-09-02 12:00:00+00');

insert into public.tab_two_identities (
  id, account_id, auth_user_id, provider, provider_subject, email, display_name,
  created_at, updated_at
) values
  ('45000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001',
   '34000000-0000-4000-8000-000000000011', 'google', 'export-subject-one',
   'export-one@example.test', 'Export One', '2026-09-02 12:01:00+00', '2026-09-02 12:02:00+00'),
  ('45000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000002',
   '34000000-0000-4000-8000-000000000012', 'google', 'export-subject-two',
   'export-two@example.test', null, '2026-09-02 12:01:00+00', '2026-09-02 12:01:00+00');

insert into private.provider_connections (
  id, account_id, provider, provider_subject, email, display_name, status,
  granted_scopes, token_key_version, refresh_token_nonce,
  refresh_token_ciphertext, refresh_token_fingerprint, created_at, updated_at
) values (
  '46000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  'google_calendar', 'provider-secret-subject', 'calendar@example.test', 'Calendar One', 'active',
  array[
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ]::text[],
  1, repeat('N', 16), repeat('C', 64), repeat('F', 43),
  '2026-09-02 12:03:00+00', '2026-09-02 12:04:00+00'
);

insert into private.stripe_customers (account_id, customer_id, created_at, updated_at)
values (
  '43000000-0000-4000-8000-000000000001', 'cus_export_secret',
  '2026-09-02 12:00:00+00', '2026-09-02 12:00:00+00'
);
insert into private.billing_subscriptions (
  account_id, customer_id, subscription_id, plan, state,
  current_period_start, current_period_end, courtesy_end, cancel_at_period_end,
  authoritative_event_created, authoritative_event_priority, authoritative_event_id,
  outcome_code, created_at, updated_at
) values (
  '43000000-0000-4000-8000-000000000001', 'cus_export_secret', 'sub_export_secret',
  'annual', 'active', '2026-09-01 00:00:00+00', '2027-09-01 00:00:00+00', null, false,
  1788264000, 50, 'evt_export_secret', 'customer_subscription_updated',
  '2026-09-01 00:00:00+00', '2026-09-02 12:00:00+00'
);

set local role anon;
select throws_ok('select * from private.sync_vaults', '42501', null,
  'anonymous clients cannot read vault metadata');
select throws_ok('insert into private.sync_devices default values', '42501', null,
  'anonymous clients cannot insert devices');
select throws_ok('update private.sync_records set tombstone = true', '42501', null,
  'anonymous clients cannot update records');
select throws_ok('delete from private.sync_account_keys', '42501', null,
  'anonymous clients cannot delete wrapped keys');
select throws_ok(
  $$select * from public.tab_two_sync_register_device(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'Browser', now())$$,
  '42501', null, 'anonymous clients cannot execute sync RPCs');
select throws_ok(
  $$select public.tab_two_consume_sync_rate_limit(
    '43000000-0000-4000-8000-000000000001', 'pull', repeat('A', 43), now())$$,
  '42501', null, 'anonymous clients cannot consume sync rate limits');
select throws_ok(
  $$select public.tab_two_account_data_export(
    '43000000-0000-4000-8000-000000000001', now())$$,
  '42501', null, 'anonymous clients cannot export account data');
select throws_ok(
  $$select public.tab_two_record_account_export_event(
    '43000000-0000-4000-8000-000000000001', 'success', 0, 0, now())$$,
  '42501', null, 'anonymous clients cannot record export audits');

reset role;
set local role authenticated;
select throws_ok('select * from private.sync_devices', '42501', null,
  'authenticated clients cannot read even their own device rows directly');
select throws_ok('insert into private.sync_records default values', '42501', null,
  'authenticated clients cannot insert encrypted records directly');
select throws_ok('update private.sync_mutation_receipts set outcome = ''{}''::jsonb', '42501', null,
  'authenticated clients cannot update receipts');
select throws_ok('delete from private.sync_audit_events', '42501', null,
  'authenticated clients cannot delete audits');
select throws_ok(
  $$select * from public.tab_two_sync_pull_records(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 0, 0, 100)$$,
  '42501', null, 'authenticated clients cannot execute sync RPCs');
select throws_ok(
  $$select public.tab_two_account_data_export(
    '43000000-0000-4000-8000-000000000001', now())$$,
  '42501', null, 'authenticated clients cannot export account data directly');
select throws_ok(
  $$select public.tab_two_record_account_export_event(
    '43000000-0000-4000-8000-000000000001', 'success', 0, 0, now())$$,
  '42501', null, 'authenticated clients cannot record export audits');

reset role;
set local role service_role;

select ok((select bool_and(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'delete_vault',
  lpad(iteration::text, 43, 'A'), '2026-09-02 14:00:00+00'))
  from generate_series(1, 5) iteration),
  'five destructive requests enter the account window');
select isnt(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'delete_vault', repeat('Z', 43),
  '2026-09-02 14:00:01+00'), true,
  'the sixth destructive request is rejected by the account limit');
select ok((select bool_and(public.tab_two_consume_sync_rate_limit(
  case when iteration % 2 = 0
    then '43000000-0000-4000-8000-000000000001'::uuid
    else '43000000-0000-4000-8000-000000000002'::uuid end,
  'delete_account', repeat('Q', 43), '2026-09-02 14:01:00+00'))
  from generate_series(1, 5) iteration),
  'five destructive requests enter one shared IP window across accounts');
select isnt(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'delete_account', repeat('Q', 43),
  '2026-09-02 14:01:01+00'), true,
  'the sixth cross-account request is rejected by the IP limit');
select ok(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'delete_vault', repeat('Z', 43),
  '2026-09-03 14:00:01+00'),
  'a completed one-day window resets both scopes');

select ok((select bool_and(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000003', 'export_account',
  lpad(iteration::text, 43, 'E'), '2026-09-02 15:00:00+00'))
  from generate_series(1, 3) iteration),
  'three account exports enter the one-hour account window');
select isnt(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000003', 'export_account', repeat('X', 43),
  '2026-09-02 15:00:01+00'), true,
  'the fourth account export is rejected by the account limit');
select ok(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000003', 'export_account', repeat('X', 43),
  '2026-09-02 16:00:01+00'),
  'a completed one-hour export window resets both scopes');
select ok((select bool_and(public.tab_two_consume_sync_rate_limit(
  case when iteration % 2 = 0
    then '43000000-0000-4000-8000-000000000001'::uuid
    else '43000000-0000-4000-8000-000000000002'::uuid end,
  'export_account', repeat('Y', 43), '2026-09-02 17:00:00+00'))
  from generate_series(1, 3) iteration),
  'three account exports enter one shared IP window across accounts');
select isnt(public.tab_two_consume_sync_rate_limit(
  '43000000-0000-4000-8000-000000000001', 'export_account', repeat('Y', 43),
  '2026-09-02 17:00:01+00'), true,
  'the fourth cross-account export is rejected by the IP limit');

select results_eq(
  $$select device_id, state, acknowledged_vault_version
    from public.tab_two_sync_register_device(
      '43000000-0000-4000-8000-000000000001',
      'AAAAAAAAAAAAAAAAAAAAAA', 'Primary browser', '2026-09-02 14:00:00+00')$$,
  $$values ('AAAAAAAAAAAAAAAAAAAAAA'::text, 'active'::text, 0::bigint)$$,
  'the first active device is registered under an account lock');
select is(public.tab_two_sync_summary(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA') #>> '{devices,0,friendlyName}',
  'Primary browser', 'the service summary returns a bounded account-owned device view');

select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'AQEBAQEBAQEBAQEBAQEBAQ', 'Second', now())$$,
  'a second active device is allowed');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'AgICAgICAgICAgICAgICAg', 'Third', now())$$,
  'a third active device is allowed');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'AwMDAwMDAwMDAwMDAwMDAw', 'Fourth', now())$$,
  'a fourth active device is allowed');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'BAQEBAQEBAQEBAQEBAQEBA', 'Fifth', now())$$,
  'a fifth active device is allowed');
select throws_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'BQUFBQUFBQUFBQUFBQUFBQ', 'Sixth', now())$$,
  'P0001', 'sync_device_limit', 'a sixth active device is rejected');

select is(public.tab_two_sync_deactivate_device(
  '43000000-0000-4000-8000-000000000001', 'BAQEBAQEBAQEBAQEBAQEBA', now()), true,
  'the exact current device can be deactivated');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000001', 'BQUFBQUFBQUFBQUFBQUFBQ', 'Replacement', now())$$,
  'an inactive device does not consume an active slot');
select is(public.tab_two_sync_rename_device(
  '43000000-0000-4000-8000-000000000001', 'BQUFBQUFBQUFBQUFBQUFBQ', 'Replacement browser', now()), true,
  'an owned device can be renamed');
select is(public.tab_two_sync_revoke_device(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
  'AQEBAQEBAQEBAQEBAQEBAQ', now()), true,
  'one exact non-current owned device can be revoked');

select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000003', 'BwcHBwcHBwcHBwcHBwcHBw', 'Metrics browser', now())$$,
  'the metric fixture has an independent active device');
select is(public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000003', 'BwcHBwcHBwcHBwcHBwcHBw',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000021',
    'requestDigest', repeat('M', 43), 'envelopeVersion', 1,
    'entityType', 'metric_bucket',
    'entityId', '00000000-0000-4000-8000-000000000002',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
  )), now()) #>> '{0,status}', 'accepted',
  'an opaque encrypted metric bucket uses the existing optimistic mutation path');
select is((select count(*) from private.sync_records
  where account_id = '43000000-0000-4000-8000-000000000003'
    and entity_type = 'metric_bucket'
    and entity_id = '00000000-0000-4000-8000-000000000002'), 1::bigint,
  'the server stores one metric ciphertext record without a plaintext metrics table');
select throws_ok($$select public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000003', 'BwcHBwcHBwcHBwcHBwcHBw',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000022',
    'requestDigest', repeat('N', 43), 'envelopeVersion', 1,
    'entityType', 'metric_bucket', 'entityId', 'tasks:2026-09-02',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
  )), now())$$,
  '22023', 'sync_mutation_invalid',
  'a metric entity id cannot reveal its source or date');
select results_eq(
  $$select entity_type, entity_id, revision from public.tab_two_sync_pull_records(
    '43000000-0000-4000-8000-000000000003', 'BwcHBwcHBwcHBwcHBwcHBw', 0, 0, 100)$$,
  $$values ('metric_bucket'::text, '00000000-0000-4000-8000-000000000002'::text, 1::bigint)$$,
  'the account-bound pull returns only its encrypted metric record');
select throws_ok($$select * from public.tab_two_sync_pull_records(
  '43000000-0000-4000-8000-000000000001', 'BwcHBwcHBwcHBwcHBwcHBw', 0, 0, 100)$$,
  'P0001', 'sync_device_not_active',
  'a metric device cannot traverse into another account');

select is(public.tab_two_sync_store_account_key(
  '43000000-0000-4000-8000-000000000001', 1::smallint, repeat('A', 54), now()), true,
  'one versioned wrapped data key is stored');
select is(public.tab_two_sync_store_account_key(
  '43000000-0000-4000-8000-000000000001', 1::smallint, repeat('Q', 54), now()), false,
  'an existing account key is never overwritten');
select results_eq(
  $$select key_version, wrapped_dek from public.tab_two_sync_account_key(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA')$$,
  $$values (1::smallint, repeat('A', 54)::text)$$,
  'only an active owned device can acquire the wrapped key');

create temporary table first_mutation_result as
select public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000001',
  'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000001',
    'requestDigest', repeat('A', 43),
    'envelopeVersion', 1,
    'entityType', 'notes', 'entityId', 'singleton',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
  )),
  '2026-09-02 14:05:00+00'
) as outcome;

select is((select outcome #>> '{0,status}' from first_mutation_result), 'accepted',
  'the first optimistic mutation is accepted');
select is((select outcome #>> '{0,revision}' from first_mutation_result), '1',
  'the server assigns the first record revision');
select is((select outcome #>> '{0,vaultVersion}' from first_mutation_result), '1',
  'the server assigns the first vault version');
select is((select expires_at - created_at from private.sync_mutation_receipts
  where idempotency_id = '53000000-0000-4000-8000-000000000001'), interval '30 days',
  'the idempotency receipt expires after the bounded retention window');

create temporary table account_export_snapshot as
select public.tab_two_account_data_export(
  '43000000-0000-4000-8000-000000000001', '2026-09-02 14:06:00+00'
) as value;

select results_eq(
  $$select jsonb_object_keys(value) from account_export_snapshot order by 1$$,
  $$values ('account'::text), ('connectedAccounts'::text), ('devices'::text),
           ('entitlement'::text), ('subscription'::text), ('vault'::text)$$,
  'the service snapshot has only the six approved top-level keys');
select is((select value #>> '{account,accountId}' from account_export_snapshot),
  '43000000-0000-4000-8000-000000000001',
  'the export contains the exact requested account');
select is((select value #>> '{account,email}' from account_export_snapshot),
  'export-one@example.test', 'the export includes readable account identity metadata');
select is((select value #>> '{connectedAccounts,0,connectionId}' from account_export_snapshot),
  '46000000-0000-4000-8000-000000000001',
  'the export contains current provider connection metadata');
select is((select value #>> '{subscription,state}' from account_export_snapshot),
  'active', 'the export reports the current customer-visible subscription state');
select is((select value #>> '{subscription,plan}' from account_export_snapshot),
  'annual', 'the export includes the customer-visible plan without Stripe IDs');
select is((select value #>> '{vault,status}' from account_export_snapshot),
  'available', 'a vault with a current record is available');
select is((select value #>> '{vault,wrappedDataKey}' from account_export_snapshot),
  repeat('A', 54), 'the private response contains the wrapped key for Edge unwrapping');
select is((select value #>> '{vault,records,0,entityType}' from account_export_snapshot),
  'notes', 'current encrypted records are deterministically included');
select ok(position('provider-secret-subject' in (select value::text from account_export_snapshot)) = 0,
  'provider subjects are excluded from the export snapshot');
select ok(position('refresh_token_' in (select value::text from account_export_snapshot)) = 0,
  'provider token envelopes are excluded from the export snapshot');
select ok(position('customerId' in (select value::text from account_export_snapshot)) = 0,
  'Stripe customer identifiers are excluded from the export snapshot');
select ok(position('subscriptionId' in (select value::text from account_export_snapshot)) = 0,
  'Stripe subscription identifiers are excluded from the export snapshot');
select ok(position('cus_export_secret' in (select value::text from account_export_snapshot)) = 0,
  'Stripe customer values are excluded from the export snapshot');
select ok(position('sub_export_secret' in (select value::text from account_export_snapshot)) = 0,
  'Stripe subscription values are excluded from the export snapshot');
select ok(position('requestDigest' in (select value::text from account_export_snapshot)) = 0,
  'mutation receipts are excluded from the export snapshot');

select is(public.tab_two_account_data_export(
  '43000000-0000-4000-8000-000000000002', '2026-09-02 14:06:00+00'
) #>> '{vault,status}', 'not_created', 'an account without a vault gets a bounded empty state');
select is(jsonb_array_length(public.tab_two_account_data_export(
  '43000000-0000-4000-8000-000000000002', '2026-09-02 14:06:00+00'
) #> '{vault,records}'), 0, 'the no-vault snapshot contains no records');
select is(public.tab_two_account_data_export(
  '43000000-0000-4000-8000-000000000002', '2026-09-02 14:06:00+00'
) #> '{vault,wrappedDataKey}', 'null'::jsonb, 'the no-vault snapshot contains no key');
select is(public.tab_two_account_data_export(
  '43000000-0000-4000-8000-000000000099', '2026-09-02 14:06:00+00'
), null::jsonb, 'an unknown account returns no snapshot');

select lives_ok($$select public.tab_two_record_account_export_event(
  '43000000-0000-4000-8000-000000000001', 'success', 1, 2048,
  '2026-09-02 14:06:00+00')$$, 'a bounded export audit can be recorded');
select is((select details from private.sync_audit_events
  where account_id = '43000000-0000-4000-8000-000000000001'
    and event_type = 'account_export'),
  '{"outcome":"success","recordCount":1,"byteCount":2048}'::jsonb,
  'the export audit stores only outcome and size metadata');
select throws_ok($$select public.tab_two_record_account_export_event(
  '43000000-0000-4000-8000-000000000001', 'raw_key_failed', 1, 0, now())$$,
  '22023', 'account_export_audit_invalid', 'unknown audit outcomes fail closed');
select throws_ok($$select public.tab_two_record_account_export_event(
  '43000000-0000-4000-8000-000000000001', 'success', -1, 0, now())$$,
  '22023', 'account_export_audit_invalid', 'negative audit counts fail closed');

select is(
  public.tab_two_sync_apply_mutations(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
    jsonb_build_array(jsonb_build_object(
      'idempotencyId', '53000000-0000-4000-8000-000000000001',
      'requestDigest', repeat('A', 43),
      'envelopeVersion', 1,
      'entityType', 'notes', 'entityId', 'singleton',
      'expectedRevision', 0, 'revision', 1, 'tombstone', false,
      'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
    )), now()),
  (select outcome from first_mutation_result),
  'an identical idempotency retry returns the original result');
select is((select vault_version from private.sync_vaults
  where account_id = '43000000-0000-4000-8000-000000000001'), 1::bigint,
  'an idempotent retry cannot increment the vault twice');
select throws_ok($$select public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000001',
    'requestDigest', repeat('Q', 43),
    'envelopeVersion', 1,
    'entityType', 'notes', 'entityId', 'singleton',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64))), now())$$,
  'P0001', 'sync_idempotency_mismatch', 'an id cannot be reused with another digest');

select is(
  public.tab_two_sync_apply_mutations(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
    jsonb_build_array(jsonb_build_object(
      'idempotencyId', '53000000-0000-4000-8000-000000000002',
      'requestDigest', repeat('g', 43),
      'envelopeVersion', 1,
      'entityType', 'notes', 'entityId', 'singleton',
      'expectedRevision', 0, 'revision', 1, 'tombstone', false,
      'nonce', repeat('A', 16), 'ciphertext', repeat('Q', 64)
    )), now()) #>> '{0,status}',
  'stale', 'a stale write returns the encrypted authoritative winner');

select results_eq(
  $$select entity_type, entity_id, revision from public.tab_two_sync_pull_records(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 0, 0, 100)$$,
  $$values ('notes'::text, 'singleton'::text, 1::bigint)$$,
  'a bounded conditional pull returns only the account ciphertext record');

select is(public.tab_two_sync_acknowledge_pull(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 1, now()), true,
  'the device acknowledges only an applied vault version');

select throws_ok($$select * from public.tab_two_sync_account_key(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA')$$,
  'P0001', 'sync_device_not_active', 'a device id cannot traverse accounts');

select throws_ok(
  $$select public.tab_two_sync_apply_mutations(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
    (select jsonb_agg('{}'::jsonb) from generate_series(1, 51)), now())$$,
  '22023', 'sync_mutation_count_invalid', 'a push cannot exceed 50 mutations');
select throws_ok(
  $$select public.tab_two_sync_apply_mutations(
    '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA',
    jsonb_build_array(jsonb_build_object(
      'idempotencyId', '53000000-0000-4000-8000-000000000099',
      'requestDigest', repeat('A', 43), 'envelopeVersion', 1,
      'entityType', 'notes', 'entityId', 'singleton',
      'expectedRevision', 1, 'revision', 2, 'tombstone', false,
      'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64),
      'plaintext', 'must never be accepted'
    )), now())$$,
  '22023', 'sync_mutation_invalid', 'an envelope with an extra plaintext field is rejected');

select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA', 'Primary B', now())$$,
  'the second account has an independent primary device');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000002', 'AQEBAQEBAQEBAQEBAQEBAQ', 'Inactive B', now())$$,
  'the second account has an acknowledgement blocker');
select lives_ok($$select * from public.tab_two_sync_register_device(
  '43000000-0000-4000-8000-000000000002', 'AgICAgICAgICAgICAgICAg', 'Revoked B', now())$$,
  'the second account has a device that will be revoked');
select is(public.tab_two_sync_revoke_device(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA',
  'AgICAgICAgICAgICAgICAg', now()), true, 'the tombstone fixture revokes its third device');

select is(public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000010',
    'requestDigest', repeat('A', 43), 'envelopeVersion', 1,
    'entityType', 'notes', 'entityId', 'singleton',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
  )), now()) #>> '{0,status}', 'accepted', 'the tombstone fixture creates a live record');
select is(public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000011',
    'requestDigest', repeat('Q', 43), 'envelopeVersion', 1,
    'entityType', 'notes', 'entityId', 'singleton',
    'expectedRevision', 1, 'revision', 2, 'tombstone', true,
    'nonce', repeat('Q', 16), 'ciphertext', repeat('Q', 64)
  )), now()) #>> '{0,status}', 'accepted', 'deletion is an optimistic tombstone mutation');
select ok(public.tab_two_sync_acknowledge_pull(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA', 2, now()),
  'the primary device acknowledges the tombstone');
select is(public.tab_two_sync_compact_tombstones(
  '43000000-0000-4000-8000-000000000002', now()), 0::bigint,
  'one unacknowledged active device blocks tombstone compaction');
select ok(public.tab_two_sync_deactivate_device(
  '43000000-0000-4000-8000-000000000002', 'AQEBAQEBAQEBAQEBAQEBAQ', now()),
  'the unacknowledged device becomes inactive');
select is(public.tab_two_sync_compact_tombstones(
  '43000000-0000-4000-8000-000000000002', now()), 1::bigint,
  'inactive and revoked devices do not block acknowledged tombstone compaction');

update private.sync_vaults
set encoded_size = 2097152 - private.sync_record_stored_size(
  'settings', 'singleton', repeat('A', 16), repeat('A', 64), 'AAAAAAAAAAAAAAAAAAAAAA')
where account_id = '43000000-0000-4000-8000-000000000002';
select is(public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000012',
    'requestDigest', repeat('g', 43), 'envelopeVersion', 1,
    'entityType', 'settings', 'entityId', 'singleton',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 64)
  )), now()) #>> '{0,status}', 'accepted', 'the exact 2,097,152-byte boundary is accepted');
select is((select encoded_size from private.sync_vaults
  where account_id = '43000000-0000-4000-8000-000000000002'), 2097152::bigint,
  'the exact vault boundary is accounted without rounding');
select is(public.tab_two_sync_apply_mutations(
  '43000000-0000-4000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA',
  jsonb_build_array(jsonb_build_object(
    'idempotencyId', '53000000-0000-4000-8000-000000000013',
    'requestDigest', repeat('w', 43), 'envelopeVersion', 1,
    'entityType', 'timer_config', 'entityId', 'singleton',
    'expectedRevision', 0, 'revision', 1, 'tombstone', false,
    'nonce', repeat('A', 16), 'ciphertext', repeat('A', 22)
  )), now()) #>> '{0,status}', 'quota', 'the next persistent record is rejected at the boundary');
select is((select count(*) from private.sync_records
  where account_id = '43000000-0000-4000-8000-000000000002'
    and entity_type = 'timer_config'), 0::bigint, 'a quota rejection stores no ciphertext record');

update private.account_grants set expires_at = '2026-09-02 13:00:00+00'
where account_id = '43000000-0000-4000-8000-000000000001';
select is((select count(*) from private.sync_records
  where account_id = '43000000-0000-4000-8000-000000000001'), 1::bigint,
  'entitlement expiry retains encrypted records');

select is(public.tab_two_sync_delete_vault(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'operator-confirmed', now()), true,
  'vault deletion removes sync state idempotently');
select is((select count(*) from private.sync_records
  where account_id = '43000000-0000-4000-8000-000000000001'), 0::bigint,
  'vault deletion removes ciphertext');
select is((select count(*) from private.account_grants
  where account_id = '43000000-0000-4000-8000-000000000001'), 1::bigint,
  'vault deletion preserves account grants');
select ok(public.tab_two_sync_delete_vault(
  '43000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'operator-confirmed', now()),
  'vault deletion retry has one stable completed outcome');

reset role;
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '34000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'delete-fixture@example.test', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now()
);
insert into public.tab_two_accounts (id) values ('44000000-0000-4000-8000-000000000001');
insert into public.tab_two_identities (
  account_id, auth_user_id, provider, provider_subject, email
) values (
  '44000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001',
  'google', 'delete-fixture-subject', 'delete-fixture@example.test'
);
insert into private.account_grants (account_id, source, capabilities, starts_at) values (
  '44000000-0000-4000-8000-000000000001', 'complimentary_owner',
  array['encrypted_sync']::private.premium_capability[], now()
);
set local role service_role;
select lives_ok($$select * from public.tab_two_sync_register_device(
  '44000000-0000-4000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'Delete fixture', now())$$,
  'the destructive saga uses a dedicated disposable account');
select ok(public.tab_two_consume_sync_rate_limit(
  '44000000-0000-4000-8000-000000000001', 'delete_account', repeat('D', 43), now()),
  'the destructive saga records its account and IP abuse limits');

create temporary table deletion_operation as
select public.tab_two_begin_account_deletion(
  '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001', now()
) as value;
select is((select value ->> 'state' from deletion_operation), 'pending_stripe',
  'account deletion first persists its retryable pending marker');
select isnt((select deleted_at from public.tab_two_accounts
  where id = '44000000-0000-4000-8000-000000000001'), null::timestamptz,
  'the pending marker blocks new account and sync work');
select is(public.tab_two_mark_deletion_stripe_canceled(
  ((select value ->> 'operationId' from deletion_operation))::uuid, now()) ->> 'state',
  'stripe_canceled', 'the saga records completed external billing work before data deletion');
select is(public.tab_two_delete_account_data(
  ((select value ->> 'operationId' from deletion_operation))::uuid, now()) ->> 'state',
  'data_deleted', 'account-scoped data deletion is one resumable database step');
select is((select count(*) from public.tab_two_identities
  where account_id = '44000000-0000-4000-8000-000000000001'), 0::bigint,
  'the data step removes the provider identity');
select is((select count(*) from private.account_grants
  where account_id = '44000000-0000-4000-8000-000000000001'), 0::bigint,
  'the data step revokes and removes grants');
select is((select count(*) from private.sync_vaults
  where account_id = '44000000-0000-4000-8000-000000000001'), 0::bigint,
  'the data step removes the encrypted vault');
select ok(public.tab_two_complete_account_deletion(
  ((select value ->> 'operationId' from deletion_operation))::uuid, now()),
  'the auth deletion completion marker is idempotent');
select is((select count(*) from private.sync_rate_limits
  where scope_type = 'account' and scope_key = '44000000-0000-4000-8000-000000000001'),
  0::bigint, 'the final completion marker removes account-scoped abuse metadata');
select is(public.tab_two_account_deletion_for_auth(
  '34000000-0000-4000-8000-000000000001') ->> 'state', 'completed',
  'the minimum completion tombstone remains available for retry reconciliation');
select is(public.tab_two_apply_stripe_billing_snapshot(
  '44000000-0000-4000-8000-000000000001', 'cus_deleted_fixture',
  'sub_deleted_fixture', 'cs_test_deleted_fixture', 'annual', 'expired',
  null, null, false, 1788360000, 90, 'evt_deleted_fixture',
  'customer_subscription_deleted', now(), null),
  'account_deleted',
  'a verified late Stripe cancellation webhook resolves against the deletion tombstone');

select * from finish();
rollback;
