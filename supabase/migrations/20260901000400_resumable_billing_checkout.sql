create or replace function private.active_billing_checkout(
  target_account_id uuid,
  effective_at timestamptz
)
returns table (
  checkout_session_id text,
  customer_id text,
  plan text,
  reserved_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    checkout.checkout_session_id,
    checkout.customer_id,
    checkout.plan::text,
    checkout.reserved_until
  from private.billing_checkout_sessions checkout
  where effective_at is not null
    and checkout.account_id = target_account_id
    and checkout.subscription_id is null
    and checkout.completed_at is null
    and checkout.reserved_until > effective_at
    and not exists (
      select 1
      from private.billing_subscriptions subscription
      where subscription.account_id = target_account_id
        and subscription.state in ('active', 'past_due', 'canceling')
    );
$$;

create or replace function private.expire_billing_checkout(
  target_account_id uuid,
  target_checkout_session_id text,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_reservation private.billing_checkout_sessions%rowtype;
begin
  if effective_at is null
    or target_checkout_session_id is null
    or target_checkout_session_id !~ '^cs_test_[A-Za-z0-9_]+$' then
    return false;
  end if;

  select * into checkout_reservation
  from private.billing_checkout_sessions checkout
  where checkout.account_id = target_account_id
    and checkout.checkout_session_id = target_checkout_session_id
  for update;

  if not found
    or checkout_reservation.subscription_id is not null
    or checkout_reservation.completed_at is not null
    or effective_at <= checkout_reservation.reserved_at then
    return false;
  end if;

  update private.billing_checkout_sessions
  set reserved_until = least(reserved_until, effective_at),
      updated_at = greatest(updated_at, effective_at)
  where account_id = target_account_id
    and checkout_session_id = target_checkout_session_id;

  update private.introductory_claims
  set reserved_until = least(reserved_until, effective_at),
      updated_at = greatest(updated_at, effective_at)
  where account_id = target_account_id
    and checkout_session_id = target_checkout_session_id
    and state = 'reserved'
    and effective_at > reserved_at;

  return true;
end;
$$;

create or replace function public.tab_two_active_billing_checkout(
  target_account_id uuid,
  effective_at timestamptz
)
returns table (
  checkout_session_id text,
  customer_id text,
  plan text,
  reserved_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.active_billing_checkout(target_account_id, effective_at);
$$;

create or replace function public.tab_two_expire_billing_checkout(
  target_account_id uuid,
  target_checkout_session_id text,
  effective_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.expire_billing_checkout(
    target_account_id,
    target_checkout_session_id,
    effective_at
  );
$$;

revoke all on function private.active_billing_checkout(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.expire_billing_checkout(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_active_billing_checkout(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_expire_billing_checkout(uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.tab_two_active_billing_checkout(uuid, timestamptz) to service_role;
grant execute on function public.tab_two_expire_billing_checkout(uuid, text, timestamptz) to service_role;
