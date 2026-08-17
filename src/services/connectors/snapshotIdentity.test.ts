import { describe, expect, it, vi } from 'vitest'
import type { HomeAssistantConfig } from './homeassistant'
import type { GithubConfig, RssConfig } from './types'
import { canonicalConnectorConfig, canonicalConnectorEventConfig, connectorSnapshotScope, newSnapshotEpoch } from './snapshotIdentity'

describe('connector snapshot identity', () => {
  it('canonicalizes object key order but preserves array order', () => {
    const a = {
      enabled: true,
      shownCount: 5,
      feeds: ['https://one.example/a', 'https://two.example/b'],
    } as RssConfig
    const b = {
      feeds: ['https://one.example/a', 'https://two.example/b'],
      shownCount: 5,
      enabled: true,
    } as RssConfig

    expect(canonicalConnectorConfig(a)).toBe(canonicalConnectorConfig(b))
    expect(canonicalConnectorConfig({ ...a, feeds: [...a.feeds].reverse() })).not.toBe(canonicalConnectorConfig(a))
  })

  it('changes scope for isolated account, secret, view, and feed mutations without embedding their values', async () => {
    const token = 'github_pat_FAKE_SCOPE_SECRET'
    const base: GithubConfig = { enabled: true, token, username: 'alice' }
    const baseScope = await connectorSnapshotScope('github', base)
    const accountScope = await connectorSnapshotScope('github', {
      ...base,
      username: 'bob',
    })
    const tokenScope = await connectorSnapshotScope('github', {
      ...base,
      token: 'github_pat_OTHER_FAKE',
    })
    const viewScope = await connectorSnapshotScope('github', {
      ...base,
      views: {
        commitGraph: false,
        pulls: true,
        issues: true,
        notifications: true,
      },
    })

    expect(baseScope).toMatch(/^github:v1:[0-9a-f]{64}$/)
    expect(accountScope).not.toBe(baseScope)
    expect(tokenScope).not.toBe(baseScope)
    expect(viewScope).not.toBe(baseScope)
    expect(baseScope).not.toContain(token)

    const capabilityUrl = 'https://feeds.example/private?key=FAKE_CAPABILITY'
    const rssBase: RssConfig = {
      enabled: true,
      feeds: [capabilityUrl],
      shownCount: 5,
    }
    const rssScope = await connectorSnapshotScope('rss', rssBase)
    const feedScope = await connectorSnapshotScope('rss', {
      ...rssBase,
      feeds: ['https://feeds.example/other'],
    })
    expect(feedScope).not.toBe(rssScope)
    expect(rssScope).not.toContain(capabilityUrl)
  })

  it('versions Home Assistant polling-contract scopes separately without exposing its config', async () => {
    const token = 'HA_FAKE_SCOPE_SECRET'
    const instanceUrl = 'https://ha.example.test'
    const config: HomeAssistantConfig = {
      enabled: true,
      instanceUrl,
      token,
      entities: [],
      actions: [{ id: 'scene.movie', name: 'Movie night', domain: 'scene' }],
    }

    const scope = await connectorSnapshotScope('homeassistant', config)

    expect(scope).toMatch(/^homeassistant:v2:[0-9a-f]{64}$/)
    expect(scope).not.toContain(token)
    expect(scope).not.toContain(instanceUrl)
    expect(scope).not.toContain('scene.movie')
    expect(scope).not.toContain('Movie night')
  })

  it('versions ICS as v2 and includes an opaque optional runtime scope', async () => {
    const config = {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example/private' }],
    } as const
    const omitted = await connectorSnapshotScope('ics', config)
    const ny = await connectorSnapshotScope('ics', config, {
      timeZone: 'America/New_York',
    })
    const berlin = await connectorSnapshotScope('ics', config, {
      timeZone: 'Europe/Berlin',
    })

    expect(omitted).toMatch(/^ics:v2:[0-9a-f]{64}$/)
    expect(ny).toMatch(/^ics:v2:[0-9a-f]{64}$/)
    expect(berlin).not.toBe(ny)
    expect(ny).not.toContain('America/New_York')
    expect(berlin).not.toContain('Europe/Berlin')
  })

  it('keeps ICS snapshot scope stable when only an identity-owned display color changes', async () => {
    const base = {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example/private' }],
    } as const
    const colored = {
      ...base,
      calendars: [{ ...base.calendars[0], color: 'fuchsia' as const }],
    }
    expect(await connectorSnapshotScope('ics', colored)).toBe(await connectorSnapshotScope('ics', base))
  })

  it('uses a single exported event identity for color-neutral ICS refresh ownership', () => {
    const base = {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example/private' }],
    } as const
    const colored = {
      ...base,
      calendars: [{ ...base.calendars[0], color: 'fuchsia' as const }],
    }

    expect(canonicalConnectorEventConfig('ics', colored)).toBe(canonicalConnectorEventConfig('ics', base))
    expect(canonicalConnectorEventConfig('rss', {
      enabled: true,
      feeds: ['https://one.example/a'],
      shownCount: 5,
    })).toBe(canonicalConnectorConfig({
      enabled: true,
      feeds: ['https://one.example/a'],
      shownCount: 5,
    }))
  })

  it('keeps malformed calendar entries serializable while ignoring a color field', async () => {
    await expect(connectorSnapshotScope('ics', {
      enabled: true,
      calendars: [null, { name: 'Work', url: 'https://calendar.example/private', color: 'sky' }],
    } as never)).resolves.toMatch(/^ics:v2:[0-9a-f]{64}$/)
  })

  it('keeps omitted runtime scope byte-compatible for existing v1 connectors', async () => {
    const config: RssConfig = {
      enabled: true,
      feeds: ['https://one.example/a'],
      shownCount: 5,
    }
    expect(await connectorSnapshotScope('rss', config)).toBe(await connectorSnapshotScope('rss', config, undefined))
  })

  it('creates a fresh non-secret epoch for an identical reconnect', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    expect(newSnapshotEpoch()).not.toBe(newSnapshotEpoch())
  })
})
