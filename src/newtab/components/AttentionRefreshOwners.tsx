import { useConnectorSnapshot } from '../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { DEFAULT_BRIEFING_SOURCES } from '../../lib/storage/schema'
import {
  attentionRuntimeScope,
  effectiveGithubViews,
  effectiveGitlabViews,
  effectiveJiraViews,
  effectiveVercelViews,
  type ActiveAttentionRuntimeScope,
} from '../../services/connectors/attentionPolicy'
import { fetchGithub, resolveGithubViews, type GithubData } from '../../services/connectors/github'
import { fetchGitlab, DEFAULT_GITLAB_VIEWS, type GitlabData } from '../../services/connectors/gitlab'
import { fetchJira, DEFAULT_JIRA_VIEWS, type JiraData } from '../../services/connectors/jira'
import { fetchLinearWork, isLinearWorkData, linearTeamIds, type LinearWorkData } from '../../services/connectors/linear'
import type {
  ConnectorConfig,
  GithubConfig,
  GitlabConfig,
  JiraConfig,
  LinearConfig,
  VercelConfig,
} from '../../services/connectors/types'
import { fetchVercel, DEFAULT_VERCEL_VIEWS, type VercelData } from '../../services/connectors/vercel'
import { resolveViews } from '../../services/connectors/views'

function connectedGithub(config: ConnectorConfig | undefined): GithubConfig | null {
  if (!config || !('token' in config) || !('username' in config)) return null
  const candidate = config as GithubConfig
  return candidate.enabled && candidate.token.trim() && candidate.username.trim() ? candidate : null
}

function connectedGitlab(config: ConnectorConfig | undefined): GitlabConfig | null {
  if (!config || !('instanceUrl' in config) || !('username' in config) || !('token' in config)) return null
  const candidate = config as GitlabConfig
  return candidate.enabled && candidate.token.trim() && candidate.instanceUrl.trim() && candidate.username.trim() ? candidate : null
}

function connectedJira(config: ConnectorConfig | undefined): JiraConfig | null {
  if (!config || !('apiToken' in config) || !('email' in config) || !('site' in config)) return null
  const candidate = config as JiraConfig
  return candidate.enabled && candidate.apiToken.trim() && candidate.email.trim() && candidate.site.trim() ? candidate : null
}

function connectedVercel(config: ConnectorConfig | undefined): VercelConfig | null {
  if (!config || !('token' in config) || !('username' in config)) return null
  const candidate = config as VercelConfig
  return candidate.enabled && candidate.token.trim() ? candidate : null
}

function connectedLinear(config: ConnectorConfig | undefined): LinearConfig | null {
  if (!config || !('displayName' in config) || !('token' in config)) return null
  const candidate = config as LinearConfig
  return candidate.enabled && candidate.token.trim() && candidate.displayName.trim() ? candidate : null
}

function GithubRefreshOwner({ config, runtime }: { config: GithubConfig; runtime: ActiveAttentionRuntimeScope }) {
  const views = effectiveGithubViews(resolveGithubViews(config), runtime)
  useConnectorSnapshot<GithubData>(
    'github',
    config,
    (previous) => fetchGithub(config.token, previous, views),
    undefined,
    runtime,
  )
  return null
}

function GitlabRefreshOwner({ config, runtime }: { config: GitlabConfig; runtime: ActiveAttentionRuntimeScope }) {
  const views = effectiveGitlabViews(resolveViews(DEFAULT_GITLAB_VIEWS, config.views), runtime)
  useConnectorSnapshot<GitlabData>(
    'gitlab',
    config,
    (previous) => fetchGitlab(config.instanceUrl, config.token, config.username, views, previous),
    undefined,
    runtime,
  )
  return null
}

function JiraRefreshOwner({ config, runtime }: { config: JiraConfig; runtime: ActiveAttentionRuntimeScope }) {
  const views = effectiveJiraViews(resolveViews(DEFAULT_JIRA_VIEWS, config.views), runtime)
  useConnectorSnapshot<JiraData>(
    'jira',
    config,
    (previous) => fetchJira(config.site, config.email, config.apiToken, views, previous),
    undefined,
    runtime,
  )
  return null
}

function VercelRefreshOwner({ config, runtime }: { config: VercelConfig; runtime: ActiveAttentionRuntimeScope }) {
  const views = effectiveVercelViews(resolveViews(DEFAULT_VERCEL_VIEWS, config.views), runtime)
  useConnectorSnapshot<VercelData>(
    'vercel',
    config,
    (previous) => fetchVercel(config.token, views, previous),
    undefined,
    runtime,
  )
  return null
}

function LinearRefreshOwner({ config, runtime }: { config: LinearConfig; runtime: ActiveAttentionRuntimeScope }) {
  useConnectorSnapshot<LinearWorkData>(
    'linear',
    config,
    () => fetchLinearWork(config.token, linearTeamIds(config)),
    undefined,
    runtime,
    isLinearWorkData,
  )
  return null
}

export default function AttentionRefreshOwners() {
  const [settings] = useStoredKey('settings')
  const [connectors] = useStoredKey('connectors')
  const sources = settings?.briefingSources ?? DEFAULT_BRIEFING_SOURCES
  const runtime = attentionRuntimeScope(settings?.briefingEnabled === true, sources)
  if (!runtime || !connectors) return null

  const github = runtime.assignments ? connectedGithub(connectors.github) : null
  const gitlab = runtime.assignments ? connectedGitlab(connectors.gitlab) : null
  const jira = runtime.assignments ? connectedJira(connectors.jira) : null
  const linear = runtime.assignments ? connectedLinear(connectors.linear) : null
  const vercel = runtime.deployments ? connectedVercel(connectors.vercel) : null

  return (
    <>
      {github ? <GithubRefreshOwner config={github} runtime={runtime} /> : null}
      {gitlab ? <GitlabRefreshOwner config={gitlab} runtime={runtime} /> : null}
      {jira ? <JiraRefreshOwner config={jira} runtime={runtime} /> : null}
      {linear ? <LinearRefreshOwner config={linear} runtime={runtime} /> : null}
      {vercel ? <VercelRefreshOwner config={vercel} runtime={runtime} /> : null}
    </>
  )
}
