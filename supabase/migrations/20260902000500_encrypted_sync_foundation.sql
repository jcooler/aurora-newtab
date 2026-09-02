create type private.sync_device_state as enum ('active', 'inactive', 'revoked');

create table private.sync_vaults (
  account_id uuid primary key references public.tab_two_accounts(id) on delete cascade,
  vault_version bigint not null default 0,
  encoded_size bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_vault_version_nonnegative check (vault_version >= 0),
  constraint sync_vault_size_bounded check (encoded_size between 0 and 2097152)
);

create table private.sync_account_keys (
  account_id uuid primary key references private.sync_vaults(account_id) on delete cascade,
  key_version smallint not null,
  wrapped_dek text not null,
  created_at timestamptz not null default now(),
  constraint sync_account_key_version_v1 check (key_version = 1),
  constraint sync_account_key_wrapped_shape
    check (length(wrapped_dek) = 54 and wrapped_dek ~ '^[A-Za-z0-9_-]+$')
);

create table private.sync_devices (
  account_id uuid not null references private.sync_vaults(account_id) on delete cascade,
  device_id text not null,
  friendly_name text not null,
  state private.sync_device_state not null default 'active',
  acknowledged_vault_version bigint not null default 0,
  registered_at timestamptz not null,
  last_seen_at timestamptz not null,
  deactivated_at timestamptz,
  revoked_at timestamptz,
  primary key (account_id, device_id),
  constraint sync_device_id_shape check (length(device_id) = 22 and device_id ~ '^[A-Za-z0-9_-]+$'),
  constraint sync_device_name_bounded check (
    char_length(friendly_name) between 1 and 48
    and friendly_name = btrim(friendly_name)
    and friendly_name !~ '[[:cntrl:]]'
  ),
  constraint sync_device_ack_nonnegative check (acknowledged_vault_version >= 0),
  constraint sync_device_deactivated_order check (deactivated_at is null or deactivated_at >= registered_at),
  constraint sync_device_revoked_order check (revoked_at is null or revoked_at >= registered_at)
);

create table private.sync_records (
  account_id uuid not null references private.sync_vaults(account_id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  revision bigint not null,
  vault_version bigint not null,
  tombstone boolean not null,
  nonce text not null,
  ciphertext text not null,
  creating_device_id text not null,
  accepted_at timestamptz not null,
  stored_size integer generated always as (
    octet_length(entity_type) + octet_length(entity_id) + octet_length(nonce)
    + octet_length(ciphertext) + octet_length(creating_device_id) + 41
  ) stored,
  primary key (account_id, entity_type, entity_id),
  unique (account_id, vault_version),
  foreign key (account_id, creating_device_id)
    references private.sync_devices(account_id, device_id) on delete restrict,
  constraint sync_record_type_known check (entity_type in (
    'settings', 'focus', 'todo_list', 'quick_link', 'timer_config', 'location',
    'notes', 'world_clock', 'countdown', 'legacy_layout', 'layout_manifest',
    'named_layout', 'calendar_preference', 'calendar_week_start',
    'connector_preference', 'habit', 'habit_completion', 'progress_goal'
  )),
  constraint sync_record_entity_id_bounded check (
    length(entity_id) between 1 and 256 and entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]*$'
  ),
  constraint sync_record_revision_positive check (revision > 0),
  constraint sync_record_vault_version_positive check (vault_version > 0),
  constraint sync_record_nonce_shape check (length(nonce) = 16 and nonce ~ '^[A-Za-z0-9_-]+$'),
  constraint sync_record_ciphertext_bounded check (
    length(ciphertext) between 22 and 262144 and ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint sync_record_page_size_bounded check (stored_size <= 262144)
);

create index sync_records_pull_order
  on private.sync_records (account_id, vault_version, entity_type, entity_id);

create table private.sync_mutation_receipts (
  account_id uuid not null,
  device_id text not null,
  idempotency_id uuid not null,
  request_digest text not null,
  outcome jsonb not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (account_id, device_id, idempotency_id),
  foreign key (account_id, device_id)
    references private.sync_devices(account_id, device_id) on delete cascade,
  constraint sync_receipt_digest_shape
    check (length(request_digest) = 43 and request_digest ~ '^[A-Za-z0-9_-]+$'),
  constraint sync_receipt_outcome_object check (jsonb_typeof(outcome) = 'object'),
  constraint sync_receipt_outcome_bounded check (octet_length(outcome::text) <= 524288),
  constraint sync_receipt_expiry_order check (expires_at > created_at)
);

create index sync_mutation_receipts_expiry
  on private.sync_mutation_receipts (expires_at);

create table private.sync_rate_limits (
  scope_type text not null,
  scope_key text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  expires_at timestamptz not null,
  primary key (scope_type, scope_key, action),
  constraint sync_rate_scope_type_known check (scope_type in ('account', 'ip')),
  constraint sync_rate_scope_key_bounded check (length(scope_key) between 1 and 64),
  constraint sync_rate_action_known check (action in (
    'bootstrap', 'pull', 'push', 'rename', 'deactivate', 'revoke',
    'delete_vault', 'delete_account'
  )),
  constraint sync_rate_count_positive check (request_count > 0),
  constraint sync_rate_expiry_order check (expires_at > window_started_at)
);

create index sync_rate_limits_expiry on private.sync_rate_limits (expires_at);

create table private.sync_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  device_id text,
  event_type text not null,
  occurred_at timestamptz not null,
  details jsonb not null default '{}'::jsonb,
  constraint sync_audit_type_present check (length(btrim(event_type)) between 1 and 80),
  constraint sync_audit_details_object check (jsonb_typeof(details) = 'object'),
  constraint sync_audit_details_bounded check (octet_length(details::text) <= 4096)
);

