import type { ProgressGoal } from './storage/schema'

export const MAX_PROGRESS_GOALS = 6
export const MAX_PROGRESS_NAME = 40
export const MAX_PROGRESS_UNIT = 16
export const MAX_PROGRESS_TARGET = 999_999

export type ProgressIntent =
  | { kind: 'increment'; id: string }
  | { kind: 'complete'; id: string }
  | { kind: 'reset'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; direction: -1 | 1 }
  | { kind: 'edit'; id: string; name: string; unit: string; target: number }
  | { kind: 'add'; id: string; name: string; unit: string; target: number; createdAt: number }

export type ProgressDraft = Pick<ProgressGoal, 'name' | 'unit' | 'target'>
export type ProgressDraftResult =
  | { ok: true; value: ProgressDraft }
  | { ok: false; message: string }

const NAME_REQUIRED = 'Enter a goal name.'
const UNIT_REQUIRED = 'Enter a unit such as glasses, pages, or minutes.'
const TARGET_INVALID = 'Choose a daily target from 1 to 999999.'
const NAME_TOO_LONG = `Goal names can be at most ${MAX_PROGRESS_NAME} characters.`
const UNIT_TOO_LONG = `Units can be at most ${MAX_PROGRESS_UNIT} characters.`

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day || month > 12) return false
  const days = month === 2
    ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31
  return day <= days
}

function isProgressGoal(value: unknown): value is ProgressGoal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const goal = value as Record<string, unknown>
  if (Object.keys(goal).length !== 6 || !Object.hasOwn(goal, 'today')) return false
  const target = goal.target
  const createdAt = goal.createdAt
  if (
    typeof goal.id !== 'string' || goal.id.length === 0 ||
    typeof goal.name !== 'string' || goal.name.length === 0 || goal.name !== goal.name.trim() || goal.name.length > MAX_PROGRESS_NAME ||
    typeof goal.unit !== 'string' || goal.unit.length === 0 || goal.unit !== goal.unit.trim() || goal.unit.length > MAX_PROGRESS_UNIT ||
    !Number.isInteger(target) || typeof target !== 'number' || target < 1 || target > MAX_PROGRESS_TARGET ||
    !Number.isInteger(createdAt) || typeof createdAt !== 'number' || createdAt < 0
  ) return false
  const today = goal.today
  if (!today || typeof today !== 'object' || Array.isArray(today) || Object.keys(today).length !== 2) return false
  const daily = today as Record<string, unknown>
  const dailyValue = daily.value
  return isDateKey(daily.date)
    && Number.isInteger(dailyValue)
    && typeof dailyValue === 'number'
    && dailyValue >= 0
    && dailyValue <= target
}

function clamp(value: number, target: number): number {
  return Math.min(target, Math.max(0, value))
}

export function progressValueForDay(goal: ProgressGoal, todayKey: string): number {
  return goal.today.date === todayKey ? clamp(goal.today.value, goal.target) : 0
}

export function validateProgressDraft(input: { name: string; unit: string; target: number }): ProgressDraftResult {
  const name = input.name.trim()
  const unit = input.unit.trim()
  if (!name) return { ok: false, message: NAME_REQUIRED }
  if (name.length > MAX_PROGRESS_NAME) return { ok: false, message: NAME_TOO_LONG }
  if (!unit) return { ok: false, message: UNIT_REQUIRED }
  if (unit.length > MAX_PROGRESS_UNIT) return { ok: false, message: UNIT_TOO_LONG }
  if (!Number.isInteger(input.target) || input.target < 1 || input.target > MAX_PROGRESS_TARGET) {
    return { ok: false, message: TARGET_INVALID }
  }
  return { ok: true, value: { name, unit, target: input.target } }
}

export function applyProgressIntent(
  goals: readonly ProgressGoal[],
  intent: ProgressIntent,
  todayKey: string,
): ProgressGoal[] {
  if (intent.kind === 'add') {
    const draft = validateProgressDraft(intent)
    if (!draft.ok || goals.length >= MAX_PROGRESS_GOALS || goals.some((goal) => goal.id === intent.id)) return [...goals]
    return [...goals, {
      id: intent.id,
      ...draft.value,
      createdAt: intent.createdAt,
      today: { date: todayKey, value: 0 },
    }]
  }

  const index = goals.findIndex((goal) => goal.id === intent.id)
  if (index === -1) return [...goals]
  if (intent.kind === 'remove') return goals.filter((goal) => goal.id !== intent.id)
  if (intent.kind === 'move') {
    const destination = index + intent.direction
    if (destination < 0 || destination >= goals.length) return [...goals]
    const result = [...goals]
    const [moved] = result.splice(index, 1)
    result.splice(destination, 0, moved!)
    return result
  }

  const row = goals[index]!
  let replacement: ProgressGoal
  if (intent.kind === 'increment') {
    replacement = { ...row, today: { date: todayKey, value: Math.min(row.target, progressValueForDay(row, todayKey) + 1) } }
  } else if (intent.kind === 'complete') {
    replacement = { ...row, today: { date: todayKey, value: row.target } }
  } else if (intent.kind === 'reset') {
    replacement = { ...row, today: { date: todayKey, value: 0 } }
  } else {
    const draft = validateProgressDraft(intent)
    if (!draft.ok) return [...goals]
    replacement = {
      ...row,
      ...draft.value,
      today: row.today.date === todayKey
        ? { date: todayKey, value: clamp(progressValueForDay(row, todayKey), draft.value.target) }
        : row.today,
    }
  }
  return goals.map((goal, rowIndex) => rowIndex === index ? replacement : goal)
}

/** Tolerant render-time boundary: corrupted persisted rows are omitted while
 * valid imported arrays, including arrays over the UI cap, keep their order. */
export function validProgressGoals(value: unknown): ProgressGoal[] {
  return Array.isArray(value) ? value.filter(isProgressGoal) : []
}
