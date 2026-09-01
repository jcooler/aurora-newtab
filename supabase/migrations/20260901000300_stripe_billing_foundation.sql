create type private.billing_plan as enum (
  'monthly',
  'annual',
  'intro_annual'
);

create type private.billing_state as enum (
  'none',
  'active',
  'past_due',
  'canceling',
  'expired'
);

create type private.introductory_claim_state as enum (
  'reserved',
  'redeemed'
);

create table private.stripe_customers (
  account_id uuid primary key references public.tab_two_accounts(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_customers_sandbox_id check (customer_id ~ '^cus_[A-Za-z0-9_]+$')
);

create table private.billing_subscriptions (
  account_id uuid primary key references public.tab_two_accounts(id) on delete cascade,
  customer_id text not null unique references private.stripe_customers(customer_id) on delete cascade,
  subscription_id text not null unique,
  plan private.billing_plan not null,
  state private.billing_state not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  courtesy_end timestamptz,
  cancel_at_period_end boolean not null default false,
  authoritative_event_created bigint not null,
  authoritative_event_priority integer not null,
  authoritative_event_id text not null,
  outcome_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_sandbox_id check (subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint billing_subscriptions_event_id check (authoritative_event_id ~ '^evt_[A-Za-z0-9_]+$'),
  constraint billing_subscriptions_event_priority check (authoritative_event_priority between 0 and 100),
  constraint billing_subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint billing_subscriptions_courtesy_order check (
    courtesy_end is null
    or (current_period_end is not null and courtesy_end > current_period_end)
  ),
  constraint billing_subscriptions_outcome_present check (length(btrim(outcome_code)) between 1 and 100)
);

create table private.billing_checkout_sessions (
  account_id uuid primary key references public.tab_two_accounts(id) on delete cascade,
  customer_id text not null references private.stripe_customers(customer_id) on delete cascade,
  checkout_session_id text not null unique,
  subscription_id text unique,
  plan private.billing_plan not null,
  reserved_at timestamptz not null,
  reserved_until timestamptz not null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint billing_checkout_sandbox_session check (checkout_session_id ~ '^cs_test_[A-Za-z0-9_]+$'),
  constraint billing_checkout_subscription_id check (subscription_id is null or subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint billing_checkout_reservation_order check (reserved_until > reserved_at)
);

create table private.introductory_claims (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.tab_two_accounts(id) on delete cascade,
  customer_id text not null unique references private.stripe_customers(customer_id) on delete cascade,
  checkout_session_id text not null unique,
  subscription_id text unique,
  state private.introductory_claim_state not null,
  reserved_at timestamptz not null,
  reserved_until timestamptz not null,
  redeemed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint introductory_claims_sandbox_session check (checkout_session_id ~ '^cs_test_[A-Za-z0-9_]+$'),
  constraint introductory_claims_subscription_id check (subscription_id is null or subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint introductory_claims_reservation_order check (reserved_until > reserved_at),
  constraint introductory_claims_redemption_shape check (
    (state = 'reserved' and redeemed_at is null)
    or (state = 'redeemed' and redeemed_at is not null)
  )
);

create table private.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  object_id text not null,
  stripe_created_at bigint not null,
  payload_sha256 bytea not null,
  outcome_code text,
  received_at timestamptz not null,
  processed_at timestamptz,
  constraint stripe_webhook_events_sandbox_id check (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  constraint stripe_webhook_event_type_present check (length(btrim(event_type)) between 1 and 200),
  constraint stripe_webhook_object_present check (length(btrim(object_id)) between 1 and 200),
  constraint stripe_webhook_payload_hash check (octet_length(payload_sha256) = 32),
  constraint stripe_webhook_outcome_present check (outcome_code is null or length(btrim(outcome_code)) between 1 and 100),
  constraint stripe_webhook_processed_order check (processed_at is null or processed_at >= received_at)
);

create table private.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  previous_state private.billing_state,
  next_state private.billing_state not null,
  plan private.billing_plan not null,
  outcome_code text not null,
  authoritative_event_created bigint not null,
  occurred_at timestamptz not null,
  constraint billing_audit_outcome_present check (length(btrim(outcome_code)) between 1 and 100)
);

create table private.billing_rate_limits (
  account_id uuid not null references public.tab_two_accounts(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (account_id, action),
  constraint billing_rate_limit_action check (action in ('checkout', 'portal')),
  constraint billing_rate_limit_count_positive check (request_count > 0)
);

revoke all on table private.stripe_customers from public, anon, authenticated;
revoke all on table private.billing_subscriptions from public, anon, authenticated;
revoke all on table private.billing_checkout_sessions from public, anon, authenticated;
revoke all on table private.introductory_claims from public, anon, authenticated;
revoke all on table private.stripe_webhook_events from public, anon, authenticated;
revoke all on table private.billing_audit_events from public, anon, authenticated;
revoke all on table private.billing_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.stripe_customers to service_role;
grant select, insert, update, delete on table private.billing_subscriptions to service_role;
grant select, insert, update, delete on table private.billing_checkout_sessions to service_role;
grant select, insert, update, delete on table private.introductory_claims to service_role;
grant select, insert, update, delete on table private.stripe_webhook_events to service_role;
grant select, insert, update, delete on table private.billing_audit_events to service_role;
grant select, insert, update, delete on table private.billing_rate_limits to service_role;

create or replace function private.consume_billing_rate_limit(
  target_account_id uuid,
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
  current_limit private.billing_rate_limits%rowtype;
begin
  if target_action not in ('checkout', 'portal')
    or effective_at is null
    or window_seconds not between 1 and 3600
    or maximum_requests not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_billing_rate_limit';
  end if;
  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;
  select * into current_limit from private.billing_rate_limits rate_limit
  where rate_limit.account_id = target_account_id and rate_limit.action = target_action
  for update;
  if not found or current_limit.window_started_at + make_interval(secs => window_seconds) <= effective_at then
    insert into private.billing_rate_limits (account_id, action, window_started_at, request_count)
    values (target_account_id, target_action, effective_at, 1)
    on conflict (account_id, action) do update
    set window_started_at = excluded.window_started_at, request_count = 1;
    return true;
  end if;
  if current_limit.request_count >= maximum_requests then return false; end if;
  update private.billing_rate_limits
  set request_count = request_count + 1
  where account_id = target_account_id and action = target_action;
  return true;
end;
$$;

create or replace function private.acquire_stripe_customer(
  target_account_id uuid,
  proposed_customer_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_customer_id text;
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'account_id_required';
  end if;
  if proposed_customer_id is null or proposed_customer_id !~ '^cus_[A-Za-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'sandbox_customer_id_required';
  end if;

  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;

  select mapping.customer_id into existing_customer_id
  from private.stripe_customers mapping
  where mapping.account_id = target_account_id;
  if existing_customer_id is not null then
    return existing_customer_id;
  end if;

  insert into private.stripe_customers (account_id, customer_id)
  values (target_account_id, proposed_customer_id);
  return proposed_customer_id;
end;
$$;

create or replace function private.reserve_billing_checkout(
  target_account_id uuid,
  target_customer_id text,
  target_checkout_session_id text,
  target_plan private.billing_plan,
  reservation_expires_at timestamptz,
  effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription private.billing_subscriptions%rowtype;
  checkout_reservation private.billing_checkout_sessions%rowtype;
  claim private.introductory_claims%rowtype;
begin
  if effective_at is null or reservation_expires_at is null or reservation_expires_at <= effective_at then
    raise exception using errcode = '22023', message = 'valid_reservation_window_required';
  end if;
  if target_checkout_session_id is null or target_checkout_session_id !~ '^cs_test_[A-Za-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'sandbox_checkout_session_id_required';
  end if;

  perform 1 from private.stripe_customers mapping
  where mapping.account_id = target_account_id and mapping.customer_id = target_customer_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'customer_mapping_not_found';
  end if;

  select * into existing_subscription from private.billing_subscriptions subscription
  where subscription.account_id = target_account_id
  for update;
  if found and existing_subscription.state in ('active', 'past_due', 'canceling') then
    return false;
  end if;

  select * into checkout_reservation from private.billing_checkout_sessions checkout
  where checkout.account_id = target_account_id
  for update;
  if found and checkout_reservation.subscription_id is null
    and checkout_reservation.reserved_until > effective_at then
    return false;
  end if;

  if target_plan = 'intro_annual' then
    select * into claim from private.introductory_claims intro
    where intro.account_id = target_account_id
    for update;

    if found and (claim.state = 'redeemed' or claim.reserved_until > effective_at) then
      return false;
    end if;
  end if;

  insert into private.billing_checkout_sessions (
    account_id, customer_id, checkout_session_id, subscription_id,
    plan, reserved_at, reserved_until, completed_at, updated_at
  ) values (
    target_account_id, target_customer_id, target_checkout_session_id, null,
    target_plan, effective_at, reservation_expires_at, null, effective_at
  ) on conflict (account_id) do update set
    customer_id = excluded.customer_id,
    checkout_session_id = excluded.checkout_session_id,
    subscription_id = null,
    plan = excluded.plan,
    reserved_at = excluded.reserved_at,
    reserved_until = excluded.reserved_until,
    completed_at = null,
    updated_at = excluded.updated_at;

  if target_plan = 'intro_annual' then
    insert into private.introductory_claims (
      account_id, customer_id, checkout_session_id, subscription_id,
      state, reserved_at, reserved_until, redeemed_at, updated_at
    ) values (
      target_account_id, target_customer_id, target_checkout_session_id, null,
      'reserved', effective_at, reservation_expires_at, null, effective_at
    ) on conflict (account_id) do update set
      customer_id = excluded.customer_id,
      checkout_session_id = excluded.checkout_session_id,
      subscription_id = null,
      state = 'reserved',
      reserved_at = excluded.reserved_at,
      reserved_until = excluded.reserved_until,
      redeemed_at = null,
      updated_at = excluded.updated_at;
  end if;
  return true;
end;
$$;

create or replace function private.claim_stripe_webhook_event(
  target_event_id text,
  target_event_type text,
  target_object_id text,
  target_stripe_created_at bigint,
  target_payload_sha256 bytea,
  target_received_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash bytea;
  stored_processed_at timestamptz;
  inserted_count integer;
begin
  if target_event_id is null or target_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or target_event_type is null or length(btrim(target_event_type)) not between 1 and 200
    or target_object_id is null or length(btrim(target_object_id)) not between 1 and 200
    or target_stripe_created_at is null or target_stripe_created_at < 0
    or target_payload_sha256 is null or octet_length(target_payload_sha256) <> 32
    or target_received_at is null then
    raise exception using errcode = '22023', message = 'invalid_webhook_claim';
  end if;

  insert into private.stripe_webhook_events (
    event_id, event_type, object_id, stripe_created_at, payload_sha256, received_at
  ) values (
    target_event_id, target_event_type, target_object_id,
    target_stripe_created_at, target_payload_sha256, target_received_at
  ) on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return 'claimed'; end if;

  select event.payload_sha256, event.processed_at into stored_hash, stored_processed_at
  from private.stripe_webhook_events event
  where event.event_id = target_event_id
  for update;
  if stored_hash <> target_payload_sha256 then
    raise exception using errcode = '22000', message = 'webhook_payload_hash_mismatch';
  end if;
  return case when stored_processed_at is null then 'resume' else 'duplicate' end;
end;
$$;

create or replace function private.complete_stripe_webhook_event(
  target_event_id text,
  target_outcome_code text,
  target_processed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_outcome_code is null or length(btrim(target_outcome_code)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'outcome_code_required';
  end if;
  update private.stripe_webhook_events
  set outcome_code = target_outcome_code, processed_at = target_processed_at
  where event_id = target_event_id and processed_at is null;
  return found;
end;
$$;

create or replace function private.apply_stripe_billing_snapshot(
  target_account_id uuid,
  target_customer_id text,
  target_subscription_id text,
  target_checkout_session_id text,
  target_plan private.billing_plan,
  target_state private.billing_state,
  target_current_period_start timestamptz,
  target_current_period_end timestamptz,
  target_cancel_at_period_end boolean,
  target_authoritative_event_created bigint,
  target_authoritative_event_priority integer,
  target_authoritative_event_id text,
  target_outcome_code text,
  effective_at timestamptz,
  target_courtesy_end timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous private.billing_subscriptions%rowtype;
  checkout_reservation private.billing_checkout_sessions%rowtype;
  intro_claim private.introductory_claims%rowtype;
  had_previous boolean := false;
  is_transition boolean := false;
  access_expires_at timestamptz;
  all_capabilities private.premium_capability[] := array[
    'encrypted_sync', 'multi_account', 'metrics_history',
    'google_calendar', 'microsoft_calendar', 'strava'
  ]::private.premium_capability[];
begin
  if target_subscription_id is null or target_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
    or target_checkout_session_id is null or target_checkout_session_id !~ '^cs_test_[A-Za-z0-9_]+$'
    or target_state = 'none'
    or target_authoritative_event_created is null or target_authoritative_event_created < 0
    or target_authoritative_event_priority not between 0 and 100
    or target_authoritative_event_id is null or target_authoritative_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or target_outcome_code is null or length(btrim(target_outcome_code)) not between 1 and 100
    or effective_at is null then
    raise exception using errcode = '22023', message = 'invalid_billing_snapshot';
  end if;
  if target_state in ('active', 'canceling')
    and (target_current_period_end is null or target_current_period_end <= effective_at) then
    raise exception using errcode = '22023', message = 'future_paid_through_required';
  end if;
  if target_state = 'past_due'
    and (target_current_period_end is null
      or target_courtesy_end is null
      or target_courtesy_end <= target_current_period_end
      or target_courtesy_end <= effective_at
      or target_courtesy_end > target_current_period_end + interval '7 days') then
    raise exception using errcode = '22023', message = 'bounded_courtesy_required';
  end if;

  perform 1 from public.tab_two_accounts account
  where account.id = target_account_id and account.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'account_not_found';
  end if;
  perform 1 from private.stripe_customers mapping
  where mapping.account_id = target_account_id and mapping.customer_id = target_customer_id;
  if not found then
    raise exception using errcode = '23503', message = 'customer_mapping_not_found';
  end if;

  select * into previous from private.billing_subscriptions subscription
  where subscription.account_id = target_account_id
  for update;
  had_previous := found;
  if had_previous and previous.subscription_id = target_subscription_id
    and (previous.authoritative_event_created, previous.authoritative_event_priority, previous.authoritative_event_id)
      >= (target_authoritative_event_created, target_authoritative_event_priority, target_authoritative_event_id) then
    return 'stale';
  end if;

  if not had_previous or previous.subscription_id <> target_subscription_id then
    if had_previous and previous.state <> 'expired' then
      return 'conflicting_subscription';
    end if;

    select * into checkout_reservation from private.billing_checkout_sessions checkout
    where checkout.account_id = target_account_id
    for update;
    if not found
      or checkout_reservation.customer_id <> target_customer_id
      or checkout_reservation.checkout_session_id <> target_checkout_session_id
      or checkout_reservation.plan <> target_plan
      or to_timestamp(target_authoritative_event_created) > checkout_reservation.reserved_until then
      return 'checkout_binding_rejected';
    end if;

    if target_plan = 'intro_annual' then
      select * into intro_claim from private.introductory_claims claim
      where claim.account_id = target_account_id
      for update;
      if not found
        or intro_claim.customer_id <> target_customer_id
        or intro_claim.checkout_session_id <> target_checkout_session_id
        or (intro_claim.state = 'redeemed' and intro_claim.subscription_id <> target_subscription_id)
        or (intro_claim.state = 'reserved' and to_timestamp(target_authoritative_event_created) > intro_claim.reserved_until) then
        return 'introductory_claim_rejected';
      end if;
      if intro_claim.state = 'reserved' then
        update private.introductory_claims
        set state = 'redeemed', subscription_id = target_subscription_id,
            redeemed_at = effective_at, updated_at = effective_at
        where account_id = target_account_id;
      end if;
    end if;

    update private.billing_checkout_sessions
    set subscription_id = target_subscription_id,
        completed_at = coalesce(completed_at, effective_at),
        updated_at = effective_at
    where account_id = target_account_id;
  else
    select * into checkout_reservation from private.billing_checkout_sessions checkout
    where checkout.account_id = target_account_id;
    if not found or checkout_reservation.checkout_session_id <> target_checkout_session_id then
      return 'checkout_binding_rejected';
    end if;
  end if;

  is_transition := not had_previous
    or previous.subscription_id <> target_subscription_id
    or previous.plan <> target_plan
    or previous.state <> target_state
    or previous.current_period_start is distinct from target_current_period_start
    or previous.current_period_end is distinct from target_current_period_end
    or previous.courtesy_end is distinct from target_courtesy_end
    or previous.cancel_at_period_end <> target_cancel_at_period_end;

  insert into private.billing_subscriptions (
    account_id, customer_id, subscription_id, plan, state,
    current_period_start, current_period_end, courtesy_end,
    cancel_at_period_end, authoritative_event_created, authoritative_event_priority,
    authoritative_event_id, outcome_code, updated_at
  ) values (
    target_account_id, target_customer_id, target_subscription_id, target_plan, target_state,
    target_current_period_start, target_current_period_end, target_courtesy_end,
    target_cancel_at_period_end, target_authoritative_event_created, target_authoritative_event_priority,
    target_authoritative_event_id, target_outcome_code, effective_at
  ) on conflict (account_id) do update set
    customer_id = excluded.customer_id,
    subscription_id = excluded.subscription_id,
    plan = excluded.plan,
    state = excluded.state,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    courtesy_end = excluded.courtesy_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    authoritative_event_created = excluded.authoritative_event_created,
    authoritative_event_priority = excluded.authoritative_event_priority,
    authoritative_event_id = excluded.authoritative_event_id,
    outcome_code = excluded.outcome_code,
    updated_at = excluded.updated_at;

  access_expires_at := case
    when target_state in ('active', 'canceling') then target_current_period_end
    when target_state = 'past_due' then target_courtesy_end
    else null
  end;

  if access_expires_at is not null and access_expires_at > effective_at then
    insert into private.account_grants (
      account_id, source, capabilities, starts_at, expires_at, revoked_at, updated_at
    ) values (
      target_account_id, 'stripe', all_capabilities,
      coalesce(target_current_period_start, effective_at), access_expires_at, null, effective_at
    ) on conflict (account_id, source) do update set
      capabilities = excluded.capabilities,
      starts_at = excluded.starts_at,
      expires_at = excluded.expires_at,
      revoked_at = null,
      updated_at = excluded.updated_at;
  else
    update private.account_grants
    set revoked_at = effective_at, updated_at = effective_at
    where account_id = target_account_id
      and source = 'stripe'
      and (revoked_at is null or revoked_at > effective_at);
  end if;

  if is_transition then
    insert into private.billing_audit_events (
      account_id, previous_state, next_state, plan, outcome_code,
      authoritative_event_created, occurred_at
    ) values (
      target_account_id,
      case when had_previous then previous.state else null end,
      target_state, target_plan, target_outcome_code,
      target_authoritative_event_created, effective_at
    );
  end if;
  return 'applied';
end;
$$;

revoke all on function private.acquire_stripe_customer(uuid, text) from public, anon, authenticated;
revoke all on function private.reserve_billing_checkout(uuid, text, text, private.billing_plan, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.claim_stripe_webhook_event(text, text, text, bigint, bytea, timestamptz) from public, anon, authenticated;
revoke all on function private.complete_stripe_webhook_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.apply_stripe_billing_snapshot(uuid, text, text, text, private.billing_plan, private.billing_state, timestamptz, timestamptz, boolean, bigint, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.consume_billing_rate_limit(uuid, text, timestamptz, integer, integer) from public, anon, authenticated;

grant execute on function private.acquire_stripe_customer(uuid, text) to service_role;
grant execute on function private.reserve_billing_checkout(uuid, text, text, private.billing_plan, timestamptz, timestamptz) to service_role;
grant execute on function private.claim_stripe_webhook_event(text, text, text, bigint, bytea, timestamptz) to service_role;
grant execute on function private.complete_stripe_webhook_event(text, text, timestamptz) to service_role;
grant execute on function private.apply_stripe_billing_snapshot(uuid, text, text, text, private.billing_plan, private.billing_state, timestamptz, timestamptz, boolean, bigint, integer, text, text, timestamptz, timestamptz) to service_role;
grant execute on function private.consume_billing_rate_limit(uuid, text, timestamptz, integer, integer) to service_role;

comment on table private.stripe_customers is 'Minimal sandbox Stripe customer identifiers keyed only by provider-neutral account UUID.';
comment on table private.stripe_webhook_events is 'Verified webhook idempotency metadata; raw request bodies are never persisted.';
comment on function private.apply_stripe_billing_snapshot(uuid, text, text, text, private.billing_plan, private.billing_state, timestamptz, timestamptz, boolean, bigint, integer, text, text, timestamptz, timestamptz)
  is 'Applies one reorder-safe normalized sandbox billing snapshot and mutates only the Stripe grant.';

create or replace function public.tab_two_billing_summary_for_account(target_account_id uuid)
returns table (
  state text,
  plan text,
  current_period_end timestamptz,
  courtesy_end timestamptz,
  cancel_at_period_end boolean,
  introductory_eligible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(subscription.state::text, 'none'),
         subscription.plan::text,
         subscription.current_period_end,
         subscription.courtesy_end,
         coalesce(subscription.cancel_at_period_end, false),
         not exists (
           select 1 from private.introductory_claims claim
           where claim.account_id = target_account_id
             and (claim.state = 'redeemed' or claim.reserved_until > now())
         )
  from (select 1) seed
  left join private.billing_subscriptions subscription
    on subscription.account_id = target_account_id;
$$;

create or replace function public.tab_two_billing_customer_for_account(target_account_id uuid)
returns text language sql stable security definer set search_path = ''
as $$ select customer.customer_id from private.stripe_customers customer where customer.account_id = target_account_id; $$;

create or replace function public.tab_two_acquire_stripe_customer(target_account_id uuid, proposed_customer_id text)
returns text language sql security definer set search_path = ''
as $$ select private.acquire_stripe_customer(target_account_id, proposed_customer_id); $$;

create or replace function public.tab_two_reserve_billing_checkout(target_account_id uuid, target_customer_id text, target_checkout_session_id text, target_plan text, reservation_expires_at timestamptz, effective_at timestamptz)
returns boolean language sql security definer set search_path = ''
as $$ select private.reserve_billing_checkout(target_account_id, target_customer_id, target_checkout_session_id, target_plan::private.billing_plan, reservation_expires_at, effective_at); $$;

create or replace function public.tab_two_claim_stripe_webhook_event(target_event_id text, target_event_type text, target_object_id text, target_stripe_created_at bigint, target_payload_sha256_hex text, target_received_at timestamptz)
returns text language sql security definer set search_path = ''
as $$ select private.claim_stripe_webhook_event(target_event_id, target_event_type, target_object_id, target_stripe_created_at, decode(target_payload_sha256_hex, 'hex'), target_received_at); $$;

create or replace function public.tab_two_complete_stripe_webhook_event(target_event_id text, target_outcome_code text, target_processed_at timestamptz)
returns boolean language sql security definer set search_path = ''
as $$ select private.complete_stripe_webhook_event(target_event_id, target_outcome_code, target_processed_at); $$;

create or replace function public.tab_two_apply_stripe_billing_snapshot(
  target_account_id uuid, target_customer_id text, target_subscription_id text, target_checkout_session_id text,
  target_plan text, target_state text, target_current_period_start timestamptz,
  target_current_period_end timestamptz, target_cancel_at_period_end boolean,
  target_authoritative_event_created bigint, target_authoritative_event_priority integer,
  target_authoritative_event_id text, target_outcome_code text,
  effective_at timestamptz, target_courtesy_end timestamptz
)
returns text language sql security definer set search_path = ''
as $$
  select private.apply_stripe_billing_snapshot(
    target_account_id, target_customer_id, target_subscription_id, target_checkout_session_id,
    target_plan::private.billing_plan, target_state::private.billing_state,
    target_current_period_start, target_current_period_end, target_cancel_at_period_end,
    target_authoritative_event_created, target_authoritative_event_priority,
    target_authoritative_event_id, target_outcome_code, effective_at, target_courtesy_end
  );
$$;

create or replace function public.tab_two_consume_billing_rate_limit(target_account_id uuid, target_action text, effective_at timestamptz)
returns boolean language sql security definer set search_path = ''
as $$ select private.consume_billing_rate_limit(target_account_id, target_action, effective_at, 60, 5); $$;

revoke all on function public.tab_two_billing_summary_for_account(uuid) from public, anon, authenticated;
revoke all on function public.tab_two_billing_customer_for_account(uuid) from public, anon, authenticated;
revoke all on function public.tab_two_acquire_stripe_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.tab_two_reserve_billing_checkout(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_claim_stripe_webhook_event(text, text, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_complete_stripe_webhook_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_apply_stripe_billing_snapshot(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, bigint, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.tab_two_consume_billing_rate_limit(uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.tab_two_billing_summary_for_account(uuid) to service_role;
grant execute on function public.tab_two_billing_customer_for_account(uuid) to service_role;
grant execute on function public.tab_two_acquire_stripe_customer(uuid, text) to service_role;
grant execute on function public.tab_two_reserve_billing_checkout(uuid, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.tab_two_claim_stripe_webhook_event(text, text, text, bigint, text, timestamptz) to service_role;
grant execute on function public.tab_two_complete_stripe_webhook_event(text, text, timestamptz) to service_role;
grant execute on function public.tab_two_apply_stripe_billing_snapshot(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, bigint, integer, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.tab_two_consume_billing_rate_limit(uuid, text, timestamptz) to service_role;
