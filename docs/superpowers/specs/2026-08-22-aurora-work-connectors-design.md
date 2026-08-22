# Aurora Work Connectors Design

**Status:** Approved for implementation by the owner's continuous-delivery
authorization in A2-D062 and the Program F roadmap.

**Extends:**

- `2026-08-22-aurora-expansion-platform-design.md`
- `2026-08-17-aurora-named-layouts-live-canvas-design.md`

**Packet boundary:** Program F Work wave only. This packet adds Linear, Sentry,
and Todoist as complete Aurora connectors and widgets. It does not add stocks,
OAuth, arbitrary provider hosts, background workers, or Chrome Web Store work.

## 1. Product law

Each connector answers one repeatable glance question:

- Linear: What assigned work needs attention?
- Sentry: What is breaking now?
- Todoist: What is due or overdue?

The widget is a bounded view of provider-owned data, not a replacement client.
Aurora may open an item in its provider. It may complete a Todoist task only
after an explicit confirmation. It never changes Linear or Sentry state.

## 2. Goals

1. Add three independently configurable connector identities with exact
   request, credential, origin, cache, backup, and recovery contracts.
2. Give each identity useful Compact, Standard, Full, and Docked tiers that
   obey the no-whitespace law.
3. Keep one data owner per mounted connector identity through the existing
   configuration-scoped snapshot authority.
4. Make setup understandable with real validation, bounded pickers, truthful
   loading and error states, and no comma-separated resource entry.
5. Prove all tiers and degraded states in rebuilt Chromium without using live
   credentials or writing outside the expected connector snapshot cache.

## 3. Non-goals

- No OAuth client, redirect flow, provider SDK, new dependency, webhook, push
  service, or service worker polling loop.
- No self-hosted Linear, Sentry, or Todoist origin in this wave.
- No issue creation, assignment, state transition, acknowledgement, resolve,
  snooze, project mutation, or task editing.
- No inferred team, project, environment, or task selection. An empty picker
  means all resources available to the credential.
- No connector result enters backup. No token, provider item, provider URL,
  organization identifier, or snapshot enters exported backup data.
- No change to named-layout placement, stacks, Weather, Flow, existing
  connector requests, legacy `layout`, exact recovery, CSP, or Store state.

## 4. Provider contracts

### 4.1 Linear

- Origin: `https://api.linear.app/*`.
- Endpoint: `POST https://api.linear.app/graphql`.
- Authentication: personal API key in `Authorization: <token>`. OAuth bearer
  tokens are not accepted by this personal-token setup.
- Identity query: `viewer` with the minimum identity and team fields required
  to name the account and populate the team picker.
- Work query: the viewer's first 50 assigned issues, requesting only identity,
  title, priority, due date, URL, workflow state, team, and cycle context.
- GraphQL responses are failures when their `errors` array is nonempty, even
  when HTTP status is 200. Partial data is not committed as a fresh snapshot.
- Aurora filters completed and canceled workflow types locally, then caps the
  stored normalized result at 25 issues.
- Refresh: on missing/stale mounted data, visible-window restoration, explicit
  refresh, and at a 15-minute minimum freshness boundary while mounted. There
  is no background worker and no request while the widget is not mounted.

### 4.2 Sentry

- Region is an explicit enum: Global, US, or DE.
- Origins are fixed respectively to `https://sentry.io/*`,
  `https://us.sentry.io/*`, or `https://de.sentry.io/*`.
- Endpoint: `GET /api/0/organizations/{organization}/issues/` on the selected
  region host with `query=is:unresolved`, `sort=trends`, `statsPeriod=24h`,
  `groupStatsPeriod=24h`, and `limit=25`.
- Optional selected project slugs are repeated `project` query parameters.
  Empty selection means all accessible organization projects.
- Authentication: `Authorization: Bearer <token>`. The documented minimum
  scope for the issue endpoint is `event:read`.
- Aurora normalizes at most 25 issues using title, short ID, project, level,
  event count, affected-user count, first/last seen, 24-hour stats, permalink,
  priority, and regression/trend facts available in the response.
- Refresh: on missing/stale mounted data, visible-window restoration, explicit
  refresh, and at a five-minute freshness boundary while mounted.

### 4.3 Todoist

- Origin: `https://api.todoist.com/*`.
- Authentication: `Authorization: Bearer <token>`.
- Setup validation and picker source: cursor-bounded
  `GET /api/v1/projects?limit=200`.
