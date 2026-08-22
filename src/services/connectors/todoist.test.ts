import { describe, expect, it, vi } from 'vitest'
import {
  classifyTodoistDue,
  closeTodoistTask,
  fetchTodoistProjects,
  fetchTodoistTasks,
  todoistTaskUrl,
  isTodoistData,
  type TodoistProject,
  type TodoistTask,
} from './todoist'

function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

async function capturedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('Expected an Error rejection')
  }
  throw new Error('Expected promise to reject')
}

describe('fetchTodoistProjects', () => {
  it('uses the exact v1 projects path with bearer auth and normalizes only actionable projects', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      body: {
        results: [
          { id: 'p-work', name: 'Work' },
          { id: 'p-work', name: 'Duplicate is ignored' },
          { id: 'tmp-project', name: 'Temporary' },
          { id: 'p-personal', name: '  Personal  ' },
          { id: '', name: 'Missing id' },
          { id: 'p-no-name' },
          null,
        ],
        next_cursor: null,
      },
    }))

    const result = await fetchTodoistProjects('todoist-secret', fetchFn as unknown as typeof fetch)

    expect(result).toEqual<TodoistProject[]>([
      { id: 'p-work', name: 'Work' },
      { id: 'p-personal', name: 'Personal' },
    ])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.todoist.com/api/v1/projects?limit=200',
      expect.objectContaining({
        headers: { Authorization: 'Bearer todoist-secret' },
        signal: expect.anything(),
      }),
    )
  })

  it('follows one opaque cursor with the original limit preserved and encoded', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({
        status: 200,
        body: { results: [{ id: 'p1', name: 'One' }], next_cursor: 'page 2/+=' },
      }))
      .mockResolvedValueOnce(fakeResponse({
        status: 200,
        body: { results: [{ id: 'p2', name: 'Two' }], next_cursor: null },
      }))

    const result = await fetchTodoistProjects('token', fetchFn as unknown as typeof fetch)

    expect(result).toEqual([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }])
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[1][0]).toBe(
      'https://api.todoist.com/api/v1/projects?limit=200&cursor=page+2%2F%2B%3D',
    )
  })

  it('rejects a third cursor after two pages instead of returning incomplete project truth', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { results: [], next_cursor: 'two' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { results: [], next_cursor: 'three' } }))

    const error = await capturedError(fetchTodoistProjects('token', fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist returned more than two pages.')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('returns a sanitized error that cannot leak token or provider response content', async () => {
    const token = 'super-secret-token'
    const responseSecret = 'private response body'
    const res = fakeResponse({ ok: false, status: 401, body: { detail: responseSecret } })
    const fetchFn = vi.fn(async () => res)

    const error = await capturedError(fetchTodoistProjects(token, fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist request failed with status 401.')
    expect(error.message).not.toContain(token)
    expect(error.message).not.toContain(responseSecret)
    expect(res.json).not.toHaveBeenCalled()
  })
})

describe('Todoist due-day classification', () => {
  const now = new Date('2026-03-08T05:30:00.000Z')
  const timeZone = 'America/New_York'

  it('compares date-only values as calendar days without UTC parsing', () => {
    expect(classifyTodoistDue('2026-03-07', now, timeZone)).toBe('overdue')
    expect(classifyTodoistDue('2026-03-08', now, timeZone)).toBe('today')
    expect(classifyTodoistDue('2026-03-09', now, timeZone)).toBe('upcoming')
  })

  it('classifies RFC3339 instants in the explicit local time zone across DST', () => {
    expect(classifyTodoistDue('2026-03-07T23:30:00-05:00', now, timeZone)).toBe('overdue')
    expect(classifyTodoistDue('2026-03-08T01:00:00-05:00', now, timeZone)).toBe('today')
    expect(classifyTodoistDue('2026-03-09T00:30:00-04:00', now, timeZone)).toBe('upcoming')
  })

  it('uses the RFC3339 instant rather than its written date prefix', () => {
    expect(classifyTodoistDue('2026-03-09T00:30:00+14:00', now, timeZone)).toBe('today')
  })

  it('rejects malformed or offset-free date-time values', () => {
    expect(classifyTodoistDue('March 8', now, timeZone)).toBeNull()
    expect(classifyTodoistDue('2026-03-08T12:00:00', now, timeZone)).toBeNull()
    expect(classifyTodoistDue('2026-02-31', now, timeZone)).toBeNull()
  })
})

describe('todoistTaskUrl', () => {
  it('builds the exact provider deep link with an encoded task id', () => {
    expect(todoistTaskUrl('task/one two')).toBe('https://app.todoist.com/app/task/task%2Fone%20two')
  })
})

