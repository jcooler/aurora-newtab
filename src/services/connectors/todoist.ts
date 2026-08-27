import type { ConnectorDescriptor, TodoistConfig } from './types'
import { getJson, postEmpty } from './http'

export const TODOIST_ORIGIN = 'https://api.todoist.com/*'
export const TODOIST_TTL_MS = 5 * 60_000
const TODOIST_API_BASE = 'https://api.todoist.com/api/v1'
const TODOIST_PAGE_LIMIT = 200

export interface TodoistProject {
  id: string
  name: string
}

export type TodoistDueBucket = 'overdue' | 'today' | 'upcoming'

export interface TodoistDue {
  date: string
  datetime: string | null
  timeZone: string | null
  text: string | null
  isRecurring: boolean
}

export interface TodoistDuration {
  amount: number
  unit: 'minute' | 'day'
}

export interface TodoistTask {
  id: string
  content: string
  projectId: string
  due: TodoistDue
  priority: 1 | 2 | 3 | 4
  labels: string[]
  duration: TodoistDuration | null
  parentId: string | null
  bucket: TodoistDueBucket
  url: string
}

export interface TodoistData {
  projects: TodoistProject[]
  tasks: TodoistTask[]
}

export interface TodoistTaskFetchOptions {
  projectIds?: readonly string[]
  now?: Date
  timeZone?: string
}

export interface TodoistCloseSuccess {
  ok: true
  status: 200
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

export class TodoistServiceError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'TodoistServiceError'
    this.status = status
  }
}

interface TodoistPageBody {
  results?: unknown
  next_cursor?: unknown
}

function todoistHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function validDateOnly(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function dayInTimeZone(date: Date, timeZone: string): string | null {
  if (!Number.isFinite(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

export function classifyTodoistDue(
  value: string,
  now: Date,
  timeZone: string,
): TodoistDueBucket | null {
  const today = dayInTimeZone(now, timeZone)
  if (today === null) return null

  let dueDay: string | null = null
  if (validDateOnly(value)) {
    dueDay = value
  } else if (RFC3339_RE.test(value)) {
    const instant = new Date(value)
    dueDay = dayInTimeZone(instant, timeZone)
  }
  if (dueDay === null) return null
  return dueDay < today ? 'overdue' : dueDay === today ? 'today' : 'upcoming'
}

export function todoistTaskUrl(id: string): string {
  return `https://app.todoist.com/app/task/${encodeURIComponent(id)}`
}

function invalidResponse(): TodoistServiceError {
  return new TodoistServiceError('Todoist returned an invalid response.')
}

async function fetchTodoistPage(
  path: string,
  token: string,
  cursor: string | null,
  fetchFn: typeof fetch,
): Promise<{ results: unknown[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(TODOIST_PAGE_LIMIT) })
  if (cursor !== null) params.set('cursor', cursor)

  let result
  try {
    result = await getJson<TodoistPageBody>(
      `${TODOIST_API_BASE}/${path}?${params.toString()}`,
      todoistHeaders(token),
      fetchFn,
    )
  } catch {
    throw new TodoistServiceError('Todoist request failed.')
  }

  if (!result.ok) {
    const message = result.status === null
      ? 'Todoist request failed.'
      : `Todoist request failed with status ${result.status}.`
    throw new TodoistServiceError(message, result.status)
  }

  const body = result.body
  if (!body || typeof body !== 'object' || !Array.isArray(body.results)) throw invalidResponse()
  const cursorValue = body.next_cursor
  if (cursorValue === undefined || cursorValue === null || cursorValue === '') {
    return { results: body.results, nextCursor: null }
  }
  if (typeof cursorValue !== 'string') throw invalidResponse()
  return { results: body.results, nextCursor: cursorValue }
}

async function fetchTodoistPages(
  path: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<unknown[]> {
  const first = await fetchTodoistPage(path, token, null, fetchFn)
  if (first.nextCursor === null) return first.results

  const second = await fetchTodoistPage(path, token, first.nextCursor, fetchFn)
  if (second.nextCursor !== null) {
    throw new TodoistServiceError('Todoist returned more than two pages.')
  }
  return [...first.results, ...second.results]
}

export async function fetchTodoistProjects(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<TodoistProject[]> {
  const rows = await fetchTodoistPages('projects', token, fetchFn)
  const seen = new Set<string>()
  const projects: TodoistProject[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const candidate = row as { id?: unknown; name?: unknown }
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    if (!id || id.startsWith('tmp-') || !name || seen.has(id)) continue
    seen.add(id)
    projects.push({ id, name })
  }
  return projects
}

function cleanSelectedProjectIds(value: readonly string[] | undefined): Set<string> {
  if (!Array.isArray(value)) return new Set()
  return new Set(value.flatMap((id) => {
    const clean = typeof id === 'string' ? id.trim() : ''
    return clean ? [clean] : []
  }))
}

function cleanLabels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const labels = value.flatMap((label) => {
    const clean = typeof label === 'string' ? label.trim() : ''
    return clean ? [clean] : []
  })
  return [...new Set(labels)]
}

function cleanDuration(value: unknown): { valid: true; duration: TodoistDuration | null } | { valid: false } {
  if (value === null || value === undefined) return { valid: true, duration: null }
  if (!value || typeof value !== 'object') return { valid: false }
  const candidate = value as { amount?: unknown; unit?: unknown }
  if (
    typeof candidate.amount !== 'number' ||
    !Number.isFinite(candidate.amount) ||
    candidate.amount <= 0 ||
    (candidate.unit !== 'minute' && candidate.unit !== 'day')
  ) return { valid: false }
  return { valid: true, duration: { amount: candidate.amount, unit: candidate.unit } }
}

function cleanDue(value: unknown): TodoistDue | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    date?: unknown
    datetime?: unknown
    timezone?: unknown
    string?: unknown
    is_recurring?: unknown
  }
  const date = typeof candidate.date === 'string' ? candidate.date.trim() : ''
  const datetime = candidate.datetime === null || candidate.datetime === undefined
    ? null
    : typeof candidate.datetime === 'string'
      ? candidate.datetime.trim()
      : ''
  if (!date || datetime === '') return null
  return {
    date,
    datetime,
    timeZone: typeof candidate.timezone === 'string' && candidate.timezone.trim()
      ? candidate.timezone.trim()
      : null,
    text: typeof candidate.string === 'string' && candidate.string.trim()
      ? candidate.string.trim()
      : null,
    isRecurring: candidate.is_recurring === true,
  }
}

function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const BUCKET_ORDER: Readonly<Record<TodoistDueBucket, number>> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
}

function dueSortValue(due: TodoistDue): number {
  const source = due.datetime ?? due.date
  if (RFC3339_RE.test(source)) return Date.parse(source)
  const match = DATE_ONLY_RE.exec(source)
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.POSITIVE_INFINITY
}

export async function fetchTodoistTasks(
  token: string,
  options: TodoistTaskFetchOptions = {},
  fetchFn: typeof fetch = fetch,
): Promise<TodoistTask[]> {
  const rows = await fetchTodoistPages('tasks', token, fetchFn)
  const selectedProjects = cleanSelectedProjectIds(options.projectIds)
  const now = options.now ?? new Date()
  const timeZone = options.timeZone ?? defaultTimeZone()
  const seen = new Set<string>()
  const tasks: TodoistTask[] = []

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const candidate = row as {
      id?: unknown
      content?: unknown
      project_id?: unknown
      due?: unknown
      priority?: unknown
      labels?: unknown
      duration?: unknown
      parent_id?: unknown
      is_completed?: unknown
      checked?: unknown
      completed_at?: unknown
    }
    if (candidate.is_completed === true || candidate.checked === true || candidate.completed_at != null) continue

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''
    const projectId = typeof candidate.project_id === 'string' ? candidate.project_id.trim() : ''
    if (!id || id.startsWith('tmp-') || !content || !projectId || seen.has(id)) continue
    if (selectedProjects.size > 0 && !selectedProjects.has(projectId)) continue

    const due = cleanDue(candidate.due)
    if (due === null) continue
    const dueValue = due.datetime ?? due.date
    const bucket = classifyTodoistDue(dueValue, now, timeZone)
    if (bucket === null) continue

    const priority = candidate.priority
    if (!Number.isInteger(priority) || typeof priority !== 'number' || priority < 1 || priority > 4) continue
    const labels = cleanLabels(candidate.labels)
    if (labels === null) continue
    const duration = cleanDuration(candidate.duration)
    if (!duration.valid) continue
    const parentId = typeof candidate.parent_id === 'string' && candidate.parent_id.trim()
      ? candidate.parent_id.trim()
      : null

    seen.add(id)
    tasks.push({
      id,
      content,
      projectId,
      due,
      priority: priority as TodoistTask['priority'],
      labels,
      duration: duration.duration,
      parentId,
      bucket,
      url: todoistTaskUrl(id),
    })
  }

  return tasks
    .sort((a, b) =>
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
      dueSortValue(a.due) - dueSortValue(b.due) ||
      a.content.localeCompare(b.content) ||
      a.id.localeCompare(b.id),
    )
    .slice(0, 25)
}

