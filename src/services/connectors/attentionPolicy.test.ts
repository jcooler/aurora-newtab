import { describe, expect, it } from 'vitest'
import { DEFAULT_GITHUB_VIEWS } from './github'
import { DEFAULT_GITLAB_VIEWS } from './gitlab'
import { DEFAULT_JIRA_VIEWS } from './jira'
import { DEFAULT_VERCEL_VIEWS } from './vercel'
import * as attentionPolicy from './attentionPolicy'
import {
  attentionRuntimeScope,
  effectiveGithubViews,
  effectiveGitlabViews,
  effectiveJiraViews,
  effectiveVercelViews,
} from './attentionPolicy'

const ALL_SOURCES = {
  calendar: true,
  assignments: true,
  deployments: true,
  rain: true,
}

describe('attention connector fetch policy', () => {
  it('adds assignment and deployment data to fetch views without changing unrelated choices', () => {
    const runtime = attentionRuntimeScope(true, ALL_SOURCES)

    expect(runtime).toEqual({ assignments: true, deployments: true })
    expect(effectiveGithubViews({ commitGraph: false, pulls: false, issues: false, notifications: false }, runtime)).toEqual({
      commitGraph: false,
      pulls: true,
      issues: true,
      notifications: false,
    })
    expect(effectiveGitlabViews({ mergeRequests: false, reviewAsks: false, todos: false, activityGraph: false }, runtime)).toEqual({
      mergeRequests: true,
      reviewAsks: true,
      todos: false,
      activityGraph: false,
    })
    expect(effectiveJiraViews({ assigned: false, statusChips: false, dueSoon: false }, runtime)).toEqual({
      assigned: true,
      statusChips: false,
      dueSoon: false,
    })
    expect(effectiveVercelViews({ deployments: false, statusSummary: false }, runtime)).toEqual({
      deployments: true,
      statusSummary: false,
    })
  })

  it('preserves legacy snapshot identity and original views when attention fetching is inactive', () => {
    const runtime = attentionRuntimeScope(false, ALL_SOURCES)

    expect(runtime).toBeUndefined()
    expect(effectiveGithubViews(DEFAULT_GITHUB_VIEWS, runtime)).toEqual(DEFAULT_GITHUB_VIEWS)
    expect(effectiveGitlabViews(DEFAULT_GITLAB_VIEWS, runtime)).toEqual(DEFAULT_GITLAB_VIEWS)
    expect(effectiveJiraViews(DEFAULT_JIRA_VIEWS, runtime)).toEqual(DEFAULT_JIRA_VIEWS)
    expect(effectiveVercelViews(DEFAULT_VERCEL_VIEWS, runtime)).toEqual(DEFAULT_VERCEL_VIEWS)
  })

  it('keeps one shared runtime identity while independently disabling a source', () => {
    expect(attentionRuntimeScope(true, { ...ALL_SOURCES, assignments: false })).toEqual({
      assignments: false,
      deployments: true,
    })
    expect(attentionRuntimeScope(true, { ...ALL_SOURCES, deployments: false })).toEqual({
      assignments: true,
      deployments: false,
    })
    expect(attentionRuntimeScope(true, { ...ALL_SOURCES, assignments: false, deployments: false })).toBeUndefined()
  })

  it('scopes connector caches only when attention adds data the configured views do not already fetch', () => {
    const candidate = (attentionPolicy as unknown as Record<string, unknown>).attentionSnapshotScope
    expect(candidate).toBeTypeOf('function')
    if (typeof candidate !== 'function') return
    const resolveScope = candidate as (
      runtime: ReturnType<typeof attentionRuntimeScope>,
      source: 'assignments' | 'deployments',
      configuredViewsAlreadyFetchSource: boolean,
    ) => unknown
    const runtime = attentionRuntimeScope(true, ALL_SOURCES)
    const assignmentsOnly = attentionRuntimeScope(true, { ...ALL_SOURCES, deployments: false })
    const deploymentsOnly = attentionRuntimeScope(true, { ...ALL_SOURCES, assignments: false })

    expect(resolveScope(runtime, 'assignments', true)).toBeUndefined()
    expect(resolveScope(runtime, 'deployments', true)).toBeUndefined()
    expect(resolveScope(runtime, 'assignments', false)).toEqual({ assignments: true })
    expect(resolveScope(assignmentsOnly, 'assignments', false)).toEqual({ assignments: true })
    expect(resolveScope(runtime, 'deployments', false)).toEqual({ deployments: true })
    expect(resolveScope(deploymentsOnly, 'deployments', false)).toEqual({ deployments: true })
    expect(resolveScope(deploymentsOnly, 'assignments', false)).toBeUndefined()
    expect(resolveScope(assignmentsOnly, 'deployments', false)).toBeUndefined()
  })
})
