# W5-P3 Settings Workspace and Connector State Implementation Plan

**Goal:** Turn Settings into a responsive workspace whose connector cards lead with their current state and keep credential entry hidden until setup, edit, or reconnect.

**Architecture:** Preserve SettingsPanel's existing storage owners and mounted-active-tab rule. Widen the existing Drawer at roomy widths, make Tabs a vertical navigation rail there, and retain a reflowed horizontal grid on narrow screens. Derive connector state only from the existing descriptor/config contract; TokenConnectForm owns an explicit disclosure state and never prefills or displays a stored secret.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` Settings section; `ROADMAP.md` W5-P3.

## Constraints

- Preserve schema v11, migrations/backups, frozen registry/profile/planner contracts, permission transactions, secret storage/redaction, and Store state.
- Implement only responsive Settings navigation, state-first connector cards, and credential disclosure for setup/edit/reconnect.
- Develop with focused tests; allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run final full gates once after stabilization.

### Task 1: Responsive Settings workspace

- [x] Widen the Drawer on roomy screens and use a true full-screen surface on narrow screens without adding a second scroll owner.
- [x] Render vertical Settings navigation with vertical keyboard behavior on roomy screens; preserve the bounded horizontal/grid navigation and keyboard behavior on narrow screens.
- [x] Preserve the active-panel-only mounting and existing dialog/focus/Escape contracts.

### Task 2: State-first connector cards and credential disclosure

- [x] Lead every connector card with a derived `Off`, `Setup needed`, `Reconnect needed`, `Connected`, or `Ready` state before descriptive copy.
- [x] Keep token credential fields collapsed until explicit setup/edit, while showing reconnect fields immediately when a stripped-secret config requires them.
- [x] Never prefill or expose a stored credential; preserve gesture-safe permission transactions, connection extras, disconnect, and cleanup recovery.

### Task 3: Focused browser and packet closeout

- [x] Add one built-extension replay covering roomy/narrow Settings navigation, state-first cards, credential disclosure/reconnect, keyboard operation, and clean runtime output; inspect required captures once.
- [x] Run one implementation review and one fix/rereview cycle; close the Important disclosure-focus finding.
- [x] Run the final unit suite, TypeScript, production/preview builds, bridge scan, and full browser harness once; correct the actual stale Notes/HA/Timer evidence families and use the one permitted full rerun.
- [x] Update ledgers, checkpoint/push, prove clean/upstream equality and protected checkout integrity, then begin W5-P4 automatically.

## Definition of Done

Settings is a wider vertical-navigation workspace when roomy and a full-screen reflowed workspace when narrow; connector cards expose their current connection/configuration state before description; credential fields appear only for explicit setup/edit or required reconnect; no frozen, storage, permission, privacy, migration, or Store contract changes.
