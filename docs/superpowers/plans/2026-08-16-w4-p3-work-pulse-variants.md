# W4-P3 Work Pulse Variants Implementation Plan

**Goal:** Make Work Pulse attention-first across Compact, Standard, and Expanded variants while keeping healthy connector states quiet and every configured connector represented.

**Architecture:** Preserve each connector's existing snapshot, identity, permission, storage, and action authority. Add a small shared render-only Work Pulse summary primitive, then let GitHub, GitLab, Jira, Vercel, and Status derive honest primary values from data they already render. Variant-aware markup and Pulse-zone CSS progressively reveal summary, prioritized rows, and useful detail inside the frozen registry placements. Home Assistant content variants remain W4-P5-owned; W4-P4 owns Dock representation and operation.

**Tech Stack:** React, TypeScript, Vitest, existing connector snapshots/services, existing Adaptive Stage `data-stage-variant` and zone hooks, CSS, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 4, 5, 6, 7, 10-13, and 15; `docs/superpowers/aurora-2/ROADMAP.md` W4-P3; `docs/superpowers/aurora-2/DECISIONS.md` through A2-D028.

## Global constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve verified W4-P2 checkpoint `95a9824ff9283673f5b1eb6014731ec39dc091dc` and the protected original checkout.
- Preserve schema v11, the frozen 26-entry registry, profile thresholds, footprints, capacity/allocation, storage/migration/backup contracts, connector snapshot/permission authorities, secrets/privacy copy, and Store state.
- Implement only W4-P3. W4-P4 owns Signal Dock entries and survival; W4-P5 owns launcher plus remaining RSS/Home Assistant/Calendar/Weather content variants.
- Work Pulse presentation may read only already-derived component data. It starts no request, changes no fetch configuration, persists nothing, logs nothing, and never surfaces tokens, URLs, or payloads as summary text.
- Use focused tests while developing. Allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run the final full unit suite, production/preview builds, production bridge scan, and browser harness once after stabilization; if the browser harness fails, fix only the actual failing family and rerun once.

---

### Task 1: Standardize honest Work Pulse summary anatomy

**Files:**
- Create: `src/newtab/widgets/shared/WorkPulseSummary.tsx`
- Create: `src/newtab/widgets/shared/WorkPulseSummary.test.tsx`

- [x] Add RED tests for a named primary value, quiet/attention/critical/unknown tones, optional metadata, no live-region churn, and no false button/link affordance.
- [x] Implement a render-only summary primitive with explicit data hooks and fixed accessible text; keep ordinary glance text at least 14 CSS px and metadata at 12 CSS px.
- [x] Run the focused primitive tests and commit `feat(pulse): add shared attention summary`.

### Task 2: Make forge and deployment connectors attention-first

**Files:**
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.test.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.test.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.test.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.test.tsx`

- [x] Add RED component tests proving Compact exposes one honest attention count/state and identity, Standard exposes prioritized actionable rows, and Expanded retains useful configured detail without changing row caps or external-link security.
- [x] Derive summary values only from each component's current resolved view/data: GitHub unread or open items, GitLab to-dos or review work, Jira active work, and Vercel failed/building/ready state. Use quiet `All clear`/ready wording only when current data supports it.
- [x] Mark summary, prioritized-row, and detail anatomy explicitly so variant CSS can reveal progressively without duplicating data or programmatic content.
- [x] Preserve every existing no-data/no-husk, view-toggle, graph-yield, URL security, snapshot, and settings contract; run focused connector tests and commit `feat(pulse): prioritize connector attention`.

### Task 3: Make service health quiet when healthy and prominent when actionable

**Files:**
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.test.tsx`
- Modify: `src/newtab/index.css`
- Create: `src/newtab/workPulsePresentation.test.ts`

- [x] Add RED tests for Status summary priority: confirmed trouble, then unknown/unreachable, then quiet all-operational; retain configured dot identity and avoid color-only meaning.
- [x] Present Compact as identity plus one primary status, Standard as summary plus prioritized rows, and Expanded as summary/rows plus useful detail. Keep healthy rows visually quiet and promote only confirmed trouble, stale/unknown, pending, or actionable work.
- [x] Turn Work Pulse into one coherent regional surface using existing zone/BoardItem ownership, hairlines, and localized contrast; do not create card-per-row geometry, root transforms, percentage positioning, height hides, new footprints, or new Dock behavior.
- [x] Add source/CSS guards for exact variant anatomy, minimum text/target rules, no schema/registry/network/storage changes, and reduced-motion continuity; run focused tests and TypeScript, then commit `style(pulse): establish responsive hierarchy`.

### Task 4: Bounded review, evidence, and checkpoint

**Files:**
- Create: `scripts/preview-w4-p3.mjs`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

- [x] Run one implementation review against only the explicit W4-P3 criteria. Fix only Critical/Important findings and perform at most one focused rereview; ledger Minor/cosmetic issues without reopening.
- [x] Run one focused built-extension replay at Compact 800x600, Standard 1600x900, and Display 2560x1440 with seeded healthy and attention states. Prove exact progressive anatomy, quiet healthy state, promoted trouble/action state, single connector ownership, safe links, no clipping, no connector request attributable to presentation, restored teardown, and zero runtime errors.
- [x] Run the final full unit suite once, TypeScript, production and preview builds once, the production bridge scan, and the full browser harness once. If the harness fails, fix the actual family and rerun once only.
- [x] Inspect the three required captures once, mark W4-P3 Verified, record exact gates and A2-D029, commit `docs: checkpoint W4-P3`, push, and prove target/upstream equality plus clean target/protected-original worktrees.
- [ ] Begin W4-P4 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of done

W4-P3 is complete when GitHub, GitLab, Jira, Vercel, and Status use honest attention-first Compact/Standard/Expanded anatomy from already-held data; healthy state stays quiet while confirmed trouble, unknown freshness, pending work, and actionable counts gain prominence; Work Pulse reads as one coherent region; all existing connector/security/snapshot/settings contracts and frozen Stage/schema/registry contracts remain unchanged; the bounded review has no Critical/Important issue open; final gates and inspected captures are recorded; and the checkpoint is pushed cleanly.
