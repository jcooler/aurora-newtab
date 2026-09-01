begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select has_table('private', 'stripe_customers', 'sandbox customer mappings are private');
select has_table('private', 'billing_checkout_sessions', 'Checkout reservations are private');
select has_table('private', 'billing_subscriptions', 'normalized subscriptions are private');
select has_table('private', 'introductory_claims', 'introductory claims are private');
select has_table('private', 'stripe_webhook_events', 'webhook idempotency is private');
select has_table('private', 'billing_audit_events', 'billing audit events are private');
select has_table('private', 'billing_rate_limits', 'billing rate limits are private');
select has_function('private', 'acquire_stripe_customer', array['uuid', 'text'], 'customer acquisition function exists');
select has_function('private', 'reserve_billing_checkout', array['uuid', 'text', 'text', 'private.billing_plan', 'timestamp with time zone', 'timestamp with time zone'], 'transactional Checkout reservation exists');
select has_function('private', 'claim_stripe_webhook_event', array['text', 'text', 'text', 'bigint', 'bytea', 'timestamp with time zone'], 'webhook claim function exists');
select has_function('private', 'apply_stripe_billing_snapshot', array['uuid', 'text', 'text', 'text', 'private.billing_plan', 'private.billing_state', 'timestamp with time zone', 'timestamp with time zone', 'boolean', 'bigint', 'integer', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone'], 'atomic normalized snapshot function exists');

select hasnt_column('private', 'stripe_webhook_events', 'payload', 'raw webhook payloads are not persisted');
select hasnt_column('private', 'billing_subscriptions', 'checkout_url', 'Checkout URLs are not persisted');
select hasnt_column('private', 'billing_subscriptions', 'portal_url', 'Portal URLs are not persisted');
select hasnt_column('private', 'stripe_customers', 'email', 'email is not billing authority');

insert into public.tab_two_accounts (id) values
  ('41000000-0000-4000-8000-000000000001'),
  ('41000000-0000-4000-8000-000000000002');

set local role anon;
select throws_ok('select * from private.stripe_customers', '42501', null, 'anonymous clients cannot read customer mappings');
select throws_ok('select * from private.billing_checkout_sessions', '42501', null, 'anonymous clients cannot read Checkout reservations');
select throws_ok('select * from private.billing_subscriptions', '42501', null, 'anonymous clients cannot read subscriptions');
select throws_ok('select * from private.stripe_webhook_events', '42501', null, 'anonymous clients cannot read webhook events');

reset role;
set local role authenticated;
select throws_ok('select * from private.introductory_claims', '42501', null, 'authenticated clients cannot read introductory claims');
select throws_ok('select * from private.billing_audit_events', '42501', null, 'authenticated clients cannot read billing audit events');
select throws_ok(
  $$select private.acquire_stripe_customer('41000000-0000-4000-8000-000000000001', 'cus_client')$$,
  '42501', null, 'authenticated clients cannot execute billing functions'
);

reset role;
set local role service_role;

select ok(private.consume_billing_rate_limit(
  '41000000-0000-4000-8000-000000000001', 'checkout', '2026-09-01 14:00:00+00', 60, 2
), 'the first billing action enters the account window');
select ok(private.consume_billing_rate_limit(
  '41000000-0000-4000-8000-000000000001', 'checkout', '2026-09-01 14:00:01+00', 60, 2
), 'the bounded second billing action is accepted');
select isnt(private.consume_billing_rate_limit(
  '41000000-0000-4000-8000-000000000001', 'checkout', '2026-09-01 14:00:02+00', 60, 2
), true, 'the next action in the same window is rejected');

select is(private.acquire_stripe_customer(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a'
), 'cus_sandbox_a', 'one exact sandbox customer mapping is recorded');
select is(private.acquire_stripe_customer(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_other'
), 'cus_sandbox_a', 'customer acquisition reuses the account mapping');
select throws_ok(
  $$select private.acquire_stripe_customer('41000000-0000-4000-8000-000000000002', 'cus_sandbox_a')$$,
  '23505', null, 'one Stripe customer cannot map to another account'
);

select ok(private.reserve_billing_checkout(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'cs_test_intro_1',
  'intro_annual', '2026-09-01 15:31:00+00', '2026-09-01 15:00:00+00'
), 'an eligible account reserves one expiring introductory Checkout');
select isnt(private.reserve_billing_checkout(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'cs_test_intro_race',
  'intro_annual', '2026-09-01 15:40:00+00', '2026-09-01 15:05:00+00'
), true, 'a concurrent Checkout URL is never returned');
select ok(private.reserve_billing_checkout(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'cs_test_intro_2',
  'intro_annual', '2026-09-01 16:31:00+00', '2026-09-01 16:00:00+00'
), 'an abandoned expired reservation can be replaced');

select is(private.claim_stripe_webhook_event(
  'evt_test_1', 'checkout.session.completed', 'cs_test_intro_2', 1788278700,
  decode(repeat('ab', 32), 'hex'), '2026-09-01 16:06:00+00'
), 'claimed', 'a verified webhook event is claimed once');
select is(private.claim_stripe_webhook_event(
  'evt_test_1', 'checkout.session.completed', 'cs_test_intro_2', 1788278700,
  decode(repeat('ab', 32), 'hex'), '2026-09-01 16:07:00+00'
), 'resume', 'an unprocessed exact retry resumes');
select throws_ok(
  $$select private.claim_stripe_webhook_event(
    'evt_test_1', 'checkout.session.completed', 'cs_test_intro_2', 1788278700,
    decode(repeat('cd', 32), 'hex'), '2026-09-01 16:08:00+00')$$,
  '22000', 'webhook_payload_hash_mismatch', 'an event id with another payload hash is rejected'
);

select lives_ok(
  $$select private.set_complimentary_owner_grant(
    '41000000-0000-4000-8000-000000000001', true, 'billing test', 'owner survives billing')$$,
  'the independent owner grant is active before billing transitions'
);

select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'active', '2026-09-01 16:00:00+00', '2027-09-01 16:00:00+00',
  false, 1788278700, 60, 'evt_test_1', 'checkout_session_completed',
  '2026-09-01 16:06:00+00', null
), 'applied', 'activation, Checkout binding, intro redemption, and grant apply atomically');
select is((select state::text from private.introductory_claims where account_id = '41000000-0000-4000-8000-000000000001'), 'redeemed', 'the introductory offer is redeemed');
select is((select subscription_id from private.introductory_claims where account_id = '41000000-0000-4000-8000-000000000001'), 'sub_test_a', 'redemption is bound to the exact subscription');
select is((select cardinality(capabilities) from private.account_grants where account_id = '41000000-0000-4000-8000-000000000001' and source = 'stripe'), 6, 'the Stripe grant has exactly six capabilities');
select is((select expires_at from private.account_grants where account_id = '41000000-0000-4000-8000-000000000001' and source = 'stripe'), '2027-09-01 16:00:00+00'::timestamptz, 'the Stripe grant cannot outlive paid-through');

