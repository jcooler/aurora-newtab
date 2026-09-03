import { describe, expect, it } from 'vitest'
import { getConnector } from '../../services/connectors/registry'
import type { ConnectorConfig, ConnectorId } from '../../services/connectors/types'
import { deriveConnectorCardState } from './connectorCardState'

type Expected = ReturnType<typeof deriveConnectorCardState>

const configured: Record<ConnectorId, ConnectorConfig> = {
  rss: { enabled: true, feeds: ['https://news.example.test/feed.xml'], shownCount: 5 },
  github: { enabled: true, token: 'gh_test', username: 'octocat' },
  gitlab: { enabled: true, token: 'gl_test', instanceUrl: 'https://gitlab.example.test', username: 'sam' },
  jira: { enabled: true, email: 'sam@example.test', apiToken: 'jira_test', site: 'https://team.atlassian.net', displayName: 'Sam' },
  vercel: { enabled: true, token: 'vc_test', username: 'sam' },
  crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
  ics: { enabled: true, calendars: [{ name: 'Studio', url: 'https://calendar.example.test/private.ics' }] },
  status: { enabled: true, services: [{ name: 'API', url: 'https://status.example.test/api/v2/status.json' }] },
  homeassistant: { enabled: true, instanceUrl: 'https://home.example.test', token: 'ha_test', locationName: 'Home' },
  linear: { enabled: true, token: 'linear_test', displayName: 'Sam', itemLimit: 6 },
  sentry: { enabled: true, token: 'sentry_test', organization: 'team', region: 'us', itemLimit: 6 },
  todoist: { enabled: true, token: 'todoist_test', accountLabel: 'Todoist', itemLimit: 6 },
  onThisDay: { enabled: true },
  publicHolidays: { enabled: true, countryCode: 'US' },
  auroraKp: { enabled: true },
  googleCalendar: {
    enabled: true,
    accountId: '42000000-0000-4000-8000-000000000001',
    accounts: [{
      connectionId: '52000000-0000-4000-8000-000000000001',
      displayEmail: 'sam@example.test',
      calendars: [{ calendarId: 'primary', name: 'Sam', color: '#4285f4', primary: true }],
    }],
  },
}

const reconnect: Record<ConnectorId, ConnectorConfig> = {
  rss: { enabled: true, feeds: [], shownCount: 5 },
  github: { enabled: true, token: '', username: 'octocat' },
  gitlab: { enabled: true, token: '', instanceUrl: 'https://gitlab.example.test', username: 'sam' },
  jira: { enabled: true, email: 'sam@example.test', apiToken: '', site: 'https://team.atlassian.net', displayName: 'Sam' },
  vercel: { enabled: true, token: '', username: 'sam' },
  crypto: { enabled: true, coins: [] },
  ics: { enabled: true, calendars: [] },
  status: { enabled: true, services: [] },
  homeassistant: { enabled: true, instanceUrl: 'https://home.example.test', token: '', locationName: 'Home' },
  linear: { enabled: true, token: '', displayName: 'Sam', itemLimit: 6 },
  sentry: { enabled: true, token: '', organization: 'team', region: 'us', itemLimit: 6 },
  todoist: { enabled: true, token: '', accountLabel: 'Todoist', itemLimit: 6 },
  onThisDay: { enabled: undefined } as unknown as ConnectorConfig,
  publicHolidays: { enabled: true, countryCode: '' },
  auroraKp: { enabled: undefined } as unknown as ConnectorConfig,
  googleCalendar: { enabled: true, accounts: [] } as ConnectorConfig,
}

const setupExpected: Expected = {
  configured: false,
  visible: false,
  state: 'unconfigured',
  stateLabel: 'Not set up',
  identityLabel: null,
  primaryAction: 'setup',
  primaryActionLabel: 'Set up',
  mode: 'setup',
  showVisibilityControl: false,
  group: 'available',
  openImmediately: false,
}

const hiddenExpected = (identityLabel: string | null): Expected => ({
  configured: true,
  visible: false,
  state: 'configured-hidden',
  stateLabel: 'Hidden',
  identityLabel,
  primaryAction: 'edit',
  primaryActionLabel: 'Edit',
  mode: 'edit',
  showVisibilityControl: true,
  group: 'available',
  openImmediately: false,
})

const visibleExpected = (identityLabel: string | null): Expected => ({
  configured: true,
  visible: true,
  state: 'configured-visible',
  stateLabel: 'On canvas',
  identityLabel,
  primaryAction: 'edit',
  primaryActionLabel: 'Edit',
  mode: 'edit',
  showVisibilityControl: true,
  group: 'on-canvas',
  openImmediately: false,
})

const reconnectExpected = (identityLabel: string): Expected => ({
  configured: false,
  visible: false,
  state: 'reconnect-required',
  stateLabel: 'Reconnect required',
  identityLabel,
  primaryAction: 'reconnect',
  primaryActionLabel: 'Reconnect',
  mode: 'reconnect',
  showVisibilityControl: false,
  group: 'available',
  openImmediately: true,
})

const identities: Partial<Record<ConnectorId, string>> = {
  github: 'Connected as octocat',
  gitlab: 'Connected as sam',
  jira: 'Connected as Sam',
  vercel: 'Connected as sam',
  homeassistant: 'Connected to Home',
  linear: 'Connected as Sam',
  sentry: 'Connected to team',
  todoist: 'Connected to Todoist',
}

describe('deriveConnectorCardState', () => {
  for (const id of Object.keys(configured) as ConnectorId[]) {
    const descriptor = getConnector(id)!

    it(`${id}: unconfigured`, () => {
      expect(deriveConnectorCardState(descriptor, undefined)).toEqual(setupExpected)
    })

    it(`${id}: configured but hidden`, () => {
      expect(deriveConnectorCardState(descriptor, { ...configured[id], enabled: false })).toEqual(
        hiddenExpected(identities[id] ?? null),
      )
    })

    it(`${id}: configured and visible`, () => {
      expect(deriveConnectorCardState(descriptor, configured[id])).toEqual(
        visibleExpected(identities[id] ?? null),
      )
    })

    it(`${id}: reconnect-shaped input`, () => {
      const expected = identities[id]
        ? reconnectExpected(identities[id]!)
        : setupExpected
      expect(deriveConnectorCardState(descriptor, reconnect[id])).toEqual(expected)
    })
  }

  it('treats the legacy single-calendar URL as meaningful configuration', () => {
    const descriptor = getConnector('ics')!
    expect(
      deriveConnectorCardState(descriptor, {
        enabled: false,
        url: 'https://calendar.example.test/private.ics',
      }),
    ).toEqual(hiddenExpected(null))
  })

  it('never includes a credential or capability URL in its labels', () => {
    for (const id of Object.keys(configured) as ConnectorId[]) {
      const state = deriveConnectorCardState(getConnector(id)!, configured[id])
      const rendered = JSON.stringify(state)
      expect(rendered).not.toContain('_test')
      expect(rendered).not.toContain('private.ics')
      expect(rendered).not.toContain('status.example.test')
    }
  })
})
