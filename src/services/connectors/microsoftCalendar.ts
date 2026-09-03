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
const CALENDAR_LIST_PATH = '/v1.0/me/calendars'
const CALENDAR_LIST_SELECT = 'id,name,color,hexColor,isDefaultCalendar,canViewPrivateItems'
const MAX_ACCOUNTS = 5
const MAX_CALENDARS_PER_ACCOUNT = 10
const MAX_SELECTED_CALENDARS = 20
const MAX_DISCOVERED_CALENDARS = 250
const MAX_CALENDAR_LIST_BYTES = 1_048_576
const MAX_EVENTS_PAGE_BYTES = 4_194_304
const MAX_REFRESH_BYTES = 5 * 1_048_576
const MAX_PAGES = 10
const MAX_CONCURRENT_REQUESTS = 4
const MAX_EVENTS_PER_CALENDAR = 10_000
const MAX_EVENTS_PER_CONNECTION = 10_000
const MAX_WINDOW_MS = 370 * 86_400_000
const REQUEST_TIMEOUT_MS = 15_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const COLOR = /^#[0-9a-f]{6}$/iu
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u
const UTC_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z)?$/u

const MICROSOFT_COLORS: Readonly<Record<string, string>> = Object.freeze({
  lightBlue: '#3a96dd',
  lightGreen: '#00a300',
  lightOrange: '#da532c',
  lightGray: '#69797e',
  lightYellow: '#e3a21a',
  lightTeal: '#00aba9',
  lightPink: '#e671b8',
  lightBrown: '#a05000',
  lightRed: '#e51400',
})
const FALLBACK_COLORS = Object.freeze([
  '#0078d4', '#0ea5e9', '#0891b2', '#14b8a6', '#7c3aed', '#9333ea', '#db2777', '#ea580c',
])

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

export class MicrosoftCalendarRequestError extends Error {
  constructor(public readonly code: MicrosoftCalendarConnectionIssueCode) {
    super(code)
    this.name = 'MicrosoftCalendarRequestError'
  }
}

export interface DiscoveredMicrosoftCalendar extends MicrosoftCalendarSelection {
  canViewPrivateItems: boolean
  readable: boolean
}

interface ResponseBudget {
  remaining: number
}

interface DeltaChanges {
  events: MicrosoftCalendarEvent[]
  deletedIds: string[]
  deltaLink: string
}

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

function validAccessToken(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length >= 1
    && value.length <= 4_096
    && !/[\u0000-\u001f\u007f]/u.test(value)
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

function graphUrl(value: string | URL): URL {
  let url: URL
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(value)
  } catch {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  if (url.protocol !== 'https:'
    || url.origin !== GRAPH_ORIGIN
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || url.hash !== ''
    || !url.pathname.startsWith('/v1.0/')) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  return url
}

function exactQueryKeys(url: URL, allowed: readonly string[]): boolean {
  const keys = [...url.searchParams.keys()]
  return new Set(keys).size === keys.length && keys.every((key) => allowed.includes(key))
}

function assertCalendarListUrl(value: string | URL, continuation: boolean): URL {
  const url = graphUrl(value)
  if (url.pathname !== CALENDAR_LIST_PATH
    || !exactQueryKeys(url, continuation ? ['$select', '$skiptoken'] : ['$select'])
    || url.searchParams.get('$select') !== CALENDAR_LIST_SELECT
    || (continuation ? !boundedText(url.searchParams.get('$skiptoken'), 2_048) : url.searchParams.has('$skiptoken'))) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  return url
}

function deltaPath(calendarId: string): string {
  return `/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta`
}

function assertDeltaContinuationUrl(
  value: string | URL,
  calendarId: string,
  tokenKind: '$skiptoken' | '$deltatoken',
): URL {
  const url = graphUrl(value)
  if (url.pathname !== deltaPath(calendarId)
    || !exactQueryKeys(url, [tokenKind])
    || !boundedText(url.searchParams.get(tokenKind), 4_096)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  return url
}

async function requestJson(
  input: string | URL,
  accessToken: string,
  maxBytes: number,
  fetchFn: typeof fetch,
  budget?: ResponseBudget,
): Promise<unknown> {
  const url = graphUrl(input)
  if (!validAccessToken(accessToken)) throw new MicrosoftCalendarRequestError('unauthorized')
  let response: Response
  try {
    response = await fetchFn(url.toString(), {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
    })
  } catch {
    throw new MicrosoftCalendarRequestError('offline')
  }
  if (response.status === 401) throw new MicrosoftCalendarRequestError('unauthorized')
  if (response.status === 403) throw new MicrosoftCalendarRequestError('forbidden')
  if (response.status === 410) throw new MicrosoftCalendarRequestError('cursor_expired')
  if (response.status === 429) throw new MicrosoftCalendarRequestError('rate_limited')
  if (!response.ok) throw new MicrosoftCalendarRequestError('provider_error')
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const jsonMediaType = mediaType === 'application/json'
    || (mediaType?.startsWith('application/') === true && mediaType.endsWith('+json'))
  if (!jsonMediaType) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const declared = response.headers.get('content-length')
  let declaredBytes = 0
  if (declared !== null) {
    const bytes = Number(declared)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new MicrosoftCalendarRequestError('invalid_response')
    if (bytes > maxBytes || (budget && bytes > budget.remaining)) {
      throw new MicrosoftCalendarRequestError('response_too_large')
    }
    declaredBytes = bytes
  }
  const body = await response.text()
  const actualBytes = new TextEncoder().encode(body).byteLength
  if (actualBytes > maxBytes) throw new MicrosoftCalendarRequestError('response_too_large')
  const charged = Math.max(declaredBytes, actualBytes)
  if (budget) {
    if (charged > budget.remaining) throw new MicrosoftCalendarRequestError('response_too_large')
    budget.remaining -= charged
  }
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
}

function fallbackColor(calendarId: string): string {
  let hash = 0
  for (const character of calendarId) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]!
}

function usableHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !COLOR.test(value)) return null
  const normalized = value.toLowerCase()
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.04 || luminance > 0.9 ? null : normalized
}

