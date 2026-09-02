begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select has_function(
  'public', 'tab_two_active_billing_checkout',
  array['uuid', 'timestamp with time zone'],
  'service boundary exposes only the active Checkout binding'
);
select has_function(
  'public', 'tab_two_expire_billing_checkout',
  array['uuid', 'text', 'timestamp with time zone'],
  'service boundary can expire only one exact incomplete Checkout binding'
);

insert into public.tab_two_accounts (id) values
  ('42000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000002');

set local role anon;
select throws_ok(
  $$select * from public.tab_two_active_billing_checkout(
    '42000000-0000-4000-8000-000000000001', '2026-09-01 15:05:00+00')$$,
  '42501', null, 'anonymous clients cannot inspect an active Checkout binding'
);
select throws_ok(
  $$select public.tab_two_expire_billing_checkout(
    '42000000-0000-4000-8000-000000000001', 'cs_test_recovery', '2026-09-01 15:05:00+00')$$,
  '42501', null, 'anonymous clients cannot expire an active Checkout binding'
);

reset role;
set local role authenticated;
select throws_ok(
  $$select * from public.tab_two_active_billing_checkout(
    '42000000-0000-4000-8000-000000000001', '2026-09-01 15:05:00+00')$$,
  '42501', null, 'authenticated clients cannot inspect an active Checkout binding'
);
select throws_ok(
  $$select public.tab_two_expire_billing_checkout(
    '42000000-0000-4000-8000-000000000001', 'cs_test_recovery', '2026-09-01 15:05:00+00')$$,
  '42501', null, 'authenticated clients cannot expire an active Checkout binding'
);

reset role;
set local role service_role;

select is(private.acquire_stripe_customer(
  '42000000-0000-4000-8000-000000000001', 'cus_recovery_a'
), 'cus_recovery_a', 'recovery fixture has one exact customer mapping');
select ok(private.reserve_billing_checkout(
  '42000000-0000-4000-8000-000000000001', 'cus_recovery_a', 'cs_test_recovery_a',
  'intro_annual', '2026-09-01 15:31:00+00', '2026-09-01 15:00:00+00'
), 'recovery fixture has one incomplete introductory Checkout');

select results_eq(
  $$select checkout_session_id, customer_id, plan, reserved_until
    from public.tab_two_active_billing_checkout(
      '42000000-0000-4000-8000-000000000001', '2026-09-01 15:05:00+00')$$,
  $$values (
    'cs_test_recovery_a'::text,
    'cus_recovery_a'::text,
    'intro_annual'::text,
    '2026-09-01 15:31:00+00'::timestamptz
  )$$,
  'service role reads only the minimum future incomplete reservation binding'
);

select ok(public.tab_two_expire_billing_checkout(
  '42000000-0000-4000-8000-000000000001', 'cs_test_recovery_a', '2026-09-01 15:06:00+00'
), 'the exact incomplete reservation is expired');
select is_empty(
  $$select * from public.tab_two_active_billing_checkout(
    '42000000-0000-4000-8000-000000000001', '2026-09-01 15:06:00+00')$$,
  'an expired binding is no longer active'
);
select is(
  (select reserved_until from private.introductory_claims
    where account_id = '42000000-0000-4000-8000-000000000001'),
  '2026-09-01 15:06:00+00'::timestamptz,
  'a matching unredeemed introductory reservation is expired atomically'
);
select ok(public.tab_two_expire_billing_checkout(
  '42000000-0000-4000-8000-000000000001', 'cs_test_recovery_a', '2026-09-01 15:06:00+00'
), 'expiring the same exact incomplete binding is idempotent');
select isnt(public.tab_two_expire_billing_checkout(
  '42000000-0000-4000-8000-000000000001', 'cs_test_wrong', '2026-09-01 15:07:00+00'
), true, 'a different Checkout id cannot expire the account reservation');

select is(private.acquire_stripe_customer(
  '42000000-0000-4000-8000-000000000002', 'cus_recovery_b'
), 'cus_recovery_b', 'completed fixture has its own customer mapping');
select ok(private.reserve_billing_checkout(
  '42000000-0000-4000-8000-000000000002', 'cus_recovery_b', 'cs_test_recovery_b',
  'monthly', '2026-09-01 16:31:00+00', '2026-09-01 16:00:00+00'
), 'completed fixture begins as one incomplete Checkout');
update private.billing_checkout_sessions
set subscription_id = 'sub_recovery_b', completed_at = '2026-09-01 16:02:00+00'
where account_id = '42000000-0000-4000-8000-000000000002';

select is_empty(
  $$select * from public.tab_two_active_billing_checkout(
    '42000000-0000-4000-8000-000000000002', '2026-09-01 16:05:00+00')$$,
  'a completed Checkout is never exposed as resumable'
);
select isnt(public.tab_two_expire_billing_checkout(
  '42000000-0000-4000-8000-000000000002', 'cs_test_recovery_b', '2026-09-01 16:05:00+00'
), true, 'a completed Checkout cannot be expired by recovery logic');
select is(
  (select reserved_until from private.billing_checkout_sessions
    where account_id = '42000000-0000-4000-8000-000000000002'),
  '2026-09-01 16:31:00+00'::timestamptz,
  'completed Checkout history is unchanged'
);

select * from finish();
rollback;
