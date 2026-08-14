import { describe, expect, it, vi } from 'vitest'
import type { HomeAssistantConfig } from './homeassistant'
import type { GithubConfig, RssConfig } from './types'
import {
  canonicalConnectorConfig,
  connectorSnapshotScope,
  newSnapshotEpoch,
} from './snapshotIdentity'

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
    expect(canonicalConnectorConfig({ ...a, feeds: [...a.feeds].reverse() })).not.toBe(
      canonicalConnectorConfig(a),
    )
  })

  it('changes scope for isolated account, secret, view, and feed mutations without embedding their values', async () => {
    const token = 'github_pat_FAKE_SCOPE_SECRET'
    const base: GithubConfig = { enabled: true, token, username: 'alice' }
    const baseScope = await connectorSnapshotScope('github', base)
    const accountScope = await connectorSnapshotScope('github', { ...base, username: 'bob' })
    const tokenScope = await connectorSnapshotScope('github', {
      ...base,
      token: 'github_pat_OTHER_FAKE',
    })
    const viewScope = await connectorSnapshotScope('github', {
      ...base,
      views: { commitGraph: false, pulls: true, issues: true, notifications: true },
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

  it('creates a fresh non-secret epoch for an identical reconnect', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    expect(newSnapshotEpoch()).not.toBe(newSnapshotEpoch())
  })
})
