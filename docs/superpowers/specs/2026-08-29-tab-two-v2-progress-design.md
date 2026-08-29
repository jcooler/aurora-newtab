# Tab Two V2 Progress Design

**Date:** 2026-08-29<br>
**Status:** Owner-approved direction, written specification awaiting review<br>
**Parent design:** `docs/superpowers/specs/2026-08-29-tab-two-v2-product-and-visual-design.md`<br>
**Visual authority:** `mockups/tab-two-v2/index.html`, Progress view and resting-canvas rail

## Summary

Progress gives people a quiet way to keep daily goals visible without turning those goals into alerts. The first production packet adds local manual goals, derives existing Habits into the same overview without copying them, and introduces an optional intrinsic Progress canvas rail.

The customer-facing promise is: **Keep what matters moving.**

This packet remains local-first. It does not add an account, sync, payments, premium gating, provider integrations, history charts, analytics, or Store changes.

## Goals

- Add a dedicated Progress Settings tab using the approved V2 hierarchy.
- Let a person create, edit, increment, complete, reset, reorder, and remove manual daily goals.
- Present existing Habits in Progress using the `habits` key as their only authority.
- Add an optional intrinsic Progress canvas identity with a quiet three-item rail.
- Keep Progress separate from Attention and Briefing signals.
- Preserve photo dominance, explicit layouts, reduced motion, keyboard access, backup integrity, and cross-tab storage authority.

## Non-goals

- Strava, Fitbit, Apple Health, Google Fit, or another remote provider.
- Account creation, automatic sync, billing, entitlement checks, or paywalls.
- Historical charts, trends, streak products, coaching, reminders, notifications, or attention counts.
- Arbitrary URL metrics or formula builders.
- Automatic placement, viewport-driven layout changes, or silent replacement of the Habits widget.

## Data authority

### Manual goals

Add one top-level `progressGoals` key to `AuroraData`:

```ts
export interface ProgressGoal {
  id: string
  name: string
  unit: string
  target: number
  createdAt: number
  today: {
    date: string
    value: number
  }
}
```

Rules:

- `date` is a local `YYYY-MM-DD` key produced by the existing civil-time helper.
- A goal whose stored date is not today displays zero without an automatic write.
- The first action on a new local day writes today's date and the new value atomically.
- `value` and `target` are finite non-negative integers. `target` is at least 1.
- Values are clamped from 0 through the target. Completing a goal writes the target. Reset writes zero for today.
- A manual goal name is trimmed and limited to 40 characters. A unit is trimmed and limited to 16 characters.
- The supported UI limit is six manual goals. Imported over-cap data remains readable, matching the defensive Habits pattern.
- Every mutation uses `storage.update('progressGoals', updater)` so the latest cross-tab value is revalidated inside the serialized updater.

`progressGoals` is normal user-authored data. It is included in backup export and restore, validated before confirmation, and contains no credential or capability URL.

### Existing Habits

Habits remain owned only by `AuroraData.habits`.

- Progress derives the current-day complete state and streak information from each `Habit.log`.
- Completing or reopening a Habit from Progress updates `habits` through the existing date-key toggle behavior.
- Progress never copies a Habit into `progressGoals` and never changes the Habits schema.
- Removing or renaming a Habit continues through the existing Widgets editor. Progress may link to that editor but does not introduce a second configuration authority.

### Schema and migration

- Bump `CURRENT_VERSION` from 19 to 20.
- Add migration `19` to backfill `progressGoals: []` and the nested `settings.widgets.progress: false` toggle while preserving every stored setting and widget choice.
- Add `progress` to the complete widget-toggle validators and defaults.
- Update backup validation, data-flow inventory, and storage key tests for the new non-secret key.

## Settings experience

Insert **Progress** after General in the Settings rail:

1. General
2. Progress
3. Widgets
4. Connectors
5. Data

The tab uses the approved copy:

- Eyebrow: `Progress`
- Heading: `Keep what matters moving.`
- Support: `Use light reminders for personal goals. Progress never becomes an attention alert.`

### Overview

- Manual goals render first in explicit stored order.
- Habits follow in their existing order and carry a `Habit` source label.
- Each row shows a restrained progress ring, source label, name, current value, target, and one primary action.
- Incomplete manual goals use `+1`; complete goals use `Reset` in Settings and a completed check state.
- Habit actions use `Done` or `Reopen` and update the existing Habit log.
- `Edit` opens one shared manual-goal dialog. Habits offer `Manage habits`, which activates Widgets and focuses the existing Habits editor.

### Add and edit dialog

The dialog contains Name, Daily target, and Unit. It provides explicit Save and Cancel actions, closes on Escape, traps focus, and returns focus to the exact invoker.

Validation is inline and prevents persistence:

- Empty name: `Enter a goal name.`
- Empty unit: `Enter a unit such as glasses, pages, or minutes.`
- Target outside 1 through 999999: `Choose a daily target from 1 to 999999.`
- Seventh goal: the Add action is absent and the overview says `Maximum of 6 manual goals.`

Deleting is a two-step action inside the edit dialog. The first click arms `Delete goal`; the second confirms. Closing the dialog disarms deletion.

### Empty state

When no manual goals or Habits exist, show:

- `Choose one thing to keep moving.`
- `Add a simple daily value. It stays in this Chrome profile.`
- Primary action: `Add progress`

