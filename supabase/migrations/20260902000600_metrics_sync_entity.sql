alter table private.sync_records
  drop constraint sync_record_type_known;

alter table private.sync_records
  add constraint sync_record_type_known check (entity_type in (
    'settings', 'focus', 'todo_list', 'quick_link', 'timer_config', 'location',
    'notes', 'world_clock', 'countdown', 'legacy_layout', 'layout_manifest',
    'named_layout', 'calendar_preference', 'calendar_week_start',
    'connector_preference', 'habit', 'habit_completion', 'progress_goal',
    'metric_bucket'
  ));

-- The optimistic mutation RPC validates the same closed vocabulary before it
-- touches the table. Replacing only this private implementation preserves the
-- existing public wrapper, grants, RLS, receipt, quota, and revision contract.
create or replace function private.apply_sync_mutations(
  target_account_id uuid,
  target_device_id text,
  mutations jsonb,
  effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  mutation jsonb;
  mutation_count integer;
  idempotency_id uuid;
  request_digest text;
  entity_type text;
  entity_id text;
  expected_revision bigint;
  proposed_revision bigint;
  tombstone boolean;
  nonce text;
  ciphertext text;
  receipt_digest text;
  receipt_outcome jsonb;
  existing_record private.sync_records%rowtype;
  current_revision bigint;
  old_size integer;
  new_size integer;
  next_total bigint;
  next_vault_version bigint;
  vault private.sync_vaults%rowtype;
  outcome jsonb;
  outcomes jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(mutations) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'sync_mutations_invalid';
  end if;
  mutation_count := jsonb_array_length(mutations);
  if mutation_count not between 1 and 50 or effective_at is null then
    raise exception using errcode = '22023', message = 'sync_mutation_count_invalid';
  end if;
  perform private.require_active_sync_device(target_account_id, target_device_id);
  select * into strict vault from private.sync_vaults
  where account_id = target_account_id for update;
  delete from private.sync_mutation_receipts receipt
  where receipt.account_id = target_account_id and receipt.expires_at <= effective_at;

  for mutation in select value from jsonb_array_elements(mutations)
  loop
    if jsonb_typeof(mutation) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(mutation)) <> 10 then
      raise exception using errcode = '22023', message = 'sync_mutation_invalid';
    end if;
    if not (mutation ?& array[
      'idempotencyId', 'requestDigest', 'entityType', 'entityId', 'expectedRevision',
      'revision', 'tombstone', 'nonce', 'ciphertext', 'envelopeVersion'
    ]) then
      raise exception using errcode = '22023', message = 'sync_mutation_invalid';
    end if;
    if jsonb_typeof(mutation -> 'idempotencyId') is distinct from 'string'
      or jsonb_typeof(mutation -> 'requestDigest') is distinct from 'string'
      or jsonb_typeof(mutation -> 'entityType') is distinct from 'string'
      or jsonb_typeof(mutation -> 'entityId') is distinct from 'string'
      or jsonb_typeof(mutation -> 'expectedRevision') is distinct from 'number'
      or jsonb_typeof(mutation -> 'revision') is distinct from 'number'
      or jsonb_typeof(mutation -> 'tombstone') is distinct from 'boolean'
      or jsonb_typeof(mutation -> 'nonce') is distinct from 'string'
      or jsonb_typeof(mutation -> 'ciphertext') is distinct from 'string'
      or jsonb_typeof(mutation -> 'envelopeVersion') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'sync_mutation_invalid';
    end if;

    begin
      idempotency_id := (mutation ->> 'idempotencyId')::uuid;
      expected_revision := (mutation ->> 'expectedRevision')::bigint;
      proposed_revision := (mutation ->> 'revision')::bigint;
      tombstone := (mutation ->> 'tombstone')::boolean;
    exception when others then
      raise exception using errcode = '22023', message = 'sync_mutation_invalid';
    end;
    request_digest := mutation ->> 'requestDigest';
    entity_type := mutation ->> 'entityType';
    entity_id := mutation ->> 'entityId';
    nonce := mutation ->> 'nonce';
    ciphertext := mutation ->> 'ciphertext';

    if (mutation ->> 'envelopeVersion')::integer <> 1
      or request_digest is null or length(request_digest) <> 43 or request_digest !~ '^[A-Za-z0-9_-]+$'
      or entity_type not in (
        'settings', 'focus', 'todo_list', 'quick_link', 'timer_config', 'location',
        'notes', 'world_clock', 'countdown', 'legacy_layout', 'layout_manifest',
        'named_layout', 'calendar_preference', 'calendar_week_start',
        'connector_preference', 'habit', 'habit_completion', 'progress_goal',
        'metric_bucket'
      )
      or entity_id is null or length(entity_id) not between 1 and 256
      or entity_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]*$'
      or (entity_type = 'metric_bucket' and entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or expected_revision < 0 or proposed_revision <> expected_revision + 1
      or nonce is null or length(nonce) <> 16 or nonce !~ '^[A-Za-z0-9_-]+$'
      or ciphertext is null or length(ciphertext) not between 22 and 262144
      or ciphertext !~ '^[A-Za-z0-9_-]+$'
      or private.sync_record_stored_size(
        entity_type, entity_id, nonce, ciphertext, target_device_id) > 262144 then
      raise exception using errcode = '22023', message = 'sync_mutation_invalid';
    end if;

    select receipt.request_digest, receipt.outcome
      into receipt_digest, receipt_outcome
    from private.sync_mutation_receipts receipt
    where receipt.account_id = target_account_id
      and receipt.device_id = target_device_id
      and receipt.idempotency_id = idempotency_id
      and receipt.expires_at > effective_at
    for update;
    if found then
      if receipt_digest is distinct from request_digest then
        raise exception using errcode = 'P0001', message = 'sync_idempotency_mismatch';
      end if;
      outcomes := outcomes || jsonb_build_array(receipt_outcome);
      continue;
    end if;

    select * into existing_record from private.sync_records record
    where record.account_id = target_account_id
      and record.entity_type = entity_type and record.entity_id = entity_id
    for update;
    current_revision := case when found then existing_record.revision else 0 end;

    if expected_revision <> current_revision then
      outcome := jsonb_build_object(
        'status', 'stale',
        'entityType', entity_type,
        'entityId', entity_id,
        'revision', current_revision,
        'winner', case when current_revision = 0 then null else jsonb_build_object(
          'envelopeVersion', 1,
          'entityType', existing_record.entity_type,
          'entityId', existing_record.entity_id,
          'revision', existing_record.revision,
          'vaultVersion', existing_record.vault_version,
          'tombstone', existing_record.tombstone,
          'nonce', existing_record.nonce,
          'ciphertext', existing_record.ciphertext
        ) end
      );
    else
      old_size := case when current_revision = 0 then 0 else existing_record.stored_size end;
      new_size := private.sync_record_stored_size(
        entity_type, entity_id, nonce, ciphertext, target_device_id);
      next_total := vault.encoded_size - old_size + new_size;
      if next_total > 2097152 then
        outcome := jsonb_build_object(
          'status', 'quota', 'entityType', entity_type, 'entityId', entity_id,
          'encodedSize', vault.encoded_size, 'limit', 2097152
        );
      else
        next_vault_version := vault.vault_version + 1;
        insert into private.sync_records (
          account_id, entity_type, entity_id, revision, vault_version, tombstone,
          nonce, ciphertext, creating_device_id, accepted_at
        ) values (
          target_account_id, entity_type, entity_id, proposed_revision,
          next_vault_version, tombstone, nonce, ciphertext, target_device_id, effective_at
        )
        on conflict on constraint sync_records_pkey do update
        set revision = excluded.revision,
            vault_version = excluded.vault_version,
            tombstone = excluded.tombstone,
            nonce = excluded.nonce,
            ciphertext = excluded.ciphertext,
            creating_device_id = excluded.creating_device_id,
            accepted_at = excluded.accepted_at;

        update private.sync_vaults
        set vault_version = next_vault_version,
            encoded_size = next_total,
            updated_at = effective_at
        where account_id = target_account_id;
        vault.vault_version := next_vault_version;
        vault.encoded_size := next_total;
        outcome := jsonb_build_object(
          'status', 'accepted', 'entityType', entity_type, 'entityId', entity_id,
          'revision', proposed_revision, 'vaultVersion', next_vault_version
        );
      end if;
    end if;

    insert into private.sync_mutation_receipts (
      account_id, device_id, idempotency_id, request_digest, outcome, created_at, expires_at
    ) values (
      target_account_id, target_device_id, idempotency_id, request_digest, outcome,
      effective_at, effective_at + interval '30 days'
    );
    outcomes := outcomes || jsonb_build_array(outcome);
  end loop;

  update private.sync_devices set last_seen_at = effective_at
  where account_id = target_account_id and device_id = target_device_id;
  return outcomes;
end;
$$;
