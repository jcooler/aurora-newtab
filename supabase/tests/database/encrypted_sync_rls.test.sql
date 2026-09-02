begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select has_table('private', 'sync_vaults', 'encrypted vault totals are private');
select has_table('private', 'sync_account_keys', 'wrapped account keys are private');
select has_table('private', 'sync_devices', 'sync device registry is private');
select has_table('private', 'sync_records', 'encrypted records are private');
select has_table('private', 'sync_mutation_receipts', 'idempotency receipts are private');
select has_table('private', 'sync_audit_events', 'sync audit events are private');

select hasnt_column('private', 'sync_records', 'value', 'record storage has no plaintext value');
select hasnt_column('private', 'sync_records', 'plaintext', 'record storage has no plaintext field');
select hasnt_column('private', 'sync_account_keys', 'raw_dek', 'key storage has no raw data key');
select hasnt_column('private', 'sync_devices', 'email', 'device storage has no user email');
select hasnt_column('private', 'sync_devices', 'session', 'device storage has no auth session');
select hasnt_column('private', 'sync_mutation_receipts', 'raw_request', 'receipts have no raw requests');

select has_function('public', 'tab_two_sync_register_device',
  array['uuid', 'text', 'text', 'timestamp with time zone'], 'service device registration RPC exists');
select has_function('public', 'tab_two_sync_account_key',
  array['uuid', 'text'], 'service wrapped-key acquisition RPC exists');
select has_function('public', 'tab_two_sync_summary',
  array['uuid', 'text'], 'service device and vault summary RPC exists');
select has_function('public', 'tab_two_sync_apply_mutations',
  array['uuid', 'text', 'jsonb', 'timestamp with time zone'], 'service optimistic mutation RPC exists');
select has_function('public', 'tab_two_sync_pull_records',
  array['uuid', 'text', 'bigint', 'bigint', 'integer'], 'service bounded pull RPC exists');
select has_function('public', 'tab_two_sync_acknowledge_pull',
  array['uuid', 'text', 'bigint', 'timestamp with time zone'], 'service acknowledgement RPC exists');
select has_function('public', 'tab_two_sync_compact_tombstones',
  array['uuid', 'timestamp with time zone'], 'service tombstone compaction RPC exists');
select has_function('public', 'tab_two_sync_delete_vault',
  array['uuid', 'text', 'timestamp with time zone'], 'service vault deletion RPC exists');

insert into public.tab_two_accounts (id) values
  ('43000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002');

insert into private.account_grants (account_id, source, capabilities, starts_at)
values
  ('43000000-0000-4000-8000-000000000001', 'complimentary_owner',
   array['encrypted_sync']::private.premium_capability[], '2026-09-02 12:00:00+00'),
  ('43000000-0000-4000-8000-000000000002', 'complimentary_owner',
   array['encrypted_sync']::private.premium_capability[], '2026-09-02 12:00:00+00');

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

reset role;
set local role service_role;

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
  '43000000-0000-4000-8000-000000000001', 'operator-confirmed', now()), true,
  'vault deletion removes sync state idempotently');
select is((select count(*) from private.sync_records
  where account_id = '43000000-0000-4000-8000-000000000001'), 0::bigint,
  'vault deletion removes ciphertext');
select is((select count(*) from private.account_grants
  where account_id = '43000000-0000-4000-8000-000000000001'), 1::bigint,
  'vault deletion preserves account grants');
select ok(public.tab_two_sync_delete_vault(
  '43000000-0000-4000-8000-000000000001', 'operator-confirmed', now()),
  'vault deletion retry has one stable completed outcome');

select * from finish();
rollback;
