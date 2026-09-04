# Tab Two Paid MVP Release Dossier

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Runtime and automated-evidence source:** `87647558a6d362de80a5d7249e5570e5dde230ff`<br>
**Verdict:** **OWNER QA PENDING - NOT AUTHORIZED FOR RELEASE**

## Decision summary

The paid MVP implementation is ready for the owner's cumulative manual QA, not
for customer release. The exact automated candidate preserves every current
free capability and all 15 existing free connectors, adds the approved account,
billing, encrypted-sync, aggregate Metrics, Google Calendar, Microsoft Calendar,
and private Help/diagnostic boundaries, and removes fitness from every launch
surface. Historical `strava` entitlement and `fitness` aggregate values remain
parseable only for wire compatibility.

No fitness provider is silently substituted. Fitbit is the first post-MVP
commercial-clarification candidate, WHOOP and Polar are the next technical
candidates, and MyFitnessPal is retained as a later nutrition opportunity. No
provider registration, permission, credential, hosted object, cost, production
code, advertising promise, or launch dependency was created for any of them.

## Exact candidate binding

| Item | Exact evidence |
|---|---|
| Runtime and composed QA source | `87647558a6d362de80a5d7249e5570e5dde230ff` |
| Final production provenance | `dist/build-provenance.json` contains the same full commit |
| Provenance-file SHA-256 | `0CEADC343860748124B049682465D7BF31B7024CB6CD1B8D0D2804D5EFF42F7B` |
| Production manifest SHA-256 | `887E3C6A1D8B09EE0524FF8458C796CD8062EE10C5AB64715EA2A14BC81FF989` |
| PM-P9 evidence index | `artifacts/qa-paid-mvp-stabilization/87647558a6d362de80a5d7249e5570e5dde230ff/evidence.json` |
| Evidence-index SHA-256 | `401F2D6A8B8BB687CA76B38148C4DF6EE08D967CE21A9121D7404A1E0A9EF6F5` |
| Pre-dossier repository state | local `87647558a6d362de80a5d7249e5570e5dde230ff`; upstream and remote `00778b1f72cce1293881c0600c86b521243c3be7` |

The dossier checkpoint is the commit containing this file. It changes only
documentation and ledgers, so it cannot self-record its own Git object id. The
handoff must prove that final local HEAD, configured upstream, and
`origin/feat/aurora-2-observatory` are identical. Runtime evidence remains bound
to `87647558a6d362de80a5d7249e5570e5dde230ff`.

The final bounded review found one Important UX defect: the customer-facing
support action resolved to an unavailable public destination. Runtime source
`87647558a6d362de80a5d7249e5570e5dde230ff` removes that dead action and shows
an honest prelaunch private-support notice. Its seven fresh Help captures were
inspected at original resolution before the complete matrix replay passed.

## Automated verification

The exact composed result is `AUTOMATED_PASS_OWNER_QA_PENDING`.

| Gate | Result |
|---|---|
| Full Vitest suite | 274 files and 4,353 tests passed at the exact runtime source |
| PM-P9 registry | 38 widgets, 17 connectors, 19 flow families, and 6 explicit manual ceilings |
| Specialist replay | 11 automated entries passed; real production account authentication is `DEFERRED_OWNER_QA` by design |
| Local database | 311 pgTAP tests passed; database lint reported no schema errors |
| Edge coverage | All 214 Edge-function tests are included in the green Vitest suite |
| TypeScript | `tsc --noEmit` passed |
| Dependency review | Cache-backed `npm audit --offline --audit-level=high` reported zero vulnerabilities |
| Production isolation | No real secret, credential, preview fixture, or local-development marker was found in the production artifact |

Direct `deno test` is not a second independent Edge gate for this repository:
the Edge tests intentionally use Vitest and extensionless project imports. The
live npm advisory request stalled after a healthy registry check, so the exact
lockfile was also checked through the local audit cache. A clean `npm ci` attempt
also stalled; installed top-level dependencies were restored, with only ignored
optional runtime remnants and no source or lockfile change. Vite completed the
363-module production build with its existing advisory for a bundle larger than
500 KB; that advisory is not a build failure. Broad bundle scanning matched
generic `service_role`, `sb_secret_`, and `client_secret` validation literals in
the bundled Supabase SDK plus the intended public Supabase publishable key; no
secret value or private credential was present.

## Installed-extension evidence

The exact PM-P9 replay retained 108 original-resolution PNGs totaling
78,825,639 bytes:

