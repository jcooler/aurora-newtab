alter table private.sync_rate_limits
  drop constraint sync_rate_action_known,
  add constraint sync_rate_action_known check (action in (
    'bootstrap', 'pull', 'push', 'rename', 'deactivate', 'revoke',
    'delete_vault', 'delete_account', 'export_account'
  ));

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
      'delete_vault', 'delete_account', 'export_account'
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
    when 'export_account' then window_seconds := 3600; maximum_requests := 3;
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

create or replace function public.tab_two_account_data_export(
  target_account_id uuid,
  effective_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_account as (
    select account.id, account.created_at
    from public.tab_two_accounts account
    where account.id = target_account_id
      and account.deleted_at is null
      and effective_at is not null
  ),
  selected_identity as (
    select identity_link.email,
           identity_link.display_name,
           identity_link.created_at,
           identity_link.updated_at
    from public.tab_two_identities identity_link
    join selected_account account on account.id = identity_link.account_id
    order by identity_link.created_at, identity_link.id
    limit 1
  ),
  selected_entitlement as (
    select entitlement.capabilities,
           entitlement.grant_sources,
           entitlement.earliest_expiry
    from selected_account account
    cross join lateral private.effective_entitlement(account.id, effective_at) entitlement
  ),
  selected_subscription as (
    select subscription.state::text as state,
           subscription.plan::text as plan,
           subscription.current_period_start,
           subscription.current_period_end,
           subscription.courtesy_end,
           subscription.cancel_at_period_end,
           subscription.created_at,
           subscription.updated_at
    from selected_account account
    left join private.billing_subscriptions subscription
      on subscription.account_id = account.id
  ),
  provider_snapshot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'connectionId', connection.id,
      'provider', connection.provider::text,
      'accountKind', connection.account_kind,
      'email', connection.email,
      'displayName', connection.display_name,
      'status', connection.status::text,
      'grantedScopes', to_jsonb(connection.granted_scopes),
      'createdAt', connection.created_at,
      'updatedAt', connection.updated_at
    ) order by connection.provider::text, connection.created_at, connection.id)
      filter (where connection.id is not null), '[]'::jsonb) as value
    from selected_account account
    left join private.provider_connections connection
      on connection.account_id = account.id
     and connection.revoked_at is null
  ),
  device_snapshot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'deviceId', device.device_id,
      'friendlyName', device.friendly_name,
      'state', device.state::text,
      'lastSeenAt', device.last_seen_at,
      'createdAt', device.registered_at,
      'updatedAt', greatest(
        device.last_seen_at,
        coalesce(device.deactivated_at, device.last_seen_at),
        coalesce(device.revoked_at, device.last_seen_at)
      ),
      'revokedAt', device.revoked_at
    ) order by device.registered_at, device.device_id)
      filter (where device.account_id is not null), '[]'::jsonb) as value
    from selected_account account
    left join private.sync_devices device on device.account_id = account.id
  ),
  record_snapshot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'envelopeVersion', 1,
      'accountId', record.account_id,
      'entityType', record.entity_type,
      'entityId', record.entity_id,
      'revision', record.revision,
      'vaultVersion', record.vault_version,
      'tombstone', record.tombstone,
      'nonce', record.nonce,
      'ciphertext', record.ciphertext
    ) order by record.entity_type, record.entity_id)
      filter (where record.account_id is not null), '[]'::jsonb) as value,
    count(record.account_id) as record_count
    from selected_account account
    left join private.sync_records record on record.account_id = account.id
  ),
  vault_snapshot as (
    select case
             when vault.account_id is null then 'not_created'
             when records.record_count = 0 then 'empty'
             else 'available'
           end as status,
           coalesce(vault.vault_version, 0) as vault_version,
           coalesce(vault.encoded_size, 0) as stored_bytes,
           case when records.record_count > 0 then account_key.wrapped_dek else null end as wrapped_data_key,
           records.value as records
    from selected_account account
    cross join record_snapshot records
    left join private.sync_vaults vault on vault.account_id = account.id
    left join private.sync_account_keys account_key on account_key.account_id = account.id
  )
  select jsonb_build_object(
    'account', jsonb_build_object(
      'accountId', account.id,
      'email', identity_link.email,
      'displayName', identity_link.display_name,
      'accountCreatedAt', account.created_at,
      'identityCreatedAt', identity_link.created_at,
      'identityUpdatedAt', identity_link.updated_at
    ),
    'connectedAccounts', providers.value,
    'subscription', jsonb_build_object(
      'state', case
        when subscription.state is not null then subscription.state
        when 'complimentary_owner' = any(entitlement.grant_sources) then 'complimentary'
        else 'none'
      end,
      'plan', subscription.plan,
      'currentPeriodStart', subscription.current_period_start,
      'currentPeriodEnd', subscription.current_period_end,
      'courtesyEnd', subscription.courtesy_end,
      'cancelAtPeriodEnd', coalesce(subscription.cancel_at_period_end, false),
      'createdAt', subscription.created_at,
      'updatedAt', subscription.updated_at
    ),
    'entitlement', jsonb_build_object(
      'capabilities', to_jsonb(entitlement.capabilities),
      'grantSources', to_jsonb(entitlement.grant_sources),
      'expiresAt', entitlement.earliest_expiry
    ),
    'devices', devices.value,
    'vault', jsonb_build_object(
      'status', vault.status,
      'vaultVersion', vault.vault_version,
      'storedBytes', vault.stored_bytes,
      'wrappedDataKey', vault.wrapped_data_key,
      'records', vault.records
    )
  )
  from selected_account account
  cross join selected_identity identity_link
  cross join selected_entitlement entitlement
  cross join selected_subscription subscription
  cross join provider_snapshot providers
  cross join device_snapshot devices
  cross join vault_snapshot vault;
$$;

create or replace function public.tab_two_record_account_export_event(
  target_account_id uuid,
  outcome_code text,
  record_count integer,
  byte_count integer,
  occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_account_id is null
    or outcome_code is null
    or outcome_code not in ('success', 'rate_limited', 'data_unavailable')
    or record_count is null
    or record_count < 0
    or byte_count is null
    or byte_count < 0
    or occurred_at is null then
    raise exception using errcode = '22023', message = 'account_export_audit_invalid';
  end if;

  insert into private.sync_audit_events (
    account_id,
    device_id,
    event_type,
    occurred_at,
    details
  ) values (
    target_account_id,
    null,
    'account_export',
    occurred_at,
    jsonb_build_object(
      'outcome', outcome_code,
      'recordCount', record_count,
      'byteCount', byte_count
    )
  );
end;
$$;

revoke all on function public.tab_two_account_data_export(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tab_two_record_account_export_event(uuid, text, integer, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.tab_two_account_data_export(uuid, timestamptz) to service_role;
grant execute on function public.tab_two_record_account_export_event(uuid, text, integer, integer, timestamptz)
  to service_role;

comment on function public.tab_two_account_data_export(uuid, timestamptz) is
  'Returns one exact service-only customer export snapshot without provider secrets, Stripe IDs, or plaintext sync data.';
comment on function public.tab_two_record_account_export_event(uuid, text, integer, integer, timestamptz) is
  'Records the minimal outcome and size metadata for one account export attempt.';
