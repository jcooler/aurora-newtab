# Local Widgets: Habit Streaks + Month Calendar — v2 sub-project 4

**Approved by Jon 2026-07-30.** The "breather" sub-project — zero network, zero permissions, pure local-first widgets in the established pattern. Independent of the connector waves; schedulable between or after them whenever a lighter cycle is wanted. Reads sub-project 1's spec only for the Settings-tab placement of config.

## Habit streaks

- **Data** (schema bump in whichever sub-project ships first thereafter): `habits: { id, name, createdAt, log: string[] /* local YYYY-MM-DD keys, the days marked done */ }[]`, max 6 habits.
- **Widget**: a compact row of habit chips — name + current-streak count (`🔥 12`) + today's check control (one tap marks today; tap again unmarks). Streak = consecutive local-date keys ending today-or-yesterday (yesterday keeps a streak alive until today is marked — the convention that doesn't punish morning users; TDD the edge cases: DST, month roll, gap = reset, unmark-today recompute).
- **Config** (Widgets tab): add/rename/remove habits; toggle `widgets.habits` (label added same-task per the labels-with-their-widget rule).
- **Placement**: new `BlockId` `habits`, default lower-center above the quote (plan pins with screenshot gate; must clear the quote and links at defaults).
- The streak math is a pure module (`src/lib/habits.ts`), TDD-first; the widget is gate/inner split like every sibling.

## Month calendar

- **Widget**: a small static month grid — current month, today ringed with accent, countdown dates (from the existing `countdowns` key) dotted; Jon's approved scope is at-a-glance, so NO event data in this sub-project (the connector calendar covers events; if both are enabled they are complementary, not duplicative — this is the "what date is the 3rd Friday" glance).
- Month navigation: prev/next chevrons, snap-back-to-today affordance; keyboard accessible (roving grid per ARIA grid pattern — or, if the plan judges the full grid pattern heavy for a display-only calendar, buttons-only nav with the grid as a static table + caption; decide in the plan, a11y-reviewed either way).
- **Data**: none new — renders from `Date` + `countdowns`. Pure month-math module (`src/lib/monthGrid.ts`: weeks matrix for a given month with local-first weekday origin Sunday, TDD leap/boundary cases).
- **Config**: `widgets.monthCal` toggle only.
- **Placement**: new `BlockId` `monthCal`, default upper-left under the timer pill (screenshot-gated; must clear timer pill and its panel anchor).

## Out of scope

Habit reminders/notifications; habit history charts; calendar event display (connector calendar's job); week-start preference (Sunday fixed until someone asks).

## Compliance

Nothing — no network, no permissions. The easiest disclosure section ever written: none needed beyond the storage line both keys inherit.
