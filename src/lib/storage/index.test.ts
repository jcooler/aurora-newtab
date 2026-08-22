import { describe, expect, it, vi } from 'vitest'
import * as storageModule from './index'
import { createStorage } from './index'
import { migrations, type Migration } from './migrations'
import { memoryDriver, type StorageDriver } from './driver'
import { CURRENT_VERSION, defaults, type AuroraData, type DataKey } from './schema'
import { LegacyLayoutValidationError } from '../layout/v2'
import type { LayoutV2 } from '../layout/types'
import {
  createInProcessStorageAuthority,
  type StorageAuthority,
} from './authority'

function recordingAuthority(events: string[] = []): StorageAuthority {
  const inner = createInProcessStorageAuthority()
  return {
    runExclusive: (work) => inner.runExclusive(async () => {
      events.push('lock:enter')
      try {
        return await work()
      } finally {
        events.push('lock:exit')
      }
    }),
  }
}

const KNOWN_KEYS = [
  'settings',
  'focus',
  'todoLists',
  'links',
  'timerConfig',
  'timerSession',
  'photoPrefs',
  'location',
  'weatherCache',
  'notes',
  'worldClocks',
  'countdowns',
  'layout',
  'layouts',
  'connectors',
  'connectorSnapshots',
  'habits',
  'apodCache',
] as const satisfies readonly DataKey[]

const PREVIOUS: AuroraData = {
  ...defaults(),
  settings: { ...defaults().settings, name: 'Before restore' },
  focus: { text: 'Keep this focus', date: '2026-08-14', done: false },
  links: [{ id: 'before', title: 'Before', url: 'https://before.example' }],
  notes: { text: 'Pre-image note', updatedAt: 100 },
}

const TARGET: AuroraData = {
  ...defaults(),
  settings: { ...defaults().settings, name: 'After restore', use24Hour: true },
  focus: { text: 'Imported focus', date: '2026-08-15', done: true },
  links: [{ id: 'after', title: 'After', url: 'https://after.example' }],
  notes: { text: 'Imported note', updatedAt: 200 },
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function v9Seed(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...defaults(),
    layout: { weather: { x: 12, y: 20 }, focus: { x: 50, y: 50 } },
    ...extra,
    'aurora:version': 9,
  }
}

function v10Settings(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { layoutDensity: _layoutDensity, ...settings } = defaults().settings as unknown as Record<string, unknown>
  return { ...settings, ...extra }
}

function v10Seed(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...defaults(),
    settings: v10Settings({ name: 'Stored v10' }),
    ...extra,
    'aurora:version': 10,
  }
}

interface AtomicStorage {
  snapshot(): Promise<AuroraData>
  replaceAllWithRollback<T>(
    next: AuroraData,
    finalize: (previous: AuroraData) => Promise<T>,
  ): Promise<{ previous: AuroraData; value: T }>
}

function atomicStorage(
  driver: StorageDriver,
  authority: StorageAuthority,
): ReturnType<typeof createStorage> & AtomicStorage {
  return createStorage(driver, authority) as ReturnType<typeof createStorage> & AtomicStorage
}

interface DriverControls {
  read?: (
    keys: string[] | null,
    call: number,
    proceed: () => Promise<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>
  write?: (
    patch: Record<string, unknown>,
    call: number,
    apply: () => Promise<void>,
  ) => Promise<void>
}

function controllableDriver(
  seed: object,
  controls: DriverControls = {},
) {
  const base = memoryDriver(clone(seed) as Record<string, unknown>)
  const reads: Array<string[] | null> = []
  const writes: Array<Record<string, unknown>> = []
  const driver: StorageDriver = {
    read(keys) {
      reads.push(keys === null ? null : [...keys])
      const proceed = () => base.read(keys)
      return controls.read ? controls.read(keys, reads.length, proceed) : proceed()
    },
    write(patch) {
      writes.push(clone(patch))
      const apply = () => base.write(patch)
      return controls.write ? controls.write(patch, writes.length, apply) : apply()
    },
    onChanged: (cb) => base.onChanged(cb),
  }
  return { base, driver, reads, writes }
}

describe('createStorage', () => {
  it('first-run init writes and verifies every default before separately stamping and verifying the version', async () => {
    const events: string[] = []
    const controlled = controllableDriver({}, {
      async read(keys, _call, proceed) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return proceed()
      },
      async write(patch, _call, apply) {
        events.push(`write:${Object.keys(patch).join(',')}`)
        await apply()
      },
    })

    await createStorage(controlled.driver, recordingAuthority(events)).init()

    expect(controlled.writes).toEqual([defaults(), { 'aurora:version': CURRENT_VERSION }])
    expect(controlled.reads).toEqual([null, [...KNOWN_KEYS], ['aurora:version']])
    expect(events).toEqual([
      'lock:enter',
      'read:null',
      `write:${KNOWN_KEYS.join(',')}`,
      `read:${KNOWN_KEYS.join(',')}`,
      'write:aurora:version',
      'read:aurora:version',
      'lock:exit',
    ])
  })

  it('resumes an exact interrupted defaults seed by stamping only the version', async () => {
    const controlled = controllableDriver(defaults())

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    expect(controlled.reads).toEqual([null, ['aurora:version']])
    expect(controlled.writes).toEqual([{ 'aurora:version': CURRENT_VERSION }])
  })

  it.each([
    ['partial known data without a version', { settings: defaults().settings }],
    ['non-default complete known data without a version', {
      ...defaults(), settings: { ...defaults().settings, name: 'Unversioned' },
    }],
    ['string version', { ...defaults(), 'aurora:version': '9' }],
    ['non-finite NaN version', { ...defaults(), 'aurora:version': Number.NaN }],
    ['non-finite infinite version', { ...defaults(), 'aurora:version': Number.POSITIVE_INFINITY }],
    ['fractional version', { ...defaults(), 'aurora:version': 9.5 }],
    ['negative version', { ...defaults(), 'aurora:version': -1 }],
    ['unsupported zero version', { ...defaults(), 'aurora:version': 0 }],
  ])('rejects %s safely without writing', async (_label, seed) => {
    const controlled = controllableDriver(seed)

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.writes).toEqual([])
  })

  it.each([
    ['reject-before-apply', false],
    ['apply-then-reject', true],
  ])('handles a fresh defaults write that %s and remains retryable', async (_label, applyFirst) => {
    let reject = true
    const controlled = controllableDriver({}, {
      async write(_patch, call, apply) {
        if (call === 1 && reject) {
          reject = false
          if (applyFirst) await apply()
          throw new Error('private defaults write failure')
        }
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    if (applyFirst) {
      await expect(storage.init()).resolves.toBeUndefined()
    } else {
      const error = await storage.init().catch((caught) => caught)
      expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
      expect(error.message).toBe('Aurora storage initialization failed')
      expect(controlled.base.dump()).toEqual({})
      await expect(storage.init()).resolves.toBeUndefined()
    }
    expect(controlled.base.dump()).toEqual({ ...defaults(), 'aurora:version': CURRENT_VERSION })
  })

  it('rejects a mismatched fresh defaults readback without stamping a version', async () => {
    const controlled = controllableDriver({}, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        return call === 2 ? { ...found, focus: { text: 'wrong', date: '2026-08-15', done: false } } : found
      },
    })

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)
    expect(controlled.writes).toEqual([defaults()])
    expect(controlled.base.dump()).not.toHaveProperty('aurora:version')
  })

