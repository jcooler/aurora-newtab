# Aurora Flow — Design

**Status:** Owner approved in brainstorming on 2026-08-21 (a session that
holds across tabs; focus + timer + top task; named "Flow"). Implemented and
verified in the bounded Flow packet on 2026-08-21.
**Prior art:** Momentum's Focus Mode, researched 2026-08-21.

## 1. What Flow is

One control clears Aurora down to the work: the user's own focus sentence,
the timer, and the task they are on. Everything else — widgets, docks, the
layout badge, the gear, the tray — goes away until they end it. The
photograph stays, because Aurora is photo-forward and the picture is not
the distraction.

**Named "Flow", not "Focus".** Aurora already has a Focus widget (the
"What's your main focus today?" line) and the timer's own accessible name
is "Focus timer". A third meaning of the same word would make every label
ambiguous.

**Momentum parity, deliberately partial.** Momentum's Focus Mode bundles a
Pomodoro timer, Soundscapes, and Tab Stash behind one "Start Focusing"
button, and surfaces the top to-do under the timer. Flow copies the
arrangement and the task promotion. It does NOT copy Soundscapes (bundled
audio plus a player) or Tab Stash (tab permissions plus a restore model);
each is a real feature in its own right and is recorded in §7 rather than
smuggled in here.

## 2. The prerequisite: the timer must persist

**Today the running timer is component state.** `TimerState` lives in a
`useReducer` inside `TimerWidget`; only `timerConfig` (the work/break
minute durations) is stored. Open a new tab and the timer is idle again.

A session that "holds across tabs" therefore cannot be layered on top of
the timer as it stands — a new tab would clear the screen around a timer
freshly reset to 25:00, which is worse than not holding at all.

The existing state shape already anticipates this: `endsAt` is an absolute
epoch timestamp, so any tab can derive true remaining time from it without
a shared ticker. Persisting the timer is the completion of that design, and
it independently fixes a weakness users already expect not to have (a
pomodoro that survives a new tab).

## 3. Data model

One new TOP-LEVEL storage key, `timerSession`, holding the timer's live
state and the Flow flag together — they are coupled now, and splitting them
across two keys would let them disagree:

```ts
export interface TimerSession {
  mode: 'work' | 'break'
  running: boolean
  /** Absolute epoch ms. Any tab derives remaining time from this; nothing
   *  is broadcast and no ticker is shared. */
  endsAt: number | null
  /** Remaining time for a PAUSED timer, where `endsAt` means nothing. */
  remainingMs: number
  cycles: number
  /** Whether the cleared Flow screen is showing. */
  flow: boolean
}
```

`AuroraData.timerSession: TimerSession | null` — `null` is idle, which is
also the default. As a brand-new top-level key it is backfilled by
`migrate()`'s default merge exactly the way `layouts` and `apodCache`
arrived, so the migration step keyed to the previous version is the
identity, `CURRENT_VERSION` bumps, `METADATA_ONLY_FLOOR` moves with it, and
`backup.ts` gains a validator accepting `null` or the full shape.

**The reducer stays pure.** `timerReducer` is unchanged in kind: it already
computes from `now`, so the only change is that its state is READ from and
WRITTEN to storage instead of held in a component. Every existing reducer
test stays valid.

**Cross-tab behavior falls out for free.** Two open tabs both read
`timerSession` through the existing `useStoredKey` subscription, and both
derive the same countdown from `endsAt`. No new synchronization code.

## 4. The Flow screen

A full-viewport layer above the canvas, below nothing. Composition, top to
bottom, centered:

1. **The mantra** — the user's own focus text for today, read from the
   existing `focus` key. If it is empty, the familiar prompt renders as an
   INPUT here, so a session can begin by naming the work rather than
   starting blank. Writing it here writes the same `focus` key the widget
   uses; there is one focus sentence, not two.
2. **The timer** — large, centered, with Pause/Resume and Done. The phase
   is named beside it ("In flow" during work, "Break" during the break).
3. **The current task** — the first unchecked item of the first todo list,
   with a real checkbox. Checking it writes through the existing todo
   storage, and the next unchecked item rises into its place. Beneath it, a
   quiet count of what remains ("3 more"). With no list or no unchecked
   items, this whole block is absent rather than an empty husk (the
   no-whitespace law).

Everything else on the canvas is hidden: all widgets, both dock strips, the
layout badge, the settings gear, and the utility tray trigger.

## 5. Entry, exit, and rules

**Entry.** "Start flow" is the primary action inside the timer panel — the
surface the user already opens to start a timer, so the feature has a home
rather than a new icon to discover.

**Exit.** An explicit "Done" / "End flow" control on the screen, plus
Escape through the shared dialog-escape stack so it composes with every
other Escape consumer. Ending Flow leaves the timer's own state alone: a
running timer keeps running in the restored dashboard.

**Flow rolls through the break.** When the work phase completes, Flow does
NOT end; it shows the break countdown and continues, because that is what a
pomodoro is. Only Done or Escape ends it.

**Edit mode is unavailable during Flow.** The Ctrl/Cmd+Shift+E chord is
ignored while `flow` is true, the same way it is already ignored during a
live edit session — a placement cannot be edited on a screen that is not
showing placements.

**Flow never writes layout data.** It touches `timerSession`, and `focus`
or the todo list only when the user types or checks something. The frozen
legacy `layout` key and the `layouts` document are untouched, which the
QA write-log asserts.

## 6. Testing and acceptance

**Pure model.** The persisted session: derive remaining from `endsAt`
across a simulated reload; a paused session restores its `remainingMs`; a
session whose `endsAt` has passed while every tab was closed resolves to
the completed phase rather than a negative countdown; `flow` survives
independently of `running`.

**Component.** The mantra reads the focus key and the empty state offers an
input that writes it; the top unchecked task appears and promotion works on
check; the remaining count is accurate; absent tasks render nothing;
Escape and Done both end Flow; the edit chord is ignored; the dashboard is
fully restored on exit.

**QA gate.** NL-P6 gains a `flow` scenario capturing the cleared screen
across the viewport matrix, including the short-desktop family, so Flow
ships proven at every window size rather than only at 1600x900.

**Acceptance criteria.**
1. Starting Flow in one tab and opening a NEW tab shows the same cleared
   screen with the same countdown, accurate to the second.
2. A timer started before this feature existed (no `timerSession` stored)
   loads as idle, and every previously saved backup still imports.
3. Ending Flow restores every widget, dock, and control exactly as it was.
4. Checking the task in Flow is visible in the Tasks widget afterward, and
   vice versa — one source of truth.
5. Flow continues through the work-to-break transition without ending.
6. No layout key is written at any point in a Flow session.

## 7. Deferred

**Soundscapes.** Momentum plays a background sound during a session.
Aurora would need bundled audio (extension size), a player with volume and
mute honoring the existing `settings.muted`, and a licensing answer for the
audio itself. Its own feature.

**Tab Stash.** Momentum stashes open tabs at the start of a session and
restores them after. Aurora would need the `tabs` permission, a stash
store, and a restore model that cannot lose a user's work. Its own
feature, and a permission the extension does not currently request.

**A Flow history.** "Time focused today" is a natural companion once
sessions are persisted — the data (`cycles`, phase completions) is already
in the model. Not built now; recorded so the shape is not closed off.
