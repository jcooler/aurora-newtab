export type BriefingProfile = 'compact' | 'standard' | 'display'
export type BriefingSignalKind = 'calendar' | 'tasks' | 'rain'

export interface BriefingSignal {
  kind: BriefingSignalKind
  text: string
}

export interface BriefingEvent {
  summary: string
  start: number
  end: number
  allDay: boolean
}

export interface BriefingTodoList {
  items: readonly { done: boolean }[]
}

export interface BriefingHour {
  time: string
  precipProb: number
}

export interface BriefingInputs {
  now: number
  use24Hour: boolean
  events: readonly BriefingEvent[]
  todoLists: readonly BriefingTodoList[]
  hourly: readonly BriefingHour[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const RAIN_THRESHOLD = 50
const BUDGETS: Record<BriefingProfile, { segments: number; characters: number }> = {
  compact: { segments: 1, characters: 56 },
  standard: { segments: 2, characters: 104 },
  display: { segments: 3, characters: 160 },
}

function cleanSummary(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function compareEvents(a: BriefingEvent, b: BriefingEvent): number {
  if (a.start !== b.start) return a.start - b.start
  const aSummary = cleanSummary(a.summary)
  const bSummary = cleanSummary(b.summary)
  return aSummary < bSummary ? -1 : aSummary > bSummary ? 1 : 0
}

function calendarSignal(inputs: BriefingInputs): BriefingSignal | null {
  const valid = inputs.events.filter((event) => (
    typeof event.summary === 'string' && cleanSummary(event.summary).length > 0 &&
    Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > inputs.now &&
    event.start - inputs.now <= DAY_MS
  )).sort(compareEvents)
  const event = valid.find((candidate) => !candidate.allDay) ?? valid[0]
  if (!event) return null

  const summary = cleanSummary(event.summary)
  if (event.allDay) return { kind: 'calendar', text: `${summary} today` }
  const diffMs = event.start - inputs.now
  if (diffMs < 60_000) return { kind: 'calendar', text: `${summary} now` }
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return { kind: 'calendar', text: `${summary} in ${minutes}m` }
  return { kind: 'calendar', text: `${summary} in ${Math.floor(diffMs / 3_600_000)}h` }
}

function tasksSignal(todoLists: readonly BriefingTodoList[]): BriefingSignal | null {
  const count = todoLists.reduce(
    (total, list) => total + list.items.filter((item) => item.done === false).length,
    0,
  )
  if (count === 0) return null
  return {
    kind: 'tasks',
    text: `${count} ${count === 1 ? 'task needs' : 'tasks need'} attention`,
  }
}

function formatHour(value: string, use24Hour: boolean): string | null {
  const match = /T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null
  }
  if (use24Hour) return `${match[1]}:${match[2]}`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 || 12
  return minute === 0 ? `${hour12} ${suffix}` : `${hour12}:${match[2]} ${suffix}`
}

function rainSignal(hourly: readonly BriefingHour[], use24Hour: boolean): BriefingSignal | null {
  const candidates = hourly
    .filter((point) => Number.isFinite(point.precipProb) && point.precipProb >= RAIN_THRESHOLD)
    .map((point) => ({ ...point, formatted: formatHour(point.time, use24Hour) }))
    .filter((point): point is BriefingHour & { formatted: string } => point.formatted !== null)
    .sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
  return candidates[0] ? { kind: 'rain', text: `Rain ${candidates[0].formatted}` } : null
}

export function collectBriefingSignals(inputs: BriefingInputs): BriefingSignal[] {
  const signals = [
    calendarSignal(inputs),
    tasksSignal(inputs.todoLists),
    rainSignal(inputs.hourly, inputs.use24Hour),
  ]
  return signals.filter((signal): signal is BriefingSignal => signal !== null)
}

function truncate(value: string, characters: number): string {
  if (value.length <= characters) return value
  if (characters <= 1) return '…'.slice(0, characters)
  return `${value.slice(0, characters - 1).trimEnd()}…`
}

export function formatBriefing(signals: readonly BriefingSignal[], profile: BriefingProfile): string {
  if (signals.length === 0) return 'Nothing urgent.'
  const budget = BUDGETS[profile]
  const admitted = signals.slice(0, budget.segments)
  let sentence = ''
  for (const signal of admitted) {
    const separator = sentence.length > 0 ? ' · ' : ''
    const remaining = budget.characters - sentence.length - separator.length
    if (remaining <= 0) break
    sentence += separator + truncate(signal.text, remaining)
    if (sentence.length >= budget.characters || sentence.endsWith('…')) break
  }
  return sentence || 'Nothing urgent.'
}
