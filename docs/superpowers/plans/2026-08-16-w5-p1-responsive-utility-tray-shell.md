# W5-P1 Responsive Utility Tray Shell Implementation Plan

**Goal:** Add one responsive Utility Tray shell that is anchored/modeless outside Compact and a true modal bottom sheet in Compact.

**Architecture:** Keep the Tray render-only and outside the frozen widget registry/planner. App derives modality from the existing Adaptive Stage profile, owns the single open flag, and makes the dashboard inert only while the Compact modal is open. The shell owns Escape, outside/backdrop dismissal, initial focus, and exact invoker restoration; focus trapping is active only in modal mode. W5-P2 retains all tool-content integration.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` section 9; `ROADMAP.md` W5-P1; A2-D005 and A2-D031.

## Constraints

- Preserve schema v11, registry, profiles, capacities, allocations, migrations/backups, storage, privacy, permissions, existing tool behavior, and Store state.
- Do not move Tasks, Notes, Timer, Home Assistant actions, or refresh content into the Tray; W5-P2 owns that work.
- Develop with focused tests; one review and one fix/rereview; only Critical/Important defects block. Run final full gates once after stabilization.

### Task 1: Build the responsive shell

**Files:** Create `src/newtab/components/UtilityTray.tsx` and `.test.tsx`; modify `src/newtab/App.tsx` and `src/newtab/index.css`.

- [x] Write failing component/App tests for desktop modeless behavior, Compact modal semantics/inert/trap, Escape/outside close, and invoker focus restoration.
- [x] Implement the smallest shell, persistent invoker, profile-derived modality, and modal-only dashboard inertness.
- [x] Run focused tests and TypeScript; commit the implementation (`e762699`).

### Task 2: Focused browser proof, review, final gates, and checkpoint

- [x] Add one focused Compact/Standard replay proving real focus order, outside/Escape close, modal-only backdrop/inert/trap, containment, no runtime errors, and cleanup; inspect required captures once.
- [x] Run one implementation review. The verdict was Ready with no Critical/Important finding; no rereview was needed.
- [x] Run the full unit suite, TypeScript, production/preview builds, bridge scan, and full browser harness once; use the single permitted rerun for the persistent-target family, then correct the unrelated stale Compact Calendar assertion without a third run.
- [x] Record A2-D032 and packet evidence, checkpoint/push, prove both worktrees clean/equal, and begin W5-P2 automatically.

## Definition of Done

Desktop Utility Tray is anchored and modeless with no trap or background inertness; Compact is a contained modal bottom sheet with backdrop, inert dashboard, focus trap, Escape/outside dismissal, and invoker restoration; no W5-P2 integration or frozen contract changes occur.
