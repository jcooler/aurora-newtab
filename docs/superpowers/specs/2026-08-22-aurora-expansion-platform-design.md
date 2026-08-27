# Aurora Expansion Platform Design

**Status:** Approved for implementation under A2-D062 and the owner-approved
continuous-delivery roadmap on 2026-08-21.

**Extends:**

- `2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- `2026-08-17-aurora-named-layouts-live-canvas-design.md`

**Packet boundary:** Program E only. This packet makes future additions
repeatable. It does not ship a new user-visible widget or connector.

## 1. Problem

Aurora already has 26 widget identities, nine connectors, four display tiers,
named layouts, docks, stacks, backup and recovery, permissions, and provider
cache ownership. Adding one identity touches several independent authorities.
A missing registry row, tier promise, renderer, setting, backup rule, origin
owner, or catalog fixture can compile successfully and still fail for users.

The owner also wants dozens of serious, useful-at-a-glance, and fun additions.
Aurora needs a durable way to compare those ideas and a development path that
makes omissions visible before implementation review.

## 2. Goals

1. Preserve a machine-readable catalog of at least 36 candidate additions with
   enough product, provider, privacy, and presentation detail to make a real
   sequencing decision.
2. Produce a human-readable catalog from the same data so research does not
   split into two inconsistent documents.
3. Provide a guarded scaffold that emits a reviewable starter packet into an
   explicit scratch directory and never edits production authorities by
   itself.
4. Add executable contracts that fail when current widget, connector,
   settings, tier, origin, backup, or visual-catalog authorities drift apart.
5. Make the first four addition waves ready for their own just-in-time specs
   without granting permissions, adding credentials, or weakening frozen
   boundaries in this packet.

## 3. Non-goals

- No new widget identity, connector identity, provider request, permission,
  host origin, credential, migration, or storage key ships in Program E.
- No central runtime meta-registry replaces the existing typed authorities.
  Independent authorities remain valuable because the contract suite can
  detect omissions between them.
- The scaffold does not write into `src`, `scripts`, `docs`, `dist`, the
  repository root, or the protected original checkout.
- The catalog does not approve OAuth, provider terms, or Store warnings. It
  records those costs and blockers for the addition packet that must decide
  them.
- No exhaustive NL-P6 visual matrix runs. The packet changes development
  infrastructure, not presentation.
- Stocks and portfolio tracking remain deferred. Crypto remains unchanged.

## 4. Users and stories

- As an Aurora user, I want additions selected for clear glance value rather
  than novelty alone so that a larger catalog remains useful.
- As a privacy-conscious user, I want permissions, data sent, local storage,
  backup behavior, and credential handling known before an integration ships.
- As an Aurora contributor, I want one command to reveal every required
  integration point so that a widget cannot quietly omit a tier, setting,
  renderer, recovery rule, or visual fixture.
- As a reviewer, I want generated starter work isolated from production so I
  can reject or reshape it without cleanup risk.
- As the owner, I want an ordered backlog of dozens of ideas while retaining a
  separate acceptance decision for each implementation wave.

## 5. Candidate catalog

### 5.1 Authority and files

`docs/superpowers/catalog/expansion/candidates.json` is the machine-readable
research authority. `scripts/expansion/render-catalog.mjs` validates it and
generates `docs/superpowers/catalog/expansion/CATALOG.md`. The generated
Markdown carries a header that says it must not be edited directly.

The JSON root has this shape:

```ts
interface ExpansionCatalog {
  catalogVersion: 1
  verifiedOn: string // ISO calendar date, for example 2026-08-22
  candidates: ExpansionCandidate[]
}
```

Each candidate has the following required fields:

```ts
interface ExpansionCandidate {
  id: string
  label: string
  kind: 'browser-native' | 'built-in-provider' | 'connector' | 'local'
  status: 'approved-wave' | 'researched' | 'deferred' | 'absorbed' | 'blocked'
  wave: 'browser-native' | 'work' | 'at-a-glance' | 'broader' | 'backlog'
  priority: 1 | 2 | 3 | 4 | 5
  userValue: string
  glanceQuestion: string
  source: {
    provider: string
    docsUrl: string
    transport: string
    termsRisk: 'low' | 'medium' | 'high' | 'unknown'
  }
  auth: {
    mode: 'none' | 'browser-permission' | 'api-token' | 'oauth-pkce' |
      'oauth-secret-required' | 'local'
    directClientViable: boolean
    secretHandling: string
  }
  access: {
    chromePermissions: string[]
    origins: string[]
    userWarnings: string[]
  }
  privacy: {
    sends: string[]
    receives: string[]
    stores: string[]
    backup: string
    redaction: string
  }
  cache: {
    freshness: string
    staleBehavior: string
    refresh: string
    failure: string
  }
  settings: {
    setup: string[]
    controls: string[]
    validation: string[]
  }
  presentation: {
    compact: string
    standard: string
    full: string
    docked: string
    interaction: string
    empty: string
    loading: string
    stale: string
    error: string
  }
  maintenance: {
    risk: 'low' | 'medium' | 'high'
    drivers: string[]
  }
  decision: {
    rationale: string
    blockers: string[]
  }
}
```

Strings may explicitly say `Not applicable` but may not be blank. Arrays may
be empty only where the schema permits no permission, origin, warning, sent
data, received data, stored data, setup field, control, validation, risk
driver, or blocker. URLs must use HTTPS. IDs use lower camel case and are
unique.

### 5.2 Initial catalog scope

The initial catalog contains the 14 roadmap candidates plus at least 22
ranked backlog candidates. The first four waves remain:

1. Browser-native: Reading List, Recently Closed, Downloads, and Tab Groups.
2. Work: Linear, Sentry, and Todoist.
3. At a glance: On This Day, public holidays, severe weather, and aurora/Kp.
4. Broader: Notion, Slack, and Spotify, each blocked until its own OAuth,
   scope, provider-policy, and privacy decision is accepted.

Backlog research spans browser context, engineering operations, project work,
calendar and communication, natural events, space, learning, history, sports,
transit, packages, and local insights. Overlap with an existing Aurora widget
is recorded as `absorbed`, not disguised as a separate feature. High-warning
or client-secret-required ideas remain `blocked` or `deferred`.

### 5.3 Ranking

Priority is an editorial decision informed by five recorded dimensions:

- repeat glance value;
- setup and permission cost;
- privacy exposure;
- provider and maintenance risk;
- differentiation from current Aurora capabilities.

The catalog renderer groups by wave and status. It highlights required Chrome
warnings, secret-bearing auth, host origins, high maintenance risk, blockers,
and whether a direct MV3 client is viable. It does not compute an opaque score
or silently reorder approved waves.

## 6. Safe scaffold

### 6.1 Command

`node scripts/expansion/scaffold.mjs` requires:

```text
--id=<lowerCamelId>
--label=<human label>
--kind=builtin|connector|provider
--out-dir=<explicit scratch directory>
```

The output directory must be absent or empty and must resolve inside the
active worktree. A scaffold root's first path segment must begin with
`.aurora-expansion-`; a QA root must begin with `.qa-expansion-platform-`.
The command rejects the repository root, `src`, `docs`, `scripts`, `dist`, the
protected original path, existing symlinks and junctions, traversal, absolute
children, duplicate writes, and a non-empty target. Failure happens before the
first write.

### 6.2 Output

The scaffold generates only a starter packet:

- `candidate.json`, populated with explicit review markers that fail its
  local validation until replaced;
- a widget component and focused test starter;
- a service and service-test starter for connector or provider kinds;
- a settings starter for connector kinds;
- `INTEGRATION-CHECKLIST.md` with every production authority and required
  RED/GREEN, backup, permission, privacy, tier, dock, error, Chromium, review,
  and checkpoint proof;
- `manifest.json` listing every emitted payload file and its SHA-256 digest;
  the manifest does not attempt to hash itself.

Generated TypeScript is intentionally not production-ready. It has no fetch,
storage write, permission request, credential literal, or hidden fallback.
The contributor chooses the actual design in that addition packet, writes a
focused failing production test, and then integrates files manually.

## 7. Executable addition contracts

### 7.1 Current widget parity

The contract suite compares independent runtime authorities:

- `BLOCK_IDS`;
- `WIDGET_REGISTRY` IDs and renderer keys;
- actual keys of the renderer implementation map;
- `WIDGET_SIZE_CONTRACTS` keys and nonblank declared promises;
- `DEFAULT_WIDGET_POINTS` keys;
- widget availability keys against `defaults().settings.widgets`;
- a widget-toggle introduction-version ledger against the real migration path,
  so every current toggle is covered and every post-baseline toggle is
  materialized by its declared migration;
- catalog-capture identities and each supported free tier;
- Docked capture coverage exactly when the content contract declares Docked.

Actual renderer keys must be derived from the renderer object, not from the
registry being checked. Catalog coverage data moves to one tooling manifest
consumed by both the Chromium catalog script and Vitest.

### 7.2 Current connector parity

The suite verifies:

- `CONNECTOR_IDS`, connector descriptors, connector-backed registry entries,
  and settings bodies have exact identity parity;
- every descriptor declares nonblank auth, TTL, origin ownership, backup
  re-entry behavior, secret fields, and redaction behavior through the real
  full-backup path;
- generic complete fixtures exist for every connector identity;
- backup export never emits any declared secret field;
- every declared held origin has exactly one owning connector in a full
  fixture, while shared origins retain their existing ownership semantics;
- disabled, invalid, configured-hidden, and configured-visible settings
  states remain distinguishable.

These tests use the real descriptor, backup, validation, and origin helpers.
They do not assert on mocks or mirror the implementation to compute expected
values.

### 7.3 Command and Chromium proof

`npm run test:expansion-contract` runs the focused Vitest and Node contract
families. The existing catalog harness first gains a tested non-writing check
mode so contract checks cannot replace accepted evidence. A separate guarded
scratch-output option rebuilds `dist` from the reviewed commit, captures all
currently supported widget tiers into ignored batch-specific directories, and
fails on a missing identity, declared tier, Docked branch, empty useful region,
page/runtime error, failed request, or any unexpected successful or failed
external request.

Program E records one full scratch catalog run and individually inspects a
bounded representative set: one built-in, one browser-owned widget, one local
widget, one connector, one Docked line, one Full tier, and one standard-only
widget. This proves the generalized harness without reopening the owner-gated
NL-P5 catalog or running the exhaustive NL-P6 matrix.

## 8. Documentation

`docs/ADDING-AURORA-CAPABILITY.md` explains:

1. select and verify a catalog candidate;
2. write the candidate's just-in-time design and permission/privacy decision;
3. generate a scratch starter;
4. observe RED before production code;
5. integrate each listed authority manually;
6. run the expansion contract and focused tests;
7. rebuild and run the Chromium tier catalog;
8. complete bounded review, one fix cycle, ledger, checkpoint, push, and
   active/protected proof.

The guide names the Store gate and states that permission acceptance for one
addition does not authorize another.

## 9. Error handling and safety

- Catalog validation reports every candidate and field path in one run, then
  exits nonzero without rewriting Markdown.
- Markdown generation writes to a sibling temporary file and renames only
  after complete validation.
- Scaffold path validation and collision checks finish before any directory or
  file is created.
- Scratch catalog generation rejects symlinks and junctions before deleting or
  replacing output.
- Contract failures name the missing or extra identity and the two authorities
  that disagree.
- Real secrets, live capability URLs, provider account data, and OAuth client
  secrets never appear in generated artifacts, logs, catalogs, or committed
  fixtures. Contract fixtures may use unmistakably inert values such as
  `contract-token` and reserved `.invalid` URLs solely to prove redaction and
  origin behavior; those values are never logged.

## 10. Acceptance criteria

- [ ] The catalog contains at least 36 unique, fully validated candidates and
  includes every Program F identity under its approved wave.
- [ ] Generated Markdown is byte-stable and exactly reflects the JSON source.
- [ ] Invalid fields, duplicate IDs, insecure URLs, blank presentation states,
  and contradictory direct-client auth fail with field-specific errors.
- [ ] The scaffold refuses every protected or production path before writing
  and emits deterministic, digest-listed scratch output for all three kinds.
- [ ] Removing any current widget from a renderer, size contract, default
  point, or visual-catalog manifest makes the focused contract fail.
- [ ] Removing any current connector descriptor, settings body, complete
  fixture, redaction rule, or origin owner makes the focused contract fail.
- [ ] Every supported current tier has Chromium catalog coverage; Docked
  coverage appears only for Docked-capable widgets.
- [ ] Focused tests, TypeScript, production build, Node contracts, scratch
  Chromium catalog, diff hygiene, bounded review, ledgers, push, and repository
  proofs pass from the exact reviewed commit.
- [ ] No production permission, origin, request, credential, storage schema,
  migration, dependency, user-facing presentation, protected checkout, or
  Chrome Web Store state changes.

## 11. Success measures

Program E succeeds when a deliberate omission in each protected authority is
caught by one focused command, a future contributor can generate a safe
starter without touching production, and the owner can compare at least 36
ideas using one truthful catalog. Adoption and user-value metrics belong to
the individual addition waves because Program E itself is developer-facing.

## 12. Frozen boundaries

All existing storage authority, migrations, backup validation and redaction,
exact V1/V2/V3 and named-layout recovery, connector identities and request
contracts, credentials, permissions, Notes ownership, Calendar/ICS contracts,
CSP, dependencies, accepted NL-P6 evidence, Store state, and the protected
original checkout remain frozen. Program E may test these boundaries; it may
not alter them.