  it('reports a fixed safe error when fresh defaults readback rejects, then resumes the exact seed', async () => {
    let rejectReadback = true
    const controlled = controllableDriver({}, {
      async read(_keys, call, proceed) {
        if (call === 2 && rejectReadback) {
          rejectReadback = false
          throw new Error('private defaults readback failure')
        }
        return proceed()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    const error = await storage.init().catch((caught) => caught)
    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.base.dump()).toEqual(defaults())
    await expect(storage.init()).resolves.toBeUndefined()
  })

  it.each([
    ['reject-before-apply', false],
    ['apply-then-reject', true],
  ])('verifies a version stamp that %s and allows the interrupted seed to retry', async (_label, applyFirst) => {
    let reject = true
    const controlled = controllableDriver(defaults(), {
      async write(_patch, call, apply) {
        if (call === 1 && reject) {
          reject = false
          if (applyFirst) await apply()
          throw new Error('private version write failure')
        }
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    if (applyFirst) {
      await expect(storage.init()).resolves.toBeUndefined()
    } else {
      await expect(storage.init()).rejects.toBeInstanceOf(storageModule.StorageInitializationError)
      expect(controlled.base.dump()).toEqual(defaults())
      await expect(storage.init()).resolves.toBeUndefined()
    }
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
  })

  it('rejects a mismatched version readback', async () => {
    const controlled = controllableDriver(defaults(), {
      async read(_keys, call, proceed) {
        const found = await proceed()
        return call === 2 ? { 'aurora:version': CURRENT_VERSION - 1 } : found
      },
    })

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)
  })

  it('reports a fixed safe error when version readback rejects and a later init observes the applied stamp', async () => {
    let rejectReadback = true
    const controlled = controllableDriver(defaults(), {
      async read(_keys, call, proceed) {
        if (call === 2 && rejectReadback) {
          rejectReadback = false
          throw new Error('private version readback failure')
        }
        return proceed()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    const error = await storage.init().catch((caught) => caught)
    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
    await expect(storage.init()).resolves.toBeUndefined()
  })

  it('old-version init writes and verifies the complete migration target under one acquisition', async () => {
    const events: string[] = []
    const v9 = {
      ...defaults(),
      settings: { ...defaults().settings, name: 'Migrated' },
      layout: { weather: { x: 12, y: 20 } },
      'aurora:version': 9,
      unknown: { sentinel: 'keep' },
    }
    const controlled = controllableDriver(v9, {
      async read(keys, _call, proceed) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return proceed()
      },
      async write(_patch, _call, apply) {
        events.push('write')
        await apply()
      },
    })

    await createStorage(controlled.driver, recordingAuthority(events)).init()

    expect(controlled.reads).toEqual([null, [...KNOWN_KEYS, 'aurora:version']])
    expect(controlled.writes).toHaveLength(1)
    expect(Object.keys(controlled.writes[0])).toEqual([...KNOWN_KEYS, 'aurora:version'])
    expect(controlled.writes[0]['aurora:version']).toBe(CURRENT_VERSION)
    expect((controlled.writes[0].layout as LayoutV2).legacy).toEqual({ weather: { x: 12, y: 20 } })
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'keep' })
    expect(events).toEqual([
      'lock:enter', 'read:null', 'write',
      `read:${[...KNOWN_KEYS, 'aurora:version'].join(',')}`,
      'lock:exit',
    ])
  })

  it('preserves existing data at the current version without writing', async () => {
    const controlled = controllableDriver({
      'aurora:version': CURRENT_VERSION,
      settings: { ...defaults().settings, name: 'Jon' },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())
    await storage.init()
    expect((await storage.get('settings')).name).toBe('Jon')
    expect(controlled.writes).toEqual([])
  })

  it('migrates v10 through v12 with Auto Fit in one authority-held target write and verified readback', async () => {
    const events: string[] = []
    const seed = v10Seed({
      settings: v10Settings({ name: 'Migrated density', muted: true }),
      unknown: { sentinel: 'keep' },
    })
    const controlled = controllableDriver(seed, {
      async read(keys, _call, proceed) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return proceed()
      },
      async write(_patch, _call, apply) {
        events.push('write')
        await apply()
      },
    })

    await createStorage(controlled.driver, recordingAuthority(events)).init()

    expect(controlled.writes).toHaveLength(1)
    expect(controlled.writes[0]['aurora:version']).toBe(CURRENT_VERSION)
    expect((controlled.writes[0].settings as Record<string, unknown>)).toEqual({
      ...seed.settings as Record<string, unknown>,
      layoutDensity: 'auto',
    })
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'keep' })
    expect(events).toEqual([
      'lock:enter', 'read:null', 'write',
      `read:${[...KNOWN_KEYS, 'aurora:version'].join(',')}`,
      'lock:exit',
    ])
  })

  // The v11/v12 metadata-only era ended with v14: migrations[13] backfills
  // the five nested appearance ink fields, so METADATA_ONLY_FLOOR moved to
  // 14 (its own doc rule) and every pre-14 store takes the full migrate
  // path ONCE. These tests pin that path's exactness for the former
  // metadata-only versions: user data survives byte-for-byte, the inks
  // backfill to null, and the missing layouts key arrives as null.
  it('upgrades v11 through the full migrate path: ink fields backfilled, every user value preserved', async () => {
    const layout = {
      version: 2 as const,
      profiles: {},
      legacy: { clock: { x: 12.25, y: 34.75 } },
    }
    const v11Settings = { ...defaults().settings, name: 'Exact v11' } as Record<string, unknown>
    // A real v11 store predates the ink fields AND the layouts key.
    delete v11Settings.widgetTextColor
    delete v11Settings.photoTextColor
    delete v11Settings.photoClockColor
    delete v11Settings.photoGreetingColor
    delete v11Settings.photoQuoteColor
    const seed = {
      ...defaults(),
      layout,
      settings: v11Settings,
      'aurora:version': 11,
      unknown: { sentinel: 'keep' },
    }
    delete (seed as Record<string, unknown>).layouts
    const before = structuredClone(seed)
    const controlled = controllableDriver(seed)

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    const dump = controlled.base.dump() as Record<string, unknown>
    expect(dump['aurora:version']).toBe(CURRENT_VERSION)
    expect(dump.settings).toEqual({
      ...before.settings,
      widgetTextColor: null,
      photoTextColor: null,
      photoClockColor: null,
      photoGreetingColor: null,
      photoQuoteColor: null,
    })
    expect(dump.layout).toEqual(before.layout)
    expect(dump.layouts).toBeNull()
    expect(dump.unknown).toEqual({ sentinel: 'keep' })
  })

  it('upgrades v12 the same way: inks backfilled, layout and unknown keys untouched', async () => {
    const v12Settings = { ...defaults().settings, name: 'Exact v12' } as Record<string, unknown>
    delete v12Settings.widgetTextColor
    delete v12Settings.photoTextColor
    delete v12Settings.photoClockColor
    delete v12Settings.photoGreetingColor
    delete v12Settings.photoQuoteColor
    const seed = {
      ...defaults(),
      layout: { version: 3 as const, profiles: {} },
      settings: v12Settings,
      'aurora:version': 12,
      unknown: { sentinel: 'keep' },
    }
    delete (seed as Record<string, unknown>).layouts
    const before = structuredClone(seed)
    const controlled = controllableDriver(seed)

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    const dump = controlled.base.dump() as Record<string, unknown>
    expect(dump['aurora:version']).toBe(CURRENT_VERSION)
    expect(dump.settings).toEqual({
      ...before.settings,
      widgetTextColor: null,
      photoTextColor: null,
      photoClockColor: null,
      photoGreetingColor: null,
      photoQuoteColor: null,
    })
    expect(dump.layout).toEqual(before.layout)
    expect(dump.unknown).toEqual({ sentinel: 'keep' })
  })

  it('fresh defaults include layouts: null', async () => {
    const controlled = controllableDriver({})
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())
    await storage.init()
    expect(await storage.get('layouts')).toBeNull()
  })

  it('upgrades v15 through the full migration path so nested browser toggles exist', async () => {
    const widgets = { ...defaults().settings.widgets } as Record<string, boolean>
    for (const key of ['readingList', 'recentlyClosed', 'downloads', 'tabGroups']) delete widgets[key]
    const seed = {
      ...defaults(),
      settings: { ...defaults().settings, name: 'Exact v15', widgets },
      'aurora:version': 15,
      unknown: { sentinel: 'keep' },
    }
    const controlled = controllableDriver(seed)

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    expect(controlled.writes).toHaveLength(1)
    expect(controlled.writes[0]['aurora:version']).toBe(16)
    expect((controlled.writes[0].settings as ReturnType<typeof defaults>['settings']).widgets).toMatchObject({
      readingList: false,
      recentlyClosed: false,
      downloads: false,
      tabGroups: false,
    })
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'keep' })
  })

  it('rejects malformed v15 widget settings without writing or stamping v16', async () => {
    const seed = {
      ...defaults(),
      settings: { ...defaults().settings, widgets: 'oops' },
      'aurora:version': 15,
    }
    const controlled = controllableDriver(seed)

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)

    expect(controlled.writes).toEqual([])
    expect(controlled.base.dump()['aurora:version']).toBe(15)
    expect((controlled.base.dump().settings as Record<string, unknown>).widgets).toBe('oops')
  })

  it('upgrades v14 atomically, materializing timerSession null and preserving both layout authorities', async () => {
    const seed = {
      ...defaults(),
      layout: { version: 3 as const, profiles: {} },
      layouts: {
        version: 1 as const,
        activeLayoutId: 'desk',
        layouts: [{ id: 'desk', name: 'Desk', widgets: {} }],
      },
      settings: { ...defaults().settings, name: 'Exact v14' },
      'aurora:version': 14,
      unknown: { sentinel: 'keep' },
    } as Record<string, unknown>
    delete seed.timerSession
    const before = structuredClone(seed)
    const controlled = controllableDriver(seed)

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    expect(controlled.writes).toHaveLength(1)
    expect(controlled.writes[0].timerSession).toBeNull()
    expect(controlled.writes[0].layout).toEqual(before.layout)
    expect(controlled.writes[0].layouts).toEqual(before.layouts)
    expect(controlled.writes[0].settings).toEqual(before.settings)
    expect(controlled.writes[0]['aurora:version']).toBe(16)
    expect(controlled.base.dump().unknown).toEqual(before.unknown)
  })

  it('rolls a failed v14 migration verification back to the exact prior logical values', async () => {
    const seed = { ...defaults(), 'aurora:version': 14 } as Record<string, unknown>
    delete seed.timerSession
    const before = structuredClone(seed)
    const controlled = controllableDriver(seed, {
      async read(keys, call, proceed) {
        const found = await proceed()
        if (call === 2 && keys?.includes('aurora:version')) return { 'aurora:version': 14 }
        return found
      },
    })

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)

    expect(controlled.writes).toHaveLength(2)
    expect(controlled.writes[0].timerSession).toBeNull()
    // Rollback follows the storage-wide standing rule: a previously missing
    // known top-level key is materialized at its logical default.
    expect(controlled.writes[1].timerSession).toBeNull()
    expect(controlled.base.dump()).toEqual({ ...before, timerSession: null })
  })

  it('rolls a failed v11 migration verification back to the literal pre-upgrade store', async () => {
    // v11 takes the full migrate path since the floor moved to 14; a failed
    // post-write verification must restore the exact prior bytes.
    const seed = { ...defaults(), 'aurora:version': 11 }
    const controlled = controllableDriver(seed, {
      async read(keys, call, proceed) {
        const found = await proceed()
        if (call === 2 && keys?.includes('aurora:version')) return { 'aurora:version': 11 }
        return found
      },
    })

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)

    expect(controlled.writes).toHaveLength(2)
    expect((controlled.writes[0] as Record<string, unknown>)['aurora:version']).toBe(CURRENT_VERSION)
    expect((controlled.writes[1] as Record<string, unknown>)['aurora:version']).toBe(11)
    expect(controlled.base.dump()).toEqual(seed)
  })

  it.each([
    ['absent', () => {
      const { settings: _settings, ...seed } = v10Seed()
      return seed
    }],
    ['null', () => v10Seed({ settings: null })],
    ['string', () => v10Seed({ settings: 'corrupt' })],
    ['array', () => v10Seed({ settings: [] })],
  ])('rejects a malformed persisted v10 %s settings container before any write', async (_label, makeSeed) => {
    const seed = makeSeed()
    const before = structuredClone(seed)
    const controlled = controllableDriver(seed)

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.writes).toEqual([])
    expect(controlled.base.dump()).toEqual(before)
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['non-string', 7],
    ['unknown', 'dense'],
  ])('repairs a current-v12 %s density only, verifies it under authority, and notifies settings subscribers', async (_label, density) => {
    const events: string[] = []
    const settings = { ...defaults().settings, name: 'Keep every sibling', muted: true } as unknown as Record<string, unknown>
    if (density === undefined) delete settings.layoutDensity
    else settings.layoutDensity = density
    const controlled = controllableDriver({
      ...defaults(),
      settings,
      'aurora:version': CURRENT_VERSION,
      unknown: { sentinel: 'keep' },
    }, {
      async read(keys, _call, proceed) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return proceed()
      },
      async write(_patch, _call, apply) {
        events.push('write:settings')
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, recordingAuthority(events))
    const changed = vi.fn()
    storage.subscribe('settings', changed)

    await storage.init()

    const expected = { ...settings, layoutDensity: 'auto' }
    expect(await storage.get('settings')).toEqual(expected)
    expect(controlled.writes).toEqual([{ settings: expected }])
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'keep' })
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith(expected)
    expect(events).toEqual([
      'lock:enter', 'read:null', 'write:settings', 'read:settings', 'lock:exit',
      'read:settings',
    ])
  })

  it.each(['auto', 'compact', 'balanced', 'spacious'] as const)(
    'leaves valid current-v12 density %s byte-for-byte unchanged',
    async (layoutDensity) => {
      const settings = { ...defaults().settings, name: 'Current', layoutDensity }
      const controlled = controllableDriver({ settings, 'aurora:version': CURRENT_VERSION })

      await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

      expect(controlled.writes).toEqual([])
      expect((await controlled.base.read(['settings'])).settings).toEqual(settings)
    },
  )

  it('rolls back a rejected current-v12 repair and succeeds on retry without changing Settings siblings', async () => {
    const settings = v10Settings({ name: 'Rollback me', panelColor: '#123456' })
    let rejectFirst = true
    const controlled = controllableDriver({ settings, 'aurora:version': CURRENT_VERSION }, {
      async write(_patch, _call, apply) {
        if (rejectFirst) {
          rejectFirst = false
          throw new Error('private repair write rejection')
        }
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    const error = await storage.init().catch((caught) => caught)
    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect((await controlled.base.read(['settings'])).settings).toEqual(settings)

    await expect(storage.init()).resolves.toBeUndefined()
    expect((await storage.get('settings'))).toEqual({ ...settings, layoutDensity: 'auto' })
  })

  it('rolls back a mismatched current-v12 repair readback and reports fatal rollback failure distinctly', async () => {
    const settings = v10Settings({ name: 'Fatal rollback' })
    const controlled = controllableDriver({ settings, 'aurora:version': CURRENT_VERSION }, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call === 2) return { settings: { ...settings, layoutDensity: 'dense' } }
        if (call === 3) return { settings: { ...settings, name: 'wrong rollback' } }
        return found
      },
    })

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.AtomicMigrationRollbackError)
    expect(error.message).toBe('Aurora storage migration rollback failed')
    expect(controlled.writes).toEqual([
      { settings: { ...settings, layoutDensity: 'auto' } },
      { settings },
    ])
  })

  it('rolls back a failed v10 target and retries the complete migration to v11', async () => {
    let rejectTarget = true
    const seed = v10Seed({ settings: v10Settings({ name: 'Retry v10' }) })
    const controlled = controllableDriver(seed, {
      async write(_patch, call, apply) {
        if (call === 1 && rejectTarget) {
          rejectTarget = false
          throw new Error('private target rejection')
        }
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    await expect(storage.init()).rejects.toBeInstanceOf(storageModule.StorageInitializationError)
    expect((await controlled.base.read(['settings', 'aurora:version']))).toEqual({
      settings: seed.settings,
      'aurora:version': 10,
    })
    await expect(storage.init()).resolves.toBeUndefined()
    expect((await storage.get('settings')).layoutDensity).toBe('auto')
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
  })

  it('does not repair invalid density in a future-version store', async () => {
    const settings = v10Settings({ layoutDensity: 'dense' })
    const controlled = controllableDriver({ settings, 'aurora:version': CURRENT_VERSION + 1 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await createStorage(controlled.driver, createInProcessStorageAuthority()).init()

    expect(controlled.writes).toEqual([])
    expect((await controlled.base.read(['settings'])).settings).toEqual(settings)
    warn.mockRestore()
  })

  it('future-version init warns under one acquisition and performs no write', async () => {
    const events: string[] = []
    const controlled = controllableDriver({ 'aurora:version': CURRENT_VERSION + 1 }, {
      async read(keys, _call, proceed) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return proceed()
      },
      async write(_patch, _call, apply) {
        events.push('write')
        await apply()
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await createStorage(controlled.driver, recordingAuthority(events)).init()

    expect(events).toEqual(['lock:enter', 'read:null', 'lock:exit'])
    expect(controlled.writes).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      `Aurora data is schema v${CURRENT_VERSION + 1}, app expects v${CURRENT_VERSION}`,
    )
    warn.mockRestore()
  })

  it('rejects an invalid known legacy row before any migration write', async () => {
    const controlled = controllableDriver(v9Seed({ layout: { weather: { x: Number.NaN, y: 20 } } }))

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(LegacyLayoutValidationError)
    expect(controlled.writes).toEqual([])
  })

  it('rejects a missing v9 migration step before any storage write', async () => {
    const registry = migrations as Partial<Record<number, Migration>>
    const step = registry[9]
    delete registry[9]
    const controlled = controllableDriver(v9Seed())
    try {
      const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
        .init().catch((caught) => caught)

      expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
      expect(error.message).toBe('Aurora storage initialization failed')
      expect(error.message).not.toContain('schema v9')
      expect(error.cause).toBeInstanceOf(Error)
      expect(error.cause.message).toBe('No migration from schema v9')
      expect(controlled.writes).toEqual([])
    } finally {
      registry[9] = step
    }
  })

  it.each([
    ['reject-before-apply', false],
    ['apply-then-reject', true],
  ])('rolls back exact v9 logical values when the migration target write %s', async (_label, applyFirst) => {
    const seed = v9Seed({
      notes: { text: 'private prior note', updatedAt: 9 },
      unknown: { sentinel: 'keep' },
    })
    const controlled = controllableDriver(seed, {
      async write(_patch, call, apply) {
        if (call === 1) {
          if (applyFirst) await apply()
          throw new Error('private target write cause')
        }
        await apply()
      },
    })

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.writes).toHaveLength(2)
    expect(controlled.writes[1]).toEqual(Object.fromEntries([
      ...KNOWN_KEYS.map((key) => [key, seed[key]]),
      ['aurora:version', 9],
    ]))
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'keep' })
    expect(await controlled.base.read([...KNOWN_KEYS, 'aurora:version'])).toEqual(controlled.writes[1])
  })

  it.each([
    ['rejects', 'reject'],
    ['mismatches', 'mismatch'],
  ])('rolls back exact v9 logical values when target readback %s', async (_label, mode) => {
    const seed = v9Seed({ unknown: 'keep' })
    const controlled = controllableDriver(seed, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call !== 2) return found
        if (mode === 'reject') throw new Error('private target read cause')
        return { ...found, notes: { text: 'wrong', updatedAt: 10 } }
      },
    })

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.StorageInitializationError)
    expect(error.message).toBe('Aurora storage initialization failed')
    expect(controlled.writes).toHaveLength(2)
    expect(await controlled.base.read([...KNOWN_KEYS, 'aurora:version'])).toEqual(controlled.writes[1])
    expect(controlled.base.dump().unknown).toBe('keep')
  })

  it('materializes missing prior keys at v9 logical defaults during rollback', async () => {
    const seed = {
      settings: { ...defaults().settings, name: 'Stored v9' },
      layout: { weather: { x: 12, y: 20 } },
      'aurora:version': 9,
      unknown: 'keep',
    }
    const controlled = controllableDriver(seed, {
      async write(_patch, call, apply) {
        if (call === 1) throw new Error('target rejected')
        await apply()
      },
    })

    await expect(createStorage(controlled.driver, createInProcessStorageAuthority()).init())
      .rejects.toBeInstanceOf(storageModule.StorageInitializationError)

    expect(controlled.writes[1]).toEqual({
      ...defaults(),
      settings: seed.settings,
      layout: seed.layout,
      'aurora:version': 9,
    })
    expect(controlled.base.dump().unknown).toBe('keep')
  })

  it.each([
    ['rollback write rejection', 'write'],
    ['rollback read rejection', 'read'],
    ['rollback readback mismatch', 'mismatch'],
  ])('raises a distinct fixed-message fatal migration error for %s', async (_label, mode) => {
    const controlled = controllableDriver(v9Seed(), {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call === 2) return { ...found, notes: { text: 'wrong target readback', updatedAt: 10 } }
        if (call === 3 && mode === 'read') throw new Error('private rollback read cause')
        if (call === 3 && mode === 'mismatch') return { ...found, links: [{ private: 'wrong' }] }
        return found
      },
      async write(_patch, call, apply) {
        if (call === 2 && mode === 'write') throw new Error('private rollback write cause')
        await apply()
      },
    })

    const error = await createStorage(controlled.driver, createInProcessStorageAuthority())
      .init().catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.AtomicMigrationRollbackError)
    expect(error.message).toBe('Aurora storage migration rollback failed')
    expect(error.message).not.toContain('private')
    expect(error.primaryError).toBeDefined()
    expect(error.rollbackError).toBeDefined()
  })

  it('keeps a second context queued through migration target verification', async () => {
    let verificationEntered = () => {}
    let releaseVerification = () => {}
    const entered = new Promise<void>((resolve) => { verificationEntered = resolve })
    const gate = new Promise<void>((resolve) => { releaseVerification = resolve })
    const controlled = controllableDriver(v9Seed(), {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call === 2) {
          verificationEntered()
          await gate
        }
        return found
      },
    })
    const authority = createInProcessStorageAuthority()
    const migrating = createStorage(controlled.driver, authority)
    const second = createStorage(controlled.driver, authority)

    const init = migrating.init()
    await entered
    const queued = second.set('focus', { text: 'queued', date: '2026-08-15', done: false })
    await Promise.resolve()
    await Promise.resolve()
    expect(controlled.writes).toHaveLength(1)
    releaseVerification()
    await init
    await queued
    expect(controlled.writes).toHaveLength(2)
    expect((await controlled.base.read(['focus'])).focus).toEqual({
      text: 'queued', date: '2026-08-15', done: false,
    })
  })

  it('keeps a second context queued until a failed migration fully rolls back', async () => {
    let rollbackReadEntered = () => {}
    let releaseRollbackRead = () => {}
    const entered = new Promise<void>((resolve) => { rollbackReadEntered = resolve })
    const gate = new Promise<void>((resolve) => { releaseRollbackRead = resolve })
    const controlled = controllableDriver(v9Seed(), {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call === 2) return { ...found, notes: { text: 'wrong target readback', updatedAt: 10 } }
        if (call === 3) {
          rollbackReadEntered()
          await gate
        }
        return found
      },
    })
    const authority = createInProcessStorageAuthority()
    const migrating = createStorage(controlled.driver, authority)
    const second = createStorage(controlled.driver, authority)

    const init = migrating.init()
    await entered
    const queuedFocus = { text: 'queued', date: '2026-08-15', done: false }
    const queued = second.set('focus', queuedFocus)
    await Promise.resolve()
    await Promise.resolve()
    expect(controlled.writes).toHaveLength(2)
    releaseRollbackRead()
    await expect(init).rejects.toBeInstanceOf(storageModule.StorageInitializationError)
    await queued
    expect(controlled.writes).toHaveLength(3)
    expect((await controlled.base.read(['focus'])).focus).toEqual(queuedFocus)
  })

  it('allows a successful init retry after safe rollback', async () => {
    let failFirstTarget = true
    const controlled = controllableDriver(v9Seed(), {
      async write(_patch, _call, apply) {
        if (failFirstTarget) {
          failFirstTarget = false
          throw new Error('first target rejected')
        }
        await apply()
      },
    })
    const storage = createStorage(controlled.driver, createInProcessStorageAuthority())

    await expect(storage.init()).rejects.toBeInstanceOf(storageModule.StorageInitializationError)
    await expect(storage.init()).resolves.toBeUndefined()
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect((controlled.base.dump().layout as LayoutV2).legacy).toEqual({
      weather: { x: 12, y: 20 }, focus: { x: 50, y: 50 },
    })
  })

  it('get falls back to defaults for a missing key', async () => {
    const storage = createStorage(memoryDriver({ 'aurora:version': CURRENT_VERSION }))
    await storage.init()
    expect(await storage.get('timerConfig')).toEqual({ workMinutes: 25, breakMinutes: 5 })
  })

  it('set/get round-trips', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('focus', { text: 'Ship M2', date: '2026-07-26', done: false })
    expect((await storage.get('focus'))?.text).toBe('Ship M2')
  })

  it('update applies a function to the current value', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('links', [{ id: 'a', title: 'A', url: 'https://a.example' }])
    const out = await storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])
    expect(out.map((l) => l.id)).toEqual(['a', 'b'])
    expect(await storage.get('links')).toEqual(out)
  })

  it('subscribe fires for its key only, and unsubscribe stops it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onFocus = vi.fn()
    const unsub = storage.subscribe('focus', onFocus)
    await storage.set('links', [])
    expect(onFocus).not.toHaveBeenCalled()
    await storage.set('focus', { text: 'x', date: '2026-07-26', done: false })
    expect(onFocus).toHaveBeenCalledWith({ text: 'x', date: '2026-07-26', done: false })
    unsub()
    await storage.set('focus', null)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('a deep-equal write does not notify subscribers; a changed write does', async () => {
    // chrome.storage.onChanged never fires for a write that doesn't actually
    // change the stored value. memoryDriver must be faithful to that or bugs
    // like the photo-upload no-op (deep-equal re-save of photoPrefs) slip past
    // tests that use a more permissive double.
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onPhotoPrefs = vi.fn()
    storage.subscribe('photoPrefs', onPhotoPrefs)

    const current = await storage.get('photoPrefs')
    await storage.set('photoPrefs', { ...current })
    expect(onPhotoPrefs).not.toHaveBeenCalled()

    const changed = { ...current, mode: 'gradient' as const }
    await storage.set('photoPrefs', changed)
    expect(onPhotoPrefs).toHaveBeenCalledTimes(1)
    expect(onPhotoPrefs).toHaveBeenCalledWith(changed)
  })

  it('serializes concurrent update() calls on the same key', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [{ id: 'l1', name: 'A', items: [] }])
    const slow = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l2', name: 'B', items: [] },
    ])
    const fast = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l3', name: 'C', items: [] },
    ])
    await Promise.all([slow, fast])
    const ids = (await storage.get('todoLists')).map((l) => l.id)
    expect(ids).toEqual(['l1', 'l2', 'l3']) // neither write lost
  })

  it('the independent-context control loses one same-key update without a shared authority', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      todoLists: [{ id: 'l1', name: 'A', items: [] }],
    })
    let waitingReads = 0
    let bothReadsReady = () => {}
    let releaseReads = () => {}
    const bothReads = new Promise<void>((resolve) => {
      bothReadsReady = resolve
    })
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve
    })
    const driver: StorageDriver = {
      async read(keys) {
        const value = await base.read(keys)
        if (keys?.includes('todoLists')) {
          waitingReads += 1
          if (waitingReads === 2) bothReadsReady()
          await readsReleased
        }
        return value
      },
      write: (patch) => base.write(patch),
      onChanged: (cb) => base.onChanged(cb),
    }
    const first = createStorage(driver, createInProcessStorageAuthority())
    const second = createStorage(driver, createInProcessStorageAuthority())

    const updates = Promise.all([
      first.update('todoLists', (lists) => [...lists, { id: 'l2', name: 'B', items: [] }]),
      second.update('todoLists', (lists) => [...lists, { id: 'l3', name: 'C', items: [] }]),
    ])
    await bothReads
    releaseReads()
    await updates

    expect((await first.get('todoLists')).map((list) => list.id)).toHaveLength(2)
  })

  it('preserves both same-key updates from independent contexts under one shared authority', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      todoLists: [{ id: 'l1', name: 'A', items: [] }],
    })
    let reads = 0
    let releaseFirstWrite = () => {}
    let firstWriteEntered = () => {}
    const writeReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve
    })
    const firstWrite = new Promise<void>((resolve) => {
      firstWriteEntered = resolve
    })
    const driver: StorageDriver = {
      async read(keys) {
        if (keys?.includes('todoLists')) reads += 1
        return base.read(keys)
      },
      async write(patch) {
        if ('todoLists' in patch && reads === 1) {
          firstWriteEntered()
          await writeReleased
        }
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const authority = createInProcessStorageAuthority()
    const first = createStorage(driver, authority)
    const second = createStorage(driver, authority)

    const firstUpdate = first.update('todoLists', (lists) => [
      ...lists,
      { id: 'l2', name: 'B', items: [] },
    ])
    await firstWrite
    const secondUpdater = vi.fn((lists: ReturnType<typeof defaults>['todoLists']) => [
      ...lists,
      { id: 'l3', name: 'C', items: [] },
    ])
    const secondUpdate = second.update('todoLists', secondUpdater)

    expect(reads).toBe(1)
    expect(secondUpdater).not.toHaveBeenCalled()
    releaseFirstWrite()
    await Promise.all([firstUpdate, secondUpdate])

    expect((await first.get('todoLists')).map((list) => list.id)).toEqual(['l1', 'l2', 'l3'])
  })

  it('holds one authority acquisition across update read and write', async () => {
    const events: string[] = []
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      links: [{ id: 'a', title: 'A', url: 'https://a.example' }],
    })
    const driver: StorageDriver = {
      async read(keys) {
        events.push('read')
        return base.read(keys)
      },
      async write(patch) {
        events.push('write')
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, recordingAuthority(events))

    await storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])

    expect(events).toEqual(['lock:enter', 'read', 'write', 'lock:exit'])
  })

  it('routes set and setMany through the same authority and propagates changed keys', async () => {
    const events: string[] = []
    const base = memoryDriver({ 'aurora:version': CURRENT_VERSION })
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      async write(patch) {
        events.push(`write:${Object.keys(patch).sort().join(',')}`)
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, recordingAuthority(events))
    const focusChanges = vi.fn()
    const linkChanges = vi.fn()
    storage.subscribe('focus', focusChanges)
    storage.subscribe('links', linkChanges)

    await storage.set('focus', { text: 'First', date: '2026-08-13', done: false })
    await storage.setMany({
      focus: { text: 'Ship W1-P2', date: '2026-08-13', done: false },
      links: [{ id: 'authority', title: 'Authority', url: 'https://example.com' }],
    })

    expect(events).toEqual([
      'lock:enter', 'write:focus', 'lock:exit',
      'lock:enter', 'write:focus,links', 'lock:exit',
    ])
    expect(focusChanges).toHaveBeenLastCalledWith({
      text: 'Ship W1-P2', date: '2026-08-13', done: false,
    })
    expect(linkChanges).toHaveBeenCalledWith([
      { id: 'authority', title: 'Authority', url: 'https://example.com' },
    ])
  })

  it('updates named keys through one authority-held read and one patch write', async () => {
    const events: string[] = []
    const { driver, writes } = controllableDriver({
      'aurora:version': CURRENT_VERSION,
      location: { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true },
      weatherCache: null,
    }, {
      read: async (keys, _call, proceed) => {
        events.push(`read:${keys?.join(',')}`)
        return proceed()
      },
      write: async (patch, _call, apply) => {
        events.push(`write:${Object.keys(patch).join(',')}`)
        await apply()
      },
    })
    const storage = createStorage(driver, recordingAuthority(events))

    const result = await storage.updateMany(['location', 'weatherCache'], ({ location }) => ({
      weatherCache: {
        current: { tempC: 21, feelsLikeC: 20, code: 0, windKmh: 5, humidity: 50 },
        hourly: [],
        fetchedAt: 123,
        locationLabel: location?.label ?? '',
        requestIdentity: 'open-meteo:v1:dallas',
      },
    }))

    expect(events).toEqual([
      'lock:enter',
      'read:location,weatherCache',
      'write:weatherCache',
      'lock:exit',
    ])
    expect(writes).toHaveLength(1)
    expect(result.weatherCache?.requestIdentity).toBe('open-meteo:v1:dallas')
  })

  it('lets a conditional cache commit observe a newer cross-context location inside the lock', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      location: { lat: 32.7767, lon: -96.797, label: 'Springfield', manual: true },
      weatherCache: null,
    })
    const authority = createInProcessStorageAuthority()
    const first = createStorage(base, authority)
    const second = createStorage(base, authority)

    await second.setMany({
      location: { lat: 34.0232, lon: -84.3616, label: 'Springfield', manual: true },
      weatherCache: null,
    })
    const updater = vi.fn(({ location }: Pick<AuroraData, 'location' | 'weatherCache'>) => (
      location?.lat === 32.7767
        ? {
            weatherCache: {
              current: { tempC: 21, feelsLikeC: 20, code: 0, windKmh: 5, humidity: 50 },
              hourly: [],
              fetchedAt: 123,
              locationLabel: 'Springfield',
              requestIdentity: 'open-meteo:v1:old',
            },
          }
        : {}
    ))
    const result = await first.updateMany(['location', 'weatherCache'], updater)

    expect(updater).toHaveBeenCalledWith({
      location: { lat: 34.0232, lon: -84.3616, label: 'Springfield', manual: true },
      weatherCache: null,
    })
    expect(result).toEqual({})
    expect(await first.get('weatherCache')).toBeNull()
  })

  it('updateMany recovers after authority/updater failure and skips empty patches', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      location: null,
      weatherCache: null,
    })
    const read = vi.fn(base.read)
    const write = vi.fn(base.write)
    let rejectAuthority = true
    const inner = createInProcessStorageAuthority()
    const authority: StorageAuthority = {
      runExclusive: (work) => {
        if (rejectAuthority) {
          rejectAuthority = false
          return Promise.reject(new Error('authority failed'))
        }
        return inner.runExclusive(work)
      },
    }
    const storage = createStorage({ read, write, onChanged: base.onChanged }, authority)
    const updater = vi.fn(() => ({}))

    await expect(storage.updateMany(['location', 'weatherCache'], updater)).rejects.toThrow('authority failed')
    expect(read).not.toHaveBeenCalled()
    expect(updater).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()

    await expect(storage.updateMany(['location', 'weatherCache'], () => {
      throw new Error('updater failed')
    })).rejects.toThrow('updater failed')
    expect(write).not.toHaveBeenCalled()

    await expect(storage.updateMany(['location', 'weatherCache'], updater)).resolves.toEqual({})
    expect(updater).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('authority failure performs no read, updater callback, or write', async () => {
    const read = vi.fn(async () => ({ links: [] }))
    const write = vi.fn(async () => {})
    const updater = vi.fn((links: ReturnType<typeof defaults>['links']) => links)
    const authority: StorageAuthority = {
      runExclusive: async () => { throw new Error('authority failed') },
    }
    const storage = createStorage({ read, write, onChanged: () => () => {} }, authority)

    await expect(storage.update('links', updater)).rejects.toThrow('authority failed')
    expect(read).not.toHaveBeenCalled()
    expect(updater).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('a rejected write preserves the old value and the next queued update succeeds', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      links: [{ id: 'a', title: 'A', url: 'https://a.example' }],
    })
    let rejectNext = true
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      async write(patch) {
        if (rejectNext) {
          rejectNext = false
          throw new Error('storage rejected')
        }
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, createInProcessStorageAuthority())

    await expect(storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])).rejects.toThrow('storage rejected')
    expect((await storage.get('links')).map((link) => link.id)).toEqual(['a'])

    await expect(storage.update('links', (links) => [
      ...links,
      { id: 'c', title: 'C', url: 'https://c.example' },
    ])).resolves.toEqual([
      { id: 'a', title: 'A', url: 'https://a.example' },
      { id: 'c', title: 'C', url: 'https://c.example' },
    ])
  })

  it('update() works when destructured (no this-binding)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { update, get } = storage
    await update('focus', () => ({ text: 'x', date: '2026-07-26', done: false }))
    expect((await get('focus'))?.text).toBe('x')
  })

  it('snapshot holds one authority acquisition around one all-known-key read', async () => {
    const events: string[] = []
    let releaseRead = () => {}
    let readEntered = () => {}
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const readStarted = new Promise<void>((resolve) => { readEntered = resolve })
    const controlled = controllableDriver({
      ...PREVIOUS,
      'aurora:version': CURRENT_VERSION,
      unknown: 'not backup state',
    }, {
      async read(_keys, call, proceed) {
        events.push(`read:${call}`)
        const value = await proceed()
        if (call === 1) {
          readEntered()
          await readGate
        }
        return value
      },
      async write(_patch, call, apply) {
        events.push(`write:${call}`)
        await apply()
      },
    })
    const authority = recordingAuthority(events)
    const first = atomicStorage(controlled.driver, authority)
    const second = createStorage(controlled.driver, authority)

    const snapshot = first.snapshot()
    await readStarted
    const mutation = second.setMany({
      focus: { text: 'Concurrent focus', date: '2026-08-16', done: false },
      links: [{ id: 'concurrent', title: 'Concurrent', url: 'https://concurrent.example' }],
    })

    await Promise.resolve()
    expect(controlled.writes).toEqual([])
    releaseRead()

    await expect(snapshot).resolves.toEqual(PREVIOUS)
    await mutation
    expect(controlled.reads).toEqual([KNOWN_KEYS])
    expect(events).toEqual([
      'lock:enter', 'read:1', 'lock:exit',
      'lock:enter', 'write:1', 'lock:exit',
    ])
  })

  it('snapshot defaults missing known keys and excludes unknown and version keys', async () => {
    const focus = { text: 'Only stored key', date: '2026-08-14', done: false }
    const controlled = controllableDriver({
      focus,
      'aurora:version': CURRENT_VERSION,
      unknown: { private: 'driver-only' },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())

    const snapshot = await storage.snapshot()

    expect(snapshot).toEqual({ ...defaults(), focus })
    expect(Object.keys(snapshot)).toEqual(KNOWN_KEYS)
    expect(snapshot).not.toHaveProperty('aurora:version')
    expect(snapshot).not.toHaveProperty('unknown')
    expect(controlled.reads).toEqual([KNOWN_KEYS])
  })

  it('replace writes and verifies one all-key patch, finalizes the literal pre-image, and notifies subscribers', async () => {
    const events: string[] = []
    const controlled = controllableDriver({
      ...PREVIOUS,
      'aurora:version': CURRENT_VERSION,
      unknown: 'preserved outside backup state',
    }, {
      async read(_keys, call, proceed) {
        events.push(`read:${call}`)
        return proceed()
      },
      async write(_patch, call, apply) {
        events.push(`write:${call}`)
        await apply()
      },
    })
    const storage = atomicStorage(controlled.driver, recordingAuthority(events))
    const focusChanged = vi.fn()
    storage.subscribe('focus', focusChanged)
    const finalize = vi.fn(async (previous: AuroraData) => {
      events.push('finalize')
      expect(previous).toEqual(PREVIOUS)
      return 'permissions reconciled'
    })

    await expect(storage.replaceAllWithRollback(TARGET, finalize)).resolves.toEqual({
      previous: PREVIOUS,
      value: 'permissions reconciled',
    })

    expect(controlled.reads).toEqual([KNOWN_KEYS, KNOWN_KEYS])
    expect(controlled.writes).toEqual([TARGET])
    expect(Object.keys(controlled.writes[0])).toEqual(KNOWN_KEYS)
    expect(focusChanged).toHaveBeenCalledWith(TARGET.focus)
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      'lock:enter', 'read:1', 'write:1', 'read:2', 'finalize', 'lock:exit',
    ])
    expect(controlled.base.dump().unknown).toBe('preserved outside backup state')
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
  })

  it('replace accepts structurally equal readback with different object key insertion order', async () => {
    const controlled = controllableDriver(PREVIOUS, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call !== 2) return found
        const settings = found.settings as Record<string, unknown>
        return {
          ...found,
          settings: Object.fromEntries(Object.entries(settings).reverse()),
        }
      },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())

    await expect(storage.replaceAllWithRollback(TARGET, async () => 'done')).resolves.toEqual({
      previous: PREVIOUS,
      value: 'done',
    })
  })

  it('authority rejection runs no storage or finalizer work and a later replace can retry', async () => {
    const controlled = controllableDriver(PREVIOUS)
    const denied = new Error('authority unavailable')
    let attempts = 0
    const authority: StorageAuthority = {
      async runExclusive(work) {
        attempts += 1
        if (attempts === 1) throw denied
        return work()
      },
    }
    const storage = atomicStorage(controlled.driver, authority)
    const finalize = vi.fn(async () => 'done')

    await expect(storage.replaceAllWithRollback(TARGET, finalize)).rejects.toBe(denied)
    expect(controlled.reads).toEqual([])
    expect(controlled.writes).toEqual([])
    expect(finalize).not.toHaveBeenCalled()

    await expect(storage.replaceAllWithRollback(TARGET, finalize)).resolves.toEqual({
      previous: PREVIOUS,
      value: 'done',
    })
    expect(attempts).toBe(2)
  })

  it.each([
    ['rejects before applying', false],
    ['applies then rejects', true],
  ])('rolls back the exact pre-image when the target write %s', async (_label, applyFirst) => {
    const primary = new Error(applyFirst ? 'target applied then rejected' : 'target rejected')
    const controlled = controllableDriver(PREVIOUS, {
      async write(_patch, call, apply) {
        if (call === 1) {
          if (applyFirst) await apply()
          throw primary
        }
        await apply()
      },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())
    const finalize = vi.fn(async () => 'not reached')

    await expect(storage.replaceAllWithRollback(TARGET, finalize)).rejects.toBe(primary)

    expect(finalize).not.toHaveBeenCalled()
    expect(controlled.writes).toEqual([TARGET, PREVIOUS])
    expect(Object.keys(controlled.writes[1])).toEqual(KNOWN_KEYS)
    expect(await controlled.base.read([...KNOWN_KEYS])).toEqual(PREVIOUS)
    expect(controlled.reads).toEqual([KNOWN_KEYS, KNOWN_KEYS])
  })

  it.each([
    ['returns a wrong key', 'mismatch'],
    ['rejects', 'reject'],
  ])('rolls back and skips finalize when target readback %s', async (_label, mode) => {
    const primary = new Error(`target readback ${mode}`)
    const controlled = controllableDriver(PREVIOUS, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call !== 2) return found
        if (mode === 'reject') throw primary
        return {
          ...found,
          focus: { text: 'Wrong readback', date: '2026-08-17', done: false },
        }
      },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())
    const finalize = vi.fn(async () => 'not reached')

    const error = await storage.replaceAllWithRollback(TARGET, finalize).catch((caught) => caught)

    if (mode === 'reject') expect(error).toBe(primary)
    else expect(error).toBeInstanceOf(Error)
    expect(finalize).not.toHaveBeenCalled()
    expect(controlled.writes).toEqual([TARGET, PREVIOUS])
    expect(await controlled.base.read([...KNOWN_KEYS])).toEqual(PREVIOUS)
    expect(controlled.reads).toEqual([KNOWN_KEYS, KNOWN_KEYS, KNOWN_KEYS])
  })

  it('rolls back the exact pre-image when finalize rejects after verified target write', async () => {
    const primary = new Error('permission cleanup failed')
    const controlled = controllableDriver(PREVIOUS)
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())

    await expect(storage.replaceAllWithRollback(TARGET, async (previous) => {
      expect(previous).toEqual(PREVIOUS)
      throw primary
    })).rejects.toBe(primary)

    expect(controlled.writes).toEqual([TARGET, PREVIOUS])
    expect(await controlled.base.read([...KNOWN_KEYS])).toEqual(PREVIOUS)
    expect(controlled.reads).toEqual([KNOWN_KEYS, KNOWN_KEYS, KNOWN_KEYS])
  })

  it('rollback materializes missing known keys at defaults and preserves driver sentinels', async () => {
    const storedFocus = { text: 'Physically stored', date: '2026-08-14', done: false }
    const logicalPrevious: AuroraData = { ...defaults(), focus: storedFocus }
    const primary = new Error('target applied then rejected')
    const controlled = controllableDriver({
      focus: storedFocus,
      'aurora:version': CURRENT_VERSION,
      unknown: { sentinel: 'preserve me' },
    }, {
      async write(_patch, call, apply) {
        await apply()
        if (call === 1) throw primary
      },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())

    await expect(storage.replaceAllWithRollback(TARGET, async () => 'not reached'))
      .rejects.toBe(primary)

    expect(controlled.writes).toEqual([TARGET, logicalPrevious])
    expect(Object.keys(controlled.writes[1])).toEqual(KNOWN_KEYS)
    expect(await controlled.base.read([...KNOWN_KEYS])).toEqual(logicalPrevious)
    expect(controlled.base.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect(controlled.base.dump().unknown).toEqual({ sentinel: 'preserve me' })
  })

  it.each([
    ['rollback write rejection', 'write'],
    ['rollback read rejection', 'read'],
    ['rollback readback mismatch', 'mismatch'],
  ])('reports a fatal rollback error for %s', async (_label, mode) => {
    const primary = new Error('primary failure with private state')
    const rollback = new Error(`injected ${mode} failure`)
    const controlled = controllableDriver(PREVIOUS, {
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (call === 3 && mode === 'read') throw rollback
        if (call === 3 && mode === 'mismatch') {
          return {
            ...found,
            links: [{ id: 'wrong', title: 'Wrong', url: 'https://wrong.example' }],
          }
        }
        return found
      },
      async write(_patch, call, apply) {
        if (call === 2 && mode === 'write') throw rollback
        await apply()
      },
    })
    const storage = atomicStorage(controlled.driver, createInProcessStorageAuthority())

    const error = await storage.replaceAllWithRollback(TARGET, async () => {
      throw primary
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(storageModule.AtomicRestoreRollbackError)
    expect(error.primaryError).toBe(primary)
    if (mode === 'write' || mode === 'read') expect(error.rollbackError).toBe(rollback)
    else expect(error.rollbackError).toBeInstanceOf(Error)
    expect(error.message).toBe('Aurora storage rollback failed')
    expect(error.message).not.toContain('private state')
    expect(error.message).not.toContain('https://')
  })

  it('blocks a second storage instance until target verification and finalize commit', async () => {
    let finalizeEntered = () => {}
    let releaseFinalize = () => {}
    const inFinalize = new Promise<void>((resolve) => { finalizeEntered = resolve })
    const finalizeGate = new Promise<void>((resolve) => { releaseFinalize = resolve })
    const controlled = controllableDriver(PREVIOUS)
    const authority = createInProcessStorageAuthority()
    const first = atomicStorage(controlled.driver, authority)
    const second = createStorage(controlled.driver, authority)

    const replace = first.replaceAllWithRollback(TARGET, async () => {
      finalizeEntered()
      await finalizeGate
      return 'committed'
    })
    await inFinalize
    const queuedFocus = { text: 'Queued focus', date: '2026-08-16', done: false }
    const queuedMutation = second.set('focus', queuedFocus)

    // Drain the authority's promise scheduling. If the critical section were
    // already free, the direct set() would have reached the driver by now.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(controlled.writes).toEqual([TARGET])
    expect(await controlled.base.read(['focus', 'links'])).toEqual({
      focus: TARGET.focus,
      links: TARGET.links,
    })
    releaseFinalize()
    await expect(replace).resolves.toEqual({ previous: PREVIOUS, value: 'committed' })
    await queuedMutation

    expect(await controlled.base.read(['focus', 'links'])).toEqual({
      focus: queuedFocus,
      links: TARGET.links,
    })
    expect(controlled.writes).toEqual([TARGET, { focus: queuedFocus }])
  })

  it('blocks a second storage instance until a failed replace fully rolls back', async () => {
    let finalizeEntered = () => {}
    let rejectFinalize: (error: unknown) => void = () => {}
    const inFinalize = new Promise<void>((resolve) => { finalizeEntered = resolve })
    const finalizeGate = new Promise<void>((_resolve, reject) => { rejectFinalize = reject })
    const primary = new Error('finalize failed')
    const controlled = controllableDriver(PREVIOUS)
    const authority = createInProcessStorageAuthority()
    const first = atomicStorage(controlled.driver, authority)
    const second = createStorage(controlled.driver, authority)

    const replace = first.replaceAllWithRollback(TARGET, async () => {
      finalizeEntered()
      return finalizeGate
    })
    await inFinalize
    const queuedFocus = { text: 'Queued focus', date: '2026-08-16', done: false }
    const queuedMutation = second.set('focus', queuedFocus)

    // Drain the authority's promise scheduling. A prematurely released lock
    // would let this direct set() write before rollback begins.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(controlled.writes).toEqual([TARGET])
    rejectFinalize(primary)
    await expect(replace).rejects.toBe(primary)
    await queuedMutation

    expect(await controlled.base.read(['focus', 'links'])).toEqual({
      focus: queuedFocus,
      links: PREVIOUS.links,
    })
    expect(controlled.writes).toEqual([
      TARGET,
      PREVIOUS,
      { focus: queuedFocus },
    ])
  })
})
