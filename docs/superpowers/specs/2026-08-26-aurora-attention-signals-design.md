# Aurora Attention Signals Design

**Date:** 2026-08-26

**Status:** Owner approved on 2026-08-26; ready for implementation planning

**Scope:** Replace the Greeting helper's undifferentiated unfinished-task count with timely, explainable attention signals from Calendar, connected work services, Vercel, and weather

## 1. Context

Aurora currently renders a short Greeting helper beneath the greeting. Its task signal counts every unfinished item in every local Aurora task list. Local tasks have no due date, created timestamp, age, or priority, so the product cannot truthfully distinguish an urgent task from an old undated reminder. The helper also renders as plain text with no hover, keyboard, or touch path to explain what it counted.

The owner wants to retain the calm inline helper while making every attention claim explainable. Examples include an upcoming calendar event, a newly observed assigned issue, and a recent failed Vercel deployment. Ordinary undated local tasks must no longer produce an attention message.

## 2. Governing decisions

1. The Greeting helper remains inline photo text. It does not become a widget card.
2. Ordinary unfinished Aurora tasks do not count as attention signals.
3. Assigned work is considered new for six hours after Aurora first observes it.
4. Existing assigned work is silently baselined when a source is first observed. Enabling the feature must not flag an entire existing backlog as new.
5. Recent failed Vercel deployments remain attention signals for six hours after their provider timestamp.
6. Calendar events retain the existing 24 hour upcoming window.
7. Rain retains the existing forecast threshold and remains optional.
8. Hover, keyboard focus, and tap expose the exact context behind the summary.
9. Attention sources have individual settings beneath the existing Greeting helper master switch.
10. Connected-service refresh reuses Aurora's existing connector ownership, scope, timeout, stale-retention, and Web Locks behavior.
11. No credential, capability URL, issue title, deployment URL, or other remote content is written to the attention ledger.
12. This design does not authorize account infrastructure, payments, subscriptions, cloud sync, analytics, Chrome Web Store actions, or a premium product tier.

## 3. Goals

- Make every visible attention message truthful and explainable.
- Surface newly observed assigned work even when its widget is not placed on the Canvas.
- Surface recent Vercel deployment failures without requiring the Vercel widget to be visible.
- Keep the helper visually lightweight and text-led.
- Provide mouse, keyboard, and touch access to context.
- Preserve connector privacy, permission, snapshot, backup, and multi-tab correctness.
- Let the user disable Calendar, assigned work, deployment failures, or rain independently.
- Avoid alert fatigue when the feature first observes an established backlog.

## 4. Non-goals

- No due dates, priorities, reminders, or created timestamps are added to local Aurora tasks.
- No operating-system notification, badge count, email, sound, or push notification.
- No background service that monitors while no Aurora new-tab page is open.
- No remote write, issue transition, assignment change, deployment retry, or calendar action.
- No new connector, credential, host permission, or provider API.
- No attempt to claim the provider's exact assignment time when the provider snapshot does not expose it.
- No analytics or behavioral tracking.
- No Chrome Web Store publication or submission.
- No premium subscription implementation.

## 5. Considered approaches

### 5.1 Existing snapshots only

The helper could read whatever connector snapshots already exist. This is the smallest code change, but it is not a dependable attention feature. A connector widget that is not mounted may not refresh, so new assignments and failures can remain invisible indefinitely.

### 5.2 Greeting-owned refresh with a shared attention ledger

This is the selected approach. While the Greeting helper and a source are enabled, a small source owner reuses the existing connector fetch and snapshot framework for that configured service. The renderer reads only scope-valid data. A shared local ledger records stable assigned-item IDs and first-seen timestamps so every open tab agrees on what is new.

This approach works without a visible connector widget, adds no background permission, and preserves existing request ownership and multi-tab serialization.

### 5.3 Extension background monitor

A background service could refresh connectors independently of the new-tab page and later support operating-system notifications. That is outside the requested scope and would introduce lifecycle, permission, rate-limit, privacy, and user-expectation work before it provides value for the inline helper.

## 6. Signal model

The pure attention domain exposes structured signals rather than only preformatted text.

Each signal contains:

- A stable signal key.
- A kind: `calendar`, `assignment`, `deployment`, or `rain`.
- A source label such as Calendar, GitHub, Jira, Linear, GitLab, Vercel, or Weather.
- A short summary for the inline helper.
- Detail text for the context panel.
- A relevant timestamp and relative-age input where available.
- A validated destination URL when the source already provides one.
- A severity and deterministic ordering rank.

Remote content is cleaned, whitespace-normalized, length-bounded, and rendered as text. It is never injected as HTML.

### 6.1 Calendar

Calendar preserves the current behavior:

- Use only a scope-valid, fresh ICS snapshot.
- Select events that have not ended and begin within 24 hours.
- Prefer the next timed event over an all-day event when both are useful.
- Render the event summary plus `now`, minutes, hours, or `today`.
- Include the calendar source in the context panel without exposing an ICS capability URL.

### 6.2 Assigned work

Assigned work sources are:

