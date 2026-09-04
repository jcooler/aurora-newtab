# Tab Two Freemium Product and Architecture Design

**Status:** Owner-approved consolidated architecture; implementation not started

**Date:** 2026-08-31

**Revised:** 2026-09-03

**Product:** Tab Two

**Positioning:** The best tab for your second screen.

## Summary

Tab Two remains a complete local-first product for free users. Premium is a
connector-led service for people who want work and personal signals combined
across accounts and devices. Accounts and encrypted sync support that promise,
but they are not the primary reason to upgrade.

The paid MVP uses Google-only sign-in, Stripe Managed Payments, and Supabase.
It adds account-based Google and Microsoft calendar connectors, multi-account
capability, 13 months of aggregate metrics, and encrypted cross-device sync.
Existing connectors and local features are not retroactively paywalled.
Fitness is explicitly deferred and is not a launch dependency.

This specification does not authorize infrastructure provisioning, production
implementation, deployment, merge, Chrome Web Store changes, analytics, new
permissions, or publication. Those require a separately approved implementation
plan and release gates.

## Decision authority and supersession

This document supersedes the account, entitlement, pricing, premium-boundary,
paid connector, metrics-history, support, and onboarding-sequencing language in
`2026-08-29-tab-two-v2-product-and-visual-design.md`. The earlier document
remains authoritative for the approved visual direction and presentation
principles that do not conflict with this specification.

In particular:

- The approved slogan is "The best tab for your second screen."
- Onboarding is deferred and is not a paid-MVP prerequisite.
- Pricing is no longer an open commercial decision.
- Google-only sign-in, encrypted sync, Supabase Pro, connector-led premium, and
  the paid MVP release gate are now approved product direction.

## Product thesis

The durable differentiator is not generic new-tab customization or settings
sync. It is a private, configurable second-screen surface that combines useful
signals from services the customer already uses.

The premium promise is:

> Connect your work, schedule, habits, and activity in one private second-screen view.

The product serves a prosumer audience: people whose work and personal context
overlap across a dedicated display. Connector breadth matters, but launch value
comes from a small number of deep integrations plus one coherent metrics layer,
not a large catalog of shallow cards.

## Goals

1. Preserve a complete, excellent, account-free local product.
2. Charge for new ongoing value: managed connections, multi-account continuity,
   metrics, and encrypted sync.
3. Keep free users at effectively zero backend cost.
4. Keep paid infrastructure predictable at a $1.99 monthly price.
5. Minimize retained data and keep connector secrets on the user's device.
6. Make cancellation, deletion, device management, and billing self-service.
7. Design support expectations that one independent maintainer can sustain.

## Non-goals

- Do not paywall any existing connector, widget, layout, habit, backup, or local
  behavior.
- Do not require an account for free use.
- Do not sync credentials, access tokens, API keys, capability URLs, raw provider
  responses, routes, or custom images.
- Do not add analytics, advertising, user tracking, or behavioral profiling.
- Do not add raw cloud history, financial aggregation, AI features, teams,
  organization administration, or a lifetime plan in the paid MVP.
- Do not add calendar write access in the paid MVP.
- Do not make Spotify a launch dependency.
- Do not resume onboarding work in this phase; onboarding remains deferred by
  owner decision.

## Free and paid boundary

### Free

- No Tab Two account.
- All current local features and all 15 existing connectors.
- Existing per-connector source and account limits remain unchanged.
- Local layouts, stacks, docks, habits, Progress, notes, tasks, calendar,
  refresh preferences, photos, and connector configuration.
- Manual JSON backup, restore, and local deletion.
- Connector credentials remain local plaintext protected by the Chrome and OS
  profile, as documented by the existing privacy model.
- No Tab Two backend dependency.

### Premium

- Google-authenticated Tab Two account.
- New approved account-based premium connectors.
- Multi-account support beyond current free connector behavior.
- Unified metrics with 7-, 30-, 90-, and approximately 365-day views.
- Thirteen months of aggregate-only history.
- Encrypted sync across up to five active installations.
- Device transfer through Google sign-in.
- Future premium connector depth, history, and flexibility where continuing
  maintenance or backend work creates ongoing cost.