create unique index sync_audit_one_vault_deletion
  on private.sync_audit_events (account_id, event_type)
  where event_type = 'vault_deleted';

create table private.account_deletion_operations (
  operation_id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.tab_two_accounts(id) on delete cascade,
  auth_user_id uuid not null unique,
  state text not null,
  subscription_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint account_deletion_state_known check (
    state in ('pending_stripe', 'stripe_canceled', 'data_deleted', 'completed')
  ),
  constraint account_deletion_subscription_shape check (
    subscription_id is null or subscription_id ~ '^sub_[A-Za-z0-9_]+$'
  )
);

alter table private.sync_vaults enable row level security;
alter table private.sync_account_keys enable row level security;
alter table private.sync_devices enable row level security;
alter table private.sync_records enable row level security;
alter table private.sync_mutation_receipts enable row level security;
alter table private.sync_rate_limits enable row level security;
alter table private.sync_audit_events enable row level security;
alter table private.account_deletion_operations enable row level security;

revoke all on table private.sync_vaults from public, anon, authenticated;
revoke all on table private.sync_account_keys from public, anon, authenticated;
revoke all on table private.sync_devices from public, anon, authenticated;
revoke all on table private.sync_records from public, anon, authenticated;
revoke all on table private.sync_mutation_receipts from public, anon, authenticated;
revoke all on table private.sync_rate_limits from public, anon, authenticated;
revoke all on table private.sync_audit_events from public, anon, authenticated;
revoke all on table private.account_deletion_operations from public, anon, authenticated;
grant select, insert, update, delete on table private.sync_vaults to service_role;
grant select, insert, update, delete on table private.sync_account_keys to service_role;
grant select, insert, update, delete on table private.sync_devices to service_role;
grant select, insert, update, delete on table private.sync_records to service_role;
grant select, insert, update, delete on table private.sync_mutation_receipts to service_role;
grant select, insert, update, delete on table private.sync_rate_limits to service_role;
grant select, insert, update, delete on table private.sync_audit_events to service_role;
grant select, insert, update, delete on table private.account_deletion_operations to service_role;

