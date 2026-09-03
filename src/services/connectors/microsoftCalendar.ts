import type {
  ConnectorDescriptor,
  MicrosoftCalendarAccountSelection,
  MicrosoftCalendarConfig,
  MicrosoftCalendarConnectionIssue,
  MicrosoftCalendarConnectionIssueCode,
  MicrosoftCalendarEvent,
  MicrosoftCalendarSelection,
  MicrosoftCalendarSnapshot,
  MicrosoftCalendarSourceSnapshot,
} from './types'

const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const GRAPH_ORIGIN_PATTERN = `${GRAPH_ORIGIN}/*`
const MAX_ACCOUNTS = 5
const MAX_CALENDARS_PER_ACCOUNT = 10
const MAX_SELECTED_CALENDARS = 20
const MAX_EVENTS_PER_CALENDAR = 10_000
const MAX_EVENTS_PER_SNAPSHOT = 10_000
const MAX_WINDOW_MS = 370 * 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const COLOR = /^#[0-9a-f]{6}$/iu
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u

const ISSUE_CODES = new Set<MicrosoftCalendarConnectionIssueCode>([
  'unauthorized',
  'forbidden',
  'rate_limited',
  'offline',
  'organization_approval_required',
  'provider_error',
  'invalid_response',
  'response_too_large',
  'limit_exceeded',
  'cursor_expired',
  'entitlement_required',
  'reconnect_required',
])
const SHOW_AS = new Set<MicrosoftCalendarEvent['showAs']>([
  'free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown',
])
const SENSITIVITY = new Set<MicrosoftCalendarEvent['sensitivity']>([
  'normal', 'personal', 'private', 'confidential',
])
const EVENT_TYPES = new Set<MicrosoftCalendarEvent['eventType']>([
  'singleInstance', 'occurrence', 'exception', 'seriesMaster',
])

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[] = required,
): boolean {
  const keys = Object.keys(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every((key) => allowed.includes(key))
    && keys.every((key) => Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value)
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(clone)
  return clone
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function validEmail(value: unknown): value is string {
  if (!boundedText(value, 254) || /\s/u.test(value)) return false
  const separator = value.indexOf('@')
  return separator > 0 && separator === value.lastIndexOf('@') && separator < value.length - 1
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function validLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = LOCAL_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function validDeltaLink(value: unknown): value is string {
  if (!boundedText(value, 4_096)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.origin === GRAPH_ORIGIN
      && url.pathname.startsWith('/v1.0/')
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hash === ''
  } catch {
    return false
  }
}

function parseCalendarSelection(value: unknown): MicrosoftCalendarSelection | null {
  if (!record(value)
    || !exactKeys(value, ['calendarId', 'name', 'color', 'isDefault'])
    || !boundedText(value.calendarId, 1_024)
    || !boundedText(value.name, 256)
    || typeof value.color !== 'string'
    || !COLOR.test(value.color)
    || typeof value.isDefault !== 'boolean') return null
  return immutable(value as unknown as MicrosoftCalendarSelection)
}

function parseAccountSelection(value: unknown): MicrosoftCalendarAccountSelection | null {
  if (!record(value)
    || !exactKeys(value, ['connectionId', 'displayEmail', 'accountKind', 'calendars'])
    || typeof value.connectionId !== 'string'
    || !UUID.test(value.connectionId)
    || !validEmail(value.displayEmail)
    || !['personal', 'work_or_school'].includes(value.accountKind as string)
    || !Array.isArray(value.calendars)
    || value.calendars.length < 1
    || value.calendars.length > MAX_CALENDARS_PER_ACCOUNT) return null
  const calendars: MicrosoftCalendarSelection[] = []
  const ids = new Set<string>()
  for (const candidate of value.calendars) {
    const parsed = parseCalendarSelection(candidate)
    if (!parsed || ids.has(parsed.calendarId)) return null
    ids.add(parsed.calendarId)
    calendars.push(parsed)
  }
  return immutable({
    connectionId: value.connectionId,
    displayEmail: value.displayEmail,
    accountKind: value.accountKind as MicrosoftCalendarAccountSelection['accountKind'],
    calendars,
  })
}

export function parseMicrosoftCalendarConfig(value: unknown): MicrosoftCalendarConfig | null {
  if (!record(value)
    || !exactKeys(value, ['enabled', 'accountId', 'accounts'], [
      'enabled', 'accountId', 'accounts', 'snapshotEpoch',
    ])
    || typeof value.enabled !== 'boolean'
    || typeof value.accountId !== 'string'
    || !UUID.test(value.accountId)
    || !Array.isArray(value.accounts)
    || value.accounts.length < 1
    || value.accounts.length > MAX_ACCOUNTS
    || (value.snapshotEpoch !== undefined && !boundedText(value.snapshotEpoch, 128))) return null
  const accounts: MicrosoftCalendarAccountSelection[] = []
  const connectionIds = new Set<string>()
  let selected = 0
  for (const candidate of value.accounts) {
    const parsed = parseAccountSelection(candidate)
    if (!parsed || connectionIds.has(parsed.connectionId)) return null
    connectionIds.add(parsed.connectionId)
    selected += parsed.calendars.length
    if (selected > MAX_SELECTED_CALENDARS) return null
    accounts.push(parsed)
  }
  return immutable({
    enabled: value.enabled,
    accountId: value.accountId,
    accounts,
    ...(value.snapshotEpoch === undefined ? {} : { snapshotEpoch: value.snapshotEpoch as string }),
  })
}

function parseEvent(value: unknown): MicrosoftCalendarEvent | null {
  if (!record(value) || !exactKeys(value, [
    'eventId', 'title', 'start', 'end', 'allDay', 'startDate', 'endDate', 'cancelled',
    'showAs', 'sensitivity', 'eventType', 'seriesMasterId', 'updatedAt',
  ])) return null
  if (!boundedText(value.eventId, 1_024)
    || !boundedText(value.title, 512)
    || !validTimestamp(value.start)
    || !validTimestamp(value.end)
    || value.end <= value.start
    || typeof value.allDay !== 'boolean'
    || typeof value.cancelled !== 'boolean'
    || typeof value.showAs !== 'string'
    || !SHOW_AS.has(value.showAs as MicrosoftCalendarEvent['showAs'])
    || typeof value.sensitivity !== 'string'
    || !SENSITIVITY.has(value.sensitivity as MicrosoftCalendarEvent['sensitivity'])
    || typeof value.eventType !== 'string'
    || !EVENT_TYPES.has(value.eventType as MicrosoftCalendarEvent['eventType'])
    || !validTimestamp(value.updatedAt)) return null
  if (value.allDay) {
    if (!validLocalDate(value.startDate)
      || !validLocalDate(value.endDate)
      || Date.parse(`${value.endDate}T00:00:00Z`) <= Date.parse(`${value.startDate}T00:00:00Z`)) {
      return null
    }
  } else if (value.startDate !== null || value.endDate !== null) {
    return null
  }
  const recurring = value.eventType === 'occurrence' || value.eventType === 'exception'
  if (recurring ? !boundedText(value.seriesMasterId, 1_024) : value.seriesMasterId !== null) return null
  return immutable(value as unknown as MicrosoftCalendarEvent)
}

function parseIssue(value: unknown): MicrosoftCalendarConnectionIssue | null {
  if (!record(value)
    || !exactKeys(value, ['connectionId', 'code'])
    || typeof value.connectionId !== 'string'
    || !UUID.test(value.connectionId)
    || typeof value.code !== 'string'
    || !ISSUE_CODES.has(value.code as MicrosoftCalendarConnectionIssueCode)) return null
  return immutable(value as unknown as MicrosoftCalendarConnectionIssue)
}

export function parseMicrosoftCalendarSnapshot(value: unknown): MicrosoftCalendarSnapshot | null {
  if (!record(value)
    || !exactKeys(value, ['version', 'fetchedAt', 'calendars'], [
      'version', 'fetchedAt', 'calendars', 'connectionIssues',
    ])
    || value.version !== 1
    || !validTimestamp(value.fetchedAt)
    || !Array.isArray(value.calendars)
    || value.calendars.length > MAX_SELECTED_CALENDARS) return null
  const calendars: MicrosoftCalendarSourceSnapshot[] = []
  const sourceIds = new Set<string>()
  let eventCount = 0
  for (const candidate of value.calendars) {
    if (!record(candidate)
      || !exactKeys(candidate, [
        'connectionId', 'calendarId', 'color', 'windowStart', 'windowEnd', 'deltaLink', 'events',
      ])
      || typeof candidate.connectionId !== 'string'
      || !UUID.test(candidate.connectionId)
      || !boundedText(candidate.calendarId, 1_024)
      || typeof candidate.color !== 'string'
      || !COLOR.test(candidate.color)
      || !validTimestamp(candidate.windowStart)
      || !validTimestamp(candidate.windowEnd)
      || candidate.windowEnd <= candidate.windowStart
      || candidate.windowEnd - candidate.windowStart > MAX_WINDOW_MS
      || !validDeltaLink(candidate.deltaLink)
      || !Array.isArray(candidate.events)
      || candidate.events.length > MAX_EVENTS_PER_CALENDAR) return null
    const key = `${candidate.connectionId}\u0000${candidate.calendarId}`
    if (sourceIds.has(key)) return null
    sourceIds.add(key)
    const events: MicrosoftCalendarEvent[] = []
    const eventIds = new Set<string>()
    for (const rawEvent of candidate.events) {
      const parsed = parseEvent(rawEvent)
      if (!parsed || eventIds.has(parsed.eventId)) return null
      eventIds.add(parsed.eventId)
      events.push(parsed)
    }
    eventCount += events.length
    if (eventCount > MAX_EVENTS_PER_SNAPSHOT) return null
    calendars.push({
      connectionId: candidate.connectionId,
      calendarId: candidate.calendarId,
      color: candidate.color,
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      deltaLink: candidate.deltaLink,
      events: events.sort((left, right) => (
        left.start - right.start || left.eventId.localeCompare(right.eventId, 'en-US')
      )),
    })
  }
  const connectionIssues: MicrosoftCalendarConnectionIssue[] = []
  if (value.connectionIssues !== undefined) {
    if (!Array.isArray(value.connectionIssues) || value.connectionIssues.length > MAX_ACCOUNTS) return null
    const ids = new Set<string>()
    for (const rawIssue of value.connectionIssues) {
      const parsed = parseIssue(rawIssue)
      if (!parsed || ids.has(parsed.connectionId)) return null
      ids.add(parsed.connectionId)
      connectionIssues.push(parsed)
    }
  }
  return immutable({
    version: 1,
    fetchedAt: value.fetchedAt,
    calendars,
    ...(connectionIssues.length > 0 ? { connectionIssues } : {}),
  })
}

export function isMicrosoftCalendarSnapshot(value: unknown): value is MicrosoftCalendarSnapshot {
  return parseMicrosoftCalendarSnapshot(value) !== null
}

export const microsoftCalendarDescriptor: ConnectorDescriptor<MicrosoftCalendarConfig> = {
  id: 'microsoftCalendar',
  label: 'Microsoft Calendar',
  blurb: 'Bring Outlook and Microsoft 365 calendars into one read-only schedule',
  category: 'calendar-tasks',
  auth: 'oauth',
  ttlMs: 15 * 60_000,
  secretFields: [],
  excludeFromBackup: true,
  origins: (config) => parseMicrosoftCalendarConfig(config) ? [GRAPH_ORIGIN_PATTERN] : [],
  ownsOrigins: (config) => parseMicrosoftCalendarConfig(config) !== null,
}
