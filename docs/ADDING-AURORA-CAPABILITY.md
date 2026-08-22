# Adding an Aurora Capability

Use this workflow for every new built-in widget, provider-backed widget, or connector. A catalog entry is research, not permission to ship. Each addition receives its own design, privacy decision, tests, browser evidence, review, and checkpoint.

## 1. Select and verify the candidate

Start in `docs/superpowers/catalog/expansion/candidates.json` and read the generated `docs/superpowers/catalog/expansion/CATALOG.md`. Verify the provider documentation, current API and auth model, terms risk, permissions, origins, privacy fields, cache behavior, four tier promises, maintenance risk, and blockers. Update `verifiedOn` and regenerate the catalog when research changes:

```powershell
node scripts/expansion/render-catalog.mjs
node scripts/expansion/render-catalog.mjs --check
```

Do not copy real credentials, live capability URLs, provider account data, or OAuth client secrets into source, fixtures, logs, screenshots, or generated artifacts.

## 2. Write the just-in-time design

Create a bounded design and implementation plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`. Record an Aurora decision for the addition before implementation. The decision must cover:

- the exact user glance question and non-goals;
- whether the value belongs in an existing identity instead;
- data owner, cache owner, refresh owner, and stale behavior;
- credentials, Chrome permissions, host origins, warning copy, backup, restore, and redaction;
- Compact, Standard, Full, and Docked usefulness, including tiers that must not exist;
- empty, loading, stale, error, hover, click, keyboard, touch, and edit-mode behavior;
- migrations, rollback, manual ceilings, and Store impact.

Permission acceptance for one capability does not authorize another capability.

## 3. Generate an isolated starter

Use a direct ignored child of the active repository. The scaffold refuses production paths, the protected checkout, traversal, links, non-empty targets, and collisions before writing.

```powershell
node scripts/expansion/scaffold.mjs `
  --id=readingList `
  --label="Reading List" `
  --kind=builtin `
  --out-dir=.aurora-expansion-readingList `
  --repo-root="D:\DEV\Chrome plugin-aurora-2" `
  --protected-root="D:\DEV\Chrome plugin"
```

Kinds are exact: `browser-native` and `local` candidates use `builtin`, `built-in-provider` uses `provider`, and `connector` uses `connector`. Verify every `manifest.json` digest against the generated payload bytes before copying anything. Never integrate `manifest.json` or the generated `candidate.json` directly.

## 4. Observe RED before production code

The starter tests fail deliberately with `Write the first behavior test`. Replace the generated test with the smallest real user behavior and run it before changing production code. Capture the focused failure. Implement only enough to turn that test green, then repeat for each behavior. Remove the `research-required` marker before integration.

## 5. Integrate every authority manually

Never bulk-copy a starter into the repository. Review each payload and update every applicable authority:

- identity and presentation: `src/newtab/widgetRegistry.ts`, `src/newtab/widgetRenderers.tsx`, `src/newtab/widgetSizeContracts.ts`, settings visibility in `src/settings/sections/Widgets.tsx`, and visual catalog data in `scripts/widget-catalog-manifest.mjs`;
- storage and recovery: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/storage/widgetToggleVersions.ts`, `src/lib/backup.ts`, `src/lib/backupRestore.ts`, and their tests;
- connectors: `src/services/connectors/types.ts`, `src/services/connectors/registry.ts`, `src/settings/sections/Connectors.tsx`, connector cards and forms, `src/services/permissions.ts`, and connector contract fixtures;
- browser access: `manifest.json`, optional runtime permission requests, owned origin patterns, held origins, user warning copy, and CSP;
- documentation: active spec, implementation plan, `docs/superpowers/aurora-2/STATUS.md`, `ROADMAP.md`, and `DECISIONS.md`.

Credentials remain in the existing credential authority and never enter general settings, snapshots, backup, logs, errors, or telemetry. Connector disable preserves configuration and owned-origin knowledge but must not retain an enabled held origin. Revalidate origin ownership inside queued read-modify-write operations. Do not add a manifest permission or origin until the capability's decision explicitly accepts it.

The user owns placement. A new identity never auto-docks, auto-reflows, auto-swaps tiers, or moves another widget. Every tier follows the no-whitespace law. Unsupported tiers are absent, not fake controls.

## 6. Run contracts and focused verification

Run the candidate's focused tests first, then the shared contract:

```powershell
npm run test:expansion-contract
npx tsc --noEmit
git diff --check
```

Also run focused storage, migration, backup, connector, permission, Settings, renderer, and interaction tests for every authority touched. Do not substitute one giant green matrix for an observed focused RED and targeted evidence.

## 7. Rebuild and inspect the Chromium tier catalog

Build `dist` from the exact reviewed commit before owner-facing checks. Run the catalog into a fresh `.qa-expansion-platform-*` root. Inspect every supported free tier and Docked form for useful information, truthful stale/error state, content-tight bounds, click parity, legibility, overflow, and console or request failures. Use existing-layout-shaped storage and include short-height desktop evidence when presentation or geometry changes.

Never treat an eight-pixel box or a screenshot file alone as useful output. Record what each capture proves and name every manual ceiling.

## 8. Review, checkpoint, and prove repository state

Use one bounded implementation review and at most one fix and rereview cycle. Only Critical and Important findings block the packet. After the stabilized gate:

1. update the plan checkboxes, STATUS, ROADMAP, DECISIONS, and QA report;
2. create a bounded commit and push the active branch;
3. prove the active worktree is clean and equal to its upstream;
4. prove `D:\DEV\Chrome plugin` remains clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`;
5. record test counts, Chromium evidence, and manual ceilings.

Chrome Web Store upload, listing edits, saves, submission, publication, distribution, and rollout remain prohibited until the owner gives a new action-specific W6-P5 approval. A capability decision, code review, or local acceptance does not satisfy that gate.