export async function closeTodoistTask(
  token: string,
  taskId: string,
  fetchFn: typeof fetch = fetch,
): Promise<TodoistCloseSuccess> {
  const id = taskId.trim()
  if (!id) throw new TodoistServiceError('Todoist task id is invalid.')
  if (id.startsWith('tmp-')) {
    throw new TodoistServiceError('Todoist temporary tasks cannot be completed.')
  }

  let result
  try {
    result = await postEmpty(
      `${TODOIST_API_BASE}/tasks/${encodeURIComponent(id)}/close`,
      todoistHeaders(token),
      fetchFn,
    )
  } catch {
    throw new TodoistServiceError('Todoist close failed.')
  }

  if (!result.ok) {
    const message = result.status === null
      ? 'Todoist close failed.'
      : `Todoist close failed with status ${result.status}.`
    throw new TodoistServiceError(message, result.status)
  }
  if (result.status !== 200) {
    throw new TodoistServiceError(`Todoist close returned unexpected status ${result.status}.`, result.status)
  }
  return { ok: true, status: 200 }
}

export function todoistItemLimit(config: Pick<TodoistConfig, 'itemLimit'> | null | undefined): number {
  const value = config?.itemLimit
  return typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 10 ? value : 6
}

export function todoistProjectIds(config: Pick<TodoistConfig, 'projectIds'> | null | undefined): string[] {
  if (!Array.isArray(config?.projectIds)) return []
  return [...new Set(config.projectIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))]
    .slice(0, 200)
}

function normalizedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

export function isTodoistData(value: unknown): value is TodoistData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.projects) || !Array.isArray(data.tasks) || data.projects.length > 400 || data.tasks.length > 25) return false
  const projectIds = new Set<string>()
  for (const row of data.projects) {
    if (!row || typeof row !== 'object') return false
    const project = row as Record<string, unknown>
    if (!normalizedText(project.id) || project.id.startsWith('tmp-') || !normalizedText(project.name) || projectIds.has(project.id)) return false
    projectIds.add(project.id)
  }
  const taskIds = new Set<string>()
  for (const row of data.tasks) {
    if (!row || typeof row !== 'object') return false
    const task = row as Record<string, unknown>
    const due = task.due
    if (
      !normalizedText(task.id) || task.id.startsWith('tmp-') || taskIds.has(task.id) ||
      !normalizedText(task.content) || !normalizedText(task.projectId) ||
      !normalizedText(task.url) || task.url !== todoistTaskUrl(task.id) ||
      (task.bucket !== 'overdue' && task.bucket !== 'today' && task.bucket !== 'upcoming') ||
      !Number.isInteger(task.priority) || (task.priority as number) < 1 || (task.priority as number) > 4 ||
      !Array.isArray(task.labels) || !task.labels.every(normalizedText) ||
      !due || typeof due !== 'object' || !normalizedText((due as Record<string, unknown>).date)
    ) return false
    taskIds.add(task.id)
  }
  return true
}

export const todoistDescriptor: ConnectorDescriptor<TodoistConfig> = {
  id: 'todoist',
  label: 'Todoist',
  blurb: 'Due and overdue tasks with project context',
  category: 'calendar-tasks',
  auth: 'token',
  ttlMs: TODOIST_TTL_MS,
  secretFields: ['token'],
  identityField: 'accountLabel',
  identityPhrase: 'to',
  origins: () => [TODOIST_ORIGIN],
  ownsOrigins: (config) =>
    typeof config.token === 'string' && config.token.trim().length > 0 &&
    typeof config.accountLabel === 'string' && config.accountLabel.trim().length > 0,
  redactForBackup: (config) => ({ enabled: config.enabled === true, itemLimit: todoistItemLimit(config) }),
  backupReentryRequired: (config) => config.enabled === true && !(typeof config.token === 'string' && config.token.trim().length > 0),
}
