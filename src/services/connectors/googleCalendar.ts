import type {
  ConnectorDescriptor,
  GoogleCalendarAccountSelection,
  GoogleCalendarConfig,
  GoogleCalendarEvent,
  GoogleCalendarSelection,
  GoogleCalendarSnapshot,
  GoogleCalendarSourceSnapshot,
} from './types'

const GOOGLE_API_ORIGIN = 'https://www.googleapis.com'
const GOOGLE_CALENDAR_ORIGIN_PATTERN = `${GOOGLE_API_ORIGIN}/*`
const CALENDAR_LIST_PATH = '/calendar/v3/users/me/calendarList'
const MAX_ACCOUNTS = 5
const MAX_CALENDARS_PER_ACCOUNT = 10
const MAX_SELECTED_CALENDARS = 20
const MAX_CALENDAR_LIST_BYTES = 1_048_576
const MAX_EVENTS_PAGE_BYTES = 4_194_304
const MAX_PAGES = 10
const MAX_EVENTS_PER_CALENDAR = 10_000
const MAX_CONCURRENT_REQUESTS = 4
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const COLOR = /^#[0-9a-f]{6}$/u
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u
const RFC3339_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u

export type GoogleCalendarErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'offline'
  | 'provider_error'
  | 'invalid_response'
  | 'response_too_large'
  | 'cursor_expired'

export class GoogleCalendarRequestError extends Error {
  constructor(public readonly code: GoogleCalendarErrorCode) {
    super(code)
    this.name = 'GoogleCalendarRequestError'
  }
}

export interface DiscoveredGoogleCalendar extends GoogleCalendarSelection {
  foregroundColor: string
  selected: boolean
  accessRole: 'reader' | 'writer' | 'owner'
}

interface RefreshInput {
  config: GoogleCalendarConfig
  previous: GoogleCalendarSnapshot | null
  windowStart: number
  windowEnd: number
  getAccessToken(connectionId: string): Promise<string | null>
  fetchFn?: typeof fetch
  now?: () => number
}

interface NormalizedEventPage {
  events: GoogleCalendarEvent[]
  deletedIds: string[]
  nextPageToken: string | null
  nextSyncToken: string | null
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
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

function validColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR.test(value)
}

function parseCalendarSelection(value: unknown): GoogleCalendarSelection | null {
  if (!record(value) || !exactKeys(
    value,
    ['calendarId', 'name', 'color', 'primary'],
    ['calendarId', 'name', 'color', 'primary'],
  )) return null
  if (!boundedText(value.calendarId, 1_024)
    || !boundedText(value.name, 256)
    || !validColor(value.color)
    || typeof value.primary !== 'boolean') return null
  return immutable(value as unknown as GoogleCalendarSelection)
}

function parseAccountSelection(value: unknown): GoogleCalendarAccountSelection | null {
  if (!record(value) || !exactKeys(
    value,
    ['connectionId', 'displayEmail', 'calendars'],
    ['connectionId', 'displayEmail', 'calendars'],
  )) return null
  if (typeof value.connectionId !== 'string'
    || !UUID.test(value.connectionId)
    || !validEmail(value.displayEmail)
    || !Array.isArray(value.calendars)
    || value.calendars.length < 1
    || value.calendars.length > MAX_CALENDARS_PER_ACCOUNT) return null
  const calendars: GoogleCalendarSelection[] = []
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
    calendars,
  })
}

export function parseGoogleCalendarConfig(value: unknown): GoogleCalendarConfig | null {
  if (!record(value) || !exactKeys(
    value,
    ['enabled', 'accounts'],
    ['enabled', 'accounts', 'snapshotEpoch'],
  )) return null
  if (typeof value.enabled !== 'boolean'
    || !Array.isArray(value.accounts)
    || value.accounts.length < 1
    || value.accounts.length > MAX_ACCOUNTS
    || (value.snapshotEpoch !== undefined && !boundedText(value.snapshotEpoch, 128))) return null
  const accounts: GoogleCalendarAccountSelection[] = []
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
    accounts,
    ...(value.snapshotEpoch === undefined ? {} : { snapshotEpoch: value.snapshotEpoch as string }),
  })
}