- GitHub assigned issues and pull-request review requests.
- GitLab assigned merge requests and review requests.
- Jira unresolved assigned issues.
- Linear active assigned issues.

The current provider payloads do not consistently expose assignment time. Aurora therefore uses first observation and labels it honestly as `First seen by Aurora` in the detail panel.

For each enabled source:

1. The first valid observation initializes the source ledger with all current IDs and no alerts.
2. A stable ID that appears in a later valid observation is recorded with that snapshot's fetch time and becomes new.
3. The item remains an attention signal for six hours.
4. An item that is no longer present is removed from the current known set. If it later reappears, it is treated as newly observed.
5. A failed or invalid refresh retains the last valid snapshot and must not convert temporary absence into a new assignment wave.

Stable IDs are provider-native IDs or non-secret canonical keys. Titles and URLs remain in the existing connector snapshot only.

### 6.3 Vercel deployment failures

A deployment is an attention signal when:

- Its normalized state is `ERROR`.
- Its provider `createdAt` timestamp is no more than six hours old.
- The Vercel connector and Deployment failures source are enabled.
- Its snapshot is scope-valid and accepted by the existing connector framework.

The context panel shows the project, failed state, relative age, and validated deployment URL. Successful, building, queued, canceled, malformed, future-dated, and expired deployments do not count.

Vercel does not need an attention ledger because its payload includes a provider timestamp.

### 6.4 Rain

Rain preserves the current local weather-cache behavior:

- The cache must match the current location identity and remain within its freshness window.
- The first hourly point at or above 50 percent precipitation probability is selected.
- Time formatting follows the user's 12 or 24 hour setting.
- Disabling the Rain source performs no weather write and leaves the Weather widget unchanged.

## 7. Summary copy and priority

The inline text remains concise:

- Calendar alone: the existing direct event summary, such as `Dentist appointment in 2h`.
- One new assigned-work item: `1 task needs attention`.
- Multiple new assigned-work items: `3 tasks need attention`.
- Vercel alone: `Vercel build failed` or `2 Vercel builds failed`.
- Mixed assigned work and deployment failures: `2 items need attention`.
- Rain alone: the existing direct rain summary.

The helper may combine one immediate Calendar summary with one aggregated attention summary when both fit its measured width. It never hides a recent deployment failure behind lower-priority rain. Deterministic priority is:

1. Recent Vercel failure.
2. Newly observed assigned work.
3. Upcoming Calendar event.
4. Rain.

The context panel lists every admitted fresh signal even when the inline width budget shows only the highest-priority summary. The trigger's accessible name includes the total count when visual truncation occurs.

## 8. Context panel interaction

The helper summary becomes a visually plain text button. It has no card background, icon tile, or permanent container chrome.

The context panel is a small anchored, non-modal surface:

- Mouse hover opens it and moving outside the trigger and panel closes it after a short tolerance.
- Keyboard focus opens it.
- Enter, Space, or tap toggles it.
- Escape closes it and returns focus to the trigger when focus was inside the panel.
- Clicking outside closes it.
- Moving focus between the trigger and panel keeps it open.
- The panel is portaled and clamped to the viewport so Canvas overflow and edge placement cannot clip it.
- It has no backdrop, focus trap, page scroll lock, or full-screen treatment.
- Links are keyboard reachable and use each connector's already-validated destination.

Each row shows the source, bounded title or project, status, and relative context. Examples include `GitHub | AUR-42 | First seen by Aurora 2h ago` and `Vercel | aurora-newtab | Failed 18m ago`.

The trigger exposes expanded state and panel ownership programmatically. The panel uses a labelled non-modal region rather than modal-dialog semantics. Reduced-motion users receive no animated travel or fade requirement.

## 9. Settings

The existing **Greeting helper** switch remains the master authority. When it is off, the helper renders nothing and no attention-owned connector refresh runs.

When it is on, Settings shows four subordinate switches:

1. **Upcoming calendar**
2. **Assigned work**
3. **Deployment failures**
4. **Rain**

All four default on for the approved expanded helper. Each switch changes only Greeting helper participation. It does not enable or disable a connector, place or remove a widget, delete a snapshot, revoke a permission, or change another widget's views.

Settings copy explains that assigned work means newly observed GitHub, GitLab, Jira, and Linear items, and that ordinary undated Aurora tasks are not counted.

The nested Settings addition follows the repository's versioning rule:

- Increment the storage schema version.
- Add a migration that merges the new source defaults into existing Settings.
- Extend backup validation and tests.
- Preserve explicit user choices through backup, restore, and later migrations.

## 10. Attention ledger and storage

The attention ledger is a new top-level local storage authority because first-observation state must survive reloads and synchronize across tabs. Top-level placement lets the existing default merge safely backfill older stores without rewriting unrelated data.

Its data is limited to:

- A ledger format version.
- Per-source initialization state.
- Stable current item IDs.
- Nullable first-seen timestamps used only for post-baseline arrivals.
- Last valid observation time for deterministic reconciliation and pruning.

It does not store titles, summaries, repository names, project names, issue URLs, deployment URLs, connector configuration, tokens, capability URLs, or response bodies.

