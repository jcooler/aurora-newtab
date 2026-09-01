# Tab Two Supabase Auth & Entitlements Local QA

Date: 2026-09-01

Exact source commit: `b3555b0f47245a31ea8878c562b708ed8935430c`

Result: PASS

## Scope

This witness covers PM-P2 local development authority only. It does not use or create a hosted Supabase project, production Google OAuth application, real owner grant, production signing key, production permission, deployment, release, merge, or Chrome Web Store action.

The browser seam uses a deterministic local OAuth callback and an Ed25519 key pair generated only in process memory. The private key and Supabase secret values are neither printed nor written. The generated account UUID is fixture-only.

## Exact gates

- Local Supabase database/RLS: 50 pgTAP tests passed.
- Full product suite: 232 files / 3,638 tests passed.
- Edge Function and account client focus: 72 tests passed across 4 files.
- Node account/build and QA contracts: 10/10 passed.
- Fresh database reset succeeded; database lint returned zero schema errors.
- Builds: exact `account-local`, `preview`, and `production` builds all carry commit `b3555b0f47245a31ea8878c562b708ed8935430c`.
- Manifest isolation: `identity` and `http://127.0.0.1/*` exist only in `account-local`.
- Production manifest remains at `storage`, `favicon`, `geolocation`, and `search`; optional browser permissions and optional HTTPS host authority remain unchanged.
- Production artifact scan found no session key, OAuth launch code, local Supabase origin, signing-key marker, private-key marker, secret-key marker, preview fixture, account snapshot endpoint, or entitlement lease endpoint.
- Installed Chromium ran at 1600x900 desktop and touch-enabled 768x812.

## Browser interactions

- Explicit Google sign-in path invoked through `chrome.identity.launchWebAuthFlow`.
- Callback correlation completed once; replaying the retained callback during fresh verification was rejected before another token exchange.
- The signed lease was bound to the generated account UUID and resolved only `complimentary_owner` authority.
- Sign-in and sign-out changed only `tab-two:account-session:v1`.
- The account session key was absent after sign-out.
- All non-session Chrome local storage was byte-for-byte equivalent before sign-in and after sign-out.
- Request intents were exactly: OAuth authorize, OAuth token, authenticated user, account snapshot, entitlement lease, and auth sign-out.
- Console errors: 0. Page errors: 0. Failed local requests: 0.

## Original-resolution inspection

| Capture | Resolution | Copy & controls | Focus/dialog restoration | Overflow/clipping | Overlap | Touch containment |
| --- | ---: | --- | --- | --- | --- | --- |
| `account-local-signed-in-desktop.png` | 1600x900 | PASS | PASS | PASS | PASS | N/A |
| `account-local-signed-in-touch.png` | 768x812 | PASS | PASS | PASS | PASS | PASS |

The retained evidence is under `artifacts/qa-account-auth-local/b3555b0f47245a31ea8878c562b708ed8935430c/`. The artifact directory remains protected and untracked.

## Production authority boundary

The final `dist` is the exact production build. Its manifest has no `identity` permission and no install-time localhost host access. Account auth remains unavailable in production until a later, separately approved production-authority packet.