Cancellation never removes or disables ordinary free behavior. Premium
connectors retain configuration and their last local result but stop refreshing
after entitlement expiry. Local metrics history remains readable, exportable,
and erasable while new premium aggregation pauses.

## Paid MVP release gate

Premium must not launch until all of the following are ready:

1. Google-only account authentication.
2. Stripe subscription, webhook, and entitlement lifecycle.
3. Five-device encrypted sync with conflict-safe merging.
4. Thirteen-month aggregate metrics engine.
5. Unified Metrics widget covering Habits, Focus, Tasks, calendar load, and
   development activity.
6. Multi-account connection framework.
7. Google Calendar account connector with read-only, incremental OAuth scopes.
8. Microsoft Calendar connector with delegated read-only access for supported
   personal and work accounts.
9. Self-service billing, cancellation, device management, vault deletion, and
    account deletion.
10. In-extension help, connector recovery states, and user-generated redacted
    diagnostics.

The existing ICS Calendar remains free. The paid Google and Microsoft calendar
connectors sell easier account connection, automatic calendar discovery,
multi-account use, and metrics rather than removing the free feed-based path.

On 2026-09-03, the owner approved removing Strava from this paid-MVP release
gate after the current Strava API policy was found to conflict with charging
for Strava-related functionality. No fitness provider is a paid-MVP launch
dependency. Strava remains on hold, and no replacement may enter the release
gate without separate commercial-policy research, design, and owner approval.

### Full-product QA gate

The paid MVP gate includes a complete real-extension regression of the existing
free product and every new premium surface. Aggregate unit tests or isolated
premium-flow checks are not visual acceptance. Before launch, QA must:

- Exercise every widget identity at each supported tier and in its applicable
  empty, loading, ready, stale, error, permission, reconnect, Manual refresh,
  locked, and entitled state. Verify the current free connectors as well as all
  paid connectors; no existing widget or connector may regress to make room for
  premium work.
- Inspect every final screenshot at original resolution. Text, numerals, event
  markers, actions, focus rings, menus, dialogs, context panels, and premium
  disclosures must remain legible and must not clip, overlap, touch, escape, or
  introduce an unintended scroll owner.
- Exercise pointer, keyboard, and touch widget movement from start through drop,
  including cancellation, edge placement, occupied destinations, persistence
  after reload, and movement between supported layout regions. Drag and drop
  must feel predictable, preserve the selected widget, and never cause an
  unrelated storage write or ordinary-click selection.
- Exercise named-layout switching and editing, stack creation, stack member
  reorder and removal, dock ordering and two-axis placement, layer and z-order
  behavior, exact stack footprints, and recovery after reload. Existing
  credentials, feed colors, authorities, named layouts, stacks, docks, and
  backups must remain intact.
- Cover representative desktop, short-height, ultrawide, high-density 4K/5K,
  and touch-narrow viewports without automatic layout switching or silent
  placement migration. A MacBook smoke pass remains a separate owner-visible
  manual-device check.
- Cover Settings, Account & Sync, device management, billing, cancellation,
  encrypted-vault status, Metrics, premium locked and unlocked states, expired
  entitlement, offline lease, failed-payment courtesy, quota, conflict backup,
  deletion, and connector recovery flows.
- Capture storage and request ledgers against explicit allowlists. Free local use
  must produce no Tab Two backend traffic; every interaction must produce only
  its intended storage writes and provider requests, with zero unexpected
  requests, failed requests hidden as success, console errors, or page errors.
- Verify keyboard traversal, visible focus, dialog focus restoration, control
  names, reduced-motion behavior, editable-text selection, and non-editable
  canvas selection suppression. Native permission prompts, real assistive
  technology, provider production approval, and physical-device behavior must
  be reported as manual ceilings rather than inferred from headless automation.

Any Critical or Important defect in this matrix blocks launch. The final QA
report must bind code, build, fixtures, screenshots, storage ledger, request
ledger, and runtime results to one exact commit and production artifact.

## Connector portfolio

### Paid MVP

- Google Calendar: read-only account connection and calendar-load metrics.
- Microsoft Calendar: delegated read-only Outlook.com and Microsoft 365 access.

