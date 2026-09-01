create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create type private.premium_capability as enum (
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
  'strava'
);

create type private.grant_source as enum (
  'stripe',
  'complimentary_owner'
);

create or replace function private.premium_capabilities_are_unique(
  candidate private.premium_capability[]
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(candidate) = count(distinct capability)
  from unnest(candidate) as capability;
$$;

create table public.tab_two_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tab_two_accounts_deleted_after_creation
    check (deleted_at is null or deleted_at >= created_at)
);

create table public.tab_two_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tab_two_identities_google_only check (provider = 'google'),
  constraint tab_two_identities_provider_subject_present check (length(btrim(provider_subject)) > 0),
  constraint tab_two_identities_email_present check (length(btrim(email)) > 0),
  constraint tab_two_identities_provider_subject_unique unique (provider, provider_subject)
);

create table private.account_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  source private.grant_source not null,
  capabilities private.premium_capability[] not null,
  starts_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_grants_capabilities_present check (cardinality(capabilities) > 0),
  constraint account_grants_capabilities_unique
    check (private.premium_capabilities_are_unique(capabilities)),
  constraint account_grants_expiry_after_start check (expires_at is null or expires_at > starts_at),
  constraint account_grants_account_source_unique unique (account_id, source)
);

create table private.entitlement_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  event_type text not null,
  actor text not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint entitlement_audit_event_type_present check (length(btrim(event_type)) > 0),
  constraint entitlement_audit_actor_present check (length(btrim(actor)) > 0),
  constraint entitlement_audit_reason_present check (length(btrim(reason)) > 0),
  constraint entitlement_audit_details_object check (jsonb_typeof(details) = 'object')
);

revoke all on table public.tab_two_accounts from public, anon, authenticated;
revoke all on table public.tab_two_identities from public, anon, authenticated;
grant select on table public.tab_two_accounts to authenticated;
grant select on table public.tab_two_identities to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;

alter table public.tab_two_accounts enable row level security;
alter table public.tab_two_identities enable row level security;

create policy tab_two_accounts_select_own
on public.tab_two_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.tab_two_identities identity_link
    where identity_link.account_id = tab_two_accounts.id
      and identity_link.auth_user_id = auth.uid()
  )
);

create policy tab_two_identities_select_own
on public.tab_two_identities
for select
to authenticated
using (auth_user_id = auth.uid());

create or replace function private.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select identity_link.account_id
  from public.tab_two_identities identity_link
  join public.tab_two_accounts account
    on account.id = identity_link.account_id
  where identity_link.auth_user_id = auth.uid()
    and account.deleted_at is null
  limit 1;
$$;

