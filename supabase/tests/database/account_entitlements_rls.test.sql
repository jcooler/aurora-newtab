begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(44);

select has_table('public', 'tab_two_accounts', 'provider-neutral accounts table exists');
select has_table('public', 'tab_two_identities', 'provider identities table exists');
select has_table('private', 'account_grants', 'server-only account grants table exists');
select has_table('private', 'entitlement_audit_events', 'server-only entitlement audit table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tab_two_accounts'::regclass),
  'accounts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tab_two_identities'::regclass),
  'identities has RLS enabled'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'a@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'b@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.tab_two_accounts (id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.tab_two_identities (
  id,
  account_id,
  auth_user_id,
  provider,
  provider_subject,
  email,
  display_name
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'google',
    'google-subject-a',
    'a@example.test',
    'Account A'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'google',
    'google-subject-b',
    'b@example.test',
    'Account B'
  );

set local role anon;
select throws_ok(
  'select * from public.tab_two_accounts',
  '42501',
  null,
  'anonymous clients cannot read accounts'
);
select throws_ok(
  'select * from public.tab_two_identities',
  '42501',
  null,
  'anonymous clients cannot read identities'
);

reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.tab_two_accounts),
  1::bigint,
  'authenticated clients can read their own account'
);
select is(
  (select count(*) from public.tab_two_accounts where id = '10000000-0000-4000-8000-000000000002'),
  0::bigint,
  'authenticated clients cannot read another account'
);
select is(
  (select count(*) from public.tab_two_identities),
  1::bigint,
  'authenticated clients can read their own identity'
);
select is(
  (select count(*) from public.tab_two_identities where account_id = '10000000-0000-4000-8000-000000000002'),
  0::bigint,
  'authenticated clients cannot read another identity'
);

select throws_ok(
  $$insert into public.tab_two_accounts (id) values ('10000000-0000-4000-8000-000000000003')$$,
  '42501',
  null,
  'authenticated clients cannot insert accounts'
);
select throws_ok(
  $$update public.tab_two_accounts set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated clients cannot update accounts'
);
select throws_ok(
  $$delete from public.tab_two_accounts where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated clients cannot delete accounts'
);
select throws_ok(
  $$insert into public.tab_two_identities (
      account_id, auth_user_id, provider, provider_subject, email
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'google',
      'google-subject-c',
      'c@example.test'
    )$$,
  '42501',
  null,
  'authenticated clients cannot insert identities'
);
select throws_ok(
  $$update public.tab_two_identities set display_name = 'Changed' where auth_user_id = '30000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated clients cannot update identities'
);
select throws_ok(
  $$delete from public.tab_two_identities where auth_user_id = '30000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated clients cannot delete identities'
);
select throws_ok(
  'select * from private.account_grants',
  '42501',
  null,
  'authenticated clients cannot read grants'
);
select throws_ok(
  $$insert into private.account_grants (account_id, source, capabilities, starts_at)
    values (
      '10000000-0000-4000-8000-000000000001',
      'complimentary_owner',
      array['encrypted_sync']::private.premium_capability[],
      now()
    )$$,
  '42501',
  null,
  'authenticated clients cannot mutate grants'
);
select throws_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      true,
      'test actor',
      'test reason'
    )$$,
  '42501',
  null,
  'authenticated clients cannot execute the owner grant function'
);

reset role;

select throws_ok(
  $$insert into public.tab_two_identities (
      account_id, auth_user_id, provider, provider_subject, email
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'github',
      'github-subject',
      'github@example.test'
    )$$,
  '23514',
  null,
  'identity providers are constrained to Google'
);
select throws_ok(
  $$insert into public.tab_two_identities (
      account_id, auth_user_id, provider, provider_subject, email
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'google',
      'another-google-subject',
      'duplicate-auth@example.test'
    )$$,
  '23505',
  null,
  'an auth user can map to only one Tab Two account'
);
select throws_ok(
  $$insert into public.tab_two_identities (
      account_id, auth_user_id, provider, provider_subject, email
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'google',
      'google-subject-a',
      'duplicate-subject@example.test'
    )$$,
  '23505',
  null,
  'a provider subject can map to only one Tab Two account'
);

set local role service_role;

select is(
  private.current_account_id(),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the service-only identity helper maps auth.uid to the provider-neutral account id'
);
select throws_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000099',
      true,
      'local test',
      'unknown account'
    )$$,
  '23503',
  'account_not_found',
  'owner grants require an existing exact account UUID'
);
select throws_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      true,
      ' ',
      'missing actor'
    )$$,
  '22023',
  'actor_required',
  'owner grant mutations require a nonblank audit actor'
);

