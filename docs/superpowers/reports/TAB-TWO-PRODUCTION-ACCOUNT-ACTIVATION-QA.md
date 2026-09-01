# Tab Two Production Account Activation QA

**Date:** 2026-09-01  
**Branch:** `feat/aurora-2-observatory`  
**Manual sign-in runtime source:** `35a0853c093d78dec5cb1a387380f5e602c5fb83`  
**Final review checkpoint:** `ACTIVATION_CHECKPOINT_PENDING`  
**Result:** Hosted authority activated; manual client ceiling recorded

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

Therefore this packet does not claim automated hosted screenshots, request/storage ledgers, exact client snapshot UUID equality, in-panel owner-entitlement display, or sign-out cleanup. Those client interactions remain manual ceilings. The independently verified database mapping and grant establish the hosted identity and entitlement authority, but they do not substitute for a retained visual witness of the final Account & Sync state.

The automated production QA harness remains on Playwright Chromium because that is the channel capable of loading unpacked extensions. It is suitable for non-provider and local callback contract coverage, not for claiming successful real Google authentication.

## Review and verification

One bounded review found two Important issues:

1. production validation accepted any syntactically valid 20-character Supabase project origin even though the manifest granted only the approved origin; and
2. the production QA harness had been switched to stable Chrome even though current stable Chrome cannot load unpacked extensions through Playwright's command-line path.

The sole focused fix pins validation to the exact production origin and restores the harness to the extension-capable Chromium channel. Focused RED/GREEN coverage passed before the stabilized gate.

Final stabilized command results and checkpoint provenance are recorded after the exact clean-tree gate.

## Rollback

- Disable Google in Supabase Auth and remove the exact extension redirect allowlist entry.
- Disable or remove the two account Edge Functions.
- Revoke the production signing secret and rotate the checked-in public descriptor in a reviewed forward change.
- Disable the owner grant through the audited privileged function; never delete its audit history.
- Remove production `identity` and the exact Supabase host permission in a reviewed extension change.
- Reverse schema only with a reviewed forward migration or isolated restore; do not edit hosted migration history.

No rollback step deletes local Tab Two data, changes current free behavior, touches Stripe, or mutates the Chrome Web Store.