function providerColor(candidate: Record<string, unknown>, calendarId: string): string {
  const preferred = usableHexColor(candidate.hexColor)
  if (preferred) return preferred
  const mapped = typeof candidate.color === 'string' ? MICROSOFT_COLORS[candidate.color] : undefined
  return usableHexColor(mapped) ?? fallbackColor(calendarId)
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

function normalizeCalendarListPage(value: unknown): {
  calendars: DiscoveredMicrosoftCalendar[]
  nextLink: string | null
} {
  if (!record(value) || !Array.isArray(value.value)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const nextLink = value['@odata.nextLink']
  if (nextLink !== undefined && !boundedText(nextLink, 4_096)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const calendars: DiscoveredMicrosoftCalendar[] = []
  for (const candidate of value.value) {
    if (!record(candidate)
      || !boundedText(candidate.id, 1_024)
      || !boundedText(candidate.name, 256)
      || typeof candidate.isDefaultCalendar !== 'boolean'
      || typeof candidate.canViewPrivateItems !== 'boolean') {
      throw new MicrosoftCalendarRequestError('invalid_response')
    }
    calendars.push({
      calendarId: candidate.id,
      name: candidate.name,
      color: providerColor(candidate, candidate.id),
      isDefault: candidate.isDefaultCalendar,
      canViewPrivateItems: candidate.canViewPrivateItems,
      readable: true,
    })
  }
  return { calendars, nextLink: nextLink ?? null }
}

export async function fetchMicrosoftCalendarList(
  accessToken: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<readonly DiscoveredMicrosoftCalendar[]> {
  const initial = new URL(CALENDAR_LIST_PATH, GRAPH_ORIGIN)
  initial.searchParams.set('$select', CALENDAR_LIST_SELECT)
  let url = assertCalendarListUrl(initial, false)
  const calendars: DiscoveredMicrosoftCalendar[] = []
  const calendarIds = new Set<string>()
  const followedLinks = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const normalized = normalizeCalendarListPage(
      await requestJson(url, accessToken, MAX_CALENDAR_LIST_BYTES, fetchFn),
    )
    for (const calendar of normalized.calendars) {
      if (calendarIds.has(calendar.calendarId)) {
        throw new MicrosoftCalendarRequestError('invalid_response')
      }
      if (calendars.length >= MAX_DISCOVERED_CALENDARS) {
        throw new MicrosoftCalendarRequestError('limit_exceeded')
      }
      calendarIds.add(calendar.calendarId)
      calendars.push(calendar)
    }
    if (normalized.nextLink === null) {
      return immutable(calendars.sort((left, right) => (
        Number(right.isDefault) - Number(left.isDefault)
        || left.name.localeCompare(right.name, 'en-US')
        || left.calendarId.localeCompare(right.calendarId, 'en-US')
      )))
    }
    const next = assertCalendarListUrl(normalized.nextLink, true)
    if (followedLinks.has(next.toString())) throw new MicrosoftCalendarRequestError('invalid_response')
    followedLinks.add(next.toString())
    url = next
  }
  throw new MicrosoftCalendarRequestError('invalid_response')
}

function graphDateTime(value: unknown): number | null {
  if (!record(value)
    || typeof value.dateTime !== 'string'
    || !UTC_DATE_TIME.test(value.dateTime)
    || value.timeZone !== 'UTC') return null
  const timestamp = Date.parse(value.dateTime.endsWith('Z') ? value.dateTime : `${value.dateTime}Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeGraphEvent(value: unknown): {
  event: MicrosoftCalendarEvent | null
  deletedId: string | null
} {
  if (!record(value) || !boundedText(value.id, 1_024)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  if (value['@removed'] !== undefined) {
    if (!record(value['@removed']) || value['@removed'].reason !== 'deleted') {
      throw new MicrosoftCalendarRequestError('invalid_response')
    }
    return { event: null, deletedId: value.id }
  }
  if (typeof value.isAllDay !== 'boolean'
    || typeof value.isCancelled !== 'boolean'
    || typeof value.showAs !== 'string'
    || !SHOW_AS.has(value.showAs as MicrosoftCalendarEvent['showAs'])
    || typeof value.sensitivity !== 'string'
    || !SENSITIVITY.has(value.sensitivity as MicrosoftCalendarEvent['sensitivity'])
    || typeof value.type !== 'string'
    || !EVENT_TYPES.has(value.type as MicrosoftCalendarEvent['eventType'])
    || !boundedText(value.lastModifiedDateTime, 64)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const start = graphDateTime(value.start)
  const end = graphDateTime(value.end)
  const updatedAt = Date.parse(value.lastModifiedDateTime)
  if (start === null || end === null || end <= start || !Number.isFinite(updatedAt) || updatedAt < 0) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const recurring = value.type === 'occurrence' || value.type === 'exception'
  if (recurring ? !boundedText(value.seriesMasterId, 1_024) : value.seriesMasterId !== null) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  let title: string
  if (value.subject === undefined || value.subject === null || value.subject === '') {
    title = 'Untitled event'
  } else if (boundedText(value.subject, 512)) {
    title = value.subject
  } else {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  let startDate: string | null = null
  let endDate: string | null = null
  if (value.isAllDay) {
    const rawStart = record(value.start) && typeof value.start.dateTime === 'string'
      ? value.start.dateTime.slice(0, 10)
      : null
    const rawEnd = record(value.end) && typeof value.end.dateTime === 'string'
      ? value.end.dateTime.slice(0, 10)
      : null
    if (!validLocalDate(rawStart) || !validLocalDate(rawEnd)) {
      throw new MicrosoftCalendarRequestError('invalid_response')
    }
    startDate = rawStart
    endDate = rawEnd
  }
  return {
    event: {
      eventId: value.id,
      title,
      start,
      end,
      allDay: value.isAllDay,
      startDate,
      endDate,
      cancelled: value.isCancelled,
      showAs: value.showAs as MicrosoftCalendarEvent['showAs'],
      sensitivity: value.sensitivity as MicrosoftCalendarEvent['sensitivity'],
      eventType: value.type as MicrosoftCalendarEvent['eventType'],
      seriesMasterId: recurring ? value.seriesMasterId as string : null,
      updatedAt,
    },
    deletedId: null,
  }
}

function normalizeDeltaPage(value: unknown): {
  events: MicrosoftCalendarEvent[]
  deletedIds: string[]
  nextLink: string | null
  deltaLink: string | null
} {
  if (!record(value) || !Array.isArray(value.value)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const nextLink = value['@odata.nextLink']
  const delta = value['@odata.deltaLink']
  if ((nextLink !== undefined && !boundedText(nextLink, 4_096))
    || (delta !== undefined && !boundedText(delta, 4_096))
    || (nextLink === undefined) === (delta === undefined)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const events: MicrosoftCalendarEvent[] = []
  const deletedIds: string[] = []
  const ids = new Set<string>()
  for (const candidate of value.value) {
    const normalized = normalizeGraphEvent(candidate)
    const id = normalized.event?.eventId ?? normalized.deletedId!
    if (ids.has(id)) throw new MicrosoftCalendarRequestError('invalid_response')
    ids.add(id)
    if (normalized.event) events.push(normalized.event)
    if (normalized.deletedId) deletedIds.push(normalized.deletedId)
  }
  return {
    events,
    deletedIds,
    nextLink: nextLink ?? null,
    deltaLink: delta ?? null,
  }
}

function initialDeltaUrl(calendarId: string, windowStart: number, windowEnd: number): URL {
  const url = new URL(deltaPath(calendarId), GRAPH_ORIGIN)
  url.searchParams.set('startDateTime', new Date(windowStart).toISOString())
  url.searchParams.set('endDateTime', new Date(windowEnd).toISOString())
  return url
}

async function fetchDeltaChanges(
  calendarId: string,
  accessToken: string,
  windowStart: number,
  windowEnd: number,
  priorDeltaLink: string | null,
  fetchFn: typeof fetch,
  budget: ResponseBudget,
): Promise<DeltaChanges> {
  let url = priorDeltaLink
    ? assertDeltaContinuationUrl(priorDeltaLink, calendarId, '$deltatoken')
    : initialDeltaUrl(calendarId, windowStart, windowEnd)
  const events: MicrosoftCalendarEvent[] = []
  const deletedIds: string[] = []
  const seenEventIds = new Set<string>()
  const followedLinks = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const normalized = normalizeDeltaPage(await requestJson(
      url,
      accessToken,
      MAX_EVENTS_PAGE_BYTES,
      fetchFn,
      budget,
    ))
    for (const id of [...normalized.events.map((event) => event.eventId), ...normalized.deletedIds]) {
      if (seenEventIds.has(id)) throw new MicrosoftCalendarRequestError('invalid_response')
      seenEventIds.add(id)
    }
    events.push(...normalized.events)
    deletedIds.push(...normalized.deletedIds)
    if (events.length + deletedIds.length > MAX_EVENTS_PER_CALENDAR) {
      throw new MicrosoftCalendarRequestError('limit_exceeded')
    }
    if (normalized.deltaLink) {
      const deltaLink = assertDeltaContinuationUrl(normalized.deltaLink, calendarId, '$deltatoken').toString()
      return { events, deletedIds, deltaLink }
    }
    const next = assertDeltaContinuationUrl(normalized.nextLink!, calendarId, '$skiptoken')
    if (followedLinks.has(next.toString())) throw new MicrosoftCalendarRequestError('invalid_response')
    followedLinks.add(next.toString())
    url = next
  }
  throw new MicrosoftCalendarRequestError('invalid_response')
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
  const eventCounts = new Map<string, number>()
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
    const connectionEventCount = (eventCounts.get(candidate.connectionId) ?? 0) + events.length
    if (connectionEventCount > MAX_EVENTS_PER_CONNECTION) return null
    eventCounts.set(candidate.connectionId, connectionEventCount)
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

function sourceKey(connectionId: string, calendarId: string): string {
  return `${connectionId}\n${calendarId}`
}

async function refreshSource(
  account: MicrosoftCalendarAccountSelection,
  calendar: MicrosoftCalendarSelection,
  accessToken: string,
  previous: MicrosoftCalendarSourceSnapshot | null,
  windowStart: number,
  windowEnd: number,
  fetchFn: typeof fetch,
  budget: ResponseBudget,
): Promise<MicrosoftCalendarSourceSnapshot> {
  const canIncrement = previous !== null
    && previous.windowStart === windowStart
    && previous.windowEnd === windowEnd
  let changes: DeltaChanges
  try {
    changes = await fetchDeltaChanges(
      calendar.calendarId,
      accessToken,
      windowStart,
      windowEnd,
      canIncrement && previous ? previous.deltaLink : null,
      fetchFn,
      budget,
    )
  } catch (error) {
    if (!(error instanceof MicrosoftCalendarRequestError)
      || error.code !== 'cursor_expired'
      || !canIncrement) throw error
    changes = await fetchDeltaChanges(
      calendar.calendarId,
      accessToken,
      windowStart,
      windowEnd,
      null,
      fetchFn,
      budget,
    )
    previous = null
  }
  const events = new Map<string, MicrosoftCalendarEvent>()
  if (canIncrement && previous) {
    for (const item of previous.events) events.set(item.eventId, item)
  }
  for (const id of changes.deletedIds) events.delete(id)
  for (const item of changes.events) events.set(item.eventId, item)
  if (events.size > MAX_EVENTS_PER_CALENDAR) throw new MicrosoftCalendarRequestError('limit_exceeded')
  return immutable({
    connectionId: account.connectionId,
    calendarId: calendar.calendarId,
    color: calendar.color,
    windowStart,
    windowEnd,
    deltaLink: changes.deltaLink,
    events: [...events.values()].sort((left, right) => (
      left.start - right.start || left.eventId.localeCompare(right.eventId, 'en-US')
    )),
  })
}

export async function refreshMicrosoftCalendarSnapshot(input: {
  config: MicrosoftCalendarConfig
  previous: MicrosoftCalendarSnapshot | null
  windowStart: number
  windowEnd: number
  now: () => number
  fetchFn: typeof fetch
  getAccessToken(connectionId: string): Promise<string>
}): Promise<MicrosoftCalendarSnapshot> {
  const config = parseMicrosoftCalendarConfig(input.config)
  const fetchedAt = input.now()
  if (!config
    || !validTimestamp(input.windowStart)
    || !validTimestamp(input.windowEnd)
    || input.windowEnd <= input.windowStart
    || input.windowEnd - input.windowStart > MAX_WINDOW_MS
    || !validTimestamp(fetchedAt)) {
    throw new MicrosoftCalendarRequestError('invalid_response')
  }
  const previous = input.previous ? parseMicrosoftCalendarSnapshot(input.previous) : null
  const priorBySource = new Map((previous?.calendars ?? []).map((source) => [
    sourceKey(source.connectionId, source.calendarId), source,
  ]))
  const tokenPromises = new Map<string, Promise<string>>()
  const budgets = new Map(config.accounts.map((account) => [
    account.connectionId, { remaining: MAX_REFRESH_BYTES },
  ]))
  const tokenFor = (connectionId: string): Promise<string> => {
    const existing = tokenPromises.get(connectionId)
    if (existing) return existing
    const pending = input.getAccessToken(connectionId).then((token) => {
      if (!validAccessToken(token)) throw new MicrosoftCalendarRequestError('unauthorized')
      return token
    })
    tokenPromises.set(connectionId, pending)
    return pending
  }
  const selections = config.accounts.flatMap((account) => (
    account.calendars.map((calendar) => ({ account, calendar }))
  ))
  const results = new Array<
    | { ok: true; value: MicrosoftCalendarSourceSnapshot }
    | { ok: false; code: MicrosoftCalendarConnectionIssueCode }
  >(selections.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < selections.length) {
      const index = next
      next += 1
      const selection = selections[index]!
      try {
        results[index] = {
          ok: true,
          value: await refreshSource(
            selection.account,
            selection.calendar,
            await tokenFor(selection.account.connectionId),
            priorBySource.get(sourceKey(selection.account.connectionId, selection.calendar.calendarId)) ?? null,
            input.windowStart,
            input.windowEnd,
            input.fetchFn,
            budgets.get(selection.account.connectionId)!,
          ),
        }
      } catch (error) {
        results[index] = {
          ok: false,
          code: error instanceof MicrosoftCalendarRequestError ? error.code : 'provider_error',
        }
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_REQUESTS, selections.length) },
    () => worker(),
  ))

  const calendars: MicrosoftCalendarSourceSnapshot[] = []
  const connectionIssues: MicrosoftCalendarConnectionIssue[] = []
  let offset = 0
  for (const account of config.accounts) {
    const accountResults = results.slice(offset, offset + account.calendars.length)
    offset += account.calendars.length
    const retainAccount = (): MicrosoftCalendarSourceSnapshot[] => account.calendars.flatMap((calendar) => {
      const source = priorBySource.get(sourceKey(account.connectionId, calendar.calendarId))
      return source ? [source] : []
    })
    const failed = accountResults.find((result) => !result.ok)
    if (failed && !failed.ok) {
      connectionIssues.push({ connectionId: account.connectionId, code: failed.code })
      calendars.push(...retainAccount())
      continue
    }
    const eventCount = accountResults.reduce((total, result) => (
      result.ok ? total + result.value.events.length : total
    ), 0)
    if (eventCount > MAX_EVENTS_PER_CONNECTION) {
      connectionIssues.push({ connectionId: account.connectionId, code: 'limit_exceeded' })
      calendars.push(...retainAccount())
      continue
    }
    for (const result of accountResults) if (result.ok) calendars.push(result.value)
  }
  return immutable({
    version: 1,
    fetchedAt,
    calendars,
    ...(connectionIssues.length > 0 ? { connectionIssues } : {}),
  })
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