create or replace function private.effective_entitlement(
  target_account_id uuid,
  effective_at timestamptz default now()
)
returns table (
  capabilities text[],
  grant_sources text[],
  earliest_expiry timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_grants as (
    select account_grant.source,
           account_grant.capabilities,
           account_grant.expires_at
    from private.account_grants account_grant
    join public.tab_two_accounts account
      on account.id = account_grant.account_id
    where account_grant.account_id = target_account_id
      and account.deleted_at is null
      and account_grant.starts_at <= effective_at
      and (account_grant.expires_at is null or account_grant.expires_at > effective_at)
      and (account_grant.revoked_at is null or account_grant.revoked_at > effective_at)
  ),
  expanded as (
    select active_grant.source::text as grant_source,
           capability::text as capability,
           active_grant.expires_at
    from active_grants active_grant
    cross join lateral unnest(active_grant.capabilities) as capability
  )
  select coalesce(
           array_agg(distinct expanded.capability order by expanded.capability)
             filter (where expanded.capability is not null),
           array[]::text[]
         ) as capabilities,
         coalesce(
           array_agg(distinct expanded.grant_source order by expanded.grant_source)
             filter (where expanded.grant_source is not null),
           array[]::text[]
         ) as grant_sources,
         min(expanded.expires_at) filter (where expanded.expires_at is not null) as earliest_expiry
  from expanded;
$$;

create or replace function private.set_complimentary_owner_grant(
  target_account_id uuid,
  enabled boolean,
  actor text,
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean := false;
  mutation_time timestamptz := clock_timestamp();
  all_capabilities private.premium_capability[] := array[
    'encrypted_sync',
    'multi_account',
    'metrics_history',
    'google_calendar',
    'microsoft_calendar',
    'strava'
  ]::private.premium_capability[];
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'account_id_required';
  end if;
  if enabled is null then
    raise exception using errcode = '22023', message = 'enabled_required';
  end if;
  if actor is null or length(btrim(actor)) = 0 then
    raise exception using errcode = '22023', message = 'actor_required';
  end if;
  if reason is null or length(btrim(reason)) = 0 then
    raise exception using errcode = '22023', message = 'reason_required';
  end if;

  perform 1
  from public.tab_two_accounts account
  where account.id = target_account_id
    and account.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;

  if enabled then
    select not exists (
      select 1
      from private.account_grants account_grant
      where account_grant.account_id = target_account_id
        and account_grant.source = 'complimentary_owner'
        and account_grant.starts_at <= mutation_time
        and (account_grant.expires_at is null or account_grant.expires_at > mutation_time)
        and (account_grant.revoked_at is null or account_grant.revoked_at > mutation_time)
        and account_grant.capabilities @> all_capabilities
        and all_capabilities @> account_grant.capabilities
    ) into changed;

    if changed then
      insert into private.account_grants (
        account_id,
        source,
        capabilities,
        starts_at,
        expires_at,
        revoked_at
      )
      values (
        target_account_id,
        'complimentary_owner',
        all_capabilities,
        mutation_time,
        null,
        null
      )
      on conflict (account_id, source) do update
      set capabilities = excluded.capabilities,
          starts_at = excluded.starts_at,
          expires_at = null,
          revoked_at = null,
          updated_at = mutation_time;
    end if;
  else
    select exists (
      select 1
      from private.account_grants account_grant
      where account_grant.account_id = target_account_id
        and account_grant.source = 'complimentary_owner'
        and account_grant.starts_at <= mutation_time
        and (account_grant.expires_at is null or account_grant.expires_at > mutation_time)
        and (account_grant.revoked_at is null or account_grant.revoked_at > mutation_time)
    ) into changed;

    if changed then
      update private.account_grants
      set revoked_at = mutation_time,
          updated_at = mutation_time
      where account_id = target_account_id
        and source = 'complimentary_owner';
    end if;
  end if;

  if changed then
    insert into private.entitlement_audit_events (
      account_id,
      event_type,
      actor,
      reason,
      occurred_at,
      details
    )
    values (
      target_account_id,
      case when enabled then 'complimentary_owner_enabled' else 'complimentary_owner_disabled' end,
      actor,
      reason,
      mutation_time,
      jsonb_build_object('enabled', enabled, 'source', 'complimentary_owner')
    );
  end if;
end;
$$;

create or replace function private.handle_new_tab_two_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_account_id uuid;
  provider_subject text;
begin
  if new.raw_app_meta_data ->> 'provider' is distinct from 'google' then
    return new;
  end if;

  provider_subject := new.raw_user_meta_data ->> 'sub';
  if provider_subject is null or length(btrim(provider_subject)) = 0 then
    raise exception using errcode = '22023', message = 'google_provider_subject_required';
  end if;
  if new.email is null or length(btrim(new.email)) = 0 then
    raise exception using errcode = '22023', message = 'google_email_required';
  end if;

  insert into public.tab_two_accounts default values
  returning id into new_account_id;

  insert into public.tab_two_identities (
    account_id,
    auth_user_id,
    provider,
    provider_subject,
    email,
    display_name
  )
  values (
    new_account_id,
    new.id,
    'google',
    provider_subject,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_tab_two_account on auth.users;
create trigger on_auth_user_created_create_tab_two_account
after insert on auth.users
for each row execute function private.handle_new_tab_two_auth_user();

revoke all on function private.current_account_id() from public, anon, authenticated;
revoke all on function private.effective_entitlement(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.set_complimentary_owner_grant(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function private.handle_new_tab_two_auth_user() from public, anon, authenticated;
revoke all on function private.premium_capabilities_are_unique(private.premium_capability[]) from public, anon, authenticated;

grant execute on function private.current_account_id() to service_role;
grant execute on function private.effective_entitlement(uuid, timestamptz) to service_role;
grant execute on function private.set_complimentary_owner_grant(uuid, boolean, text, text) to service_role;
grant execute on function private.premium_capabilities_are_unique(private.premium_capability[]) to service_role;

comment on schema private is 'Server-only Tab Two account entitlement state; never exposed to extension client roles.';
comment on table public.tab_two_accounts is 'Provider-neutral Tab Two account identity.';
comment on table public.tab_two_identities is 'Google auth identity mapping separated from provider-neutral accounts.';
comment on function private.set_complimentary_owner_grant(uuid, boolean, text, text)
  is 'Audited service-role mutation by exact provider-neutral account UUID; never accepts email.';