function validAccessToken(value: string): boolean {
  return value === value.trim()
    && value.length >= 1
    && value.length <= 4_096
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function assertGoogleUrl(url: URL): void {
  if (url.protocol !== 'https:'
    || url.hostname !== 'www.googleapis.com'
    || !url.pathname.startsWith('/calendar/v3/')) {
    throw new GoogleCalendarRequestError('invalid_response')
  }
}

async function requestJson(
  url: URL,
  accessToken: string,
  maxBytes: number,
  fetchFn: typeof fetch,
): Promise<unknown> {
  assertGoogleUrl(url)
  if (!validAccessToken(accessToken)) throw new GoogleCalendarRequestError('unauthorized')
  let response: Response
  try {
    response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
  } catch {
    throw new GoogleCalendarRequestError('offline')
  }
  if (response.status === 401) throw new GoogleCalendarRequestError('unauthorized')
  if (response.status === 403) throw new GoogleCalendarRequestError('forbidden')
  if (response.status === 410) throw new GoogleCalendarRequestError('cursor_expired')
  if (response.status === 429) throw new GoogleCalendarRequestError('rate_limited')
  if (!response.ok) throw new GoogleCalendarRequestError('provider_error')
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new GoogleCalendarRequestError('invalid_response')
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new GoogleCalendarRequestError('invalid_response')
    if (bytes > maxBytes) throw new GoogleCalendarRequestError('response_too_large')
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new GoogleCalendarRequestError('response_too_large')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new GoogleCalendarRequestError('invalid_response')
  }
}

function optionalToken(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  return boundedText(value, 2_048) ? value : null
}

function normalizeCalendarListPage(value: unknown): {
  calendars: DiscoveredGoogleCalendar[]
  nextPageToken: string | null
} {
  if (!record(value) || !Array.isArray(value.items)) {
    throw new GoogleCalendarRequestError('invalid_response')
  }
  const token = optionalToken(value.nextPageToken)
  if (token === null) throw new GoogleCalendarRequestError('invalid_response')
  const calendars: DiscoveredGoogleCalendar[] = []
  for (const candidate of value.items) {
    if (!record(candidate)
      || !boundedText(candidate.id, 1_024)
      || !boundedText(candidate.summary, 256)
      || !validColor(candidate.backgroundColor)
      || !validColor(candidate.foregroundColor)
      || !['reader', 'writer', 'owner'].includes(candidate.accessRole as string)
      || (candidate.primary !== undefined && typeof candidate.primary !== 'boolean')
      || (candidate.selected !== undefined && typeof candidate.selected !== 'boolean')) {
      throw new GoogleCalendarRequestError('invalid_response')
    }
    calendars.push({
      calendarId: candidate.id,
      name: candidate.summary,
      color: candidate.backgroundColor,
      foregroundColor: candidate.foregroundColor,
      primary: candidate.primary === true,
      selected: candidate.selected === true,
      accessRole: candidate.accessRole as DiscoveredGoogleCalendar['accessRole'],
    })
  }
  return { calendars, nextPageToken: token ?? null }
}

export async function fetchGoogleCalendarList(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<readonly DiscoveredGoogleCalendar[]> {
  const calendars: DiscoveredGoogleCalendar[] = []
  const calendarIds = new Set<string>()
  const pageTokens = new Set<string>()
  let pageToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (pageToken !== null) {
      if (pageTokens.has(pageToken)) throw new GoogleCalendarRequestError('invalid_response')
      pageTokens.add(pageToken)
    }
    const url = new URL(CALENDAR_LIST_PATH, GOOGLE_API_ORIGIN)
    url.searchParams.set('maxResults', '250')
    url.searchParams.set('minAccessRole', 'reader')
    url.searchParams.set('showHidden', 'false')
    url.searchParams.set('colorRgbFormat', 'true')
    url.searchParams.set('fields', 'items(id,summary,primary,selected,accessRole,backgroundColor,foregroundColor),nextPageToken')
    if (pageToken !== null) url.searchParams.set('pageToken', pageToken)
    const normalized = normalizeCalendarListPage(
      await requestJson(url, accessToken, MAX_CALENDAR_LIST_BYTES, fetchFn),
    )
    for (const calendar of normalized.calendars) {
      if (calendarIds.has(calendar.calendarId)) throw new GoogleCalendarRequestError('invalid_response')
      calendarIds.add(calendar.calendarId)
      calendars.push(calendar)
    }
    if (normalized.nextPageToken === null) {
      return immutable(calendars.sort((left, right) => (
        Number(right.primary) - Number(left.primary)
        || left.name.localeCompare(right.name, 'en-US')
        || left.calendarId.localeCompare(right.calendarId, 'en-US')
      )))
    }
    pageToken = normalized.nextPageToken
  }
  throw new GoogleCalendarRequestError('invalid_response')
}