Ledger reconciliation runs inside the storage updater and rechecks the source observation time. An older tab cannot overwrite a newer source observation. Reprocessing the same snapshot is idempotent. Invalid, stale, wrong-scope, disabled, or failed source data performs no ledger transition.

The ledger is derived device-local state. Backup export excludes it, and restore starts a fresh silent baseline on that device. This prevents a backup from transferring stale attention history to another browser.

## 11. Connector refresh ownership

The helper refresh owner mounts only when all of the following are true:

- The Greeting helper is enabled.
- The relevant subordinate source is enabled.
- The connector is enabled and completely configured.
- Aurora already owns the connector's required origin permission.

It reuses the existing connector fetch functions and snapshot hook. Therefore TTLs, conditional requests, abort timeouts, snapshot scope, stale retention, permission checks, epoch ownership, Web Locks coordination, and cross-tab subscription stay under their current authorities.

A visible connector widget and the Greeting helper may both request the same snapshot, but the existing framework must coalesce ownership so this does not create duplicate concurrent network requests. The helper never fetches a disabled connector or requests a new origin permission.

## 12. Multi-tab behavior

Aurora settings, connector snapshots, and the new attention ledger are intentionally shared across tabs in the same Chrome profile.

- One tab's valid connector refresh updates the shared snapshot.
- The queued ledger updater establishes the baseline or records a new item once.
- Every open tab receives the same resulting attention state.
- Dismissing the panel changes only that tab's open UI state. It does not mark a remote item complete or globally dismissed.
- Source setting changes propagate across tabs through the existing storage subscription.

This matches Aurora's current shared-profile behavior and avoids contradictory attention counts across tabs.

## 13. Partial, stale, and error behavior

- A source contributes nothing until configuration, snapshot scope, validation, and freshness are all satisfied.
- A retained last-known-good snapshot remains eligible only under its existing truthful stale policy and the attention time window.
- Connector errors do not produce a generic `needs attention` item. The connector widget or Settings remains the authority for connection errors.
- One failed source does not suppress valid Calendar, work, deployment, or rain signals from another source.
- If every enabled source has no signal, the helper renders nothing.
- If a linked item disappears while the context panel is open, the next shared-state render removes it without closing unrelated content.
- A malformed timestamp, ID, title, or URL is rejected or safely omitted at the connector boundary. It cannot create an unbounded or unsafe context row.

## 14. Testing and verification

### 14.1 Pure tests

- Ordinary unfinished Aurora tasks never create a signal.
- Calendar, rain, Vercel, assigned-work, mixed-source, expiry, future-time, and formatting cases.
- Existing assigned items baseline silently.
- Later new IDs alert once and expire after six hours.
- Reprocessing a snapshot is idempotent.
- Older-tab observations cannot replace newer ledger state.
- Removed and later reappearing IDs behave deterministically.
- Titles and URLs never enter the ledger.

### 14.2 Storage and settings tests

- Storage version migration adds all source settings without losing older Settings fields.
- Backup validation accepts the new Settings shape and rejects malformed source values.
- Backup export excludes the attention ledger.
- Restore produces a fresh silent baseline.
- Master and subordinate switches synchronize across tabs.

### 14.3 Component tests

- Hover, focus, Enter, Space, tap, Escape, outside pointer, and trigger-panel focus transfer.
- Expanded and ownership semantics.
- Exact source details, truthful `First seen by Aurora` copy, link destinations, and text-only rendering.
- No connector refresh when the master or matching source is off.
- No snapshot use when connector configuration, scope, or freshness is invalid.
- Mixed-source counts and priority.

### 14.4 Real Chromium verification

Use an exact provenance build and existing-layout-shaped storage. Verify at minimum:

- 1600x900 owner-visible layout.
- A compact browser width.
- A touch-capable context.
- Strongly varied backgrounds and photo text colors.
- Panel edge clamping above, below, left, and right.
- No collision with Clock, Greeting, Settings, Canvas controls, or widget frames.
- No clipping, unexpected scrollbar, stuck hover state, pointer interception, console error, or page error.
- Two-tab synchronization with one new assigned-item transition.
- Source toggles, master switch, and a recent Vercel failure fixture.

The final browser evidence must identify the exact commit and built provenance. Manual MacBook validation remains a separate owner check after the verified branch is pushed.

## 15. Delivery boundary

Implementation occurs in the isolated Aurora 2 worktree. The protected original checkout remains untouched.

After focused tests, one bounded implementation review, fixes for Critical or Important findings, one stabilized full gate, and real Chromium evidence, the completed commit may be pushed to `origin/feat/aurora-2-observatory` under the owner's explicit 2026-08-26 approval. This does not authorize merge, release, Chrome Web Store upload, submission, publication, or listing changes.

Premium subscriptions are a separate product-design conversation after this feature. That conversation must cover customer value, free and paid boundaries, identity, payment processing, entitlement enforcement, cloud data, privacy disclosures, support expectations, cancellation, recovery, Store policy, and operating cost before any implementation is authorized.
