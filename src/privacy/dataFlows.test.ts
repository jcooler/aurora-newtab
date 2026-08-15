import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { serializeBackup, validateBackupShape } from '../lib/backup'
import { defaults } from '../lib/storage/schema'
import { CONNECTORS } from '../services/connectors/registry'
import { CONNECTOR_IDS } from '../services/connectors/types'
import {
  BROWSER_DATA_FLOWS,
  CONNECTOR_DATA_FLOWS,
  FIXED_DATA_FLOWS,
  LOCAL_SECRET_STORAGE_NOTICE,
  MANIFEST_PRIVACY_DESCRIPTION,
  OTHER_LOCAL_DATA_FLOWS,
  STORED_DATA_FLOWS,
} from './dataFlows'

const DATA_KEYS = [
  'settings',
  'focus',
  'todoLists',
  'links',
  'timerConfig',
  'photoPrefs',
  'location',
  'weatherCache',
  'notes',
  'worldClocks',
  'countdowns',
  'layout',
  'connectors',
  'connectorSnapshots',
  'habits',
  'apodCache',
] as const

async function manifestFor(mode: 'production' | 'preview') {
  expect(typeof manifest).toBe('function')
  return await (manifest as (env: { command: 'build'; mode: string }) => unknown)({
    command: 'build',
    mode,
  }) as {
    description?: string
    permissions?: string[]
    optional_permissions?: string[]
    optional_host_permissions?: string[]
  }
}

