import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuroraStorage } from '../lib/storage'
import type { PhotoPrefs } from '../lib/storage/schema'
import type { ConnectorConfig, ConnectorId } from './connectors/types'
import {
  ORIGIN_OWNER_PROVIDERS,
  ownedOriginPatterns,
  readOwnedOriginPatterns,
  type OriginOwnerProvider,
  type OriginOwnershipState,
} from './originOwnership'

const autoPhotoPrefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '' }

function state(
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>,
  photoPrefs: PhotoPrefs = autoPhotoPrefs,
): OriginOwnershipState {
  return { connectors, photoPrefs }
}

describe('ownedOriginPatterns', () => {
  const originalProviders = [...ORIGIN_OWNER_PROVIDERS]

  afterEach(() => {
    const providers = ORIGIN_OWNER_PROVIDERS as OriginOwnerProvider[]
    providers.length = 0
    providers.push(...originalProviders)
  })

  it('dedupes RSS and Status rows that claim the same origin into one active claim', () => {
    expect(
      ownedOriginPatterns(
        state({
          rss: { enabled: false, feeds: ['https://shared.example.com/feed'], shownCount: 5 },
          status: {
            enabled: false,
            services: [{ name: 'Shared', url: 'https://shared.example.com/api/v2/status.json' }],
          },
        }),
      ),
    ).toEqual(['https://shared.example.com/*'])
  })

  it('dedupes ICS and Home Assistant configs that share one self-hosted origin', () => {
    expect(
      ownedOriginPatterns(
        state({
          ics: { enabled: true, calendars: [{ name: 'Home', url: 'https://home.example.com/calendar.ics' }] },
          homeassistant: {
            enabled: false,
            instanceUrl: 'https://home.example.com',
            token: 'ha-token',
            locationName: 'House',
          },
        }),
      ),
    ).toEqual(['https://home.example.com/*'])
  })

  it('dedupes a token connector origin shared with APOD while retaining APODs independent image claim', () => {
    expect(
      ownedOriginPatterns(
        state(
          {
            gitlab: {
              enabled: false,
              token: 'token',
              instanceUrl: 'https://api.nasa.gov',
              username: 'astro',
            },
          },
          { mode: 'apod', index: 0, lastRotated: '' },
        ),
      ),
    ).toEqual(['https://api.nasa.gov/*', 'https://apod.nasa.gov/*'])
  })

  it('dedupes duplicate rows inside one connector instead of creating duplicate remove candidates', () => {
    expect(
      ownedOriginPatterns(
        state({
          rss: {
            enabled: true,
            feeds: ['https://same.example.com/a.xml', 'https://same.example.com/b.xml'],
            shownCount: 5,
          },
        }),
      ),
    ).toEqual(['https://same.example.com/*'])
  })

  it('counts complete disabled configs but excludes enabled generic-toggle and backup-restored incomplete constant-origin configs', () => {
    const configured = ownedOriginPatterns(
      state({
        github: { enabled: false, token: 't', username: 'octocat' },
        vercel: { enabled: false, token: 't', username: 'shipper' },
        crypto: { enabled: false, coins: ['bitcoin'] },
      }),
    )
    expect(configured.sort()).toEqual([
      'https://api.coingecko.com/*',
      'https://api.github.com/*',
      'https://api.vercel.com/*',
    ])

    expect(
      ownedOriginPatterns(
        state({
          github: { enabled: true } as unknown as ConnectorConfig,
          vercel: { enabled: true, token: '', username: '' },
          crypto: { enabled: true, coins: [] },
        }),
      ),
    ).toEqual([])
  })

  it('claims APOD origins only while APOD mode is configured, catching connector-only ownership', () => {
    expect(ownedOriginPatterns(state({}, { mode: 'apod', index: 0, lastRotated: '' }))).toEqual([
      'https://api.nasa.gov/*',
      'https://apod.nasa.gov/*',
    ])
    expect(ownedOriginPatterns(state({}, autoPhotoPrefs))).toEqual([])
  })

  it('sweeps past malformed connector configs and malformed provider output without throwing', () => {
    const providers = ORIGIN_OWNER_PROVIDERS as OriginOwnerProvider[]
    providers.push(
      { ownedOriginPatterns: () => { throw new Error('bad provider') } },
      { ownedOriginPatterns: () => 'not-an-array' as unknown as string[] },
      { ownedOriginPatterns: () => ['not a url', 7 as unknown as string, 'https://good.example.com/path'] },
    )
    const malformed = {
      rss: { enabled: false, feeds: null },
      status: { enabled: true, services: [{ nope: true }] },
      github: { enabled: true },
    } as unknown as Partial<Record<ConnectorId, ConnectorConfig>>

    expect(() => ownedOriginPatterns(state(malformed))).not.toThrow()
    expect(ownedOriginPatterns(state(malformed))).toEqual(['https://good.example.com/*'])
  })
})

describe('readOwnedOriginPatterns', () => {
  it('reads exactly connectors and photoPrefs before feeding the pure owner registry', async () => {
    const connectors = {
      rss: { enabled: false, feeds: ['https://read.example.com/feed'], shownCount: 5 },
    } satisfies Partial<Record<ConnectorId, ConnectorConfig>>
    const get = vi.fn(async (key: string) => (key === 'connectors' ? connectors : autoPhotoPrefs))
    const storage = { get } as unknown as AuroraStorage

    await expect(readOwnedOriginPatterns(storage)).resolves.toEqual(['https://read.example.com/*'])
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledWith('connectors')
    expect(get).toHaveBeenCalledWith('photoPrefs')
  })
})