function safeProviderUrl(value: unknown, host: string, pathPrefix = '/'): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === host
      && url.username === ''
      && url.password === ''
      && url.pathname.startsWith(pathPrefix)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function parseEventTimes(start: unknown, end: unknown): Pick<
  GoogleCalendarEvent,
  'start' | 'end' | 'allDay' | 'startDate' | 'endDate'
> | null {
  if (!record(start) || !record(end)) return null
  if (validLocalDate(start.date) && validLocalDate(end.date)) {
    const startTime = Date.parse(`${start.date}T00:00:00Z`)
    const endTime = Date.parse(`${end.date}T00:00:00Z`)
    return endTime > startTime ? {
      start: startTime,
      end: endTime,
      allDay: true,
      startDate: start.date,
      endDate: end.date,
    } : null
  }
  if (typeof start.dateTime !== 'string'
    || typeof end.dateTime !== 'string'
    || !RFC3339_WITH_ZONE.test(start.dateTime)
    || !RFC3339_WITH_ZONE.test(end.dateTime)) return null
  const startTime = Date.parse(start.dateTime)
  const endTime = Date.parse(end.dateTime)
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime ? {
    start: startTime,
    end: endTime,
    allDay: false,
    startDate: null,
    endDate: null,
  } : null
}

function normalizeEventPage(value: unknown): NormalizedEventPage {
  if (!record(value) || !Array.isArray(value.items)) {
    throw new GoogleCalendarRequestError('invalid_response')
  }
  const nextPageToken = optionalToken(value.nextPageToken)
  const nextSyncToken = optionalToken(value.nextSyncToken)
  if (nextPageToken === null || nextSyncToken === null || (nextPageToken && nextSyncToken)) {
    throw new GoogleCalendarRequestError('invalid_response')
  }
  const events: GoogleCalendarEvent[] = []
  const deletedIds: string[] = []
  const ids = new Set<string>()
  for (const candidate of value.items) {
    if (!record(candidate)
      || !boundedText(candidate.id, 1_024)
      || ids.has(candidate.id)) {
      throw new GoogleCalendarRequestError('invalid_response')
    }
    ids.add(candidate.id)
    if (candidate.status === 'cancelled') {
      deletedIds.push(candidate.id)
      continue
    }
    if (!['confirmed', 'tentative'].includes(candidate.status as string)
      || !boundedText(candidate.updated, 64)
      || !Number.isFinite(Date.parse(candidate.updated))) {
      throw new GoogleCalendarRequestError('invalid_response')
    }
    const times = parseEventTimes(candidate.start, candidate.end)
    if (!times) throw new GoogleCalendarRequestError('invalid_response')
    const title = candidate.summary === undefined
      ? 'Untitled event'
      : boundedText(candidate.summary, 512) ? candidate.summary : null
    if (title === null) throw new GoogleCalendarRequestError('invalid_response')
    const calendarUrl = safeProviderUrl(candidate.htmlLink, 'calendar.google.com', '/calendar/')
    const meetUrl = safeProviderUrl(candidate.hangoutLink, 'meet.google.com')
    events.push({
      eventId: candidate.id,
      title,
      status: candidate.status as GoogleCalendarEvent['status'],
      ...times,
      updatedAt: Date.parse(candidate.updated),
      ...(calendarUrl ? { calendarUrl } : {}),
      ...(meetUrl ? { meetUrl } : {}),
    })
  }
  return {
    events,
    deletedIds,
    nextPageToken: nextPageToken ?? null,
    nextSyncToken: nextSyncToken ?? null,
  }
}

function eventsUrl(
  calendarId: string,
  windowStart: number,
  windowEnd: number,
  syncToken: string | null,
  pageToken: string | null,
): URL {
  const url = new URL(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, GOOGLE_API_ORIGIN)
  url.searchParams.set('maxResults', '2500')
  url.searchParams.set('showDeleted', 'true')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('fields', 'items(id,status,summary,start,end,updated,htmlLink,hangoutLink),nextPageToken,nextSyncToken')
  if (syncToken) {
    url.searchParams.set('syncToken', syncToken)
  } else {
    url.searchParams.set('timeMin', new Date(windowStart).toISOString())
    url.searchParams.set('timeMax', new Date(windowEnd).toISOString())
  }
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  return url
}

