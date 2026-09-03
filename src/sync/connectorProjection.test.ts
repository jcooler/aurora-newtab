import { describe, expect, it } from 'vitest'

import { COMPLETE_CONNECTOR_CONTRACT_FIXTURES } from '../test/connectorContractFixtures'
import { CONNECTOR_IDS, type ConnectorConfig, type ConnectorId } from '../services/connectors/types'
import {
  applyConnectorPreference,
  CONNECTOR_PROJECTION_IDS,
  projectConnectorPreference,
} from './connectorProjection'

const EXPECTED_PROJECTIONS: Record<ConnectorId, Record<string, unknown> | null> = {
  rss: { enabled: true, shownCount: 5 },
  github: { enabled: true },
  gitlab: { enabled: true },
  jira: { enabled: true, displayName: 'Contract User' },
  vercel: { enabled: true },
  crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
  ics: { enabled: true },
  status: { enabled: true },
  homeassistant: { enabled: true, locationName: 'Contract home' },
  linear: {
    enabled: true,
    displayName: 'Contract Linear user',
    teamIds: ['contract-linear-team'],
    itemLimit: 6,
  },
  sentry: {
    enabled: true,
    organization: 'contract-sentry-org',
    region: 'us',
    projectSlugs: ['contract-sentry-project'],
    itemLimit: 6,
  },
  todoist: {
    enabled: true,
    accountLabel: 'Contract Todoist account',
    projectIds: ['contract-todoist-project'],
    itemLimit: 6,
  },
  onThisDay: { enabled: true },
  publicHolidays: { enabled: true, countryCode: 'US' },
  auroraKp: { enabled: true },
  googleCalendar: null,
}

function secretBearingFixture(id: ConnectorId): ConnectorConfig {
  const base = structuredClone(COMPLETE_CONNECTOR_CONTRACT_FIXTURES[id]) as ConnectorConfig
  return {
    ...base,
    snapshotEpoch: 'epoch_secret_123',
    password: 'password_secret_123',
    providerResponse: { authorization: 'Bearer provider_secret_123' },
    cache: { url: 'https://cache.example.invalid/private?token=cache_secret_123' },
  } as unknown as ConnectorConfig
}

describe('connector sync projection', () => {
  it('requires an explicit projection for every current connector id', () => {
    expect(CONNECTOR_PROJECTION_IDS).toEqual(CONNECTOR_IDS)
    expect(new Set(CONNECTOR_PROJECTION_IDS).size).toBe(CONNECTOR_IDS.length)
  })

  it.each(CONNECTOR_IDS)('projects only the reviewed non-secret fields for %s', (id) => {
    expect(projectConnectorPreference(id, secretBearingFixture(id))).toEqual(EXPECTED_PROJECTIONS[id])
  })

  it('never serializes credentials, capability URLs, caches, origins, or provider responses', () => {
    const projected = CONNECTOR_IDS.map((id) => projectConnectorPreference(id, secretBearingFixture(id)))
    const serialized = JSON.stringify(projected)

    for (const forbidden of [
      'token', 'apiToken', 'password', 'email', 'snapshotEpoch', 'providerResponse', 'cache',
      'instanceUrl', 'site', 'feeds', 'calendars', 'services', 'https://', 'Bearer ', 'secret_123',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('excludes the complete Google Calendar connection and selection config from encrypted sync', () => {
    const local = {
      enabled: true,
      accounts: [{
        connectionId: '52000000-0000-4000-8000-000000000001',
        displayEmail: 'private@example.com',
        calendars: [{ calendarId: 'private-calendar', name: 'Private', color: '#4285f4', primary: true }],
      }],
    } as ConnectorConfig
    expect(projectConnectorPreference('googleCalendar', local)).toBeNull()
    expect(() => applyConnectorPreference('googleCalendar', local, { enabled: true }))
      .toThrow('sync_connector_preference_invalid')
  })

  it('overlays a reviewed preference without replacing local connection authority', () => {
    const local = {
      enabled: false,
      token: 'github_local_token',
      username: 'local-user',
      views: { commitGraph: true, pulls: true, issues: true, notifications: true },
    } satisfies ConnectorConfig

    expect(applyConnectorPreference('github', local, {
      enabled: true,
      views: { commitGraph: false, pulls: true, issues: false, notifications: true },
    })).toEqual({
      enabled: true,
      token: 'github_local_token',
      username: 'local-user',
      views: { commitGraph: false, pulls: true, issues: false, notifications: true },
    })
  })

  it('does not create or enable a connector when local connection authority is absent', () => {
    expect(applyConnectorPreference('github', undefined, { enabled: true })).toBeUndefined()
    expect(applyConnectorPreference('rss', {
      enabled: false,
      feeds: [],
      shownCount: 5,
    }, { enabled: true, shownCount: 8 })).toEqual({ enabled: false, feeds: [], shownCount: 5 })
    expect(applyConnectorPreference('ics', {
      enabled: false,
      calendars: [],
    }, { enabled: true, view: 'upcoming', upcomingCount: 4 })).toEqual({ enabled: false, calendars: [] })
  })

  it('rejects unknown or malformed remote preference fields instead of applying them', () => {
    const local = COMPLETE_CONNECTOR_CONTRACT_FIXTURES.linear
    expect(() => applyConnectorPreference('linear', local, {
      enabled: true,
      displayName: 'Remote user',
      teamIds: ['team'],
      itemLimit: 6,
      futureSecret: 'token_remote',
    })).toThrow('sync_connector_preference_invalid')
    expect(() => applyConnectorPreference('linear', local, {
      enabled: true,
      displayName: 'Remote user',
      teamIds: ['https://unsafe.example.invalid'],
      itemLimit: 6,
    })).toThrow('sync_connector_preference_invalid')
    expect(() => applyConnectorPreference('linear', local, {
      enabled: true,
      displayName: 'https://unsafe.example.invalid/private',
      teamIds: ['team'],
      itemLimit: 6,
    })).toThrow('sync_connector_preference_invalid')
  })

  it('refuses to project a connector whose required safe preference fields are malformed', () => {
    expect(projectConnectorPreference('sentry', {
      ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.sentry,
      region: 'future-region',
    } as unknown as ConnectorConfig)).toBeNull()
  })
})
