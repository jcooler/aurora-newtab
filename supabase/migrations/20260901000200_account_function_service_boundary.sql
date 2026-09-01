create or replace function public.tab_two_account_snapshot_for_auth(
  target_auth_user_id uuid
)
returns table (
  account_id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select identity_link.account_id,
         identity_link.email,
         identity_link.display_name
  from public.tab_two_identities identity_link
  join public.tab_two_accounts account
    on account.id = identity_link.account_id
  where identity_link.auth_user_id = target_auth_user_id
    and identity_link.provider = 'google'
    and account.deleted_at is null
  limit 1;
$$;

create or replace function public.tab_two_effective_entitlement_for_account(
  target_account_id uuid,
  effective_at timestamptz
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
  select entitlement.capabilities,
         entitlement.grant_sources,
         entitlement.earliest_expiry
  from private.effective_entitlement(target_account_id, effective_at) entitlement;
$$;

revoke all on function public.tab_two_account_snapshot_for_auth(uuid)
  from public, anon, authenticated;
revoke all on function public.tab_two_effective_entitlement_for_account(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.tab_two_account_snapshot_for_auth(uuid)
  to service_role;
grant execute on function public.tab_two_effective_entitlement_for_account(uuid, timestamptz)
  to service_role;

comment on function public.tab_two_account_snapshot_for_auth(uuid)
  is 'Service-role PostgREST bridge from an authenticated auth user id to a provider-neutral Tab Two account.';
comment on function public.tab_two_effective_entitlement_for_account(uuid, timestamptz)
  is 'Service-role PostgREST bridge to server-only active entitlement calculation.';