async function fetchEventChanges(
  calendarId: string,
  accessToken: string,
  windowStart: number,
  windowEnd: number,
  syncToken: string | null,
  fetchFn: typeof fetch,
): Promise<{ events: GoogleCalendarEvent[]; deletedIds: string[]; syncToken: string }> {
  const events: GoogleCalendarEvent[] = []
  const deletedIds: string[] = []
  const eventIds = new Set<string>()
  const pageTokens = new Set<string>()
  let pageToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (pageToken !== null) {
      if (pageTokens.has(pageToken)) throw new GoogleCalendarRequestError('invalid_response')
      pageTokens.add(pageToken)
    }
    const normalized = normalizeEventPage(await requestJson(
      eventsUrl(calendarId, windowStart, windowEnd, syncToken, pageToken),
      accessToken,
      MAX_EVENTS_PAGE_BYTES,
      fetchFn,
    ))
    for (const id of [...normalized.events.map((event) => event.eventId), ...normalized.deletedIds]) {
      if (eventIds.has(id)) throw new GoogleCalendarRequestError('invalid_response')
      eventIds.add(id)
    }
    events.push(...normalized.events)
    deletedIds.push(...normalized.deletedIds)
    if (events.length + deletedIds.length > MAX_EVENTS_PER_CALENDAR) {
      throw new GoogleCalendarRequestError('invalid_response')
    }
    if (normalized.nextPageToken === null) {
      if (!normalized.nextSyncToken) throw new GoogleCalendarRequestError('invalid_response')
      return { events, deletedIds, syncToken: normalized.nextSyncToken }
    }
    pageToken = normalized.nextPageToken
  }
  throw new GoogleCalendarRequestError('invalid_response')
}

function sourceKey(connectionId: string, calendarId: string): string {
  return `${connectionId}\n${calendarId}`
}

async function refreshSource(
  account: GoogleCalendarAccountSelection,
  calendar: GoogleCalendarSelection,
  accessToken: string,
  previous: GoogleCalendarSourceSnapshot | null,
  windowStart: number,
  windowEnd: number,
  fetchFn: typeof fetch,
): Promise<GoogleCalendarSourceSnapshot> {
  const canIncrement = previous !== null
    && previous.windowStart === windowStart
    && previous.windowEnd === windowEnd
  let changes: Awaited<ReturnType<typeof fetchEventChanges>>
  try {
    changes = await fetchEventChanges(
      calendar.calendarId,
      accessToken,
      windowStart,
      windowEnd,
      canIncrement && previous ? previous.syncToken : null,
      fetchFn,
    )
  } catch (error) {
    if (!(error instanceof GoogleCalendarRequestError)
      || error.code !== 'cursor_expired'
      || !canIncrement) throw error
    changes = await fetchEventChanges(
      calendar.calendarId,
      accessToken,
      windowStart,
      windowEnd,
      null,
      fetchFn,
    )
    previous = null
  }
  const events = new Map<string, GoogleCalendarEvent>()
  if (canIncrement && previous) {
    for (const event of previous.events) events.set(event.eventId, event)
  }
  for (const id of changes.deletedIds) events.delete(id)
  for (const event of changes.events) events.set(event.eventId, event)
  return immutable({
    connectionId: account.connectionId,
    calendarId: calendar.calendarId,
    color: calendar.color,
    windowStart,
    windowEnd,
    syncToken: changes.syncToken,
    events: [...events.values()].sort((left, right) => (
      left.start - right.start || left.eventId.localeCompare(right.eventId, 'en-US')
    )),
  })
}

export async function refreshGoogleCalendarSnapshot(input: RefreshInput): Promise<GoogleCalendarSnapshot> {
  const config = parseGoogleCalendarConfig(input.config)
  const fetchedAt = (input.now ?? Date.now)()
  if (!config
    || !validTimestamp(input.windowStart)
    || !validTimestamp(input.windowEnd)
    || input.windowEnd <= input.windowStart
    || input.windowEnd - input.windowStart > 370 * 86_400_000
    || !validTimestamp(fetchedAt)) throw new GoogleCalendarRequestError('invalid_response')
  const previous = input.previous && isGoogleCalendarSnapshot(input.previous) ? input.previous : null
  const priorBySource = new Map((previous?.calendars ?? []).map((calendar) => [
    sourceKey(calendar.connectionId, calendar.calendarId), calendar,
  ]))
  const tokenPromises = new Map<string, Promise<string>>()
  const tokenFor = (id: string): Promise<string> => {
    const existing = tokenPromises.get(id)
    if (existing) return existing
    const pending = input.getAccessToken(id).then((token) => {
      if (!token || !validAccessToken(token)) throw new GoogleCalendarRequestError('unauthorized')
      return token
    })
    tokenPromises.set(id, pending)
    return pending
  }
  const selections = config.accounts.flatMap((account) => (
    account.calendars.map((calendar) => ({ account, calendar }))
  ))
  const results = new Array<GoogleCalendarSourceSnapshot>(selections.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < selections.length) {
      const index = next
      next += 1
      const selection = selections[index]!
      results[index] = await refreshSource(
        selection.account,
        selection.calendar,
        await tokenFor(selection.account.connectionId),
        priorBySource.get(sourceKey(selection.account.connectionId, selection.calendar.calendarId)) ?? null,
        input.windowStart,
        input.windowEnd,
        input.fetchFn ?? fetch,
      )
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_REQUESTS, selections.length) },
    () => worker(),
  ))
  return immutable({ version: 1, fetchedAt, calendars: results })
}