### Deferred fitness evaluation

- Strava is on hold because the current policy prohibits charging end users for
  Strava-related API functionality; written commercial clearance would be
  required before reconsideration.
- MyFitnessPal and other fitness services may be evaluated, but research creates
  no implementation, launch promise, provider account, permission, secret, or
  paid-service authority.

### First expansion

- Multiple GitHub, GitLab, Todoist, Linear, and Home Assistant accounts or
  instances.
- A separately approved fitness provider only after commercial API access,
  scopes, costs, retention rules, capacity, and customer value are documented.
- Metric goals, comparisons, and configurable summary cards.

### Spotify

Spotify is technically feasible through bring-your-own developer credentials,
similar to existing Stream Deck integrations. A browser-safe PKCE flow should
be preferred so Tab Two does not retain a Spotify client secret when Spotify's
current API supports the required endpoints that way.

Spotify Development Mode is currently described by Spotify as appropriate for
personal, non-commercial projects and not as a foundation for a scaling
business. Therefore Spotify remains approval-gated. Tab Two may prototype with
owner credentials, but it must not advertise, sell, or distribute the connector
until the commercial use of customer-supplied developer credentials is cleared.
Spotify-derived historical metrics also remain disabled until its retention
rules are approved.

## Metrics and history

Connectors and local features emit typed daily measurements into one shared
metrics engine. The engine stores approximately 13 months of daily aggregate
buckets and lifetime counters where useful.

Examples:

- Habits: completion count, completion rate, and streak state.
- Focus: sessions and focused minutes.
- Tasks: completed and carried-forward counts.
- Calendar: event count and busy minutes.
- Development: counts of commits, reviews, issues, deployments, and failures
  already available through approved connector data.
- A future separately approved fitness provider may contribute only daily
  aggregate activity type, duration, distance, elevation, and consistency.

The metrics store excludes meeting titles, attendees, locations, task text,
repository names, issue text, GPS routes, media titles, and raw provider
payloads. Disconnecting a source offers an explicit delete-history choice.

## Authentication and account identity

- Supabase Auth uses Google as the only enabled MVP identity provider.
- Sign-in is explicit and user-initiated; Tab Two does not silently adopt the
  active Chrome profile.
- The customer selects the Google account during sign-in.
- Signing in checks account and entitlement state only. It does not enable sync
  or upload local product data.
- The database uses a provider-neutral Tab Two account ID. Google email is not
  the primary key.
- Billing, devices, vaults, and entitlements attach to the internal account ID.
- Connector OAuth grants remain separate from account authentication and request
  the narrowest scopes only when the customer connects that service.
- The schema permits another identity provider to attach to the same account in
  a later, separately approved release.
- Free users create no Supabase Auth user or backend record.

Google account recovery is the MVP account-recovery path. Losing Google access
does not remove data that remains on an existing local installation.

## Account & Sync experience

- Settings gains a dedicated sixth **Account & Sync** tab. It is visible to
  every user; Data remains responsible for local backup, restore, deletion, and
  privacy controls.
- Signed-out users see **Local mode**, reassurance that current data stays on
  the device, an optional **Sign in with Google** action, the sync inclusion and
  exclusion inventory, and concise plan information.
- Tab Two never forces sign-in during installation, first run, or ordinary free
  use. No persistent account or avatar control appears on the canvas.
- Premium connectors and features explain their value inline and offer **Sign
  in** for existing subscribers and **View plans** for everyone else. Ordinary
  free use never opens an upgrade modal.
- Signed-in users see account identity, subscription status, the separate
  **Enable sync** control, sync state, last successful sync, quota usage,
  **Sync now**, and device management.
- Self-service actions include **Manage billing**, **Delete synced data**,
  **Sign out**, and **Delete account**.
- The MVP uses one sync switch for all eligible data. Per-category sync controls
  are deferred.
- Onboarding remains deferred and is not coupled to accounts or premium launch.

## Payments and pricing

### Provider

Stripe Managed Payments is the preferred merchant of record. It preserves
Stripe Checkout and subscription management while assigning supported indirect
tax calculation, collection, filing, remittance, fraud handling, dispute
handling, and transaction-level support to Stripe and Link.