describe('fetchTodoistTasks', () => {
  const clock = { now: new Date('2026-03-08T05:30:00.000Z'), timeZone: 'America/New_York' }

  it('uses the exact v1 tasks path with bearer auth and preserves normalized task facts', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      body: {
        results: [{
          id: 'task/one',
          content: '  Ship Aurora  ',
          project_id: 'p-work',
          due: {
            date: '2026-03-08',
            datetime: null,
            timezone: 'America/New_York',
            string: 'every day',
            is_recurring: true,
          },
          priority: 4,
          labels: ['release', '', 'release', 'owner'],
          duration: { amount: 30, unit: 'minute' },
          parent_id: 'parent-one',
          is_completed: false,
        }],
        next_cursor: null,
      },
    }))

    const result = await fetchTodoistTasks('todoist-secret', clock, fetchFn as unknown as typeof fetch)

    expect(result).toEqual<TodoistTask[]>([{
      id: 'task/one',
      content: 'Ship Aurora',
      projectId: 'p-work',
      due: {
        date: '2026-03-08',
        datetime: null,
        timeZone: 'America/New_York',
        text: 'every day',
        isRecurring: true,
      },
      priority: 4,
      labels: ['release', 'owner'],
      duration: { amount: 30, unit: 'minute' },
      parentId: 'parent-one',
      bucket: 'today',
      url: 'https://app.todoist.com/app/task/task%2Fone',
    }])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.todoist.com/api/v1/tasks?limit=200',
      expect.objectContaining({
        headers: { Authorization: 'Bearer todoist-secret' },
        signal: expect.anything(),
      }),
    )
  })

  it('keeps only selected projects and skips temporary, completed, duplicate, undated, and malformed rows', async () => {
    const valid = (id: string, projectId: string, due: unknown = { date: '2026-03-09' }) => ({
      id,
      content: `Task ${id}`,
      project_id: projectId,
      due,
      priority: 1,
      labels: [],
      duration: null,
      parent_id: null,
    })
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      body: {
        results: [
          valid('keep', 'selected'),
          valid('other-project', 'other'),
          valid('tmp-pending', 'selected'),
          { ...valid('completed', 'selected'), is_completed: true },
          { ...valid('checked', 'selected'), checked: true },
          { ...valid('completed-at', 'selected'), completed_at: '2026-03-01T00:00:00Z' },
          { ...valid('keep', 'selected'), content: 'Duplicate' },
          { ...valid('undated', 'selected'), due: null },
          valid('bad-due', 'selected', { date: 'not-a-date' }),
          { ...valid('bad-priority', 'selected'), priority: 9 },
          { ...valid('bad-labels', 'selected'), labels: null },
          { ...valid('bad-duration', 'selected'), duration: { amount: -1, unit: 'minute' } },
          { ...valid('missing-content', 'selected'), content: '' },
          null,
        ],
        next_cursor: null,
      },
    }))

    const result = await fetchTodoistTasks(
      'token',
      { ...clock, projectIds: [' selected ', 'selected', '', 'missing'] },
      fetchFn as unknown as typeof fetch,
    )

    expect(result.map((task) => task.id)).toEqual(['keep'])
  })

  it('uses RFC3339 datetime when present and classifies overdue, today, and upcoming deterministically', async () => {
    const task = (id: string, date: string, datetime: string | null) => ({
      id,
      content: id,
      project_id: 'p',
      due: { date, datetime, is_recurring: false },
      priority: 1,
      labels: [],
      duration: null,
      parent_id: null,
    })
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      body: {
        results: [
          task('upcoming', '2026-03-09', '2026-03-09T00:30:00-04:00'),
          task('today-offset', '2026-03-09', '2026-03-09T00:30:00+14:00'),
          task('overdue', '2026-03-07', null),
        ],
        next_cursor: null,
      },
    }))

    const result = await fetchTodoistTasks('token', clock, fetchFn as unknown as typeof fetch)

    expect(result.map(({ id, bucket }) => ({ id, bucket }))).toEqual([
      { id: 'overdue', bucket: 'overdue' },
      { id: 'today-offset', bucket: 'today' },
      { id: 'upcoming', bucket: 'upcoming' },
    ])
  })

  it('sorts before applying the hard 25-task ceiling so the nearest due truth wins', async () => {
    const results = Array.from({ length: 30 }, (_, index) => ({
      id: `task-${index}`,
      content: `Task ${index}`,
      project_id: 'p',
      due: { date: `2026-04-${String(30 - index).padStart(2, '0')}` },
      priority: 1,
      labels: [],
      duration: null,
      parent_id: null,
    }))
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: { results, next_cursor: null } }))

    const result = await fetchTodoistTasks('token', clock, fetchFn as unknown as typeof fetch)

    expect(result).toHaveLength(25)
    expect(result[0].id).toBe('task-29')
    expect(result[24].id).toBe('task-5')
  })

  it('preserves task query parameters on page two and rejects a third cursor', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { results: [], next_cursor: 'next/cursor' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { results: [], next_cursor: 'third' } }))

    const error = await capturedError(fetchTodoistTasks('token', clock, fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist returned more than two pages.')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[1][0]).toBe(
      'https://api.todoist.com/api/v1/tasks?limit=200&cursor=next%2Fcursor',
    )
  })

  it('sanitizes network failures even when the thrown message contains token and task content', async () => {
    const token = 'private-token'
    const title = 'Private task title'
    const fetchFn = vi.fn(async () => {
      throw new Error(`request ${token} failed while loading ${title}`)
    })

    const error = await capturedError(fetchTodoistTasks(token, clock, fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist request failed.')
    expect(error.message).not.toContain(token)
    expect(error.message).not.toContain(title)
  })
})