No sample goal is persisted automatically.

## Canvas experience

Add `progress` as an intrinsic, optional canvas identity. It is off by default and never auto-added to an existing named layout.

- A person enables or places it explicitly through Widgets or Arrange.
- Named-layout position, visibility, tier, stack, and dock behavior follow the existing layout authority. No viewport selects or rewrites a layout.
- The resting form is a vertical rail of at most three entries using rings, short labels, and values. It does not use a generic full card.
- Manual goals are shown first, followed by Habits, using their existing order.
- If more than three entries exist, the final line says `N more` and opens Progress Settings.
- Selecting an incomplete manual goal increments it by one. Selecting a Habit toggles today through the existing Habit authority.
- A completed item uses a short check transition. No confetti, sound, toast, Attention item, or notification is generated in this packet.
- Hover and keyboard focus reveal a quiet `Open Progress` control. Every row has a truthful accessible action name.
- With no entries, the canvas identity renders nothing and starts no timers or listeners.

The initial identity supports intrinsic and compact stack-face presentations only. It does not introduce Standard or Full analytics cards.

## Date boundaries and concurrency

- The existing local-day helpers define today. No UTC date keys are introduced.
- An open tab refreshes the displayed day at the next local midnight and on visibility or focus restoration using existing civil-time scheduling patterns.
- The refresh is render-only until the person acts. It does not rewrite stale goal rows at midnight.
- Every goal action rechecks the current stored row, current local day, and goal identity inside the queued updater.
- Removing a goal while another tab has an old action open cannot recreate it.
- A delayed increment cannot overwrite a newer target, reorder, deletion, or day value.

## Privacy and product boundaries

- Manual goal names, units, targets, and daily values stay in local Chrome storage.
- Progress has no network request, host permission, credential, OAuth, analytics, or background polling authority.
- Backup export includes manual goals because they are ordinary user content. Existing backup redaction remains unchanged for secrets.
- Progress does not influence Attention counts, helper text, Briefing, connector state, or notifications.
- Existing Habits and connector capabilities remain included. No current feature becomes paid.

## Accessibility and motion

- Progress rings expose text equivalents such as `5 of 8 glasses complete`.
- Color is supplementary. Source, current value, completion, and action remain readable in text.
- All controls meet the 36px product target floor and retain visible focus.
- Dialog focus trap, Escape, and exact focus restoration follow the shared V2 dialog contract.
- Completion uses opacity and ring-fill motion only. `prefers-reduced-motion` shows the final state immediately.
- The canvas rail must remain readable on bright, dark, and detailed photographs without painting a large opaque card.

## Failure handling

- A failed storage write keeps the current visible value, announces `Progress was not saved. Try again.`, and exposes Retry for the same intent.
- Retry revalidates current storage and date ownership rather than replaying a stale whole-array write.
- Corrupt or imported invalid rows are omitted from rendering without crashing. Backup import rejects an invalid current-schema `progressGoals` shape before confirmation.
- No failure creates an Attention item.

## Verification

### Automated

- Schema/default/migration tests for v19 to v20 and full historical migration chains.
- Backup validation, export, restore, rollback, and malformed-row rejection tests.
- Pure goal normalization and local-day transition tests.
- Serialized updater tests for increments, completion, reset, deletion, reorder, target edits, cross-tab freshness, and delayed actions.
- Settings tests for empty, populated, validation, cap, add, edit, reorder, delete, Habit bridge, storage failures, Escape, and focus return.
- Canvas tests for no-data suppression, three-item limit, overflow link, manual increment, Habit toggle, accessible names, intrinsic presentation, and no Attention mutation.
- Full unit suite, TypeScript, diff hygiene, production build, and exact provenance.

### Real Chromium

Use deterministic local fixtures with no external requests. Prove:

- 1600x900 desktop, 1408x600 short-height, 3440x1440 ultrawide, and touch-enabled 375x812.
- Settings tab navigation, empty state, add, edit, validation, increment, completion, reset, reorder, delete, and Habit bridge.
- Exact storage values after each action and after reload.
- Cross-tab update visibility without stale overwrite.
- Canvas rail containment, photo dominance, keyboard actions, stack face, overflow route, and no unintended overlap.
- Local-midnight rollover using controlled time.
- Reduced-motion completion state.
- No horizontal overflow, nested Settings scroll owner, console error, page error, unexpected request, credential rendering, or closed-surface hit target.

## Acceptance criteria

- Manual Progress goals work without an account or connector.
- Existing Habits appear and update without duplicated storage.
- Progress never appears in Attention or generates a notification.
- Existing named layouts are not rewritten or auto-populated.
- The optional canvas rail remains intrinsic, quiet, and photo-first.
- A new local day displays zero before any write and safely begins a new value on the first action.
- Backup export and restore preserve valid goals and reject malformed current-schema data.
- Every visible action is keyboard-operable, focus-safe, and truthfully named.
- All required Chromium viewports pass with the highest-quality bundled background source.

## Explicitly deferred

- Strava and other fitness connectors.
- Paid history and trend views.
- Account and encrypted sync.
- Premium explanation or pricing behavior.
- Reminders, notifications, coaching, achievements, and social sharing.
- Provider-managed actions and arbitrary metric URLs.
- Chrome Web Store changes.