select isnt(private.reserve_billing_checkout(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'cs_test_second_sub',
  'annual', '2026-09-01 17:00:00+00', '2026-09-01 16:10:00+00'
), true, 'an active account cannot open a second simultaneous subscription Checkout');
select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_attacker', 'cs_test_intro_2',
  'intro_annual', 'active', '2026-09-01 16:00:00+00', '2027-09-01 16:00:00+00',
  false, 1788278800, 30, 'evt_test_other_sub', 'subscription_active',
  '2026-09-01 16:10:00+00', null
), 'conflicting_subscription', 'another subscription cannot overwrite an active bound subscription');

select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'past_due', '2026-09-01 16:00:00+00', '2027-09-01 16:00:00+00',
  false, 1788279000, 50, 'evt_test_failed', 'invoice_payment_failed',
  '2027-09-01 16:01:00+00', '2027-09-08 16:00:00+00'
), 'applied', 'payment failure applies bounded courtesy');
select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'active', '2027-09-01 16:00:00+00', '2028-09-01 16:00:00+00',
  false, 1788279000, 70, 'evt_test_paid', 'invoice_paid',
  '2027-09-01 16:02:00+00', null
), 'applied', 'same-second successful payment deterministically outranks failure');
select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'past_due', '2026-09-01 16:00:00+00', '2027-09-01 16:00:00+00',
  false, 1788279000, 50, 'evt_test_failed', 'invoice_payment_failed',
  '2027-09-01 16:03:00+00', '2027-09-08 16:00:00+00'
), 'stale', 'reversed same-second delivery cannot undo the deterministic winner');

select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'active', '2027-09-01 16:00:00+00', '2028-09-01 16:00:00+00',
  false, 1788279100, 30, 'evt_test_no_change', 'subscription_updated',
  '2027-09-01 16:04:00+00', null
), 'applied', 'a newer no-op authoritative snapshot is recorded');
select is((select count(*) from private.billing_audit_events where account_id = '41000000-0000-4000-8000-000000000001'), 3::bigint, 'only effective state or grant transitions are audited');

select is(private.apply_stripe_billing_snapshot(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'sub_test_a', 'cs_test_intro_2',
  'intro_annual', 'expired', null, null, false, 1788279200, 90, 'evt_test_refund',
  'refund_succeeded', '2027-09-02 16:00:00+00', null
), 'applied', 'a confirmed refund revokes Stripe access early');
select ok((select revoked_at is not null from private.account_grants where account_id = '41000000-0000-4000-8000-000000000001' and source = 'stripe'), 'refund marks only the Stripe grant revoked');
select results_eq(
  $$select grant_sources from private.effective_entitlement(
    '41000000-0000-4000-8000-000000000001', '2027-09-02 16:01:00+00')$$,
  $$values (array['complimentary_owner']::text[])$$,
  'billing failure never revokes the independent owner grant'
);
select isnt(private.reserve_billing_checkout(
  '41000000-0000-4000-8000-000000000001', 'cus_sandbox_a', 'cs_test_intro_again',
  'intro_annual', '2027-09-02 17:00:00+00', '2027-09-02 16:10:00+00'
), true, 'a redeemed introductory account can never reserve the offer again');

select * from finish();
rollback;