Upgrade opens Stripe-hosted Checkout in a normal browser tab. Manage billing
opens Stripe's hosted Customer Portal for payment methods, invoices, plan
changes, and cancellation. Authenticated Edge Functions create both sessions;
Tab Two never receives or stores card details. The extension refreshes its
signed entitlement after Checkout rather than trusting the return page.

Lemon Squeezy remains the fallback if Tab Two is ineligible for Stripe Managed
Payments or the public-preview service is not production-ready at implementation
approval time.

### Plans

- Monthly: **$1.99**.
- Annual: **$19.99**.
- Introductory annual: **$9.99 for the first year**, renewing at $19.99
  annually.
- Monthly and annual plans unlock the same features.
- No free trial. The complete local product is the free experience.
- No lifetime plan.
- Introductory pricing is limited to one redemption per Tab Two account and
  associated Stripe customer.
- Renewal price and date must appear clearly before checkout and in subscription
  management.
- Plan changes normally take effect at the next renewal unless Stripe can show a
  simple, transparent credit.
- Prices are tax-inclusive where Stripe Managed Payments supports that behavior.

## Entitlement lifecycle

- Stripe webhooks are the billing source of truth.
- Privileged backend code translates billing state into a signed entitlement
  lease; the extension never receives Stripe secrets.
- Effective premium access is the union of active server-side grants. Customer
  grants use Stripe as their source; the owner's real account receives a
  complimentary grant keyed to the provider-neutral Tab Two account UUID.
- The owner grant does not depend on an email comparison in the extension,
  Stripe subscription state, or mutable local storage. It is created only
  through a privileged audited backend operation and survives ordinary billing
  cancellation, payment failure, or webhook delay.
- Development and preview builds use a deterministic test entitlement so paid
  states can be exercised without a real purchase. Production-build contracts
  must prove that this fixture and every client-side bypass symbol are absent.
- The extension refreshes entitlement periodically and caches a 30-day offline
  lease.
- Free behavior never depends on an entitlement check.
- Cancellation preserves premium access through the paid billing period.
- Failed renewal receives a seven-day courtesy period while Stripe retries.
- Refunds, chargebacks, or confirmed fraud may end entitlement early without
  erasing local data.
- The encrypted cloud vault remains recoverable for 90 days after entitlement
  expiry, then is deleted automatically.
- A customer may delete the cloud vault and account earlier.

## Devices

- One premium account supports five active synced extension installations.
- Each browser profile or extension installation counts as one device.
- Devices have a random cryptographic identity and an editable friendly name.
- Tab Two does not fingerprint hardware.
- Google sign-in alone authorizes a new device; no recovery key or existing-device
  approval is required.
- At the limit, the customer chooses an existing device to revoke.
- A sixth installation may sign in and continue using all local features, but
  sync activation is blocked until the customer explicitly revokes one of the
  five active installations. Tab Two never auto-evicts a device.
- Revocation stops future sync but does not remotely erase local data.
- Device state includes only the identifier, friendly name, last sync time, and
  revocation status needed to operate the feature.

## Encrypted sync model

The approved experience prioritizes Google-authenticated recovery over
zero-knowledge encryption.

- Each account receives a distinct data-encryption key.
- The extension encrypts record-level sync envelopes before upload.
- Privileged backend code protects the account key and releases it only after
  verified Google authentication and entitlement checks.
- Supabase stores ciphertext, the protected account key, versions, tombstones,
  and minimal routing metadata: entity type, stable ID, revision, size, and
  server sequence.
- Tab Two's service can technically obtain the account key; therefore customer
  copy must say **encrypted sync**, not end-to-end encrypted or zero-knowledge
  sync.
- Normal backend operation does not need plaintext product data.
- Key access must be isolated to privileged functions, excluded from logs, and
  covered by rotation and incident procedures before production.

The single-switch sync allowlist contains layouts, widget configuration,
appearance, habits and Progress, tasks, notes, non-secret connector
preferences, stable entity identifiers, and approved aggregate metrics. A
central schema strips connector credentials and tokens, authentication
sessions, signed leases, RSS and ICS capability URLs, provider caches and raw
responses, custom images and other blobs, device-local image references, and
browser-local operational state before serialization. Deny-by-default is
authoritative when a new field has no sync classification.

