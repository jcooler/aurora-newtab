import { describe, expect, it } from 'vitest'

import { defaults, type AuroraData } from '../lib/storage/schema'
import {
  applySyncEntity,
  classifyAuroraKey,
  EXCLUDED_AURORA_KEYS,
  projectSyncEntities,
  removeSyncEntity,
  SYNCED_AURORA_KEYS,
} from './entityPolicy'
import { SYNC_ENTITY_TYPES, type SyncEntityV1 } from './types'

function fixture(): AuroraData {
  return {
    ...defaults(),
    settings: { ...defaults().settings, name: 'Alex' },
    focus: { date: '2026-09-02', text: 'Ship safely', done: false },
    todoLists: [{ id: 'today', name: 'Today', items: [{
      id: 'review', text: 'Review sync', done: true, createdOn: '2026-09-01', completedOn: '2026-09-02',
    }] }],
    links: [{ id: 'docs', title: 'Docs', url: 'https://example.com/docs' }],
    timerConfig: { workMinutes: 40, breakMinutes: 10 },
    location: { lat: 42.9634, lon: -85.6681, label: 'Grand Rapids', manual: true },
    notes: { text: 'Private local note', updatedAt: 1_788_364_800_000 },
    worldClocks: [{ zone: 'America/New_York', label: 'New York' }],
    countdowns: [{ id: 'launch', name: 'Launch', date: '2026-10-01' }],
    layouts: {
      version: 1,
      activeLayoutId: 'work',
      layouts: [{ id: 'work', name: 'Work', widgets: {} }],
    },
    calendarPreferences: { work: { defaultView: 'month', includePublicHolidays: true } },
    calendarWeekStart: 'monday',
    connectors: {
      github: { enabled: true, token: 'github_secret_token', username: 'alex' },
      rss: { enabled: true, feeds: ['https://feeds.example.invalid/private?token=rss_secret'], shownCount: 7 },
    },
    habits: [{ id: 'walk', name: 'Walk', createdAt: 100, log: ['2026-09-01', '2026-09-02'] }],
    progressGoals: [{
      id: 'water',
      name: 'Water',
      unit: 'glasses',
      target: 8,
      createdAt: 200,
      today: { date: '2026-09-02', value: 5 },
    }],
    metricsHistory: {
      version: 1,
      installationId: '00000000-0000-4000-8000-000000000001',
      buckets: [{
        schemaVersion: 1,
        id: '00000000-0000-4000-8000-000000000002',
        date: '2026-09-02',
        source: 'tasks',
        sourceInstanceId: 'local-tasks',
        installationId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        values: { kind: 'tasks', completed: 3, carriedForward: 2 },
      }],
    },
  }
}

