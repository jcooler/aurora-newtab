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
  linear: {
    enabled: true,
    token: 'contract-token',
    displayName: 'Contract Linear user',
    teamIds: ['contract-linear-team'],
    itemLimit: 6,
  },
  sentry: {
    enabled: true,
    token: 'contract-token',
    organization: 'contract-sentry-org',
    region: 'us',
    projectSlugs: ['contract-sentry-project'],
    itemLimit: 6,
  },
  todoist: {
    enabled: true,
    token: 'contract-token',
    accountLabel: 'Contract Todoist account',
    projectIds: ['contract-todoist-project'],
    itemLimit: 6,
  },
  onThisDay: {
    enabled: true,
  },
  publicHolidays: {
    enabled: true,
    countryCode: 'US',
  },
  auroraKp: {
    enabled: true,
  },
  googleCalendar: {
    enabled: true,
    accountId: '42000000-0000-4000-8000-000000000001',
    accounts: [{
      connectionId: '52000000-0000-4000-8000-000000000001',
      displayEmail: 'contract-user@example.invalid',
      calendars: [{
        calendarId: 'primary',
        name: 'Contract Google calendar',
        color: '#4285f4',
        primary: true,
      }],
    }],
  },
} as const satisfies Record<ConnectorId, ConnectorConfig>