## Sync semantics

- The local storage authority remains primary and functional while offline.
- Synced layouts, habits, tasks, preference groups, and metric buckets have
  stable IDs and revisions.
- A device uploads changes against the server version it last received.
- Independent entity changes merge automatically.
- Conflicting revisions of the same record use the latest server-accepted
  revision. Server sequence, not a device clock, determines order.
- A stale upload is rejected rather than overwriting the current server record.
  The client backs up its unsynced local version and adopts the current server
  revision; it does not retry the stale change automatically.
- Habit completion merges per habit and date.
- Metrics merge per source and daily bucket.
- Before a conflicting remote revision replaces local state, Tab Two creates a
  recoverable local backup through the existing local backup authority. The MVP
  does not show technical conflict dialogs or create cloud conflict copies.
- Deletions create tombstones so stale devices cannot resurrect removed data.
- Tombstones compact only after every active device acknowledges the deletion or
  a stale device is revoked.
- Sync exposes Up to date, Syncing, Offline, and Needs attention states.
- A failed sync cannot roll back or corrupt local state.
- Manual JSON backup and restore remain independent of cloud sync.

## Backend architecture

### Production baseline

- Supabase Pro at **$25 per month**.
- Supabase Auth with Google only.
- Postgres for accounts, identities, entitlements, devices, protected keys,
  encrypted vaults, versions, tombstones, retention schedules, and minimal
  support metadata.
- Row Level Security enabled with default-deny grants on every client-reachable
  table.
- Edge Functions for Stripe webhooks, privileged key operations, account
  deletion, and other service-role work.
- Encrypted vaults remain in Postgres for the MVP so they participate in managed
  database backups. Custom-image storage is not included.
- A production spend cap, quota alarms, and owner-visible service alerts are
  required before launch.

### Quotas and request behavior

- Maximum encrypted vault: 2 MB per premium account.
- Maximum active devices: five.
- Changes push after a short debounce.
- Pull checks are rate-limited, conditional on vault version, and coordinated
  across visible tabs with the existing Web Lock ownership pattern.
- A new device pulls immediately.
- A manual Sync now action is available.
- Per-account and per-IP abuse limits protect authentication, key release, sync,
  deletion, and webhook endpoints.

## Cost model

Free users do not authenticate, create database rows, check entitlements, or use
sync endpoints. Their incremental Tab Two backend cost is effectively zero.

Expected fixed production cost begins at approximately $25 per month for
Supabase Pro, plus the domain and any required operational mailbox. Stripe has no
fixed monthly payment-platform charge under the selected standard model; its
fees are transaction-based.

Illustrative US domestic-card subscription fees at the approved prices, before
tax-inclusive effects, refunds, disputes, currency conversion, and other local
payment differences:

| Plan | Approximate Stripe payment, Managed Payments, and Billing fees | Approximate remainder |
|---|---:|---:|
| $1.99 monthly | $0.44 | $1.55 |
| $9.99 introductory annual | $1.01 | $8.98 |
| $19.99 annual | $1.72 | $18.27 |

These are planning estimates, not accounting or legal projections. At those
illustrative domestic rates, roughly 20 monthly subscribers, three introductory
annual subscribers, or two standard annual subscribers cover the $25 Supabase
baseline before other costs.

Supabase Pro currently includes 100,000 monthly active users, an 8 GB Postgres
database, 100 GB object storage, 250 GB egress, two million Edge Function
invocations, seven days of database backups, and seven days of logs. Spend and
usage must be rechecked immediately before provisioning because provider pricing
can change.

## Privacy and data lifecycle

Tab Two stores only what operates the paid service:

- Internal account ID and Google identity reference.
- Email and display name needed for account operation and support.
- Stripe customer, subscription, entitlement, and billing-period identifiers.
- Device identifiers, friendly names, last-sync time, and revocation state.
- Protected account key, encrypted vault, versions, and deletion metadata.
- Minimal security and error logs retained for the platform's seven-day window.
- Support correspondence and diagnostics only when the customer sends them.

