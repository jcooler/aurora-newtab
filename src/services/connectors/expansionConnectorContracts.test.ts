import { describe, expect, it } from 'vitest'

import { redactBackupData, requiredReentryConnectorIds } from '../../lib/backup'
import { defaults } from '../../lib/storage/schema'
import { WIDGET_REGISTRY } from '../../newtab/widgetRegistry'
import { CONNECTOR_BODY_IDS } from '../../settings/sections/Connectors'
import { deriveConnectorCardState } from '../../settings/connectors/connectorCardState'
import { COMPLETE_CONNECTOR_CONTRACT_FIXTURES } from '../../test/connectorContractFixtures'
import { ownedOriginPatterns } from '../originOwnership'
import { CONNECTORS, heldOrigins } from './registry'
import { CONNECTOR_IDS, type ConnectorConfig, type ConnectorId } from './types'

const EXPECTED_CONNECTOR_IDS = [
  'rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'status', 'homeassistant',
  'linear', 'sentry', 'todoist',
] as const satisfies readonly ConnectorId[]

const EXPECTED_REENTRY_IDS: readonly ConnectorId[] = [
  'rss', 'github', 'gitlab', 'jira', 'vercel', 'ics', 'homeassistant',
  'linear', 'sentry', 'todoist',
]

const EXPECTED_ORIGINS: Readonly<Record<ConnectorId, readonly string[]>> = {
  rss: ['https://news.example.invalid/*'],
  github: ['https://api.github.com/*'],
  gitlab: ['https://gitlab.example.invalid/*'],
  jira: ['https://contract-fixture.atlassian.net/*'],
  vercel: ['https://api.vercel.com/*'],
  crypto: ['https://api.coingecko.com/*'],
  ics: ['https://calendar.example.invalid/*'],
  status: ['https://status.example.invalid/*'],
  homeassistant: ['https://home.example.invalid/*'],
  linear: ['https://api.linear.app/*'],
  sentry: ['https://us.sentry.io/*'],
  todoist: ['https://api.todoist.com/*'],
}

const HELD_WHEN_INCOMPLETE = new Set<ConnectorId>([
  'github', 'gitlab', 'jira', 'vercel', 'crypto', 'homeassistant',
  'linear', 'sentry', 'todoist',
])

const INCOMPLETE: Record<ConnectorId, ConnectorConfig> = {
  rss: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.rss, feeds: [] },
  github: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.github, token: '' },
  gitlab: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.gitlab, token: '' },
  jira: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.jira, apiToken: '' },
  vercel: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.vercel, token: '' },
  crypto: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.crypto, coins: [] },
  ics: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.ics, url: undefined, calendars: [] },
  status: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.status, services: [] },
  homeassistant: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.homeassistant, token: '' },
  linear: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.linear, token: '' },
  sentry: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.sentry, token: '' },
  todoist: { ...COMPLETE_CONNECTOR_CONTRACT_FIXTURES.todoist, token: '' },
}

const photoPrefs = defaults().photoPrefs
const sorted = (values: readonly string[]) => [...values].sort()

