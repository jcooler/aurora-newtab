import type { BriefingSources } from '../../lib/storage/schema'
import type { GithubViews, GitlabViews, JiraViews, VercelViews } from './types'

export interface ActiveAttentionRuntimeScope {
  assignments: boolean
  deployments: boolean
}

export type AttentionRuntimeScope = ActiveAttentionRuntimeScope | undefined

export function attentionRuntimeScope(
  briefingEnabled: boolean,
  sources: BriefingSources,
): AttentionRuntimeScope {
  const assignments = briefingEnabled && sources.assignments
  const deployments = briefingEnabled && sources.deployments
  return assignments || deployments ? { assignments, deployments } : undefined
}

export function effectiveGithubViews(
  views: GithubViews,
  runtime: AttentionRuntimeScope,
): GithubViews {
  return runtime?.assignments
    ? { ...views, pulls: true, issues: true }
    : { ...views }
}

export function effectiveGitlabViews(
  views: GitlabViews,
  runtime: AttentionRuntimeScope,
): GitlabViews {
  return runtime?.assignments
    ? { ...views, mergeRequests: true, reviewAsks: true }
    : { ...views }
}

export function effectiveJiraViews(
  views: JiraViews,
  runtime: AttentionRuntimeScope,
): JiraViews {
  return runtime?.assignments
    ? { ...views, assigned: true }
    : { ...views }
}

export function effectiveVercelViews(
  views: VercelViews,
  runtime: AttentionRuntimeScope,
): VercelViews {
  return runtime?.deployments
    ? { ...views, deployments: true }
    : { ...views }
}