Tab Two does not receive card details. It does not store synced connector
secrets, raw provider data, custom images, browsing history, analytics,
advertising identifiers, or behavioral profiles.

User controls include:

- Manage subscription through Stripe and Link.
- Delete cloud vault without deleting local data.
- Revoke a synced device.
- Export account metadata and the encrypted vault.
- Delete the cloud account after fresh Google authentication.
- Use local JSON backup independently.

Subscription cancellation stops renewal but preserves premium access through
the paid period. Deleting synced data removes the cloud vault while preserving
the account and subscription. Account deletion requires fresh Google
authentication, immediately revokes Tab Two sessions and premium access, stops
future billing, and deletes the vault, device records, and Tab Two account data.
It does not erase local data on any installation and is not recoverable through
support. Minimal transaction records may remain with Stripe or where applicable
accounting obligations require them. Revoking Google access alone does not
silently cancel a paid subscription; the product must warn customers to cancel
billing first.

## Support model

Tab Two is independently developed and does not promise a support SLA.

- In-extension Help and Troubleshooting is the primary support surface and must
  work without an external website.
- Billing, receipt, subscription, and transaction support routes through Stripe
  and Link.
- Subscription cancellation, device removal, vault deletion, reconnect, and
  sync reset are self-service.
- Connector failures include specific explanations and recovery actions.
- A Create diagnostic report action generates a user-reviewed redacted file.
- Diagnostic reports exclude tokens, capability URLs, event and task text, raw
  provider responses, and browsing information.
- Nothing is transmitted until the customer chooses to send it.
- One monitored support alias handles account access, privacy, security, and
  provider escalations.
- Product assistance is best-effort with no guaranteed response time and no
  premium priority queue.
- Provider, security, and deletion escalations use a protected notification path
  so they are not lost in ordinary mail.

Customer-facing language:

> Tab Two is independently developed and maintained. Self-service help is available in the extension. Email assistance is provided on a best-effort basis; response times are not guaranteed.

## Required implementation sequencing

1. Write and approve the implementation plan and threat model.
2. Revalidate Stripe Managed Payments eligibility, public-preview stability,
   current pricing, and supported tax behavior.
3. Revalidate Supabase pricing, data location, DPA, backup behavior, quotas, and
   spend controls.
4. Complete Google OAuth branding and identity verification planning.
5. Obtain Google Calendar and Microsoft production-access decisions. Keep every
   fitness provider outside the paid-MVP gate unless separately re-approved.
6. Design and approve the account, billing, sync, metrics, device, privacy,
   troubleshooting, and premium connector UI before production UI work.
7. Build the paid foundation behind explicit development and test environments.
8. Add provider integrations only after their individual privacy, permission,
   error, refresh, and quota designs are approved.
9. Run security, migration, entitlement, cancellation, deletion, sync-conflict,
   quota, cost, and real-extension Chromium gates.
10. Seek separate approval before any production deployment, Chrome Web Store
    mutation, rollout, or publication.

## Risk register

| Risk | Consequence | Required mitigation before implementation or launch |
|---|---|---|
| Stripe Managed Payments remains preview-only or rejects the product | Checkout or merchant-of-record plan cannot launch as designed | Revalidate eligibility and stability; use Lemon Squeezy only through a re-reviewed provider adapter and owner approval |
| Google or Microsoft access is delayed or denied | The two-connector paid launch gate is incomplete | Obtain provider decisions before promising a date; re-scope only through owner approval |
| A fitness provider's commercial terms, review path, or data policy conflicts with Tab Two | Connector removal, provider enforcement, or customer disruption | Keep fitness outside the paid-MVP gate; require current official-policy research and owner approval before design or provisioning |
| Spotify customer-supplied credentials conflict with commercial terms | Connector removal, provider enforcement, or customer disruption | Obtain written policy clearance before advertising, selling, or distributing it |
| Google-only identity is unavailable to a customer or blocked by an employer | Customer cannot create or recover a paid account | Keep free local use complete; disclose the requirement; retain provider-neutral account identity for a later approved provider |
| Backend key access is described inaccurately | Privacy promise exceeds the architecture | Use "encrypted sync" only; complete threat modeling, access isolation, rotation, and incident procedures |
| Sync schema accidentally admits a secret or capability URL | Sensitive connector authority reaches the backend | Deny by default, maintain one typed allowlist, add exhaustive secret fixtures, and fail closed on unknown fields |
| Concurrent or stale devices lose or resurrect data | Layout, text, habit, or metric corruption | Implement versioned entity merges, pre-overwrite local backups, acknowledged tombstones, and destructive conflict tests |
| Connector maintenance exceeds one-person capacity | Broken premium value and unsustainable support | Ship a small reviewed portfolio, use self-service recovery, monitor provider changes, and avoid a support SLA |
| Supabase usage or provider pricing changes | Margin falls below the $1.99 plan's assumptions | Enforce quotas and spend caps, review usage monthly, and retain a portable schema and export path |
| A new OAuth scope or extension permission changes Store review requirements | Release delay or unexpected customer warning | Request least privilege incrementally and require separate permission, privacy, Chromium, and Store-review approval |
| Owner or test access becomes a client-side bypass | Anyone can forge premium or the owner can be locked out by billing state | Keep preview fixtures out of production, bind the complimentary owner grant to the server account UUID, sign every lease, and test Stripe failure with the owner grant still active |

