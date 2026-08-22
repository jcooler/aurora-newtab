import type { ConnectorConfig, ConnectorId } from '../services/connectors/types'

/** Complete, inert connector rows for cross-authority contract tests only. */
export const COMPLETE_CONNECTOR_CONTRACT_FIXTURES = {
  rss: {
    enabled: true,
    feeds: ['https://news.example.invalid/feed.xml'],
    shownCount: 5,
  },
  github: {
    enabled: true,
    token: 'contract-token',
    username: 'contract-user',
  },
  gitlab: {
    enabled: true,
    token: 'contract-token',
    instanceUrl: 'https://gitlab.example.invalid',
    username: 'contract-user',
  },
  jira: {
    enabled: true,
    email: 'contract-user@example.invalid',
    apiToken: 'contract-token',
    site: 'contract-fixture.atlassian.net',
    displayName: 'Contract User',
  },
  vercel: {
    enabled: true,
    token: 'contract-token',
    username: 'contract-user',
  },
  crypto: {
    enabled: true,
    coins: ['bitcoin', 'ethereum'],
  },
  ics: {
    enabled: true,
    url: 'https://legacy-calendar.example.invalid/private.ics',
    calendars: [{ name: 'Contract calendar', url: 'https://calendar.example.invalid/private.ics' }],
  },
  status: {
    enabled: true,
    services: [{ name: 'Contract service', url: 'https://status.example.invalid/api/v2/status.json' }],
  },
  homeassistant: {
    enabled: true,
    instanceUrl: 'https://home.example.invalid',
    token: 'contract-token',
    locationName: 'Contract home',
  },
} as const satisfies Record<ConnectorId, ConnectorConfig>
