import { useEffect, useState } from 'react'
import {
  collectAttentionSignals,
  clearAssignmentLedgerSources,
  reconcileAssignmentSource,
  retainAssignmentLedgerSources,
  type AttentionAssignment,
  type AttentionDeployment,
  type AttentionEvent,
  type AttentionSignal,
} from '../../lib/attention'
import { resolvedLocalTimeZone } from '../../lib/dates'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { usePermissionMirrorRevision } from '../../lib/hooks/usePermissionMirrorRevision'
import { useStorage } from '../../lib/storage/context'
import { DEFAULT_BRIEFING_SOURCES, type AttentionAssignmentSource } from '../../lib/storage/schema'
import { attentionRuntimeScope, attentionSnapshotScope } from '../../services/connectors/attentionPolicy'
import { hasAttentionConnectorPermission } from '../../services/connectors/attentionPermission'
import { resolveGithubViews } from '../../services/connectors/github'
import { DEFAULT_GITLAB_VIEWS } from '../../services/connectors/gitlab'
import { isIcsData, icsCalendarsOf } from '../../services/connectors/ics'
import { DEFAULT_JIRA_VIEWS, normalizeJiraSite } from '../../services/connectors/jira'
import { getConnector } from '../../services/connectors/registry'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import type {
  ConnectorConfig,
  ConnectorSnapshot,
  GithubConfig,
  GitlabConfig,
  IcsConfig,
  JiraConfig,
  LinearConfig,
  VercelConfig,
} from '../../services/connectors/types'
import { DEFAULT_VERCEL_VIEWS } from '../../services/connectors/vercel'
import { resolveViews } from '../../services/connectors/views'
import { weatherRequestIdentity } from '../../services/weather/identity'

const WEATHER_TTL_MS = 30 * 60 * 1_000
const ICS_TTL_MS = getConnector('ics')?.ttlMs ?? 15 * 60 * 1_000

interface AssignmentRow {
  id: string
  title: string
  context: string
  url?: string
}

interface AssignmentProjection {
  source: AttentionAssignmentSource
  sourceLabel: string
  observedAt: number
  generation: string
  rows: AssignmentRow[]
}

interface ScopedProjection {
  ready: boolean
  assignments: AssignmentProjection[]
  deployments: AttentionDeployment[]
  calendar: { fetchedAt: number; events: AttentionEvent[] } | null
}

