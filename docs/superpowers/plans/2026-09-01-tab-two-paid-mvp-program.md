# Tab Two Paid MVP Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Tab Two's connector-led paid MVP without regressing the complete local-first free product or crossing provider, cost, permission, deployment, release, or Store approval boundaries.

**Architecture:** Supabase Auth, Postgres with default-deny Row Level Security, and Edge Functions form the account service; Stripe-hosted Checkout and Customer Portal remain the billing surfaces; the extension consumes signed capability leases and keeps ordinary free behavior independent of every paid service. The program is decomposed into bounded packets because account UI, authentication, billing, encrypted sync, metrics, and three provider connectors have independent failure and approval boundaries.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Vite production/preview builds, Supabase Auth/Postgres/Edge Functions, Stripe Checkout/Customer Portal/webhooks, Web Crypto, Google Calendar API, Microsoft Graph, Strava API.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Preserve untracked `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` exactly.
- Keep `D:\DEV\Chrome plugin` clean and untouched.
- Keep every current local capability and all 15 current connectors free and backend-independent.
- Do not sync credentials, tokens, authentication sessions, signed leases, capability URLs, provider caches or raw responses, custom images, device-local image references, or browser-local operational state.
- Free local use must create no Tab Two account, entitlement, sync, or billing request.
- Never implement an owner-email comparison, production build flag, mutable local premium switch, or other client-side owner bypass.
- Preview/test premium must be deterministic and absent from the production artifact; the real owner uses only a server-issued `complimentary_owner` grant bound to the internal account UUID.
- Do not add analytics, advertising, tracking, automatic layout switching, silent layout migration, or cloud image storage.
- Do not provision a paid service, create production secrets, add a Chrome permission, register a production OAuth application, or enable live Stripe prices without explicit owner approval at the named packet gate.
- Do not merge, deploy a production service, mutate the Chrome Web Store, package for release, submit, publish, distribute, or roll out without separate explicit approval.
- Each packet uses observed RED/GREEN, focused tests, one bounded Critical/Important review with at most one focused fix/rereview, one stabilized full gate, exact-provenance builds, real-extension Chromium for visual or interaction claims, original-resolution screenshot inspection, a ledger checkpoint, a scoped commit, a push, and local/upstream/remote equality proof.

---

## Program sequence

### Packet PM-P1: Account & Sync client shell and capability contracts

**Executable plan:** `docs/superpowers/plans/2026-09-01-tab-two-account-sync-client.md`

**Deliverable:** A production-safe sixth Settings tab, pure account/capability contracts, inline premium prompt primitive, deterministic preview states, and exact visual/runtime proof. Production remains Local mode with zero backend traffic. This packet begins with owner-visible PNG mockups and stops for visual approval before production UI edits.

**Rollback:** Revert the packet. It creates no backend state, schema migration, permission, provider registration, or paid dependency.

### Packet PM-P2: Supabase local foundation, Google authentication, and signed entitlements

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-supabase-auth-entitlements.md`

**Deliverable:** Versioned local Supabase migrations and Edge Functions; Google-only PKCE authentication; typed local session storage excluded from backup/sync/diagnostics; Ed25519-signed capability leases; default-deny RLS adversary tests; audited `complimentary_owner` grant; deterministic production-fixture scans. Start against local Supabase. Stop before a paid Supabase project, production Google registration, `identity` permission, or secret creation and request explicit owner approval.

**Rollback:** Disable the account adapter and revert extension changes; local free behavior remains intact. Reverse backend schema only through a tested forward migration or isolated local database restore.

### Packet PM-P3: Stripe sandbox billing and entitlement lifecycle

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-stripe-billing.md`

**Deliverable:** Authenticated Checkout/Portal session functions; raw-body signature verification; idempotent, reorder-safe webhook processing; introductory-price redemption enforcement; cancellation, courtesy, refund, chargeback, and expiry state tests; owner grant proven independent of Stripe. Use Stripe test mode only until the owner separately approves live catalog creation.

**Rollback:** Disable Checkout-session creation and preserve the last valid signed leases. Never infer billing state from a return URL.

### Packet PM-P4: Five-device encrypted sync

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-encrypted-sync.md`

**Deliverable:** AES-256-GCM record envelopes; server-wrapped per-account data keys; deny-by-default serializer; 2 MB quota; five-installation management; explicit Enable sync; conditional pull and debounced push; Web Lock ownership; server-sequenced stale-upload rejection; pre-overwrite local backups; acknowledged tombstones; vault/device/account deletion.

**Rollback:** Stop sync traffic and keep local storage authoritative. Never remotely erase installation-local data.

### Packet PM-P5: Aggregate metrics and Metrics widget

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-metrics.md`

