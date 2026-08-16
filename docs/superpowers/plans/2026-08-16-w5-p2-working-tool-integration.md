# W5-P2 Working Tool Integration Implementation Plan

**Goal:** Put Tasks, Notes, Timer, Home Assistant actions, and background refresh into the existing responsive Utility Tray with exactly one expanded tool and a persistent running-timer summary.

**Architecture:** Keep each tool's current mounted state, storage, async, and network owner. App controls the selected Tray tool and invocation focus target; tool components render only their existing detail surface into the Tray host. Notes retains its authority-backed save guard, Timer remains mounted when details close, Home Assistant reuses its current snapshot/action owner, and Background reuses its current refresh calculation.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` Utility Tray sections; `ROADMAP.md` W5-P2; A2-D005 and A2-D032.

## Constraints

- Preserve schema v11, frozen registry/profile/planner contracts, migrations/backups, storage authorities, connector identity/generation, privacy/secrets, permissions, and Store state.
- Integrate only the five written tool families. Do not redesign Settings, add persistence, add requests, or change layout allocation.
- Develop with focused tests; allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run final full gates once after stabilization.

### Task 1: Controlled Tray tool selection

**Files:** Modify `src/newtab/components/UtilityTray.tsx`, its tests, `src/newtab/App.tsx`, and `src/newtab/widgetRenderers.tsx`.

- [x] Add a controlled, enabled-tool navigation and one content host; render exactly one selected tool.
- [x] Route the persistent invoker and board tool invokers through one App selection path with exact focus restoration.
- [x] Preserve W5-P1 profile-derived modal/modeless behavior.

### Task 2: Existing-owner tool details

**Files:** Modify Tasks, Notes, Timer, Home Assistant, and Background components plus focused tests.

- [x] Embed Tasks and Notes detail surfaces without nested dialog/trap/Escape ownership.
- [x] Keep Notes save/close, Settings, Arrange, disable, and tool-switch guards authoritative.
- [x] Render Timer detail from its existing mounted reducer; prove the running summary remains after details close.
- [x] Render Home Assistant actions from the existing current snapshot/config owner without another fetch.
- [x] Render background refresh from Background's existing availability and `nextPhoto` calculation.

### Task 3: Focused browser and packet closeout

- [x] Add one W5-P2 built-extension replay covering single-tool expansion, representative operations, timer survival, responsive shell behavior, focus restoration, and clean runtime output; inspect required captures once.
- [x] Run one implementation review and one fix/rereview cycle; close the Important Notes guard finding.
- [x] Run the full unit suite, TypeScript, production/preview builds, bridge scan, and full browser harness once; use the single failing-family rerun, then source-correct the remaining implicit-role evidence selector without a third run.
- [x] Update reports/ledgers, checkpoint/push, prove clean/upstream equality and protected checkout integrity, then begin W5-P3 automatically.

## Definition of Done

The existing responsive Tray exposes one selected working tool at a time; Tasks, Notes, Timer, Home Assistant actions, and background refresh use their existing owners; a running timer remains represented after its details close; Notes cannot be silently discarded; and no frozen or Store contract changes.