const EMPTY_PROJECTION: ScopedProjection = {
  ready: false,
  assignments: [],
  deployments: [],
  calendar: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function allowedHttpsUrl(value: unknown, allowedOrigin: string): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.origin === allowedOrigin ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function anyHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function originOf(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

function currentSnapshot(snapshot: ConnectorSnapshot | undefined, now: number): snapshot is ConnectorSnapshot {
  return Boolean(snapshot && Number.isFinite(snapshot.fetchedAt) && snapshot.fetchedAt >= 0 && snapshot.fetchedAt <= now)
}

function rowsFrom(
  rawRows: unknown,
  source: AttentionAssignmentSource,
  sourceLabel: string,
  observedAt: number,
  generation: string,
  project: (row: Record<string, unknown>) => AssignmentRow | null,
): AssignmentProjection | null {
  if (!Array.isArray(rawRows)) return null
  const rows: AssignmentRow[] = []
  const seen = new Set<string>()
  let legacyIdMissing = false
  for (const value of rawRows) {
    if (!isRecord(value)) continue
    const row = project(value)
    if (!row) {
      legacyIdMissing = true
      continue
    }
    if (seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }
  if (rawRows.length > 0 && legacyIdMissing) return null
  return { source, sourceLabel, observedAt, generation, rows }
}

async function validScope(
  id: 'github' | 'gitlab' | 'jira' | 'linear' | 'vercel',
  config: ConnectorConfig,
  snapshot: ConnectorSnapshot,
  runtime: unknown,
): Promise<boolean> {
  return snapshot.scope === await connectorSnapshotScope(id, config, runtime)
}

function githubConfig(value: ConnectorConfig | undefined): GithubConfig | null {
  if (!value || !('token' in value) || !('username' in value)) return null
  const config = value as GithubConfig
  return config.enabled && clean(config.token) && clean(config.username) ? config : null
}

function gitlabConfig(value: ConnectorConfig | undefined): GitlabConfig | null {
  if (!value || !('token' in value) || !('username' in value) || !('instanceUrl' in value)) return null
  const config = value as GitlabConfig
  return config.enabled && clean(config.token) && clean(config.username) && clean(config.instanceUrl) ? config : null
}

function jiraConfig(value: ConnectorConfig | undefined): JiraConfig | null {
  if (!value || !('apiToken' in value) || !('email' in value) || !('site' in value)) return null
  const config = value as JiraConfig
  return config.enabled && clean(config.apiToken) && clean(config.email) && normalizeJiraSite(config.site) ? config : null
}

function linearConfig(value: ConnectorConfig | undefined): LinearConfig | null {
  if (!value || !('token' in value) || !('displayName' in value)) return null
  const config = value as LinearConfig
  return config.enabled && clean(config.token) && clean(config.displayName) ? config : null
}

function vercelConfig(value: ConnectorConfig | undefined): VercelConfig | null {
  if (!value || !('token' in value) || !('username' in value)) return null
  const config = value as VercelConfig
  return config.enabled && clean(config.token) ? config : null
}

export function useAttentionSignals(): { signals: AttentionSignal[]; ready: boolean } {
  const storage = useStorage()
  const [settings] = useStoredKey('settings')
  const [connectors] = useStoredKey('connectors')
  const [snapshots] = useStoredKey('connectorSnapshots')
  const [ledger] = useStoredKey('attentionLedger')
  const [location] = useStoredKey('location')
  const [weatherCache] = useStoredKey('weatherCache')
  const permissionRevision = usePermissionMirrorRevision()
  const now = useNow(60_000, settings?.briefingEnabled === true)
  const [projection, setProjection] = useState<ScopedProjection>(EMPTY_PROJECTION)
  const timeZone = resolvedLocalTimeZone()

  useEffect(() => {
    let live = true
    if (settings === undefined || connectors === undefined || snapshots === undefined) {
      setProjection(EMPTY_PROJECTION)
      return () => { live = false }
    }
    if (settings.briefingEnabled !== true) {
      setProjection({ ready: true, assignments: [], deployments: [], calendar: null })
      return () => { live = false }
    }

    setProjection(EMPTY_PROJECTION)
    const sources = settings.briefingSources ?? DEFAULT_BRIEFING_SOURCES
    const runtime = attentionRuntimeScope(true, sources)
    const nowMs = now.getTime()

    void (async () => {
      const assignments: AssignmentProjection[] = []
      const deployments: AttentionDeployment[] = []
      let calendar: ScopedProjection['calendar'] = null

      if (sources.assignments && runtime?.assignments) {
        const github = githubConfig(connectors.github)
        const githubSnapshot = snapshots.github
        const githubViews = github ? resolveGithubViews(github) : null
        const githubScope = githubViews
          ? attentionSnapshotScope(runtime, 'assignments', githubViews.pulls && githubViews.issues)
          : undefined
        if (github && hasAttentionConnectorPermission('github', github) && currentSnapshot(githubSnapshot, nowMs) && await validScope('github', github, githubSnapshot, githubScope)) {
          const data = isRecord(githubSnapshot.data) ? githubSnapshot.data : null
          const rawRows = data && Array.isArray(data.prs) && Array.isArray(data.issues) ? [...data.prs, ...data.issues] : null
          const projected = rowsFrom(rawRows, 'github', 'GitHub', githubSnapshot.fetchedAt, githubSnapshot.scope!, (row) => {
            const id = clean(row.id)
            if (!id) return null
            return {
              id,
              title: clean(row.title),
              context: clean(row.repo),
              ...(allowedHttpsUrl(row.url, 'https://github.com') ? { url: allowedHttpsUrl(row.url, 'https://github.com') } : {}),
            }
          })
          if (projected) assignments.push(projected)
        }

        const gitlab = gitlabConfig(connectors.gitlab)
        const gitlabSnapshot = snapshots.gitlab
        const gitlabViews = gitlab ? resolveViews(DEFAULT_GITLAB_VIEWS, gitlab.views) : null
        const gitlabScope = gitlabViews
          ? attentionSnapshotScope(runtime, 'assignments', gitlabViews.mergeRequests && gitlabViews.reviewAsks)
          : undefined
        if (gitlab && hasAttentionConnectorPermission('gitlab', gitlab) && currentSnapshot(gitlabSnapshot, nowMs) && await validScope('gitlab', gitlab, gitlabSnapshot, gitlabScope)) {
          const data = isRecord(gitlabSnapshot.data) ? gitlabSnapshot.data : null
          const rawRows = data && Array.isArray(data.mrs) && Array.isArray(data.reviewMrs) ? [...data.mrs, ...data.reviewMrs] : null
          const origin = originOf(gitlab.instanceUrl)
          const projected = rowsFrom(rawRows, 'gitlab', 'GitLab', gitlabSnapshot.fetchedAt, gitlabSnapshot.scope!, (row) => {
            const id = clean(row.id)
            if (!id) return null
            const url = origin ? allowedHttpsUrl(row.url, origin) : undefined
            return { id, title: clean(row.title), context: clean(row.project), ...(url ? { url } : {}) }
          })
          if (projected) assignments.push(projected)
        }

        const jira = jiraConfig(connectors.jira)
        const jiraSnapshot = snapshots.jira
        const jiraViews = jira ? resolveViews(DEFAULT_JIRA_VIEWS, jira.views) : null
        const jiraScope = jiraViews ? attentionSnapshotScope(runtime, 'assignments', jiraViews.assigned) : undefined
        if (jira && hasAttentionConnectorPermission('jira', jira) && currentSnapshot(jiraSnapshot, nowMs) && await validScope('jira', jira, jiraSnapshot, jiraScope)) {
          const data = isRecord(jiraSnapshot.data) ? jiraSnapshot.data : null
          const site = normalizeJiraSite(jira.site)
          const origin = site ? `https://${site}` : ''
          const projected = rowsFrom(data?.issues, 'jira', 'Jira', jiraSnapshot.fetchedAt, jiraSnapshot.scope!, (row) => {
            const id = clean(row.key)
            if (!id) return null
            const status = clean(row.status)
            const url = allowedHttpsUrl(row.url, origin)
            return { id, title: clean(row.summary), context: status ? `${id} · ${status}` : id, ...(url ? { url } : {}) }
          })
          if (projected) assignments.push(projected)
        }

        const linear = linearConfig(connectors.linear)
        const linearSnapshot = snapshots.linear
        if (linear && hasAttentionConnectorPermission('linear', linear) && currentSnapshot(linearSnapshot, nowMs) && await validScope('linear', linear, linearSnapshot, undefined)) {
          const data = isRecord(linearSnapshot.data) ? linearSnapshot.data : null
          const projected = rowsFrom(data?.issues, 'linear', 'Linear', linearSnapshot.fetchedAt, linearSnapshot.scope!, (row) => {
            const id = clean(row.id)
            if (!id) return null
            const identifier = clean(row.identifier)
            const team = isRecord(row.team) ? clean(row.team.name) : ''
            const context = [identifier, team].filter(Boolean).join(' · ')
            const url = allowedHttpsUrl(row.url, 'https://linear.app')
            return { id, title: clean(row.title), context, ...(url ? { url } : {}) }
          })
          if (projected) assignments.push(projected)
        }
      }

      if (sources.deployments && runtime?.deployments) {
        const vercel = vercelConfig(connectors.vercel)
        const vercelSnapshot = snapshots.vercel
        const vercelViews = vercel ? resolveViews(DEFAULT_VERCEL_VIEWS, vercel.views) : null
        const vercelScope = vercelViews ? attentionSnapshotScope(runtime, 'deployments', vercelViews.deployments) : undefined
        if (vercel && hasAttentionConnectorPermission('vercel', vercel) && currentSnapshot(vercelSnapshot, nowMs) && await validScope('vercel', vercel, vercelSnapshot, vercelScope)) {
          const data = isRecord(vercelSnapshot.data) ? vercelSnapshot.data : null
          const raw = data?.deployments
          if (Array.isArray(raw)) {
            for (const value of raw) {
              if (!isRecord(value)) continue
              const project = clean(value.project)
              const state = clean(value.state)
              const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Number.NaN
              if (!project || !state || !Number.isFinite(createdAt)) continue
              const url = anyHttpsUrl(value.url)
              deployments.push({
                id: `${createdAt}:${project}`,
                project,
                state,
                createdAt,
                ...(url ? { url } : {}),
              })
            }
          }
        }
      }

      const ics = connectors.ics as IcsConfig | undefined
      const icsSnapshot = snapshots.ics
      if (
        sources.calendar && ics?.enabled && icsCalendarsOf(ics).length > 0 &&
        hasAttentionConnectorPermission('ics', ics) &&
        currentSnapshot(icsSnapshot, nowMs) && isIcsData(icsSnapshot.data) &&
        icsSnapshot.scope === await connectorSnapshotScope('ics', ics, { timeZone })
      ) {
        calendar = {
          fetchedAt: icsSnapshot.fetchedAt,
          events: icsSnapshot.data.events.map(({ summary, start, end, allDay }) => ({ summary, start, end, allDay })),
        }
      }

      if (live) setProjection({ ready: true, assignments, deployments, calendar })
    })().catch(() => {
      if (live) setProjection({ ready: true, assignments: [], deployments: [], calendar: null })
    })

    return () => { live = false }
  }, [connectors, now, permissionRevision, settings, snapshots, timeZone])

  useEffect(() => {
    if (settings === undefined || connectors === undefined) return
    const sources = settings.briefingSources ?? DEFAULT_BRIEFING_SOURCES
    if (settings.briefingEnabled !== true || !sources.assignments) {
      void storage.update('attentionLedger', clearAssignmentLedgerSources)
      return
    }
    const active = new Set<AttentionAssignmentSource>()
    const github = githubConfig(connectors.github)
    const gitlab = gitlabConfig(connectors.gitlab)
    const jira = jiraConfig(connectors.jira)
    const linear = linearConfig(connectors.linear)
    if (github && hasAttentionConnectorPermission('github', github)) active.add('github')
    if (gitlab && hasAttentionConnectorPermission('gitlab', gitlab)) active.add('gitlab')
    if (jira && hasAttentionConnectorPermission('jira', jira)) active.add('jira')
    if (linear && hasAttentionConnectorPermission('linear', linear)) active.add('linear')
    void storage.update('attentionLedger', (current) => retainAssignmentLedgerSources(current, active))
  }, [connectors, permissionRevision, settings, storage])

  useEffect(() => {
    if (!projection.ready || projection.assignments.length === 0) return
    void storage.update('attentionLedger', (current) => {
      let next = current
      for (const source of projection.assignments) {
        next = reconcileAssignmentSource(next, source.source, source.rows.map((row) => row.id), source.observedAt, source.generation)
      }
      return next
    })
  }, [projection.assignments, projection.ready, storage])

  const hydrated = settings !== undefined && connectors !== undefined && snapshots !== undefined &&
    ledger !== undefined && location !== undefined && weatherCache !== undefined
  if (!hydrated || !projection.ready || settings.briefingEnabled !== true) return { signals: [], ready: hydrated && projection.ready }

  const sources = settings.briefingSources ?? DEFAULT_BRIEFING_SOURCES
  const assignments: AttentionAssignment[] = sources.assignments
    ? projection.assignments.flatMap((source) => source.rows.map((row) => ({
      id: row.id,
      source: source.source,
      sourceLabel: source.sourceLabel,
      title: row.title,
      context: row.context,
      firstSeenAt: ledger.sources[source.source]?.items[row.id]?.firstSeenAt ?? null,
      ...(row.url ? { url: row.url } : {}),
    })))
    : []

  const nowMs = now.getTime()
  const events = sources.calendar && projection.calendar &&
    projection.calendar.fetchedAt <= nowMs && nowMs - projection.calendar.fetchedAt < ICS_TTL_MS
    ? projection.calendar.events
    : []
  let hourly: Array<{ time: string; precipProb: number }> = []
  if (
    sources.rain && location && weatherCache && weatherCache.fetchedAt <= nowMs &&
    nowMs - weatherCache.fetchedAt < WEATHER_TTL_MS
  ) {
    try {
      if (weatherCache.requestIdentity === weatherRequestIdentity(location.lat, location.lon)) {
        hourly = weatherCache.hourly.map(({ time, precipProb }) => ({ time, precipProb }))
      }
    } catch {
      hourly = []
    }
  }

  return {
    ready: true,
    signals: collectAttentionSignals({
      now: nowMs,
      use24Hour: settings.use24Hour,
      events,
      assignments,
      deployments: sources.deployments ? projection.deployments : [],
      hourly,
    }),
  }
}
