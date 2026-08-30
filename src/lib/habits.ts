// src/lib/habits.ts — PURE streak math. No Date.now()/new Date() without an
// argument anywhere in this module: every "today" is the caller's injected
// `todayKey`, every "now" is a `Date` the caller constructs.

import type { Habit } from './storage/schema'

export const MAX_HABITS = 6

export type HabitIntent =
  | { kind: 'add'; id: string; name: string; createdAt: number }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'remove'; id: string }

/** Local (not UTC) YYYY-MM-DD for the given Date. toISOString() is UTC and
 *  would shift a late-night/early-morning local time onto the wrong calendar
 *  day; getFullYear/getMonth/getDate read the wall-clock date the caller
 *  actually means. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The local calendar day before `key`, via Date-parts arithmetic — never
 *  minus-86400000ms. A DST day is 23 or 25 hours long, so subtracting a fixed
 *  millisecond offset can land on the wrong date; constructing `new Date(y, m,
 *  day - 1)` lets the Date object normalize month/year rollover (and leap
 *  Februaries) while staying on local wall-clock dates throughout. */
export function prevDayKey(key: string): string {
  const [y, m, day] = key.split('-').map(Number)
  return localDateKey(new Date(y, m - 1, day - 1))
}

/** Consecutive local-date keys ending at `todayKey` or the day before it.
 *  Yesterday keeps a streak alive until today gets marked, so morning users
 *  (who haven't checked in yet today) aren't shown a reset streak. Anything
 *  further back than yesterday breaks the chain: 0. Duplicate/unsorted
 *  entries in `log` are tolerated (membership is checked via a Set, not
 *  position). */
export function streak(log: string[], todayKey: string): number {
  const marked = new Set(log)
  const yesterdayKey = prevDayKey(todayKey)
  let anchor: string
  if (marked.has(todayKey)) {
    anchor = todayKey
  } else if (marked.has(yesterdayKey)) {
    anchor = yesterdayKey
  } else {
    return 0
  }

  let count = 0
  let cursor = anchor
  while (marked.has(cursor)) {
    count++
    cursor = prevDayKey(cursor)
  }
  return count
}

/** Adds `key` if absent, removes it if present. Returns a NEW sorted array —
 *  `log` is never mutated. Sorting via a Set also collapses any pre-existing
 *  duplicate entries, which is safe: date keys are the only identity a log
 *  entry has. */
export function toggleDay(log: string[], key: string): string[] {
  const marked = new Set(log)
  if (marked.has(key)) {
    marked.delete(key)
  } else {
    marked.add(key)
  }
  return Array.from(marked).sort()
}

/** Applies one settings mutation to the authoritative list read at write
 * time. Intent payloads never carry a stale Habit object, so a rename cannot
 * replace a completion logged by another open tab while the editor was open. */
export function applyHabitIntent(habits: Habit[], intent: HabitIntent): Habit[] {
  if (intent.kind === 'remove') return habits.filter((habit) => habit.id !== intent.id)

  const name = intent.name.trim()
  if (!name) return habits
  if (intent.kind === 'rename') {
    return habits.map((habit) => habit.id === intent.id ? { ...habit, name } : habit)
  }

  if (habits.length >= MAX_HABITS || habits.some((habit) => habit.id === intent.id)) return habits
  return [...habits, { id: intent.id, name, createdAt: intent.createdAt, log: [] }]
}
