# Tab Two Production Account Activation QA

**Date:** 2026-09-01<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Manual sign-in runtime source:** `35a0853c093d78dec5cb1a387380f5e602c5fb83`<br>
**Final reviewed source checkpoint:** `a6f24563a7981e083b00d0ba942ee66457c95fb6`<br>
**Hosted hydration repair source:** `a6be8691717a657ac6486711282940671673e0af`<br>
**Result:** Hosted authority active; corrected owner entitlement display manually accepted

## Scope and gates

This report closes only the approved PM-P2 hosted/production account gate. It does not authorize or claim Supabase Pro, sync, Stripe, billing, merge, release, packaging, publication, rollout, or any Chrome Web Store mutation.

The owner approved Supabase Free as the initial production tier with no payment method or paid add-on. Pro compute and spend-cap configuration remain a separate pre-launch gate.

## Production authority

- Supabase organization: `Tab Two`
- Supabase project: `tab-two-production`
- Project ref: `ovlobmvxtryitupxwylg`
- Region: US East, North Virginia
- Compute/tier: included Free allocation
- Production account origin: `https://ovlobmvxtryitupxwylg.supabase.co`
- Production extension id: `akjalbmacojpmebkgohhcaaiacicpgkh`
- Signing key id: `production-2026-09-01`
- Authentication providers: Google enabled; email/password disabled
- Google scopes: `openid`, email, profile
- Redirect boundary: exact Supabase callback plus exact extension return URL; no wildcard return URL

The checked-in production descriptor contains only public configuration: the exact origin, publishable key, Ed25519 public key, and key id. The Google OAuth client secret, Supabase service authority, database password, and Ed25519 private key remain only in their provider/server secret stores. Secret values are not reproduced in this report.

## Hosted deployment evidence

- Hosted migrations `20260901000100_account_auth_entitlements.sql` and `20260901000200_account_functions.sql` match the repository migration list.
- Edge Functions `account-snapshot` and `entitlement-lease` are active with JWT verification enabled.
- Anonymous and malformed request probes produced the expected deny behavior, including 401, 404, and 405 boundaries.
- Production configuration review now rejects any Supabase origin other than the one exact approved project origin, even if another URL is syntactically valid.

## Owner identity and grant evidence

The owner completed Google sign-in from the exact unpacked production build in normal stable Chrome. An independent hosted query returned exactly one provider-neutral Google account mapping. The UUID is intentionally redacted from logs and this report.

After action-time confirmation, the privileged mutation addressed that exact UUID and produced:

- exactly one active `complimentary_owner` grant;
- exactly the six approved capabilities;
- exactly one matching entitlement audit event; and
- no additional audit event when the identical mutation was replayed.

The owner grant is independent of Stripe and cannot be selected by email, a client flag, preview fixture, or mutable extension storage.

## Browser verification ceiling

The production build was manually loaded and Google sign-in completed in the owner's normal stable Chrome profile. Automated Chromium could load the unpacked extension but Google rejected its sign-in as an unsupported browser. Current stable Chrome could complete Google sign-in but no longer accepts the command-line unpacked-extension loading path used by Playwright. Browser security policy also prevents extension-page automation from being attached to the already-running user profile.

Therefore this packet does not claim automated hosted screenshots, request/storage ledgers, exact client snapshot UUID equality, or sign-out cleanup. Those client interactions remain manual ceilings. The independently verified database mapping and grant establish the hosted identity and entitlement authority, while the owner separately provided the retained manual witness for the final Account & Sync entitlement state described below.

The automated production QA harness remains on Playwright Chromium because that is the channel capable of loading unpacked extensions. It is suitable for non-provider and local callback contract coverage, not for claiming successful real Google authentication.

## Post-activation hydration defect and repair

The owner's next real production attempt completed Google authentication but the Account & Sync panel reported that sign-in could not be completed. Redacted hosted diagnostics established the component boundary without reading or exposing any token, UUID, email, or secret:

- `auth.users.last_sign_in_at` advanced during the attempt, proving Google callback and PKCE session exchange success;
- `account-snapshot` recorded a successful invocation with zero 4xx/5xx rate;
- `entitlement-lease` recorded a successful invocation with zero 4xx/5xx rate; and
- the active owner grant remained present.

The client captured `now` before user validation and both hosted requests, then passed that stale time to future-issued lease verification. The server necessarily signed the lease after those requests began, so its `issuedAt` was newer than the client comparison instant and the fail-closed verifier cleared account authority.

An observed RED advances the clock while the lease request is in flight and reproduces the Local-mode fallback. The minimal fix obtains the verification time after the lease response. The focused gate passed 43/43 tests and TypeScript. The stabilized clean-tree gate at `a6be8691717a657ac6486711282940671673e0af` passed 233 files / 3,649 tests, TypeScript, 21/21 account build/QA contracts, diff hygiene, and exact production/preview/account-local builds of 326/279/326 modules. The correction changes no server, secret, permission, manifest, storage schema, data flow, sync, billing, merge, release, or Store state.

The owner reloaded the exact corrected production build in stable Chrome, completed the manual retry, and confirmed that Account & Sync displayed `Complimentary subscription`. This closes the corrected account and entitlement hydration witness. It does not claim that encrypted sync transport exists or ran; PM-P4 sync remains unimplemented. Sign-out cleanup remains a separate manual ceiling because real Google authentication cannot be completed in the extension-capable automated browser combination.

## Review and verification

One bounded review found two Important issues:

1. production validation accepted any syntactically valid 20-character Supabase project origin even though the manifest granted only the approved origin; and
2. the production QA harness had been switched to stable Chrome even though current stable Chrome cannot load unpacked extensions through Playwright's command-line path.

The sole focused fix pins validation to the exact production origin and restores the harness to the extension-capable Chromium channel. Focused RED/GREEN coverage passed before the stabilized gate. The first full run then exposed two stale privacy contract assertions: the old fixed-endpoint phrase and the old production manifest shape. The bounded correction updated the code-backed privacy description and asserted the approved production `identity` permission and exact Supabase host. The privacy file and TypeScript passed before the full gate was restarted from the beginning.

The exact clean tracked tree at `a6f24563a7981e083b00d0ba942ee66457c95fb6` passed:

- `npm test`: 233 files / 3,648 tests;
- `npx tsc --noEmit`;
- four account build/QA contract files: 21/21 Node tests;
- fresh `npx supabase db reset` with both PM-P2 migrations;
- `npx supabase test db`: 50/50 pgTAP tests;
- `npx supabase db lint --local --level error`: zero schema errors;
- Edge Function contract suite: 24/24 tests;
- exact production build: 326 modules;
- exact preview build: 279 modules;
- exact account-local build: 326 modules; and
- `git diff --check`.

The known pre-existing React test warning about an unwrapped `ProgressRail` update appeared without failing the suite. Vite also reported its existing large-chunk advisory. Neither changed gate status.

## Rollback

- Disable Google in Supabase Auth and remove the exact extension redirect allowlist entry.
- Disable or remove the two account Edge Functions.
- Revoke the production signing secret and rotate the checked-in public descriptor in a reviewed forward change.
- Disable the owner grant through the audited privileged function; never delete its audit history.
- Remove production `identity` and the exact Supabase host permission in a reviewed extension change.
- Reverse schema only with a reviewed forward migration or isolated restore; do not edit hosted migration history.

No rollback step deletes local Tab Two data, changes current free behavior, touches Stripe, or mutates the Chrome Web Store.