- Task source: cursor-bounded `GET /api/v1/tasks?limit=200`. Aurora follows at
  most two pages and fails rather than silently presenting an incomplete set
  beyond 400 active tasks.
- Aurora normalizes at most 25 due-bearing tasks using ID, content, project,
  due date/time, recurring flag, priority, labels, duration, and parent.
  Undated tasks do not consume widget space.
- Optional selected project IDs come from a checkbox picker. Empty selection
  means all projects. The UI never asks for comma-separated IDs.
- Provider deep link: `https://app.todoist.com/app/task/<id>`.
- Completion: `POST /api/v1/tasks/{id}/close`, only from a named confirmation
  dialog that repeats the task title and explains recurring-task behavior.
  A successful completion invalidates only Todoist's snapshot and triggers one
  bounded refresh. Cancel performs no request and no storage write.
- Refresh: on missing/stale mounted data, visible-window restoration, explicit
  refresh, and at a five-minute freshness boundary while mounted.

## 5. Storage and migration

Schema v17 adds widget toggles `linear`, `sentry`, and `todoist`, all false for
existing and new users. It extends the connector union with:

```ts
interface LinearConfig {
  enabled: boolean
  token: string
  displayName: string
  teamIds?: string[]
  itemLimit?: number
  snapshotEpoch?: string
}

interface SentryConfig {
  enabled: boolean
  token: string
  organization: string
  region: 'global' | 'us' | 'de'
  projectSlugs?: string[]
  itemLimit?: number
  snapshotEpoch?: string
}

interface TodoistConfig {
  enabled: boolean
  token: string
  accountLabel: string
  projectIds?: string[]
  itemLimit?: number
  snapshotEpoch?: string
}
```

Read-time normalizers enforce trimmed strings, deduplicated bounded selection
arrays, region membership, and item limits from 3 through 10 with a default of
6. Persisted malformed configuration degrades to disconnected or to safe
defaults; origin derivation never throws.

Migration 16 to 17 adds only the three false widget keys. It preserves every
other byte-shaped value, unknown key, connector config, snapshot, layout, and
legacy `layout`. Existing schema-16 malformed nested settings fail before the
version stamp exactly as the schema-15 guard now does.

Tokens are descriptor-declared secret fields. Connector snapshots stay
excluded from backup. Non-secret selection preferences may be exported, but
organization identifiers, account labels, team/project IDs, and provider item
content are conservatively removed with the credential. Restore therefore
requires reconnecting all three identities.

## 6. Settings experience

All three cards live in **Development** for Linear and Sentry, and
**Calendar & tasks** for Todoist.

Each setup form:

- names the exact credential and links to the provider's credential page;
- explains the fixed destination before the user connects;
- requests only its fixed optional host origin inside the submit gesture;
- validates the credential before persisting anything;
- stores one rotated snapshot epoch on successful connect;
- shows an inline provider-specific error without logging response bodies;
- supports reconnect and disconnect through the existing origin lifecycle
  authority.

Connected settings use checkbox pickers populated from validated provider
metadata or the current normalized snapshot. Pickers include Select all and
Clear, preserve provider order, and remain useful with keyboard and touch.
Item count is a labeled select from 3 through 10. A picker or count change
clears only that connector snapshot. It never changes another connector.

Sentry's region is chosen before connection and cannot be changed without a
reconnect, so a stored token is never silently sent to another host.

## 7. Presentation

### 7.1 Shared rules

- Every tier uses the same normalized snapshot and one mounted hook.
- Loading, setup-needed, empty, stale, retained-data error, and hard error
  states are content-tight and truthful.
- Full cards cap their local result region and scroll inside the widget. They
  never expand without bound or force the canvas to reflow.
- Rows use visible provider context, not unexplained dots or counts.
- Hover and focus expose the same actions. Item titles are real links opened
  through Aurora's safe external-navigation helper.
- Docked always remains one clean status line at or below the Dock height
  contract. Clicking it opens the same truthful detail surface as other dense
  dock widgets.

### 7.2 Linear tiers

- Compact: assigned count, due-soon count, and nearest due issue identifier.
- Standard: up to the selected item limit with identifier, title, state,
  priority, team, and due context.
- Full: state-grouped assigned work, cycle context when present, due context,
  and up to 25 locally scrollable issues.
- Docked: `N assigned · N due soon`; detail shows the top bounded rows.
- Empty: `No assigned Linear work` for the selected teams.

### 7.3 Sentry tiers

