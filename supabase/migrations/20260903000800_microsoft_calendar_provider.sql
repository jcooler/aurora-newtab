alter type private.provider_id add value if not exists 'microsoft_calendar';

alter table private.provider_connections
  add column account_kind text;

alter table private.provider_connections
  drop constraint provider_connections_scopes_exact,
  add constraint provider_connections_scopes_exact check (
    (
      provider::text = 'google_calendar'
      and granted_scopes = array[
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly'
      ]::text[]
    ) or (
      provider::text = 'microsoft_calendar'
      and granted_scopes = array[
        'openid',
        'offline_access',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Calendars.ReadBasic'
      ]::text[]
    )
  ),
  add constraint provider_connections_account_kind_by_provider check (
    (provider::text = 'google_calendar' and account_kind is null)
    or (
      provider::text = 'microsoft_calendar'
      and account_kind is not null
      and account_kind in ('personal', 'work_or_school')
    )
  ),
  add constraint provider_connections_subject_by_provider check (
    provider::text = 'google_calendar'
    or (
      provider::text = 'microsoft_calendar'
      and provider_subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

alter table private.provider_oauth_transactions
  drop constraint provider_oauth_redirect_exact,
  add constraint provider_oauth_redirect_exact check (
    (
      provider::text = 'google_calendar'
      and final_redirect ~ '^https://[a-p]{32}\.chromiumapp\.org/google-calendar\?nonce=[A-Za-z0-9_-]{43}$'
    ) or (
      provider::text = 'microsoft_calendar'
      and final_redirect ~ '^https://[a-p]{32}\.chromiumapp\.org/microsoft-calendar\?nonce=[A-Za-z0-9_-]{43}$'
    )
  );

create or replace function private.provider_account_has_capabilities(
  target_account_id uuid,
  provider_name text,
  effective_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.account_grants account_grant
    join public.tab_two_accounts account on account.id = account_grant.account_id
    where account_grant.account_id = target_account_id
      and account.deleted_at is null
      and account_grant.revoked_at is null
      and account_grant.starts_at <= effective_at
      and (account_grant.expires_at is null or account_grant.expires_at > effective_at)
      and exists (
        select 1 from unnest(account_grant.capabilities) capability
        where capability::text = 'multi_account'
      )
      and exists (
        select 1 from unnest(account_grant.capabilities) capability
        where capability::text = provider_name
      )
  );
$$;

create or replace function public.tab_two_provider_create_oauth_transaction(
  transaction_id uuid,
  target_account_id uuid,
  provider_name text,
  state_digest text,
  nonce_digest text,
  pkce_version smallint,
  pkce_nonce text,
  pkce_ciphertext text,
  pkce_fingerprint text,
  callback_redirect text,
  transaction_expires_at timestamptz,
  transaction_correlation_id uuid,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if effective_at is null or provider_name not in ('google_calendar', 'microsoft_calendar') then
    raise exception using errcode = '22023', message = 'provider_transaction_invalid';
  end if;
  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null;
  if not found then
    raise exception using errcode = '23503', message = 'provider_account_not_found';
  end if;
  if not private.provider_account_has_capabilities(target_account_id, provider_name, effective_at) then
    raise exception using errcode = 'P0001', message = 'provider_entitlement_required';
  end if;

  delete from private.provider_oauth_transactions transaction
  where transaction.expires_at < effective_at - interval '1 day'
     or transaction.consumed_at < effective_at - interval '1 day';

  insert into private.provider_oauth_transactions (
    id, account_id, provider, state_hash, client_nonce_hash,
    pkce_key_version, pkce_verifier_nonce, pkce_verifier_ciphertext, pkce_verifier_fingerprint,
    final_redirect, expires_at, correlation_id, created_at
  ) values (
    transaction_id, target_account_id, provider_name::private.provider_id,
    state_digest, nonce_digest, pkce_version, pkce_nonce, pkce_ciphertext, pkce_fingerprint,
    callback_redirect, transaction_expires_at, transaction_correlation_id, effective_at
  );
  return true;
end;
$$;

create or replace function public.tab_two_provider_upsert_connection(
  target_account_id uuid,
  requested_connection_id uuid,
  provider_name text,
  provider_account_kind text,
  provider_identity_subject text,
  provider_email text,
  provider_display_name text,
  provider_scopes text[],
  refresh_key_version smallint,
  refresh_nonce text,
  refresh_ciphertext text,
  refresh_fingerprint text,
  effective_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_connection_id uuid;
  active_count integer;
begin
  if effective_at is null or provider_name not in ('google_calendar', 'microsoft_calendar') then
    raise exception using errcode = '22023', message = 'provider_connection_invalid';
  end if;
  if (refresh_key_version is null) <> (refresh_nonce is null)
     or (refresh_key_version is null) <> (refresh_ciphertext is null)
     or (refresh_key_version is null) <> (refresh_fingerprint is null) then
    raise exception using errcode = '22023', message = 'provider_refresh_token_incomplete';
  end if;
  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null;
  if not found then
    raise exception using errcode = '23503', message = 'provider_account_not_found';
  end if;
  if not private.provider_account_has_capabilities(target_account_id, provider_name, effective_at) then
    raise exception using errcode = 'P0001', message = 'provider_entitlement_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_account_id::text || ':' || provider_name || ':' || provider_identity_subject, 0
  ));
  select connection.id into existing_connection_id
  from private.provider_connections connection
  where connection.account_id = target_account_id
    and connection.provider::text = provider_name
    and connection.provider_subject = provider_identity_subject
  for update;

  if existing_connection_id is null then
    if refresh_key_version is null then
      raise exception using errcode = '22023', message = 'provider_refresh_token_required';
    end if;
    select count(*) into active_count
    from private.provider_connections connection
    where connection.account_id = target_account_id
      and connection.provider::text = provider_name
      and connection.revoked_at is null;
    if active_count >= 5 then
      raise exception using errcode = 'P0001', message = 'provider_connection_limit';
    end if;
    insert into private.provider_connections (
      id, account_id, provider, account_kind, provider_subject, email, display_name,
      status, granted_scopes, token_key_version, refresh_token_nonce,
      refresh_token_ciphertext, refresh_token_fingerprint,
      created_at, updated_at, last_successful_token_refresh_at
    ) values (
      requested_connection_id, target_account_id, provider_name::private.provider_id,
      provider_account_kind, provider_identity_subject, provider_email,
      nullif(btrim(provider_display_name), ''), 'active', provider_scopes,
      refresh_key_version, refresh_nonce, refresh_ciphertext, refresh_fingerprint,
      effective_at, effective_at, effective_at
    );
    return requested_connection_id;
  end if;

  update private.provider_connections connection
  set account_kind = provider_account_kind,
      email = provider_email,
      display_name = nullif(btrim(provider_display_name), ''),
      status = 'active',
      granted_scopes = provider_scopes,
      token_key_version = case when requested_connection_id = existing_connection_id
        then coalesce(refresh_key_version, connection.token_key_version) else connection.token_key_version end,
      refresh_token_nonce = case when requested_connection_id = existing_connection_id
        then coalesce(refresh_nonce, connection.refresh_token_nonce) else connection.refresh_token_nonce end,
      refresh_token_ciphertext = case when requested_connection_id = existing_connection_id
        then coalesce(refresh_ciphertext, connection.refresh_token_ciphertext) else connection.refresh_token_ciphertext end,
      refresh_token_fingerprint = case when requested_connection_id = existing_connection_id
        then coalesce(refresh_fingerprint, connection.refresh_token_fingerprint) else connection.refresh_token_fingerprint end,
      updated_at = effective_at,
      revoked_at = null,
      last_successful_token_refresh_at = case when refresh_key_version is null
        or requested_connection_id <> existing_connection_id
        then connection.last_successful_token_refresh_at else effective_at end
  where connection.id = existing_connection_id;
  return existing_connection_id;
end;
$$;

create or replace function public.tab_two_provider_upsert_connection(
  target_account_id uuid,
  requested_connection_id uuid,
  provider_name text,
  provider_identity_subject text,
  provider_email text,
  provider_display_name text,
  provider_scopes text[],
  refresh_key_version smallint,
  refresh_nonce text,
  refresh_ciphertext text,
  refresh_fingerprint text,
  effective_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if provider_name <> 'google_calendar' then
    raise exception using errcode = '22023', message = 'provider_account_kind_required';
  end if;
  return public.tab_two_provider_upsert_connection(
    target_account_id, requested_connection_id, provider_name, null,
    provider_identity_subject, provider_email, provider_display_name, provider_scopes,
    refresh_key_version, refresh_nonce, refresh_ciphertext, refresh_fingerprint, effective_at
  );
end;
$$;

drop function public.tab_two_provider_list_connections(uuid);
create function public.tab_two_provider_list_connections(target_account_id uuid)
returns table (
  connection_id uuid,
  provider text,
  account_kind text,
  email text,
  display_name text,
  status text,
  granted_scopes text[],
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select connection.id,
         connection.provider::text,
         connection.account_kind,
         connection.email,
         connection.display_name,
         connection.status::text,
         connection.granted_scopes,
         connection.created_at,
         connection.updated_at
  from private.provider_connections connection
  join public.tab_two_accounts account on account.id = connection.account_id
  where connection.account_id = target_account_id
    and connection.revoked_at is null
    and account.deleted_at is null
  order by connection.provider::text, connection.status::text,
           lower(connection.email), connection.created_at, connection.id;
$$;

drop function public.tab_two_provider_get_connection(uuid, uuid);
create function public.tab_two_provider_get_connection(
  target_account_id uuid,
  target_connection_id uuid
)
returns table (
  connection_id uuid,
  account_id uuid,
  provider text,
  account_kind text,
  provider_subject text,
  email text,
  display_name text,
  status text,
  granted_scopes text[],
  token_key_version smallint,
  refresh_token_nonce text,
  refresh_token_ciphertext text,
  refresh_token_fingerprint text,
  created_at timestamptz,
  updated_at timestamptz,
  revoked_at timestamptz,
  last_successful_token_refresh_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select connection.id,
         connection.account_id,
         connection.provider::text,
         connection.account_kind,
         connection.provider_subject,
         connection.email,
         connection.display_name,
         connection.status::text,
         connection.granted_scopes,
         connection.token_key_version,
         connection.refresh_token_nonce,
         connection.refresh_token_ciphertext,
         connection.refresh_token_fingerprint,
         connection.created_at,
         connection.updated_at,
         connection.revoked_at,
         connection.last_successful_token_refresh_at
  from private.provider_connections connection
  join public.tab_two_accounts account on account.id = connection.account_id
  where connection.id = target_connection_id
    and connection.account_id = target_account_id
    and connection.revoked_at is null
    and account.deleted_at is null;
$$;

drop function public.tab_two_provider_find_connection_by_subject(uuid, text, text);
create function public.tab_two_provider_find_connection_by_subject(
  target_account_id uuid,
  provider_name text,
  provider_identity_subject text
)
returns table (
  connection_id uuid,
  account_id uuid,
  provider text,
  account_kind text,
  provider_subject text,
  email text,
  display_name text,
  status text,
  granted_scopes text[],
  token_key_version smallint,
  refresh_token_nonce text,
  refresh_token_ciphertext text,
  refresh_token_fingerprint text,
  created_at timestamptz,
  updated_at timestamptz,
  revoked_at timestamptz,
  last_successful_token_refresh_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if provider_name not in ('google_calendar', 'microsoft_calendar') then
    raise exception using errcode = '22023', message = 'provider_connection_invalid';
  end if;
  return query
  select connection.id,
         connection.account_id,
         connection.provider::text,
         connection.account_kind,
         connection.provider_subject,
         connection.email,
         connection.display_name,
         connection.status::text,
         connection.granted_scopes,
         connection.token_key_version,
         connection.refresh_token_nonce,
         connection.refresh_token_ciphertext,
         connection.refresh_token_fingerprint,
         connection.created_at,
         connection.updated_at,
         connection.revoked_at,
         connection.last_successful_token_refresh_at
  from private.provider_connections connection
  join public.tab_two_accounts account on account.id = connection.account_id
  where connection.account_id = target_account_id
    and connection.provider::text = provider_name
    and connection.provider_subject = provider_identity_subject
    and connection.revoked_at is null
    and account.deleted_at is null;
end;
$$;

revoke all on function private.provider_account_has_capabilities(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_upsert_connection(
  uuid, uuid, text, text, text, text, text, text[], smallint, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.tab_two_provider_list_connections(uuid)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_get_connection(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_find_connection_by_subject(uuid, text, text)
  from public, anon, authenticated;

grant execute on function private.provider_account_has_capabilities(uuid, text, timestamptz)
  to service_role;
grant execute on function public.tab_two_provider_upsert_connection(
  uuid, uuid, text, text, text, text, text, text[], smallint, text, text, text, timestamptz
) to service_role;
grant execute on function public.tab_two_provider_list_connections(uuid) to service_role;
grant execute on function public.tab_two_provider_get_connection(uuid, uuid) to service_role;
grant execute on function public.tab_two_provider_find_connection_by_subject(uuid, text, text)
  to service_role;

comment on column private.provider_connections.account_kind is
  'Null for Google; Personal or Work or school classification for Microsoft metadata.';