describe('deny-by-default sync entity policy', () => {
  it('classifies every current AuroraData key exactly once', () => {
    const expected = Object.keys(defaults()).sort()
    const classified = [...SYNCED_AURORA_KEYS, ...EXCLUDED_AURORA_KEYS].sort()
    expect(classified).toEqual(expected)
    expect(new Set(classified).size).toBe(classified.length)
    expect(() => classifyAuroraKey('futureSecret')).toThrow('sync_key_unclassified')
  })

  it('pins the complete version-one entity vocabulary', () => {
    expect(SYNC_ENTITY_TYPES).toEqual([
      'settings',
      'focus',
      'todo_list',
      'quick_link',
      'timer_config',
      'location',
      'notes',
      'world_clock',
      'countdown',
      'legacy_layout',
      'layout_manifest',
      'named_layout',
      'calendar_preference',
      'calendar_week_start',
      'connector_preference',
      'habit',
      'habit_completion',
      'progress_goal',
      'metric_bucket',
    ])
  })

  it('projects records with stable ids and keeps layout and habit authorities separate', () => {
    const entities = projectSyncEntities(fixture())
    expect(entities.map(({ entityType, entityId }) => `${entityType}:${entityId}`)).toEqual([
      'settings:singleton',
      'focus:2026-09-02',
      'todo_list:today',
      'quick_link:docs',
      'timer_config:singleton',
      'location:singleton',
      'notes:singleton',
      'world_clock:America/New_York',
      'countdown:launch',
      'legacy_layout:singleton',
      'named_layout:work',
      'layout_manifest:singleton',
      'calendar_preference:work',
      'calendar_week_start:singleton',
      'connector_preference:rss',
      'connector_preference:github',
      'habit:walk',
      'habit_completion:walk:2026-09-01',
      'habit_completion:walk:2026-09-02',
      'progress_goal:water',
      'metric_bucket:00000000-0000-4000-8000-000000000002',
    ])
    expect(entities.find((entity) => entity.entityType === 'habit')?.value).toEqual({ name: 'Walk', createdAt: 100 })
    expect(entities.filter((entity) => entity.entityType === 'habit_completion').map((entity) => entity.value)).toEqual([
      { done: true },
      { done: true },
    ])
    expect(entities.find((entity) => entity.entityType === 'layout_manifest')?.value).toEqual({
      version: 1,
      activeLayoutId: 'work',
    })
    expect(entities.find((entity) => entity.entityType === 'metric_bucket')).toEqual({
      schemaVersion: 1,
      entityType: 'metric_bucket',
      entityId: '00000000-0000-4000-8000-000000000002',
      value: {
        schemaVersion: 1,
        date: '2026-09-02',
        source: 'tasks',
        sourceInstanceId: 'local-tasks',
        installationId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        values: { kind: 'tasks', completed: 3, carriedForward: 2 },
      },
    })
  })

  it('excludes all operational, cache, image, session, lease, credential, and URL-bearing connector data', () => {
    const source = {
      ...fixture(),
      timerSession: { mode: 'work', running: true, endsAt: 1_788_364_800_000, remainingMs: 60_000, cycles: 2, flow: true },
      photoPrefs: { mode: 'upload', index: 3, lastRotated: '2026-09-02', uploadedAt: 'blob_secret_123' },
      weatherCache: { providerResponse: 'weather_secret_123' },
      weatherAlertCache: { providerResponse: 'alert_secret_123' },
      connectorSnapshots: { github: { fetchedAt: 1, data: { token: 'snapshot_secret_123' } } },
      refreshPreferences: { github: { intervalMs: 60_000, secret: 'refresh_secret_123' } },
      attentionLedger: { version: 1, sources: { github: { observedAt: 1, token: 'ledger_secret_123' } } },
      apodCache: { date: '2026-09-02', photo: { url: 'https://image.example.invalid/private', title: 'Private' } },
    } as unknown as AuroraData

    const serialized = JSON.stringify(projectSyncEntities(source))
    for (const forbidden of [
      'github_secret_token', 'rss_secret', 'blob_secret_123', 'weather_secret_123', 'alert_secret_123',
      'snapshot_secret_123', 'refresh_secret_123', 'ledger_secret_123', 'image.example.invalid',
      'timerSession', 'photoPrefs', 'weatherCache', 'connectorSnapshots', 'refreshPreferences',
      'attentionLedger', 'apodCache', 'snapshotEpoch',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('fails closed when a future top-level key appears', () => {
    expect(() => projectSyncEntities({ ...fixture(), futureSecret: 'token_future' } as unknown as AuroraData))
      .toThrow('sync_key_unclassified')
  })

  it('rejects unknown entity types, malformed ids, unsafe URLs, and extra nested fields', () => {
    const data = fixture()
    const invalidEntities = [
      { schemaVersion: 1, entityType: 'future_secret', entityId: 'singleton', value: {} },
      { schemaVersion: 1, entityType: 'todo_list', entityId: '../bad', value: { name: 'Bad', items: [] } },
      { schemaVersion: 1, entityType: 'quick_link', entityId: 'unsafe', value: { title: 'Unsafe', url: 'javascript:alert(1)' } },
      { schemaVersion: 1, entityType: 'timer_config', entityId: 'singleton', value: { workMinutes: 25, breakMinutes: 5, token: 'secret' } },
    ]
    for (const entity of invalidEntities) {
      expect(() => applySyncEntity(data, entity as SyncEntityV1)).toThrow('sync_entity_invalid')
    }
  })

  it('applies a validated entity without mutating the input and preserves local-only connector authority', () => {
    const data = fixture()
    const updated = applySyncEntity(data, {
      schemaVersion: 1,
      entityType: 'connector_preference',
      entityId: 'github',
      value: { enabled: false },
    })
    expect(updated).not.toBe(data)
    expect(updated.connectors.github).toEqual({ enabled: false, token: 'github_secret_token', username: 'alex' })
    expect(data.connectors.github).toEqual({ enabled: true, token: 'github_secret_token', username: 'alex' })
  })

  it('round-trips optional todo creation and completion days', () => {
    const projected = projectSyncEntities(fixture()).find((entity) => entity.entityType === 'todo_list')!
    expect(projected.value).toEqual({
      name: 'Today',
      items: [{
        id: 'review', text: 'Review sync', done: true, createdOn: '2026-09-01', completedOn: '2026-09-02',
      }],
    })
    expect(applySyncEntity(defaults(), projected).todoLists[0]?.items[0]).toEqual({
      id: 'review', text: 'Review sync', done: true, createdOn: '2026-09-01', completedOn: '2026-09-02',
    })
  })

  it.each(['2026-02-30', 'tomorrow', null])('rejects invalid todo provenance date %s', (createdOn) => {
    expect(() => applySyncEntity(defaults(), {
      schemaVersion: 1,
      entityType: 'todo_list',
      entityId: 'today',
      value: { name: 'Today', items: [{ id: 'item', text: 'Private', done: false, createdOn }] },
    })).toThrow('sync_entity_invalid')
  })

  it('applies and removes one opaque metric bucket while preserving unrelated history and the local installation', () => {
    const local = fixture()
    const incoming = {
      schemaVersion: 1 as const,
      entityType: 'metric_bucket' as const,
      entityId: '00000000-0000-4000-8000-000000000003',
      value: {
        schemaVersion: 1 as const,
        date: '2026-09-01',
        source: 'focus' as const,
        sourceInstanceId: '00000000-0000-4000-8000-000000000009',
        installationId: '00000000-0000-4000-8000-000000000009',
        sequence: 4,
        values: { kind: 'focus' as const, sessions: 2, minutes: 50 },
      },
    }

    const applied = applySyncEntity(local, incoming)
    expect(applied.metricsHistory?.installationId).toBe('00000000-0000-4000-8000-000000000001')
    expect(applied.metricsHistory?.buckets.map((bucket) => bucket.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ])
    const removed = removeSyncEntity(applied, 'metric_bucket', incoming.entityId)
    expect(removed.metricsHistory?.buckets.map((bucket) => bucket.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
    ])
  })

  it('rejects non-opaque metric ids and any non-aggregate metric field', () => {
    const value = {
      schemaVersion: 1,
      date: '2026-09-02',
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      installationId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      values: { kind: 'tasks', completed: 3, carriedForward: 2 },
    }
    expect(() => applySyncEntity(defaults(), {
      schemaVersion: 1, entityType: 'metric_bucket', entityId: 'tasks:2026-09-02', value,
    } as SyncEntityV1)).toThrow('sync_entity_invalid')
    expect(() => applySyncEntity(defaults(), {
      schemaVersion: 1,
      entityType: 'metric_bucket',
      entityId: '00000000-0000-4000-8000-000000000004',
      value: { ...value, taskText: 'Private task' },
    } as SyncEntityV1)).toThrow('sync_entity_invalid')
    for (const forbidden of ['eventTitle', 'repository', 'route', 'url', 'sessions', 'providerPayload']) {
      expect(() => applySyncEntity(defaults(), {
        schemaVersion: 1,
        entityType: 'metric_bucket',
        entityId: '00000000-0000-4000-8000-000000000004',
        value: { ...value, [forbidden]: 'private' },
      } as SyncEntityV1)).toThrow('sync_entity_invalid')
    }
  })
})
