create type private.provider_id as enum ('google_calendar');
create type private.provider_connection_status as enum ('active', 'reconnect_required');

create table private.provider_connections (
  id uuid primary key,
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  provider private.provider_id not null,
  provider_subject text not null,
  email text not null,
  display_name text,
  status private.provider_connection_status not null default 'active',
  granted_scopes text[] not null,
  token_key_version smallint not null,
  refresh_token_nonce text not null,
  refresh_token_ciphertext text not null,
  refresh_token_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_successful_token_refresh_at timestamptz,
  constraint provider_connections_subject_bounded check (
    char_length(provider_subject) between 1 and 255
    and provider_subject = btrim(provider_subject)
    and provider_subject !~ '[[:cntrl:]]'
  ),
  constraint provider_connections_email_bounded check (
    char_length(email) between 3 and 320
    and email = btrim(email)
    and email !~ '[[:cntrl:]]'
  ),
  constraint provider_connections_display_name_bounded check (
    display_name is null or (
      char_length(display_name) between 1 and 200
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'
    )
  ),
  constraint provider_connections_scopes_exact check (granted_scopes = array[
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ]::text[]),
  constraint provider_connections_key_v1 check (token_key_version = 1),
  constraint provider_connections_nonce_shape check (
    char_length(refresh_token_nonce) = 16
    and refresh_token_nonce ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_connections_ciphertext_shape check (
    char_length(refresh_token_ciphertext) between 23 and 5500
    and refresh_token_ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_connections_fingerprint_shape check (
    char_length(refresh_token_fingerprint) = 43
    and refresh_token_fingerprint ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_connections_revoked_order check (revoked_at is null or revoked_at >= created_at),
  constraint provider_connections_refreshed_order check (
    last_successful_token_refresh_at is null or last_successful_token_refresh_at >= created_at
  ),
  constraint provider_connections_subject_unique unique (account_id, provider, provider_subject)
);

create index provider_connections_account_status
  on private.provider_connections (account_id, provider, status, created_at, id);

create table private.provider_oauth_transactions (
  id uuid primary key,
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  provider private.provider_id not null,
  state_hash text not null unique,
  client_nonce_hash text not null,
  pkce_key_version smallint not null,
  pkce_verifier_nonce text not null,
  pkce_verifier_ciphertext text not null,
  pkce_verifier_fingerprint text not null,
  final_redirect text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  correlation_id uuid not null unique,
  created_at timestamptz not null,
  constraint provider_oauth_state_hash_shape check (
    char_length(state_hash) = 43 and state_hash ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_oauth_client_nonce_hash_shape check (
    char_length(client_nonce_hash) = 43 and client_nonce_hash ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_oauth_pkce_key_v1 check (pkce_key_version = 1),
  constraint provider_oauth_pkce_nonce_shape check (
    char_length(pkce_verifier_nonce) = 16 and pkce_verifier_nonce ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_oauth_pkce_ciphertext_shape check (
    char_length(pkce_verifier_ciphertext) between 79 and 128
    and pkce_verifier_ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_oauth_pkce_fingerprint_shape check (
    char_length(pkce_verifier_fingerprint) = 43
    and pkce_verifier_fingerprint ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint provider_oauth_redirect_exact check (
    final_redirect ~ '^https://[a-p]{32}\.chromiumapp\.org/google-calendar\?nonce=[A-Za-z0-9_-]{43}$'
  ),
  constraint provider_oauth_expiry_bounded check (
    expires_at > created_at and expires_at <= created_at + interval '10 minutes'
  ),
  constraint provider_oauth_consumed_order check (consumed_at is null or consumed_at >= created_at)
);

create index provider_oauth_transactions_cleanup
  on private.provider_oauth_transactions (expires_at, consumed_at);

create table private.provider_rate_limits (
  scope_type text not null,
  scope_key text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  expires_at timestamptz not null,
  primary key (scope_type, scope_key, action),
  constraint provider_rate_scope_type_known check (scope_type in ('account', 'ip')),
  constraint provider_rate_scope_key_bounded check (
    char_length(scope_key) between 1 and 64 and scope_key !~ '[[:cntrl:]]'
  ),
  constraint provider_rate_action_known check (
    action in ('start', 'callback_failure', 'session', 'disconnect')
  ),
  constraint provider_rate_count_positive check (request_count > 0),
  constraint provider_rate_expiry_order check (expires_at > window_started_at)
);

create index provider_rate_limits_cleanup on private.provider_rate_limits (expires_at);

revoke all on table private.provider_connections from public, anon, authenticated;
revoke all on table private.provider_oauth_transactions from public, anon, authenticated;
revoke all on table private.provider_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.provider_connections to service_role;
grant select, insert, update, delete on table private.provider_oauth_transactions to service_role;
grant select, insert, update, delete on table private.provider_rate_limits to service_role;

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
  if effective_at is null or provider_name <> 'google_calendar' then
    raise exception using errcode = '22023', message = 'provider_transaction_invalid';
  end if;
  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null;
  if not found then
    raise exception using errcode = '23503', message = 'provider_account_not_found';
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

create or replace function public.tab_two_provider_consume_oauth_transaction(
  target_state_hash text,
  effective_at timestamptz
)
returns table (
  transaction_id uuid,
  account_id uuid,
  provider text,
  client_nonce_hash text,
  pkce_key_version smallint,
  pkce_verifier_nonce text,
  pkce_verifier_ciphertext text,
  pkce_verifier_fingerprint text,
  final_redirect text,
  expires_at timestamptz,
  correlation_id uuid
)
language sql
security definer
set search_path = ''
as $$
  update private.provider_oauth_transactions transaction
  set consumed_at = effective_at
  where transaction.state_hash = target_state_hash
    and transaction.consumed_at is null
  returning transaction.id,
            transaction.account_id,
            transaction.provider::text,
            transaction.client_nonce_hash,
            transaction.pkce_key_version,
            transaction.pkce_verifier_nonce,
            transaction.pkce_verifier_ciphertext,
            transaction.pkce_verifier_fingerprint,
            transaction.final_redirect,
            transaction.expires_at,
            transaction.correlation_id;
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
declare
  existing_connection_id uuid;
  active_count integer;
begin
  if effective_at is null or provider_name <> 'google_calendar' then
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

  perform pg_advisory_xact_lock(hashtextextended(
    target_account_id::text || ':' || provider_name || ':' || provider_identity_subject, 0
  ));
  select connection.id into existing_connection_id
  from private.provider_connections connection
  where connection.account_id = target_account_id
    and connection.provider = provider_name::private.provider_id
    and connection.provider_subject = provider_identity_subject
  for update;

  if existing_connection_id is null then
    if refresh_key_version is null then
      raise exception using errcode = '22023', message = 'provider_refresh_token_required';
    end if;
    select count(*) into active_count
    from private.provider_connections connection
    where connection.account_id = target_account_id
      and connection.provider = provider_name::private.provider_id
      and connection.revoked_at is null;
    if active_count >= 5 then
      raise exception using errcode = 'P0001', message = 'provider_connection_limit';
    end if;
    insert into private.provider_connections (
      id, account_id, provider, provider_subject, email, display_name,
      status, granted_scopes, token_key_version, refresh_token_nonce,
      refresh_token_ciphertext, refresh_token_fingerprint,
      created_at, updated_at, last_successful_token_refresh_at
    ) values (
      requested_connection_id, target_account_id, provider_name::private.provider_id,
      provider_identity_subject, provider_email, nullif(btrim(provider_display_name), ''),
      'active', provider_scopes, refresh_key_version, refresh_nonce,
      refresh_ciphertext, refresh_fingerprint, effective_at, effective_at, effective_at
    );
    return requested_connection_id;
  end if;

  update private.provider_connections connection
  set email = provider_email,
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

create or replace function public.tab_two_provider_list_connections(target_account_id uuid)
returns table (
  connection_id uuid,
  provider text,
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
  order by lower(connection.email), connection.created_at, connection.id;
$$;

create or replace function public.tab_two_provider_get_connection(
  target_account_id uuid,
  target_connection_id uuid
)
returns table (
  connection_id uuid,
  account_id uuid,
  provider text,
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

create or replace function public.tab_two_provider_find_connection_by_subject(
  target_account_id uuid,
  provider_name text,
  provider_identity_subject text
)
returns table (
  connection_id uuid,
  account_id uuid,
  provider text,
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
    and connection.provider = provider_name::private.provider_id
    and connection.provider_subject = provider_identity_subject
    and connection.revoked_at is null
    and account.deleted_at is null;
$$;

create or replace function public.tab_two_provider_rotate_refresh_token(
  target_account_id uuid,
  target_connection_id uuid,
  refresh_key_version smallint,
  refresh_nonce text,
  refresh_ciphertext text,
  refresh_fingerprint text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from private.provider_connections connection
  where connection.id = target_connection_id
    and connection.account_id = target_account_id
    and connection.revoked_at is null
  for update;
  if not found then return false; end if;
  update private.provider_connections
  set token_key_version = refresh_key_version,
      refresh_token_nonce = refresh_nonce,
      refresh_token_ciphertext = refresh_ciphertext,
      refresh_token_fingerprint = refresh_fingerprint,
      status = 'active',
      updated_at = effective_at,
      last_successful_token_refresh_at = effective_at
  where id = target_connection_id and account_id = target_account_id;
  return true;
end;
$$;

create or replace function public.tab_two_provider_mark_reconnect_required(
  target_account_id uuid,
  target_connection_id uuid,
  effective_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update private.provider_connections connection
    set status = 'reconnect_required', updated_at = effective_at
    where connection.id = target_connection_id
      and connection.account_id = target_account_id
      and connection.revoked_at is null
    returning 1
  ) select exists(select 1 from changed);
$$;

create or replace function public.tab_two_provider_delete_connection(
  target_account_id uuid,
  target_connection_id uuid,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count integer;
begin
  if effective_at is null then
    raise exception using errcode = '22023', message = 'provider_effective_at_required';
  end if;
  delete from private.provider_connections connection
  where connection.id = target_connection_id and connection.account_id = target_account_id;
  get diagnostics removed_count = row_count;
  return removed_count = 1;
end;
$$;

create or replace function private.consume_provider_rate_scope(
  target_scope_type text,
  target_scope_key text,
  target_action text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_limit integer;
  action_window interval;
  observed_count integer;
begin
  case target_action
    when 'start' then action_limit := 5; action_window := interval '10 minutes';
    when 'callback_failure' then action_limit := 20; action_window := interval '10 minutes';
    when 'session' then action_limit := 60; action_window := interval '1 minute';
    when 'disconnect' then action_limit := 10; action_window := interval '10 minutes';
    else raise exception using errcode = '22023', message = 'provider_rate_limit_invalid';
  end case;
  if effective_at is null or target_scope_type not in ('account', 'ip')
     or target_scope_key is null or char_length(target_scope_key) not between 1 and 64 then
    raise exception using errcode = '22023', message = 'provider_rate_limit_invalid';
  end if;

  insert into private.provider_rate_limits (
    scope_type, scope_key, action, window_started_at, request_count, expires_at
  ) values (
    target_scope_type, target_scope_key, target_action, effective_at, 1, effective_at + action_window
  )
  on conflict (scope_type, scope_key, action) do update
  set window_started_at = case
        when private.provider_rate_limits.expires_at <= effective_at then effective_at
        else private.provider_rate_limits.window_started_at end,
      request_count = case
        when private.provider_rate_limits.expires_at <= effective_at then 1
        else private.provider_rate_limits.request_count + 1 end,
      expires_at = case
        when private.provider_rate_limits.expires_at <= effective_at then effective_at + action_window
        else private.provider_rate_limits.expires_at end
  returning request_count into observed_count;
  return observed_count <= action_limit;
end;
$$;

create or replace function public.tab_two_consume_provider_rate_limit(
  target_account_id uuid,
  target_action text,
  ip_fingerprint text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_allowed boolean := true;
  ip_allowed boolean;
begin
  delete from private.provider_rate_limits rate
  where rate.expires_at < effective_at - interval '1 day';
  if target_account_id is not null then
    account_allowed := private.consume_provider_rate_scope(
      'account', target_account_id::text, target_action, effective_at
    );
  end if;
  ip_allowed := private.consume_provider_rate_scope(
    'ip', ip_fingerprint, target_action, effective_at
  );
  return account_allowed and ip_allowed;
end;
$$;

revoke all on function public.tab_two_provider_create_oauth_transaction(
  uuid, uuid, text, text, text, smallint, text, text, text, text, timestamptz, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.tab_two_provider_consume_oauth_transaction(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_upsert_connection(
  uuid, uuid, text, text, text, text, text[], smallint, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.tab_two_provider_list_connections(uuid) from public, anon, authenticated;
revoke all on function public.tab_two_provider_get_connection(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tab_two_provider_find_connection_by_subject(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_rotate_refresh_token(
  uuid, uuid, smallint, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.tab_two_provider_mark_reconnect_required(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tab_two_provider_delete_connection(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tab_two_consume_provider_rate_limit(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.consume_provider_rate_scope(text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.tab_two_provider_create_oauth_transaction(
  uuid, uuid, text, text, text, smallint, text, text, text, text, timestamptz, uuid, timestamptz
) to service_role;
grant execute on function public.tab_two_provider_consume_oauth_transaction(text, timestamptz) to service_role;
grant execute on function public.tab_two_provider_upsert_connection(
  uuid, uuid, text, text, text, text, text[], smallint, text, text, text, timestamptz
) to service_role;
grant execute on function public.tab_two_provider_list_connections(uuid) to service_role;
grant execute on function public.tab_two_provider_get_connection(uuid, uuid) to service_role;
grant execute on function public.tab_two_provider_find_connection_by_subject(uuid, text, text) to service_role;
grant execute on function public.tab_two_provider_rotate_refresh_token(
  uuid, uuid, smallint, text, text, text, timestamptz
) to service_role;
grant execute on function public.tab_two_provider_mark_reconnect_required(uuid, uuid, timestamptz) to service_role;
grant execute on function public.tab_two_provider_delete_connection(uuid, uuid, timestamptz) to service_role;
grant execute on function public.tab_two_consume_provider_rate_limit(uuid, text, text, timestamptz) to service_role;
grant execute on function private.consume_provider_rate_scope(text, text, text, timestamptz) to service_role;

comment on table private.provider_connections is
  'Account-bound provider metadata and encrypted refresh-token authority; never exposed to extension roles.';
comment on table private.provider_oauth_transactions is
  'Ten-minute one-use provider OAuth transactions with encrypted PKCE verifier custody.';
