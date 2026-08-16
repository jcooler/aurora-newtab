# W4-P2 Aurora Briefing Implementation Plan

**Goal:** Add Aurora's deterministic, privacy-preserving Briefing to the Now hierarchy as one terse sentence synthesized only from useful data Aurora already holds.

**Architecture:** Keep schema v11, the frozen 26-entry registry, Stage geometry/capacity, and all storage/network authorities unchanged. A pure briefing module converts already-stored Calendar, Tasks, and matching fresh Weather inputs into ordered text segments and applies fixed responsive segment/character budgets. A render-only component reads those local values without triggering refreshes and sits beneath Greeting inside the existing Greeting BoardItem, so Briefing gains no registry identity or planner capacity.

**Tech Stack:** React, TypeScript, Vitest, existing local storage hooks, existing Calendar/Weather validators and identity helpers, CSS profile selectors, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 3-7, 11-13, and 15; `docs/superpowers/aurora-2/ROADMAP.md` W4-P2; `docs/superpowers/aurora-2/DECISIONS.md` through A2-D027.

## Global constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve verified W4-P1 checkpoint `7023beee7cb4cf9a596d559d96020e5f033e6a1c` and the protected original checkout.
- Preserve schema v11, Layout V2 and optional exact legacy provenance, the frozen registry/profile/capacity/allocation contracts, storage authority, migrations/backups, connector permissions, privacy copy, and Store state.
- Implement only W4-P2. W4-P3 owns Work Pulse connector attention variants, W4-P4 owns Signal Dock renderers, and W4-P5 owns launcher and remaining connector content variants.
- Briefing is local render-time synthesis only: no LLM, cloud service, new request, refresh owner, persistence field, credential/capability value, analytics, or log output.
- Use focused tests while developing. Allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run the final full unit suite, production/preview builds, production bridge scan, and browser harness once after stabilization; if the browser harness fails, fix only the actual failing family and rerun once.

---

### Task 1: Freeze deterministic synthesis and privacy contracts

**Files:**
- Create: `src/lib/briefing.ts`
- Create: `src/lib/briefing.test.ts`

- [x] Add RED tests for fixed signal priority: next active/upcoming Calendar item, incomplete Tasks count, then likely Rain.
- [x] Add RED tests for deterministic Compact/Standard/Display budgets: 1/2/3 segments with total character ceilings and an ellipsis when the final admitted segment must be shortened.
- [x] Add RED tests for stable tie-breaking, current/expired events, all-day wording, zero-task omission, rain threshold/hour formatting, empty fallback, malformed input rejection, and omission of URL/token/capability fields.
- [x] Implement pure `collectBriefingSignals` and `formatBriefing` functions with explicit inputs and no time, storage, network, locale, or random reads inside the module.
- [x] Run the focused pure tests, then commit `feat(briefing): add deterministic local synthesis`.

### Task 2: Read only valid locally held inputs and render in Now

**Files:**
- Create: `src/newtab/components/AuroraBriefing.tsx`
- Create: `src/newtab/components/AuroraBriefing.test.tsx`
- Modify: `src/newtab/components/Greeting.tsx`
- Modify: `src/newtab/components/Greeting.test.tsx`

- [x] Add RED component tests proving the visible sentence comes only from hydrated local storage and updates on storage/minute changes without initiating any fetch.
- [x] Accept Calendar data only when ICS is enabled, structurally valid, fresh under its existing TTL, and scoped to the current config/timezone; compute scope locally without refreshing. Accept Weather only when its request identity matches the current location and its existing 30-minute freshness boundary. Count incomplete Tasks locally.
- [x] Render Compact, Standard, and Display sentence variants from the same signal snapshot; keep exactly one visible/programmatic sentence per active profile and use an ordinary polite text paragraph, not a live region that re-announces every minute.
- [x] Place Briefing after Greeting inside the existing Greeting BoardItem so semantic Now order becomes Clock, Greeting/Briefing, Search, Focus without changing registry identity, footprints, Stage capacity, or allocation.
- [x] Run focused component/Greeting tests, then commit `feat(briefing): render local Now summary`.

### Task 3: Fit the terse sentence across profiles

**Files:**
- Modify: `src/newtab/index.css`
- Modify: `src/newtab/dayNowPresentation.test.ts`
- Modify: `src/newtab/App.test.tsx`

- [x] Style Briefing as one secondary photo-legible line beneath Greeting; Compact shows the one-segment budget, Standard the two-segment budget, and Display/Ultrawide the three-segment budget.
- [x] Preserve the established Greeting width caps, Clock prominence, Search/Focus targets, reduced-motion behavior, no root scaling, no viewport-percentage positioning, and no whole-widget height hides.
- [x] Add source/DOM guards proving Briefing has no registry/schema/network/storage identity and cannot duplicate or displace BoardItems.
- [x] Run the focused Briefing/Greeting/App/CSS tests and TypeScript, then commit `style(briefing): fit the Now hierarchy`.

### Task 4: Bounded review, evidence, and checkpoint

**Files:**
- Create: `scripts/preview-w4-p2.mjs`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

- [x] Run one implementation review against only the explicit W4-P2 criteria. Fix only Critical/Important findings and perform at most one focused rereview; ledger Minor/cosmetic issues without reopening.
- [x] Run one focused built-extension replay at Compact 800x600, Standard 1600x900, and Display 2560x1440. Prove exact 1/2/3 segment priority/truncation, local cache identity/freshness gates, one visible/programmatic sentence, unchanged BoardItem ownership/order, no clipping, no network request attributable to Briefing, restored teardown, and zero runtime errors.
- [x] Run the final full unit suite once, TypeScript, production and preview builds once, the production bridge scan, and the full browser harness once. If the harness fails, fix the actual family and rerun once only.
- [x] Inspect the three required captures once, mark W4-P2 Verified, record exact gates and A2-D028, commit `docs: checkpoint W4-P2`, push, and prove target/upstream equality plus clean target/protected-original worktrees.
- [ ] Begin W4-P3 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of done

W4-P2 is complete when Aurora renders one terse Briefing sentence in Now from locally held, current Calendar/Tasks/Weather data; priority and responsive truncation are deterministic; malformed, stale, mismatched, secret, and capability-bearing values cannot surface; no LLM, cloud, fetch, persistence, schema, registry, allocation, permission, or Store contract is added; Compact/Standard/Display remain composed and accessible; the bounded review has no Critical/Important issue open; final gates and inspected captures are recorded; and the checkpoint is pushed cleanly.