describe('code-backed privacy inventory', () => {
  it('covers every user-data key plus non-user storage metadata independently', () => {
    expect(Object.keys(defaults())).toEqual(DATA_KEYS)
    expect(Object.keys(STORED_DATA_FLOWS)).toEqual(DATA_KEYS)
    expect(Object.values(STORED_DATA_FLOWS).every((flow) => flow.storage === 'chrome.storage.local')).toBe(true)
    expect(OTHER_LOCAL_DATA_FLOWS.uploadedPhotos).toMatchObject({
      storage: 'indexedDB',
      export: 'outside-json-backup',
      transmission: 'none',
    })
    expect(OTHER_LOCAL_DATA_FLOWS.schemaVersion).toEqual({
      key: 'aurora:version',
      storage: 'chrome.storage.local',
      sensitivity: ['preferences'],
      export: 'outside-json-backup',
      transmission: 'none',
      description: 'Non-user schema metadata used only for local migrations.',
    })
  })

  it('records the exact cache export contract against real backup behavior', () => {
    expect(STORED_DATA_FLOWS.weatherCache.export).toBe('included')
    expect(STORED_DATA_FLOWS.connectorSnapshots.export).toBe('excluded')
    expect(STORED_DATA_FLOWS.apodCache.export).toBe('excluded')

    const data = {
      ...defaults(),
      weatherCache: {
        current: { tempC: 12, feelsLikeC: 10, code: 1, windKmh: 5, humidity: 40 },
        hourly: [],
        fetchedAt: 1,
        locationLabel: 'Somewhere',
      },
      connectorSnapshots: { crypto: { fetchedAt: 1, data: { coins: [] } } },
      apodCache: { date: '2026-08-14', photo: null },
    }
    const exported = JSON.parse(serializeBackup(data)).data
    expect(exported.weatherCache).toEqual(data.weatherCache)
    expect(exported).not.toHaveProperty('connectorSnapshots')
    expect(exported).not.toHaveProperty('apodCache')
    expect(validateBackupShape(data).ok).toBe(true)
  })

  it('classifies all connectors and their descriptor-backed secret kinds', () => {
    expect(Object.keys(CONNECTOR_DATA_FLOWS)).toEqual(CONNECTOR_IDS)
    for (const descriptor of CONNECTORS) {
      const flow = CONNECTOR_DATA_FLOWS[descriptor.id]
      expect(flow.permission).toBe('optional-per-origin')
      expect(flow.transmission).toBe('provider-direct')
      expect(flow.destinationKind).toMatch(/^(fixed|configured)-provider$/)
      expect(flow.destinations.length).toBeGreaterThan(0)
      expect(flow.trigger.length).toBeGreaterThan(0)
      expect(flow.methods).toContain('GET')
      expect(flow.sends.length).toBeGreaterThan(0)
      expect(flow.receives.length).toBeGreaterThan(0)
      expect(flow.cache).toBe('connectorSnapshots-excluded-from-backup')
      expect(flow.backend).toBe('none')
      if (descriptor.auth === 'token') {
        expect(flow.account).toBe('third-party')
        expect(flow.authenticationFields).toEqual(descriptor.secretFields)
      }
    }
    expect(CONNECTOR_DATA_FLOWS.rss.capabilityFields).toEqual(['feeds'])
    expect(CONNECTOR_DATA_FLOWS.ics.capabilityFields).toEqual(['url', 'calendars'])
    expect(CONNECTOR_DATA_FLOWS.rss.backup).toBe('redacted')
    expect(CONNECTOR_DATA_FLOWS.ics.backup).toBe('redacted')
    expect(CONNECTOR_DATA_FLOWS.crypto.authenticationFields).toEqual([])
    expect(CONNECTOR_DATA_FLOWS.status.capabilityFields).toEqual([])
    expect(CONNECTOR_DATA_FLOWS.homeassistant.operations).toEqual([
      'GET /api/config on connect',
      'GET /api/states in the explicit picker only',
      'GET /api/states/{entity_id} for regular selected-entity polling',
      'GET /api/ for action-only health',
      'POST /api/services/{domain}/{service} only on an action click',
    ])
  })

  it('distinguishes Aurora network requests from browser-mediated and navigation flows', () => {
    expect(Object.keys(FIXED_DATA_FLOWS)).toEqual(['weatherForecast', 'citySearch', 'reverseGeocode', 'apod'])
    expect(Object.values(FIXED_DATA_FLOWS).every((flow) => flow.transmission === 'provider-direct')).toBe(true)
    for (const flow of Object.values(FIXED_DATA_FLOWS)) {
      expect(flow.destinations.length).toBeGreaterThan(0)
      expect(flow.trigger.length).toBeGreaterThan(0)
      expect(flow.sends.length).toBeGreaterThan(0)
      expect(flow.receives.length).toBeGreaterThan(0)
      expect(flow.methods).toEqual(['GET'])
      expect(flow.permission.length).toBeGreaterThan(0)
      expect(flow.cache.length).toBeGreaterThan(0)
      expect(flow.backend).toBe('none')
    }
    expect(FIXED_DATA_FLOWS.apod).toMatchObject({
      destinations: ['api.nasa.gov', 'apod.nasa.gov'],
      sends: ['shared NASA DEMO_KEY'],
      receives: ['APOD metadata', 'selected image bytes'],
      permission: 'optional-per-origin',
      cache: 'apodCache-excluded-from-backup',
    })
    expect(FIXED_DATA_FLOWS.weatherForecast.sends).toEqual(['rounded coordinates'])
    expect(FIXED_DATA_FLOWS.weatherForecast.cache).toBe('weatherCache-included-in-backup')
    expect(BROWSER_DATA_FLOWS.search.transmission).toBe('browser-mediated')
    expect(BROWSER_DATA_FLOWS.bookmarks.transmission).toBe('none')
    expect(BROWSER_DATA_FLOWS.favicon.transmission).toBe('browser-mediated')
    expect(BROWSER_DATA_FLOWS.navigation.transmission).toBe('browser-mediated')
    expect(BROWSER_DATA_FLOWS.geolocation.transmission).toBe('none')
  })

  it('drives both manifest modes and the in-product local plaintext warning', async () => {
    expect(MANIFEST_PRIVACY_DESCRIPTION).toBe(
      'A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.',
    )
    expect(LOCAL_SECRET_STORAGE_NOTICE).toContain('local plaintext')
    expect(LOCAL_SECRET_STORAGE_NOTICE).toContain('shared or untrusted profile')

    const production = await manifestFor('production')
    expect(production).toMatchObject({
      description: MANIFEST_PRIVACY_DESCRIPTION,
      permissions: ['storage', 'favicon', 'geolocation', 'search'],
      optional_permissions: ['bookmarks'],
      optional_host_permissions: ['https://*/*'],
    })
    const preview = await manifestFor('preview')
    expect(preview).toMatchObject({
      description: MANIFEST_PRIVACY_DESCRIPTION,
      permissions: ['storage', 'favicon', 'bookmarks', 'geolocation', 'search'],
      optional_permissions: [],
      optional_host_permissions: ['https://*/*'],
    })
  })
})