| Evidence owner | PNGs |
|---|---:|
| Free baseline | 5 |
| Widget, canvas, and free-connector specialists | 40 |
| Progress | 4 |
| Account & Sync | 12 |
| Metrics | 13 |
| Google Calendar | 13 |
| Microsoft Calendar | 14 |
| Help and diagnostics | 7 |

The composed index reports 64 screenshots because four legacy specialist
schemas retain images under their own evidence keys instead of a top-level
`screenshots` array. The filesystem inventory above includes those 44 images.

The final ledgers contain 15 expected fixture-fulfilled requests, 18 allowed
layout or weather storage writes, zero console errors, zero page errors, and
zero failed requests. Eleven requests belong to Microsoft Graph fixtures and
four to free connector fixtures. The writes are three free-layout writes plus
15 widget-layout or Weather writes.

Product-identical captures were inspected at original resolution during the
specialist checkpoints. The exact PM-P9 replay additionally enforces machine
geometry, containment, focus, request, storage, and error judgments. This does
not claim native Chrome prompts, real provider UI, assistive-technology speech,
or physical-device behavior.

## Hosted authority inherited from earlier approved gates

PM-P9 did not redeploy or mutate any hosted service. These are inherited,
source-specific sandbox authorities:

| Area | Hosted evidence and current boundary |
|---|---|
| Account and entitlements | Manual sign-in source `35a0853c093d78dec5cb1a387380f5e602c5fb83`; hydration repair `a6be8691717a657ac6486711282940671673e0af`; Supabase Free account authority remains active |
| Stripe sandbox billing | Initial local source `95df3a206d80ceebe52b11bd0dcf74630408f789`; branded return range `bfde9b3` through `a21561b`; resumable and automatic-convergence work through `bc0206e`; `account-snapshot` version 9 and `stripe-webhook` version 8 remain the last recorded hosted versions |
| Encrypted sync | Hosted matrix `e2ec380134c0c062b770a2ec2821c9f9ecae7044`; production enable source `6317fedf35a0aadf2cf9ed5c9afe16f9d7b12616` |
| Aggregate Metrics sync | Hosted matrix `c772838586eae9f7dbe922981134366ab36bb845`; only `sync-push` and `sync-pull` version 5 were activated for this delta |
| Google Calendar | Hosted sandbox boundary `c29092ca741205ad3dbe70b17cad82526ae25024`; five version 1 functions and OAuth Testing audience remain the recorded authority |
| Microsoft Calendar | Hosted sandbox boundary `191eb88629a5f750d2e8bd8fe338aaeec8299138`; five version 1 functions, unverified publisher, and client-secret expiry on 2027-03-02 remain the recorded authority |

The detailed proof and cleanup records remain in the packet-specific QA
reports. The PM-P9 source is not represented as deployed hosted code.

## Launch blockers

These items block any release-readiness claim:

- Complete the cumulative stable-Chrome owner checklist in
  `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`, including account, Stripe sandbox,
  sync, Metrics, real Google and Microsoft consent/revocation, keyboard and
  assistive technology, physical MacBook/touchpad, and mixed-DPI checks.
- Establish a monitored, non-public support alias and a protected escalation
  path. The current Help surface presents an honest prelaunch notice and no dead
  or public submission action.
- Design and implement customer export controls for account metadata, the
  encrypted vault, and a local conflict backup. These controls are absent at the
  stabilized commit and remain an Important product gap. The existing local
  dashboard backup export does not include those three service/recovery
  artifacts; documentation must not weaken the existing data-portability promise
  to conceal the gap.
- Decide and complete the appropriate Google production verification and
  Microsoft publisher-verification paths before general provider availability.
- Make separate owner decisions for Supabase Pro and Stripe live mode. No paid
  infrastructure or real payment is authorized by this dossier.
- Obtain explicit approval before merge, packaging, release restaging, Chrome
  Web Store mutation, provider publication, customer rollout, or any production
  permission or secret change.

## Rollback boundary

The PM-P9 implementation begins after plan checkpoint
`00778b1f72cce1293881c0600c86b521243c3be7`. Roll back with reviewed forward
fixes or targeted Git reverts for the PM-P9 commits; do not reset the worktree,
rewrite hosted migration history, delete customer data, or touch provider and
billing authority. Generated PM-P9 evidence is untracked and can be retained as
historical proof without entering a release package.

No merge, package, deployment, live billing action, provider publication,
Chrome Web Store action, or rollout is authorized by this document.