- Compact: unresolved count, strongest level, and top trending short ID.
- Standard: top issues with title, project, level, event count, users, and last
  seen.
- Full: up to 25 locally scrollable issues with trend, first/last seen,
  priority, event count, affected users, and project context.
- Docked: `N unresolved · <top short ID>`; detail names the issue, project,
  level, count, and last seen.
- Empty: `No unresolved Sentry issues` for the selected projects.

### 7.4 Todoist tiers

- Compact: overdue count, due-today count, and next task.
- Standard: overdue and today sections with title, project, time, priority,
  and recurrence.
- Full: overdue, today, and upcoming sections with up to 25 locally scrollable
  tasks, project labels, priority, duration, and recurrence.
- Docked: `N due today · N overdue`; detail shows the next bounded tasks.
- Empty: `Nothing due in Todoist` for the selected projects.

## 8. Privacy and permissions

The three origins are optional host permissions requested only by their setup
gestures and released only when no configured connector owns them. No new
Chrome API permission is required.

Data flow records state exactly what is sent and received. Tokens, provider
response bodies, issue/task titles, IDs, URLs, selected resource IDs, and
snapshots never enter logs, backup, catalog fixtures, screenshots, or reports.
Chromium evidence uses inert synthetic responses and unmistakably fake tokens.

## 9. Error and race handling

- Every request has the shared eight-second timeout and typed HTTP failure.
- Linear checks GraphQL errors separately from HTTP status.
- Todoist pagination reuses the same query parameters and opaque cursor.
- Sentry parameters are encoded with `URLSearchParams`; organization and
  project selections are never interpolated without encoding.
- A late response revalidates connector ownership inside the serialized
  snapshot write, preserving the existing stale-completion defense.
- Reconnect rotates `snapshotEpoch`. Disconnect clears only that identity and
  releases only unowned origins.
- Selection changes are read-modify-write operations over the authoritative
  connector map and clear only the matching snapshot.
- A Todoist completion has an in-flight latch. Repeated confirmation cannot
  send duplicate close requests.

## 10. Delivery shape

The Work wave is one bounded packet executed in this order:

1. schema v17, identities, descriptors, privacy, backup, fixtures, registry,
   and exact migration;
2. Linear service, settings, widget, tiers, and tests;
3. Sentry service, settings, widget, tiers, and tests;
4. Todoist service, settings, widget, confirmation mutation, tiers, and tests;
5. catalog contracts, rebuilt-extension Chromium evidence, bounded review,
   one fix/rereview cycle, ledgers, checkpoint, push, and repository proof.

Every production behavior receives a focused observed RED before its change.
The packet does not run the exhaustive NL-P6 matrix.

## 11. Acceptance criteria

- [ ] Schema v17 adds exactly three false widget toggles and preserves all
  unrelated current and legacy data.
- [ ] Connector IDs, descriptors, settings bodies, fixtures, privacy flows,
  backup redaction, origin ownership, widgets, renderers, size contracts,
  default placements, and catalog coverage have exact parity.
- [ ] All three setup paths request only their fixed provider origin, validate
  before persist, redact credentials, rotate snapshot identity, and disconnect
  without disturbing another owner.
- [ ] Linear fails on GraphQL errors and stores at most 25 active assigned
  issues; Sentry uses only its chosen official region and at most 25 unresolved
  issues; Todoist follows at most two pages and stores at most 25 due tasks.
- [ ] Empty, loading, stale, retained-data error, hard error, Compact,
  Standard, Full, and Docked states are useful and content-tight.
- [ ] Full result regions have measured local overflow at maximum fixtures;
  Docked remains within its height contract and opens contextual detail.
- [ ] Todoist completion requires explicit confirmation, is single-flight,
  invalidates only Todoist, and sends no request on Cancel.
- [ ] Focused tests, full tests, TypeScript, production build, expansion
  contracts, Chromium evidence, diff hygiene, bounded review, one fix cycle,
  ledgers, push, and active/protected proofs pass from the reviewed commit.
- [ ] No existing connector request, permission, credential, backup, storage,
  layout, dependency, protected checkout, or Chrome Web Store state changes.

## 12. Owner-visible QA

The rebuilt-extension witness covers all four tiers for all three identities,
maximum-data Full cards, every Docked degraded state, setup and reconnect,
picker changes, deep links, Todoist confirm/Cancel/single-flight, reload cache
continuity, exact request allowlists, expected snapshot-only writes, and exact
1408x445 usefulness. Original-resolution captures are inspected individually;
contact sheets are navigation aids only.