create or replace function private.require_active_sync_device(
  target_account_id uuid,
  target_device_id text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.sync_devices device
    where device.account_id = target_account_id
      and device.device_id = target_device_id
      and device.state = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'sync_device_not_active';
  end if;
end;
$$;

create or replace function private.consume_sync_rate_scope(
  target_scope_type text,
  target_scope_key text,
  target_action text,
  effective_at timestamptz,
  window_seconds integer,
  maximum_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_count integer;
begin
  if target_scope_type not in ('account', 'ip')
    or target_scope_key is null or length(target_scope_key) not between 1 and 64
    or target_action not in (
      'bootstrap', 'pull', 'push', 'rename', 'deactivate', 'revoke',
      'delete_vault', 'delete_account'
    )
    or effective_at is null
    or window_seconds not between 1 and 86400
    or maximum_requests not between 1 and 120 then
    raise exception using errcode = '22023', message = 'sync_rate_limit_invalid';
  end if;

  insert into private.sync_rate_limits as rate_limit (
    scope_type, scope_key, action, window_started_at, request_count, expires_at
  ) values (
    target_scope_type, target_scope_key, target_action, effective_at, 1,
    effective_at + make_interval(secs => window_seconds)
  )
  on conflict (scope_type, scope_key, action) do update
  set window_started_at = case
        when rate_limit.expires_at <= effective_at then effective_at
        else rate_limit.window_started_at
      end,
      request_count = case
        when rate_limit.expires_at <= effective_at then 1
        else least(rate_limit.request_count + 1, maximum_requests + 1)
      end,
      expires_at = case
        when rate_limit.expires_at <= effective_at
          then effective_at + make_interval(secs => window_seconds)
        else rate_limit.expires_at
      end
  returning request_count into resulting_count;

  return resulting_count <= maximum_requests;
end;
$$;

create or replace function private.consume_sync_rate_limit(
  target_account_id uuid,
  target_action text,
  target_ip_fingerprint text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_seconds integer;
  maximum_requests integer;
  account_allowed boolean;
  ip_allowed boolean;
begin
  if target_account_id is null
    or target_ip_fingerprint is null
    or length(target_ip_fingerprint) <> 43
    or target_ip_fingerprint !~ '^[A-Za-z0-9_-]+$'
    or effective_at is null then
    raise exception using errcode = '22023', message = 'sync_rate_limit_invalid';
  end if;

  perform 1 from public.tab_two_accounts account where account.id = target_account_id;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;

  case target_action
    when 'bootstrap' then window_seconds := 600; maximum_requests := 10;
    when 'pull' then window_seconds := 600; maximum_requests := 120;
    when 'push' then window_seconds := 600; maximum_requests := 120;
    when 'rename' then window_seconds := 600; maximum_requests := 20;
    when 'deactivate' then window_seconds := 600; maximum_requests := 20;
    when 'revoke' then window_seconds := 600; maximum_requests := 20;
    when 'delete_vault' then window_seconds := 86400; maximum_requests := 5;
    when 'delete_account' then window_seconds := 86400; maximum_requests := 5;
    else raise exception using errcode = '22023', message = 'sync_rate_limit_invalid';
  end case;

  account_allowed := private.consume_sync_rate_scope(
    'account', target_account_id::text, target_action, effective_at,
    window_seconds, maximum_requests
  );
  ip_allowed := private.consume_sync_rate_scope(
    'ip', target_ip_fingerprint, target_action, effective_at,
    window_seconds, maximum_requests
  );
  return account_allowed and ip_allowed;
end;
$$;

create or replace function private.register_sync_device(
  target_account_id uuid,
  target_device_id text,
  target_friendly_name text,
  effective_at timestamptz
)
returns table (device_id text, state text, acknowledged_vault_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_state private.sync_device_state;
  active_count integer;
begin
  if target_account_id is null
    or target_device_id is null
    or length(target_device_id) <> 22
    or target_device_id !~ '^[A-Za-z0-9_-]+$'
    or target_friendly_name is null
    or char_length(target_friendly_name) not between 1 and 48
    or target_friendly_name is distinct from btrim(target_friendly_name)
    or target_friendly_name ~ '[[:cntrl:]]'
    or effective_at is null then
    raise exception using errcode = '22023', message = 'sync_device_invalid';
  end if;

  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;

  insert into private.sync_vaults (account_id, created_at, updated_at)
  values (target_account_id, effective_at, effective_at)
  on conflict (account_id) do nothing;

  select device.state into existing_state
  from private.sync_devices device
  where device.account_id = target_account_id and device.device_id = target_device_id
  for update;

  if existing_state = 'revoked' then
    raise exception using errcode = 'P0001', message = 'sync_device_revoked';
  end if;
  if existing_state is distinct from 'active' then
    select count(*) into active_count from private.sync_devices device
    where device.account_id = target_account_id and device.state = 'active';
    if active_count >= 5 then
      raise exception using errcode = 'P0001', message = 'sync_device_limit';
    end if;
  end if;

  insert into private.sync_devices (
    account_id, device_id, friendly_name, state, acknowledged_vault_version,
    registered_at, last_seen_at, deactivated_at, revoked_at
  ) values (
    target_account_id, target_device_id, target_friendly_name, 'active', 0,
    effective_at, effective_at, null, null
  )
  on conflict on constraint sync_devices_pkey do update
  set friendly_name = excluded.friendly_name,
      state = 'active',
      last_seen_at = excluded.last_seen_at,
      deactivated_at = null;

  insert into private.sync_audit_events (account_id, device_id, event_type, occurred_at)
  values (target_account_id, target_device_id,
    case when existing_state is null then 'device_registered' else 'device_reactivated' end,
    effective_at);

  return query
  select device.device_id, device.state::text, device.acknowledged_vault_version
  from private.sync_devices device
  where device.account_id = target_account_id and device.device_id = target_device_id;
end;
$$;

create or replace function private.store_sync_account_key(
  target_account_id uuid,
  target_key_version smallint,
  target_wrapped_dek text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sync_account_keys (account_id, key_version, wrapped_dek, created_at)
  values (target_account_id, target_key_version, target_wrapped_dek, effective_at)
  on conflict (account_id) do nothing;
  return found;
end;
$$;

create or replace function private.sync_account_key(
  target_account_id uuid,
  target_device_id text
)
returns table (key_version smallint, wrapped_dek text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_sync_device(target_account_id, target_device_id);
  return query
  select account_key.key_version, account_key.wrapped_dek
  from private.sync_account_keys account_key
  where account_key.account_id = target_account_id;
end;
$$;

create or replace function private.sync_summary(
  target_account_id uuid,
  current_device_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summary jsonb;
begin
  if not exists (
    select 1 from private.sync_devices device
    where device.account_id = target_account_id
      and device.device_id = current_device_id
      and device.state <> 'revoked'
  ) then
    raise exception using errcode = 'P0001', message = 'sync_device_not_found';
  end if;

  select jsonb_build_object(
    'vaultVersion', vault.vault_version,
    'encodedSize', vault.encoded_size,
    'currentDeviceId', current_device_id,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deviceId', device.device_id,
        'friendlyName', device.friendly_name,
        'state', device.state::text,
        'acknowledgedVaultVersion', device.acknowledged_vault_version,
        'lastSeenAt', (extract(epoch from device.last_seen_at) * 1000)::bigint
      ) order by device.registered_at, device.device_id)
      from private.sync_devices device
      where device.account_id = target_account_id and device.state <> 'revoked'
    ), '[]'::jsonb)
  ) into summary
  from private.sync_vaults vault where vault.account_id = target_account_id;

  if summary is null then
    raise exception using errcode = 'P0001', message = 'sync_vault_not_found';
  end if;
  return summary;
end;
$$;

create or replace function private.sync_record_stored_size(
  target_entity_type text,
  target_entity_id text,
  target_nonce text,
  target_ciphertext text,
  target_device_id text
)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select octet_length(target_entity_type) + octet_length(target_entity_id)
    + octet_length(target_nonce) + octet_length(target_ciphertext)
    + octet_length(target_device_id) + 41;
$$;

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
        'connector_preference', 'habit', 'habit_completion', 'progress_goal'
      )
      or entity_id is null or length(entity_id) not between 1 and 256
      or entity_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]*$'
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

create or replace function private.pull_sync_records(
  target_account_id uuid,
  target_device_id text,
  after_vault_version bigint,
  cursor_vault_version bigint,
  page_limit integer
)
returns table (
  entity_type text, entity_id text, revision bigint, vault_version bigint,
  tombstone boolean, nonce text, ciphertext text, stored_size integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if after_vault_version is null or cursor_vault_version is null or page_limit is null
    or after_vault_version < 0 or cursor_vault_version < 0 or page_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'sync_pull_invalid';
  end if;
  perform private.require_active_sync_device(target_account_id, target_device_id);
  return query
  with limited as (
    select record.entity_type, record.entity_id, record.revision, record.vault_version,
      record.tombstone, record.nonce, record.ciphertext, record.stored_size
    from private.sync_records record
    where record.account_id = target_account_id
      and record.vault_version > greatest(after_vault_version, cursor_vault_version)
    order by record.vault_version, record.entity_type, record.entity_id
    limit page_limit
  ), measured as (
    select limited.*,
      sum(limited.stored_size) over (
        order by limited.vault_version, limited.entity_type, limited.entity_id
      ) as page_size
    from limited
  )
  select measured.entity_type, measured.entity_id, measured.revision, measured.vault_version,
    measured.tombstone, measured.nonce, measured.ciphertext, measured.stored_size
  from measured where measured.page_size <= 262144
  order by measured.vault_version, measured.entity_type, measured.entity_id;
end;
$$;

create or replace function private.acknowledge_sync_pull(
  target_account_id uuid,
  target_device_id text,
  acknowledged_version bigint,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_vault_version bigint;
begin
  perform private.require_active_sync_device(target_account_id, target_device_id);
  select vault.vault_version into current_vault_version
  from private.sync_vaults vault where vault.account_id = target_account_id;
  if acknowledged_version is null or effective_at is null
    or acknowledged_version < 0 or acknowledged_version > current_vault_version then
    raise exception using errcode = '22023', message = 'sync_acknowledgement_invalid';
  end if;
  update private.sync_devices
  set acknowledged_vault_version = greatest(acknowledged_vault_version, acknowledged_version),
      last_seen_at = effective_at
  where account_id = target_account_id and device_id = target_device_id and state = 'active';
  return found;
end;
$$;

create or replace function private.deactivate_sync_device(
  target_account_id uuid, target_device_id text, effective_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.sync_devices set state = 'inactive', deactivated_at = effective_at,
    last_seen_at = effective_at
  where account_id = target_account_id and device_id = target_device_id and state = 'active';
  if found then
    insert into private.sync_audit_events (account_id, device_id, event_type, occurred_at)
    values (target_account_id, target_device_id, 'device_deactivated', effective_at);
  end if;
  return found;
end;
$$;

create or replace function private.rename_sync_device(
  target_account_id uuid, target_device_id text, target_friendly_name text, effective_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if target_friendly_name is null or char_length(target_friendly_name) not between 1 and 48
    or target_friendly_name is distinct from btrim(target_friendly_name)
    or target_friendly_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'sync_device_name_invalid';
  end if;
  update private.sync_devices set friendly_name = target_friendly_name, last_seen_at = effective_at
  where account_id = target_account_id and device_id = target_device_id and state <> 'revoked';
  return found;
end;
$$;

create or replace function private.revoke_sync_device(
  target_account_id uuid, current_device_id text, target_device_id text, effective_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_sync_device(target_account_id, current_device_id);
  if target_device_id = current_device_id then
    raise exception using errcode = '22023', message = 'sync_current_device_cannot_be_revoked';
  end if;
  update private.sync_devices set state = 'revoked', revoked_at = effective_at,
    last_seen_at = effective_at
  where account_id = target_account_id and device_id = target_device_id and state <> 'revoked';
  if found then
    insert into private.sync_audit_events (account_id, device_id, event_type, occurred_at)
    values (target_account_id, target_device_id, 'device_revoked', effective_at);
  end if;
  return found;
end;
$$;

create or replace function private.compact_sync_tombstones(
  target_account_id uuid, effective_at timestamptz
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  removed_count bigint;
  removed_size bigint;
begin
  perform 1 from private.sync_vaults where account_id = target_account_id for update;
  with deleted as (
    delete from private.sync_records record
    where record.account_id = target_account_id and record.tombstone
      and not exists (
        select 1 from private.sync_devices device
        where device.account_id = target_account_id and device.state = 'active'
          and device.acknowledged_vault_version < record.vault_version
      )
    returning stored_size
  )
  select count(*), coalesce(sum(stored_size), 0) into removed_count, removed_size from deleted;
  update private.sync_vaults set encoded_size = encoded_size - removed_size, updated_at = effective_at
  where account_id = target_account_id;
  return removed_count;
end;
$$;

create or replace function private.delete_sync_vault(
  target_account_id uuid, target_device_id text, confirmation text, effective_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from private.sync_audit_events audit
    where audit.account_id = target_account_id and audit.event_type = 'vault_deleted'
  ) then
    return true;
  end if;
  perform private.require_active_sync_device(target_account_id, target_device_id);
  if confirmation is distinct from 'operator-confirmed' then
    raise exception using errcode = '22023', message = 'sync_vault_delete_confirmation_invalid';
  end if;
  perform 1 from public.tab_two_accounts where id = target_account_id and deleted_at is null;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;
  delete from private.sync_vaults where account_id = target_account_id;
  insert into private.sync_audit_events (account_id, event_type, occurred_at, details)
  values (target_account_id, 'vault_deleted', effective_at, jsonb_build_object('completed', true))
  on conflict (account_id, event_type) where event_type = 'vault_deleted' do nothing;
  return true;
end;
$$;

create or replace function private.account_deletion_json(
  operation private.account_deletion_operations
)
returns jsonb language sql immutable strict set search_path = '' as $$
  select jsonb_build_object(
    'operationId', operation.operation_id,
    'accountId', operation.account_id,
    'authUserId', operation.auth_user_id,
    'state', operation.state,
    'subscriptionId', operation.subscription_id
  );
$$;

create or replace function private.account_deletion_for_auth(target_auth_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.account_deletion_json(operation)
  from private.account_deletion_operations operation
  where operation.auth_user_id = target_auth_user_id;
$$;

create or replace function private.begin_account_deletion(
  target_account_id uuid, target_auth_user_id uuid, effective_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  operation private.account_deletion_operations%rowtype;
  owned_subscription_id text;
begin
  select * into operation from private.account_deletion_operations existing
  where existing.auth_user_id = target_auth_user_id for update;
  if found then
    if operation.account_id <> target_account_id then
      raise exception using errcode = 'P0001', message = 'account_deletion_not_found';
    end if;
    return private.account_deletion_json(operation);
  end if;

  perform 1 from public.tab_two_accounts account
  join public.tab_two_identities identity_link on identity_link.account_id = account.id
  where account.id = target_account_id
    and identity_link.auth_user_id = target_auth_user_id
    and account.deleted_at is null
  for update of account;
  if not found then
    raise exception using errcode = 'P0001', message = 'account_deletion_not_found';
  end if;

  select subscription.subscription_id into owned_subscription_id
  from private.billing_subscriptions subscription
  where subscription.account_id = target_account_id and subscription.state <> 'expired';

  insert into private.account_deletion_operations (
    account_id, auth_user_id, state, subscription_id, created_at, updated_at
  ) values (
    target_account_id, target_auth_user_id, 'pending_stripe', owned_subscription_id,
    effective_at, effective_at
  ) returning * into operation;
  update public.tab_two_accounts set deleted_at = effective_at where id = target_account_id;
  return private.account_deletion_json(operation);
end;
$$;

create or replace function private.mark_deletion_stripe_canceled(
  target_operation_id uuid, effective_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare operation private.account_deletion_operations%rowtype;
begin
  update private.account_deletion_operations
  set state = case when state = 'pending_stripe' then 'stripe_canceled' else state end,
      updated_at = effective_at
  where operation_id = target_operation_id
    and state in ('pending_stripe', 'stripe_canceled')
  returning * into operation;
  if not found then raise exception using errcode = 'P0001', message = 'account_deletion_not_found'; end if;
  return private.account_deletion_json(operation);
end;
$$;

create or replace function private.delete_account_data(
  target_operation_id uuid, effective_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare operation private.account_deletion_operations%rowtype;
begin
  select * into operation from private.account_deletion_operations existing
  where existing.operation_id = target_operation_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'account_deletion_not_found'; end if;
  if operation.state in ('data_deleted', 'completed') then
    return private.account_deletion_json(operation);
  end if;
  if operation.state <> 'stripe_canceled' then
    raise exception using errcode = 'P0001', message = 'stripe_cancellation_required';
  end if;

  delete from private.sync_vaults where account_id = operation.account_id;
  delete from private.stripe_customers where account_id = operation.account_id;
  delete from private.billing_audit_events where account_id = operation.account_id;
  delete from private.billing_rate_limits where account_id = operation.account_id;
  delete from private.sync_rate_limits rate_limit
  where rate_limit.scope_type = 'account' and rate_limit.scope_key = operation.account_id::text;
  delete from private.account_grants where account_id = operation.account_id;
  delete from private.entitlement_audit_events where account_id = operation.account_id;
  delete from public.tab_two_identities where account_id = operation.account_id;
  delete from private.sync_audit_events where account_id = operation.account_id;

  update private.account_deletion_operations set state = 'data_deleted', updated_at = effective_at
  where operation_id = target_operation_id returning * into operation;
  return private.account_deletion_json(operation);
end;
$$;

create or replace function private.complete_account_deletion(
  target_operation_id uuid, effective_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from private.sync_rate_limits rate_limit
  using private.account_deletion_operations operation
  where operation.operation_id = target_operation_id
    and rate_limit.scope_type = 'account'
    and rate_limit.scope_key = operation.account_id::text;
  update private.account_deletion_operations
  set state = 'completed', updated_at = effective_at
  where operation_id = target_operation_id and state in ('data_deleted', 'completed');
  return found;
end;
$$;

create or replace function public.tab_two_apply_stripe_billing_snapshot(
  target_account_id uuid, target_customer_id text, target_subscription_id text, target_checkout_session_id text,
  target_plan text, target_state text, target_current_period_start timestamptz,
  target_current_period_end timestamptz, target_cancel_at_period_end boolean,
  target_authoritative_event_created bigint, target_authoritative_event_priority integer,
  target_authoritative_event_id text, target_outcome_code text,
  effective_at timestamptz, target_courtesy_end timestamptz
)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.tab_two_accounts account
    where account.id = target_account_id and account.deleted_at is not null
  ) then
    return 'account_deleted';
  end if;
  return private.apply_stripe_billing_snapshot(
    target_account_id, target_customer_id, target_subscription_id, target_checkout_session_id,
    target_plan::private.billing_plan, target_state::private.billing_state,
    target_current_period_start, target_current_period_end, target_cancel_at_period_end,
    target_authoritative_event_created, target_authoritative_event_priority,
    target_authoritative_event_id, target_outcome_code, effective_at, target_courtesy_end
  );
end;
$$;

create or replace function public.tab_two_sync_register_device(
  target_account_id uuid, target_device_id text, target_friendly_name text, effective_at timestamptz
)
returns table (device_id text, state text, acknowledged_vault_version bigint)
language sql security definer set search_path = '' as $$
  select * from private.register_sync_device(target_account_id, target_device_id, target_friendly_name, effective_at);
$$;

create or replace function public.tab_two_sync_store_account_key(
  target_account_id uuid, target_key_version smallint, target_wrapped_dek text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.store_sync_account_key(target_account_id, target_key_version, target_wrapped_dek, effective_at);
$$;

create or replace function public.tab_two_sync_account_key(target_account_id uuid, target_device_id text)
returns table (key_version smallint, wrapped_dek text)
language sql stable security definer set search_path = '' as $$
  select * from private.sync_account_key(target_account_id, target_device_id);
$$;

create or replace function public.tab_two_sync_summary(target_account_id uuid, current_device_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.sync_summary(target_account_id, current_device_id);
$$;

create or replace function public.tab_two_consume_sync_rate_limit(
  target_account_id uuid, target_action text, target_ip_fingerprint text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.consume_sync_rate_limit(
    target_account_id, target_action, target_ip_fingerprint, effective_at);
$$;

create or replace function public.tab_two_sync_apply_mutations(
  target_account_id uuid, target_device_id text, mutations jsonb, effective_at timestamptz
)
returns jsonb language sql security definer set search_path = '' as $$
  select private.apply_sync_mutations(target_account_id, target_device_id, mutations, effective_at);
$$;

create or replace function public.tab_two_sync_pull_records(
  target_account_id uuid, target_device_id text, after_vault_version bigint,
  cursor_vault_version bigint, page_limit integer
)
returns table (
  entity_type text, entity_id text, revision bigint, vault_version bigint,
  tombstone boolean, nonce text, ciphertext text, stored_size integer
)
language sql stable security definer set search_path = '' as $$
  select * from private.pull_sync_records(
    target_account_id, target_device_id, after_vault_version, cursor_vault_version, page_limit);
$$;

create or replace function public.tab_two_sync_acknowledge_pull(
  target_account_id uuid, target_device_id text, acknowledged_version bigint, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.acknowledge_sync_pull(target_account_id, target_device_id, acknowledged_version, effective_at);
$$;

create or replace function public.tab_two_sync_deactivate_device(
  target_account_id uuid, target_device_id text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.deactivate_sync_device(target_account_id, target_device_id, effective_at);
$$;

create or replace function public.tab_two_sync_rename_device(
  target_account_id uuid, target_device_id text, target_friendly_name text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.rename_sync_device(target_account_id, target_device_id, target_friendly_name, effective_at);
$$;

create or replace function public.tab_two_sync_revoke_device(
  target_account_id uuid, current_device_id text, target_device_id text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.revoke_sync_device(target_account_id, current_device_id, target_device_id, effective_at);
$$;

create or replace function public.tab_two_sync_compact_tombstones(
  target_account_id uuid, effective_at timestamptz
)
returns bigint language sql security definer set search_path = '' as $$
  select private.compact_sync_tombstones(target_account_id, effective_at);
$$;

create or replace function public.tab_two_sync_delete_vault(
  target_account_id uuid, target_device_id text, confirmation text, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.delete_sync_vault(target_account_id, target_device_id, confirmation, effective_at);
$$;

create or replace function public.tab_two_account_deletion_for_auth(target_auth_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.account_deletion_for_auth(target_auth_user_id);
$$;
create or replace function public.tab_two_begin_account_deletion(
  target_account_id uuid, target_auth_user_id uuid, effective_at timestamptz
)
returns jsonb language sql security definer set search_path = '' as $$
  select private.begin_account_deletion(target_account_id, target_auth_user_id, effective_at);
$$;
create or replace function public.tab_two_mark_deletion_stripe_canceled(
  target_operation_id uuid, effective_at timestamptz
)
returns jsonb language sql security definer set search_path = '' as $$
  select private.mark_deletion_stripe_canceled(target_operation_id, effective_at);
$$;
create or replace function public.tab_two_delete_account_data(
  target_operation_id uuid, effective_at timestamptz
)
returns jsonb language sql security definer set search_path = '' as $$
  select private.delete_account_data(target_operation_id, effective_at);
$$;
create or replace function public.tab_two_complete_account_deletion(
  target_operation_id uuid, effective_at timestamptz
)
returns boolean language sql security definer set search_path = '' as $$
  select private.complete_account_deletion(target_operation_id, effective_at);
$$;

revoke all on function public.tab_two_sync_register_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_store_account_key(uuid, smallint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_account_key(uuid, text) from public, anon, authenticated;
revoke all on function public.tab_two_sync_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.tab_two_consume_sync_rate_limit(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_apply_mutations(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_pull_records(uuid, text, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.tab_two_sync_acknowledge_pull(uuid, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_deactivate_device(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_rename_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_revoke_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_compact_tombstones(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_sync_delete_vault(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_account_deletion_for_auth(uuid) from public, anon, authenticated;
revoke all on function public.tab_two_begin_account_deletion(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_mark_deletion_stripe_canceled(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_delete_account_data(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_complete_account_deletion(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.tab_two_sync_register_device(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_store_account_key(uuid, smallint, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_account_key(uuid, text) to service_role;
grant execute on function public.tab_two_sync_summary(uuid, text) to service_role;
grant execute on function public.tab_two_consume_sync_rate_limit(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_apply_mutations(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function public.tab_two_sync_pull_records(uuid, text, bigint, bigint, integer) to service_role;
grant execute on function public.tab_two_sync_acknowledge_pull(uuid, text, bigint, timestamptz) to service_role;
grant execute on function public.tab_two_sync_deactivate_device(uuid, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_rename_device(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_revoke_device(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tab_two_sync_compact_tombstones(uuid, timestamptz) to service_role;
grant execute on function public.tab_two_sync_delete_vault(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tab_two_account_deletion_for_auth(uuid) to service_role;
grant execute on function public.tab_two_begin_account_deletion(uuid, uuid, timestamptz) to service_role;
grant execute on function public.tab_two_mark_deletion_stripe_canceled(uuid, timestamptz) to service_role;
grant execute on function public.tab_two_delete_account_data(uuid, timestamptz) to service_role;
grant execute on function public.tab_two_complete_account_deletion(uuid, timestamptz) to service_role;

revoke all on function private.require_active_sync_device(uuid, text) from public, anon, authenticated;
revoke all on function private.register_sync_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.store_sync_account_key(uuid, smallint, text, timestamptz) from public, anon, authenticated;
revoke all on function private.sync_account_key(uuid, text) from public, anon, authenticated;
revoke all on function private.sync_summary(uuid, text) from public, anon, authenticated;
revoke all on function private.consume_sync_rate_scope(text, text, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function private.consume_sync_rate_limit(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.sync_record_stored_size(text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.apply_sync_mutations(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.pull_sync_records(uuid, text, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function private.acknowledge_sync_pull(uuid, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function private.deactivate_sync_device(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.rename_sync_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.revoke_sync_device(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.compact_sync_tombstones(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.delete_sync_vault(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.account_deletion_json(private.account_deletion_operations) from public, anon, authenticated;
revoke all on function private.account_deletion_for_auth(uuid) from public, anon, authenticated;
revoke all on function private.begin_account_deletion(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.mark_deletion_stripe_canceled(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.delete_account_data(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.complete_account_deletion(uuid, timestamptz) from public, anon, authenticated;

grant execute on function private.require_active_sync_device(uuid, text) to service_role;
grant execute on function private.register_sync_device(uuid, text, text, timestamptz) to service_role;
grant execute on function private.store_sync_account_key(uuid, smallint, text, timestamptz) to service_role;
grant execute on function private.sync_account_key(uuid, text) to service_role;
grant execute on function private.sync_summary(uuid, text) to service_role;
grant execute on function private.consume_sync_rate_scope(text, text, text, timestamptz, integer, integer) to service_role;
grant execute on function private.consume_sync_rate_limit(uuid, text, text, timestamptz) to service_role;
grant execute on function private.sync_record_stored_size(text, text, text, text, text) to service_role;
grant execute on function private.apply_sync_mutations(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function private.pull_sync_records(uuid, text, bigint, bigint, integer) to service_role;
grant execute on function private.acknowledge_sync_pull(uuid, text, bigint, timestamptz) to service_role;
grant execute on function private.deactivate_sync_device(uuid, text, timestamptz) to service_role;
grant execute on function private.rename_sync_device(uuid, text, text, timestamptz) to service_role;
grant execute on function private.revoke_sync_device(uuid, text, text, timestamptz) to service_role;
grant execute on function private.compact_sync_tombstones(uuid, timestamptz) to service_role;
grant execute on function private.delete_sync_vault(uuid, text, text, timestamptz) to service_role;
grant execute on function private.account_deletion_json(private.account_deletion_operations) to service_role;
grant execute on function private.account_deletion_for_auth(uuid) to service_role;
grant execute on function private.begin_account_deletion(uuid, uuid, timestamptz) to service_role;
grant execute on function private.mark_deletion_stripe_canceled(uuid, timestamptz) to service_role;
grant execute on function private.delete_account_data(uuid, timestamptz) to service_role;
grant execute on function private.complete_account_deletion(uuid, timestamptz) to service_role;

comment on table private.sync_account_keys is
  'AES-256-KW wrapped account DEKs only; raw key material is never persisted.';
comment on table private.sync_records is
  'Opaque AES-256-GCM ciphertext and routing metadata; no plaintext product values.';