function validEvent(value: unknown): value is GoogleCalendarEvent {
  if (!record(value) || !exactKeys(
    value,
    ['eventId', 'title', 'status', 'start', 'end', 'allDay', 'startDate', 'endDate', 'updatedAt'],
    ['eventId', 'title', 'status', 'start', 'end', 'allDay', 'startDate', 'endDate', 'updatedAt', 'calendarUrl', 'meetUrl'],
  )) return false
  return boundedText(value.eventId, 1_024)
    && boundedText(value.title, 512)
    && ['confirmed', 'tentative'].includes(value.status as string)
    && validTimestamp(value.start)
    && validTimestamp(value.end)
    && value.end > value.start
    && typeof value.allDay === 'boolean'
    && (value.allDay
      ? validLocalDate(value.startDate) && validLocalDate(value.endDate)
      : value.startDate === null && value.endDate === null)
    && validTimestamp(value.updatedAt)
    && (value.calendarUrl === undefined
      || safeProviderUrl(value.calendarUrl, 'calendar.google.com', '/calendar/') === value.calendarUrl)
    && (value.meetUrl === undefined
      || safeProviderUrl(value.meetUrl, 'meet.google.com') === value.meetUrl)
}

export function isGoogleCalendarSnapshot(value: unknown): value is GoogleCalendarSnapshot {
  if (!record(value)
    || !exactKeys(value, ['version', 'fetchedAt', 'calendars'], ['version', 'fetchedAt', 'calendars'])
    || value.version !== 1
    || !validTimestamp(value.fetchedAt)
    || !Array.isArray(value.calendars)
    || value.calendars.length > MAX_SELECTED_CALENDARS) return false
  const sources = new Set<string>()
  for (const candidate of value.calendars) {
    if (!record(candidate)
      || !exactKeys(
        candidate,
        ['connectionId', 'calendarId', 'color', 'windowStart', 'windowEnd', 'syncToken', 'events'],
        ['connectionId', 'calendarId', 'color', 'windowStart', 'windowEnd', 'syncToken', 'events'],
      )
      || typeof candidate.connectionId !== 'string'
      || !UUID.test(candidate.connectionId)
      || !boundedText(candidate.calendarId, 1_024)
      || !validColor(candidate.color)
      || !validTimestamp(candidate.windowStart)
      || !validTimestamp(candidate.windowEnd)
      || candidate.windowEnd <= candidate.windowStart
      || !boundedText(candidate.syncToken, 2_048)
      || !Array.isArray(candidate.events)
      || candidate.events.length > MAX_EVENTS_PER_CALENDAR
      || !candidate.events.every(validEvent)) return false
    const key = sourceKey(candidate.connectionId, candidate.calendarId)
    if (sources.has(key)) return false
    sources.add(key)
    const eventIds = new Set((candidate.events as GoogleCalendarEvent[]).map((event) => event.eventId))
    if (eventIds.size !== candidate.events.length) return false
  }
  return true
}

export const googleCalendarDescriptor: ConnectorDescriptor<GoogleCalendarConfig> = {
  id: 'googleCalendar',
  label: 'Google Calendar',
  blurb: 'Bring selected Google calendars into one read-only schedule',
  category: 'calendar-tasks',
  auth: 'oauth',
  ttlMs: 15 * 60_000,
  secretFields: [],
  excludeFromBackup: true,
  origins: (config) => parseGoogleCalendarConfig(config) ? [GOOGLE_CALENDAR_ORIGIN_PATTERN] : [],
  ownsOrigins: (config) => parseGoogleCalendarConfig(config) !== null,
}