**Deliverable:** Typed daily aggregate buckets for Habits, Focus, Tasks, calendar load, development activity, and fitness; 13-month retention; local and encrypted-vault merge rules; delete-history controls; 7/30/90/approximately-365-day views; owner-approved Metrics visuals and exact populated/empty/error geometry.

**Rollback:** Disable aggregation and preserve/export existing local buckets. No raw event, task, repository, route, or media history is collected.

### Packet PM-P6: Multi-account framework and Google Calendar

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-google-calendar.md`

**Deliverable:** Account-scoped connector identities, read-only incremental Google Calendar OAuth, calendar discovery and color preservation, multi-account aggregation, disconnect/history deletion, refresh ownership, and calendar-load metrics. Stop for exact scope, consent copy, OAuth registration, permission, privacy, and visual approval before provider activation.

**Rollback:** Disable the premium connector without changing the free ICS Calendar or the separate `ics`, `monthCal`, and `publicHolidays` authorities.

### Packet PM-P7: Microsoft Calendar

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-microsoft-calendar.md`

**Deliverable:** Delegated read-only Outlook.com/Microsoft 365 authentication, account-scoped calendar discovery, preserved colors, multi-account aggregation, reconnect/error states, and calendar-load metrics. Provider application and scope approval are explicit gates.

**Rollback:** Disable Microsoft Calendar independently; Google Calendar, free ICS, local Calendar, and all existing connectors remain functional.

### Packet PM-P8: Strava

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-strava.md`

**Deliverable:** Approval-contingent read-only activity summaries and aggregate duration, distance, elevation, type, and consistency metrics with no GPS routes or raw activity history. Do not advertise, sell, or make Strava a launch dependency until production athlete capacity and commercial approval are documented.

**Rollback:** Disable Strava independently while preserving local Metrics and every other connector.

### Packet PM-P9: Full-product stabilization and paid release dossier

**Plan created just in time as:** `docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-stabilization.md`

**Deliverable:** The complete spec-defined free/premium widget-state matrix; drag/drop, keyboard, touch, layouts, stacks, docks, persistence, account, billing, sync, metrics, connector, quota, conflict-backup, deletion, accessibility, storage, request, and geometry gates; in-extension Help and Troubleshooting; user-reviewed redacted diagnostics; exact build provenance; original-resolution screenshot inspection; owner MacBook smoke test; privacy/README/ledgers/release dossier reconciliation.

**Rollback:** Do not roll out. Preserve the last verified free artifact. Store mutation remains a separate approval after this packet passes.

---

## Cross-packet execution protocol

- [ ] **Step 1: Verify the packet boundary before each packet**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin-aurora-2' status --short --branch
git -C 'D:\DEV\Chrome plugin-aurora-2' rev-parse HEAD
git -C 'D:\DEV\Chrome plugin-aurora-2' rev-parse '@{upstream}'
git -C 'D:\DEV\Chrome plugin' status --short --branch
```

Expected: the feature branch and protected checkout match the current ledger; only the two protected untracked paths exist before a new packet.

- [ ] **Step 2: Create only the next just-in-time packet plan**

Read the architecture spec, threat model, current source, and prior packet evidence. Use `superpowers:brainstorming` only when a new visual or material product choice remains; otherwise use `superpowers:writing-plans` and freeze exact files, interfaces, RED/GREEN tests, browser evidence, rollback, and approval gates for that one packet.

- [ ] **Step 3: Execute one packet**

Use `superpowers:executing-plans` in a fresh session. Do not mix code from a later packet into the active diff.

- [ ] **Step 4: Review and stabilize once**

Inspect the entire packet diff. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle, then run the single stabilized full gate and exact browser/build proof required by the packet.

- [ ] **Step 5: Checkpoint and continue**

Reconcile `STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, privacy/public docs when behavior changes, and the packet QA report. Stage only intended files, commit, push, prove HEAD equals upstream and remote, confirm the protected original is clean, then begin the next packet unless an explicit gate requires the owner.

## Program completion

The paid MVP is implemented only when PM-P1 through PM-P9 are verified and pushed, all provider approvals required by the final scope are documented, the owner MacBook smoke pass is complete, and no Critical or Important full-product QA finding remains. Completion still does not authorize merging or any Chrome Web Store action.