select results_eq(
  $$select capabilities, grant_sources
    from private.effective_entitlement(
      '10000000-0000-4000-8000-000000000001',
      clock_timestamp()
    )$$,
  $$values (array[]::text[], array[]::text[])$$,
  'an account with no grants has no effective entitlement'
);

select lives_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      true,
      'local test',
      'owner fixture'
    )$$,
  'the privileged function can enable the owner grant by exact account id'
);
select is(
  (select cardinality(capabilities) from private.account_grants
    where account_id = '10000000-0000-4000-8000-000000000001'
      and source = 'complimentary_owner'),
  6,
  'the owner grant contains all six paid MVP capabilities'
);
select is(
  (select count(*) from private.entitlement_audit_events
    where account_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'enabling the owner grant writes one audit event'
);

select lives_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      true,
      'local test',
      'owner fixture repeated'
    )$$,
  'enabling an already-active owner grant is idempotent'
);
select is(
  (select count(*) from private.entitlement_audit_events
    where account_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'an idempotent enable writes no additional audit event'
);

insert into private.account_grants (
  account_id,
  source,
  capabilities,
  starts_at,
  expires_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  'stripe',
  array['encrypted_sync', 'strava']::private.premium_capability[],
  clock_timestamp() - interval '1 day',
  clock_timestamp() + interval '1 day'
);

select results_eq(
  $$select capabilities, grant_sources
    from private.effective_entitlement(
      '10000000-0000-4000-8000-000000000001',
      clock_timestamp()
    )$$,
  $$values (
    array[
      'encrypted_sync', 'google_calendar', 'metrics_history',
      'microsoft_calendar', 'multi_account', 'strava'
    ]::text[],
    array['complimentary_owner', 'stripe']::text[]
  )$$,
  'effective entitlement returns the sorted union of active grant sources'
);

update private.account_grants
set expires_at = clock_timestamp() - interval '1 second'
where account_id = '10000000-0000-4000-8000-000000000001'
  and source = 'stripe';

select results_eq(
  $$select grant_sources
    from private.effective_entitlement(
      '10000000-0000-4000-8000-000000000001',
      clock_timestamp()
    )$$,
  $$values (array['complimentary_owner']::text[])$$,
  'expired grants are excluded from effective entitlement'
);

update private.account_grants
set expires_at = null,
    revoked_at = clock_timestamp() - interval '1 second'
where account_id = '10000000-0000-4000-8000-000000000001'
  and source = 'stripe';

select results_eq(
  $$select grant_sources
    from private.effective_entitlement(
      '10000000-0000-4000-8000-000000000001',
      clock_timestamp()
    )$$,
  $$values (array['complimentary_owner']::text[])$$,
  'revoked grants are excluded from effective entitlement'
);

select lives_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      false,
      'local test',
      'owner fixture disabled'
    )$$,
  'the privileged function can disable an active owner grant'
);
select is(
  (select count(*) from private.entitlement_audit_events
    where account_id = '10000000-0000-4000-8000-000000000001'),
  2::bigint,
  'disabling the owner grant writes one audit event'
);
select lives_ok(
  $$select private.set_complimentary_owner_grant(
      '10000000-0000-4000-8000-000000000001',
      false,
      'local test',
      'owner fixture disabled repeatedly'
    )$$,
  'disabling an already-disabled owner grant is idempotent'
);
select is(
  (select count(*) from private.entitlement_audit_events
    where account_id = '10000000-0000-4000-8000-000000000001'),
  2::bigint,
  'an idempotent disable writes no additional audit event'
);

reset role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '30000000-0000-4000-8000-000000000010',
  'authenticated',
  'authenticated',
  'nongoogle@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select is(
  (select count(*) from public.tab_two_identities
    where auth_user_id = '30000000-0000-4000-8000-000000000010'),
  0::bigint,
  'non-Google auth users do not create Tab Two accounts'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '30000000-0000-4000-8000-000000000011',
  'authenticated',
  'authenticated',
  'google@example.test',
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"sub":"google-subject-trigger","full_name":"Google Person"}'::jsonb,
  now(),
  now()
);

select is(
  (select count(*) from public.tab_two_identities
    where auth_user_id = '30000000-0000-4000-8000-000000000011'),
  1::bigint,
  'a Google auth user creates exactly one provider identity'
);
select is(
  (select provider_subject from public.tab_two_identities
    where auth_user_id = '30000000-0000-4000-8000-000000000011'),
  'google-subject-trigger',
  'the Google provider subject is stored separately from the auth user id'
);
select isnt(
  (select account_id from public.tab_two_identities
    where auth_user_id = '30000000-0000-4000-8000-000000000011'),
  '30000000-0000-4000-8000-000000000011'::uuid,
  'the provider-neutral account id is generated independently from auth.users.id'
);

select * from finish();
rollback;