## Implementation questions that remain open

These questions do not reopen the approved product direction, but the later
implementation plan must resolve them before code or provisioning:

- Exact Google and Microsoft OAuth scopes and approval artifacts.
- Account-key wrapping algorithm, secret storage, rotation, and emergency
  recovery procedure.
- Exact sync entity map, revision format, tombstone acknowledgement, and local
  conflict-backup retention and restoration behavior.
- Supabase region, data processing terms, migration workflow, backup restore
  drill, and encrypted-vault export procedure.
- Exact tax-inclusive Stripe catalog configuration and introductory-price
  eligibility enforcement.
- Exact account-deletion retention required for transaction, tax, fraud, and
  security records.
- The owner-visible alert path for provider, security, privacy, deletion, quota,
  and spend events.
- Final Metrics and Account & Sync visual treatment, which requires separate
  owner-visible approval before production implementation.

## Acceptance criteria for the architecture phase

- Every approved decision in this specification has an explicit implementation
  owner, test strategy, and rollback path in the later implementation plan.
- Existing local capabilities and connector authorities remain free and intact.
- Free use performs no Tab Two account or sync backend traffic.
- The sync schema is deny-by-default and demonstrably excludes all secret and
  capability-bearing fields.
- Privacy copy says encrypted sync and never claims zero-knowledge or end-to-end
  encryption.
- Billing, entitlement, offline grace, cancellation, refund, deletion, and
  retention states are exhaustively specified and tested.
- Preview/test premium is deterministic, production contains no client-side
  bypass, and the signed complimentary owner grant remains active independently
  of Stripe billing state.
- Device revocation cannot claim to erase remote local data.
- Conflict tests prove that concurrent same-record changes create a recoverable
  local backup before replacement, independent entity changes merge, and
  deletion changes do not resurrect.
- Provider API access, retention, commercial-use, and quota terms are recorded
  before each connector is implemented.
- The paid launch does not depend on Spotify.
- No analytics, permissions, infrastructure, production secrets, deployment,
  Store change, or backend cost is introduced by approving this document.

## External evidence snapshot

The commercial and provider claims above were checked on 2026-08-31 against:

- Stripe pricing: <https://stripe.com/pricing>
- Stripe Managed Payments: <https://stripe.com/managed-payments>
- Stripe Managed Payments pricing: <https://support.stripe.com/questions/managed-payments-pricing>
- Supabase pricing: <https://supabase.com/pricing>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Spotify quota modes: <https://developer.spotify.com/documentation/web-api/concepts/quota-modes>
- Spotify Development Mode update: <https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security>
- Google Calendar scopes: <https://developers.google.com/workspace/calendar/api/auth>
- Google sensitive-scope verification: <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>
- Microsoft Graph calendar permissions: <https://learn.microsoft.com/en-us/graph/permissions-reference>
- Strava rate limits and review: <https://developers.strava.com/docs/rate-limits/>

Provider terms and prices are not durable product facts. They must be rechecked
at implementation and release approval time.
