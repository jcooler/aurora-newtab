import type { AttentionAssignmentSource, AttentionLedger } from './storage/schema'

export const ATTENTION_WINDOW_MS = 6 * 60 * 60 * 1_000

const DAY_MS = 24 * 60 * 60 * 1_000
const RAIN_THRESHOLD = 50
const TITLE_LIMIT = 96
const SUMMARY_LIMIT = 104

export interface AttentionAssignment {
  id: string
  source: AttentionAssignmentSource
  sourceLabel: string
  title: string
  context: string
  url?: string
  firstSeenAt: number | null
}

export interface AttentionEvent {
  summary: string
  start: number
  end: number
  allDay: boolean
}

export interface AttentionDeployment {
  id: string
  project: string
  state: string
  url?: string
  createdAt: number
}

export interface AttentionHour {
  time: string
  precipProb: number
}

export interface AttentionInputs {
  now: number
  use24Hour: boolean
  events: readonly AttentionEvent[]
  assignments: readonly AttentionAssignment[]
  deployments: readonly AttentionDeployment[]
  hourly: readonly AttentionHour[]
}

export interface AttentionSignal {
  key: string
  kind: 'calendar' | 'assignment' | 'deployment' | 'rain'
  source: string
  title: string
  panelTitle?: string
  status?: string
  detail: string
  timestamp: number
  url?: string
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function boundedText(value: string, limit = TITLE_LIMIT): string {
  const clean = cleanText(value)
  if (clean.length <= limit) return clean
  return `${clean.slice(0, limit - 1).trimEnd()}…`
}

function validIds(values: readonly string[]): string[] {
  return [...new Set(values.map(cleanText).filter(Boolean))].sort()
}

export function reconcileAssignmentSource(
  ledger: AttentionLedger,
  source: AttentionAssignmentSource,
  currentIds: readonly string[],
  observedAt: number,
  generation?: string,
): AttentionLedger {
  if (!Number.isFinite(observedAt) || observedAt < 0) return ledger
  const previous = ledger.sources[source]
  if (previous && observedAt <= previous.observedAt) return ledger

  const generationChanged = Boolean(previous?.generation && generation && previous.generation !== generation)
  const items = Object.fromEntries(validIds(currentIds).map((id) => [
    id,
    {
      firstSeenAt: previous && !generationChanged
        ? previous.items[id]?.firstSeenAt === undefined
          ? observedAt
          : previous.items[id].firstSeenAt
        : null,
    },
  ]))

  return {
    version: 1,
    sources: {
      ...ledger.sources,
      [source]: { ...(generation ? { generation } : {}), observedAt, items },
    },
  }
}

export function clearAssignmentLedgerSources(ledger: AttentionLedger): AttentionLedger {
  return Object.keys(ledger.sources).length === 0 ? ledger : { version: 1, sources: {} }
}

export function retainAssignmentLedgerSources(
  ledger: AttentionLedger,
  active: ReadonlySet<AttentionAssignmentSource>,
): AttentionLedger {
  const sources = Object.fromEntries(
    Object.entries(ledger.sources).filter(([source]) => active.has(source as AttentionAssignmentSource)),
  ) as AttentionLedger['sources']
  return Object.keys(sources).length === Object.keys(ledger.sources).length ? ledger : { version: 1, sources }
}

function relativeAge(now: number, timestamp: number): string {
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function assignmentSignals(inputs: AttentionInputs): AttentionSignal[] {
  const signals: AttentionSignal[] = []
  for (const item of inputs.assignments) {
    const id = cleanText(item.id)
    const title = boundedText(item.title)
    const source = cleanText(item.sourceLabel)
    const firstSeenAt = item.firstSeenAt
    if (
      !id || !title || !source || firstSeenAt === null || !Number.isFinite(firstSeenAt) ||
      firstSeenAt > inputs.now || inputs.now - firstSeenAt > ATTENTION_WINDOW_MS
    ) continue
    const context = boundedText(item.context, 64)
    const age = `First seen by Tab Two ${relativeAge(inputs.now, firstSeenAt)}`
    signals.push({
      key: `assignment:${item.source}:${id}`,
      kind: 'assignment',
      source,
      title,
      status: 'New',
      detail: context ? `${context} · ${age}` : age,
      timestamp: firstSeenAt,
      ...(item.url ? { url: item.url } : {}),
    })
  }
  return signals
}

function deploymentSignals(inputs: AttentionInputs): AttentionSignal[] {
  const signals: AttentionSignal[] = []
  for (const deployment of inputs.deployments) {
    const id = cleanText(deployment.id)
    const title = boundedText(deployment.project)
    if (
      !id || !title || cleanText(deployment.state).toUpperCase() !== 'ERROR' ||
      !Number.isFinite(deployment.createdAt) || deployment.createdAt > inputs.now ||
      inputs.now - deployment.createdAt > ATTENTION_WINDOW_MS
    ) continue
    signals.push({
      key: `deployment:${id}`,
      kind: 'deployment',
      source: 'Vercel',
      title,
      status: 'Failed',
      detail: `Failed ${relativeAge(inputs.now, deployment.createdAt)}`,
      timestamp: deployment.createdAt,
      ...(deployment.url ? { url: deployment.url } : {}),
    })
  }
  return signals
}

function compareEvents(a: AttentionEvent, b: AttentionEvent): number {
  if (a.start !== b.start) return a.start - b.start
  return cleanText(a.summary).localeCompare(cleanText(b.summary))
}

function localDateKey(value: number): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function calendarDetail(inputs: AttentionInputs, event: AttentionEvent): string {
  if (event.allDay) return 'All day today'
  const tomorrow = new Date(inputs.now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const targetKey = localDateKey(event.start)
  const day = targetKey === localDateKey(inputs.now)
    ? 'today'
    : targetKey === localDateKey(tomorrow.getTime())
      ? 'tomorrow'
      : new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(event.start)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !inputs.use24Hour,
  }).format(event.start)
  return `Starts ${day} at ${time}`
}

function calendarSignal(inputs: AttentionInputs): AttentionSignal | null {
  const candidates = inputs.events.filter((event) => (
    typeof event.summary === 'string' && cleanText(event.summary).length > 0 &&
    Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > inputs.now &&
    event.start - inputs.now <= DAY_MS
  )).sort(compareEvents)
  const event = candidates.find((candidate) => !candidate.allDay) ?? candidates[0]
  if (!event) return null

  const summary = boundedText(event.summary)
  let title: string
  if (event.allDay) {
    title = `${summary} today`
  } else {
    const diff = event.start - inputs.now
    if (diff < 60_000) title = `${summary} now`
    else if (diff < 3_600_000) title = `${summary} in ${Math.floor(diff / 60_000)}m`
    else title = `${summary} in ${Math.floor(diff / 3_600_000)}h`
  }
  return {
    key: `calendar:${event.start}:${summary}`,
    kind: 'calendar',
    source: 'Calendar',
    title: boundedText(title),
    panelTitle: summary,
    status: event.allDay
      ? 'Today'
      : event.start - inputs.now < 60_000
        ? 'Now'
        : event.start - inputs.now < 3_600_000
          ? `In ${Math.floor((event.start - inputs.now) / 60_000)}m`
          : `In ${Math.floor((event.start - inputs.now) / 3_600_000)}h`,
    detail: calendarDetail(inputs, event),
    timestamp: event.start,
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

function rainSignal(inputs: AttentionInputs): AttentionSignal | null {
  const candidates = inputs.hourly
    .filter((point) => Number.isFinite(point.precipProb) && point.precipProb >= RAIN_THRESHOLD)
    .map((point) => ({ ...point, formatted: formatHour(point.time, inputs.use24Hour) }))
    .filter((point): point is AttentionHour & { formatted: string } => point.formatted !== null)
    .sort((a, b) => a.time.localeCompare(b.time))
  const first = candidates[0]
  if (!first) return null
  return {
    key: `rain:${first.time}`,
    kind: 'rain',
    source: 'Weather',
    title: `Rain ${first.formatted}`,
    status: `${Math.round(first.precipProb)}%`,
    detail: `${Math.round(first.precipProb)}% chance of rain`,
    timestamp: 0,
  }
}

const KIND_RANK: Record<AttentionSignal['kind'], number> = {
  deployment: 0,
  assignment: 1,
  calendar: 2,
  rain: 3,
}

export function collectAttentionSignals(inputs: AttentionInputs): AttentionSignal[] {
  const calendar = calendarSignal(inputs)
  const rain = rainSignal(inputs)
  return [
    ...deploymentSignals(inputs),
    ...assignmentSignals(inputs),
    ...(calendar ? [calendar] : []),
    ...(rain ? [rain] : []),
  ].sort((left, right) => {
    const rank = KIND_RANK[left.kind] - KIND_RANK[right.kind]
    if (rank !== 0) return rank
    if (left.kind === 'calendar') return left.timestamp - right.timestamp
    if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp
    return left.key.localeCompare(right.key)
  })
}

export function summarizeAttention(signals: readonly AttentionSignal[]): string {
  if (signals.length === 0) return ''
  const assignments = signals.filter((signal) => signal.kind === 'assignment').length
  const deployments = signals.filter((signal) => signal.kind === 'deployment').length
  let work = ''
  if (assignments > 0 && deployments > 0) {
    const count = assignments + deployments
    work = `${count} items need attention`
  } else if (assignments > 0) {
    work = `${assignments} ${assignments === 1 ? 'task needs' : 'tasks need'} attention`
  } else if (deployments > 0) {
    work = deployments === 1 ? 'Vercel build failed' : `${deployments} Vercel builds failed`
  }

  const calendar = signals.find((signal) => signal.kind === 'calendar')?.title ?? ''
  const direct = calendar || signals.find((signal) => signal.kind === 'rain')?.title || ''
  return boundedText(work && direct ? `${work} · ${direct}` : work || direct, SUMMARY_LIMIT)
}