describe('expansion connector authorities', () => {
  it('keeps all twelve identities in exact type, descriptor, widget, Settings, and fixture parity', () => {
    expect(CONNECTOR_IDS).toEqual(EXPECTED_CONNECTOR_IDS)
    expect(CONNECTORS.map(({ id }) => id)).toEqual(EXPECTED_CONNECTOR_IDS)
    expect(CONNECTOR_BODY_IDS).toEqual(EXPECTED_CONNECTOR_IDS)
    expect(Object.keys(COMPLETE_CONNECTOR_CONTRACT_FIXTURES)).toEqual(EXPECTED_CONNECTOR_IDS)
    expect(sorted(WIDGET_REGISTRY.flatMap((entry) => entry.availability.kind === 'connector' ? [entry.availability.id] : [])))
      .toEqual(sorted(EXPECTED_CONNECTOR_IDS))
  })

  it('requires complete descriptor policy and fixture secret fields', () => {
    for (const descriptor of CONNECTORS) {
      const fixture = COMPLETE_CONNECTOR_CONTRACT_FIXTURES[descriptor.id]
      expect(descriptor.auth.trim().length).toBeGreaterThan(0)
      expect(Number.isFinite(descriptor.ttlMs) && descriptor.ttlMs > 0).toBe(true)
      expect(descriptor.ownsOrigins(fixture)).toBe(true)
      const origins = descriptor.origins(fixture)
      expect(origins).toEqual(EXPECTED_ORIGINS[descriptor.id])
      origins.forEach((origin) => expect(origin).toMatch(/^https:\/\/[^/]+\/\*$/))
      descriptor.secretFields.forEach((field) => expect(Object.hasOwn(fixture, field)).toBe(true))
      if (descriptor.identityField) expect(Object.hasOwn(fixture, descriptor.identityField)).toBe(true)
    }
  })

  it('redacts exact credential and capability fields through the full backup path', () => {
    const { data: redacted, redactions } = redactBackupData({
      ...defaults(),
      connectors: COMPLETE_CONNECTOR_CONTRACT_FIXTURES,
    })

    expect(JSON.stringify(redacted).includes('contract-token')).toBe(false)
    expect(redacted.connectors).toEqual({
      rss: { enabled: true, feeds: [], shownCount: 5 },
      github: { enabled: true, username: 'contract-user' },
      gitlab: { enabled: true, instanceUrl: 'https://gitlab.example.invalid', username: 'contract-user' },
      jira: { enabled: true, email: 'contract-user@example.invalid', site: 'contract-fixture.atlassian.net', displayName: 'Contract User' },
      vercel: { enabled: true, username: 'contract-user' },
      crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
      ics: { enabled: true, calendars: [] },
      status: { enabled: true, services: [{ name: 'Contract service', url: 'https://status.example.invalid/api/v2/status.json' }] },
      homeassistant: { enabled: true, instanceUrl: 'https://home.example.invalid', locationName: 'Contract home' },
      linear: { enabled: true, itemLimit: 6 },
      sentry: { enabled: true, region: 'us', itemLimit: 6 },
      todoist: { enabled: true, itemLimit: 6 },
    })
    expect(redactions.reentryRequired).toEqual(EXPECTED_REENTRY_IDS)
    expect(requiredReentryConnectorIds(redacted.connectors, EXPECTED_REENTRY_IDS, true)).toEqual(EXPECTED_REENTRY_IDS)
  })

  it('keeps ownership separate while preserving the frozen enabled-only held-origin behavior', () => {
    const fixtures = COMPLETE_CONNECTOR_CONTRACT_FIXTURES
    const allOwned = sorted(Object.values(EXPECTED_ORIGINS).flat())
    expect(sorted(ownedOriginPatterns({ connectors: fixtures, photoPrefs }))).toEqual(allOwned)
    expect(sorted(heldOrigins(fixtures))).toEqual(allOwned)

    for (const descriptor of CONNECTORS) {
      const id = descriptor.id
      const own = new Set(descriptor.origins(fixtures[id]))
      const expectedWithoutOwn = allOwned.filter((origin) => !own.has(origin))

      const disabled = { ...fixtures, [id]: { ...fixtures[id], enabled: false } } as Record<ConnectorId, ConnectorConfig>
      expect(sorted(ownedOriginPatterns({ connectors: disabled, photoPrefs }))).toEqual(allOwned)
      expect(sorted(heldOrigins(disabled))).toEqual(expectedWithoutOwn)

      const incomplete = { ...fixtures, [id]: INCOMPLETE[id] }
      expect(sorted(ownedOriginPatterns({ connectors: incomplete, photoPrefs }))).toEqual(expectedWithoutOwn)
      const expectedHeld = HELD_WHEN_INCOMPLETE.has(id)
        ? sorted([...expectedWithoutOwn, ...EXPECTED_ORIGINS[id]])
        : expectedWithoutOwn
      expect(sorted(heldOrigins(incomplete))).toEqual(expectedHeld)
    }
  })

  it('derives unconfigured, invalid, configured-hidden, and configured-visible card states from real configs', () => {
    for (const descriptor of CONNECTORS) {
      const fixture = COMPLETE_CONNECTOR_CONTRACT_FIXTURES[descriptor.id]
      expect(deriveConnectorCardState(descriptor, undefined)).toMatchObject({
        configured: false,
        visible: false,
        state: 'unconfigured',
      })
      expect(deriveConnectorCardState(descriptor, INCOMPLETE[descriptor.id])).toMatchObject({
        configured: false,
        visible: false,
      })
      expect(deriveConnectorCardState(descriptor, { ...fixture, enabled: false })).toMatchObject({
        configured: true,
        visible: false,
        state: 'configured-hidden',
      })
      expect(deriveConnectorCardState(descriptor, fixture)).toMatchObject({
        configured: true,
        visible: true,
        state: 'configured-visible',
      })
    }
  })
})