describe('closeTodoistTask', () => {
  it('POSTs the exact encoded close path with bearer auth and no request body', async () => {
    const res = fakeResponse({ status: 204 })
    const fetchFn = vi.fn(async () => res)

    const result = await closeTodoistTask('todoist-secret', 'task/one two', fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: true, status: 204 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchFn.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(url).toBe('https://api.todoist.com/api/v1/tasks/task%2Fone%20two/close')
    expect(init).toEqual(expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer todoist-secret' },
      signal: expect.anything(),
    }))
    expect(init).not.toHaveProperty('body')
    expect(res.json).not.toHaveBeenCalled()
  })

  it('rejects temporary and empty ids before issuing a request', async () => {
    const fetchFn = vi.fn()

    await expect(closeTodoistTask('token', 'tmp-local', fetchFn as unknown as typeof fetch))
      .rejects.toThrow('Todoist temporary tasks cannot be completed.')
    await expect(closeTodoistTask('token', '   ', fetchFn as unknown as typeof fetch))
      .rejects.toThrow('Todoist task id is invalid.')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('accepts only the documented 204 response even when another 2xx status is ok', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200 }))

    const error = await capturedError(closeTodoistTask('token', 'task-one', fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist close returned unexpected status 200.')
  })

  it('sanitizes close failures without leaking token, task content, or response body', async () => {
    const token = 'private-token'
    const title = 'Private task title'
    const responseSecret = 'private provider body'
    const res = fakeResponse({ ok: false, status: 500, body: { detail: responseSecret } })
    const fetchFn = vi.fn(async () => {
      void title
      return res
    })

    const error = await capturedError(closeTodoistTask(token, 'task-one', fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist close failed with status 500.')
    expect(error.message).not.toContain(token)
    expect(error.message).not.toContain(title)
    expect(error.message).not.toContain(responseSecret)
    expect(res.json).not.toHaveBeenCalled()
  })

  it('sanitizes a rejecting fetch even when its message contains private inputs', async () => {
    const token = 'private-token'
    const title = 'Private task title'
    const fetchFn = vi.fn(async () => {
      throw new Error(`${token}: ${title}`)
    })

    const error = await capturedError(closeTodoistTask(token, 'task-one', fetchFn as unknown as typeof fetch))

    expect(error.message).toBe('Todoist close failed.')
    expect(error.message).not.toContain(token)
    expect(error.message).not.toContain(title)
  })
})

describe('isTodoistData', () => {
  const task: TodoistTask = {
    id: 'task-one',
    content: 'Ship Aurora',
    projectId: 'p-work',
    due: { date: '2026-08-22', datetime: null, timeZone: null, text: 'today', isRecurring: false },
    priority: 4,
    labels: ['release'],
    duration: null,
    parentId: null,
    bucket: 'today',
    url: 'https://app.todoist.com/app/task/task-one',
  }

  it('accepts a normalized projects and tasks snapshot and rejects unsafe or oversized rows', () => {
    expect(isTodoistData({ projects: [{ id: 'p-work', name: 'Work' }], tasks: [task] })).toBe(true)
    expect(isTodoistData({ projects: [{ id: 'p-work', name: 'Work' }], tasks: [{ ...task, url: 'https://evil.example/task' }] })).toBe(false)
    expect(isTodoistData({ projects: [], tasks: Array.from({ length: 26 }, () => task) })).toBe(false)
  })
})
