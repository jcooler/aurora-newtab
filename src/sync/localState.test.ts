import { describe, expect, it, vi } from 'vitest'
import { createInProcessStorageAuthority } from '../lib/storage/authority'
import { memoryDriver } from '../lib/storage/driver'
import {
  SYNC_CONFLICT_BACKUPS_STORAGE_KEY,
  SYNC_DEVICE_STORAGE_KEY,
  SYNC_INDEX_STORAGE_KEY,
  createSyncLocalStateStore,
  emptySyncIndex,
  type SyncIndexStateV1,
} from './localState'

const accountId = '42000000-0000-4000-8000-000000000001'
const otherAccountId = '42000000-0000-4000-8000-000000000002'

function deterministicCrypto(): Crypto {
  return {
    getRandomValues: ((target: Uint8Array) => {
      target.set(Uint8Array.from({ length: target.byteLength }, (_, index) => index))
      return target
    }) as Crypto['getRandomValues'],
  } as Crypto
}

function digest(byte: number): string {
  let binary = ''
  for (const value of new Uint8Array(32).fill(byte)) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

describe('SyncLocalStateStore', () => {
  it('pins three isolated versioned keys', () => {
    expect([SYNC_DEVICE_STORAGE_KEY, SYNC_INDEX_STORAGE_KEY, SYNC_CONFLICT_BACKUPS_STORAGE_KEY]).toEqual([
      'tab-two:sync-device:v1',
      'tab-two:sync-index:v1',
      'tab-two:sync-conflict-backups:v1',
    ])
  })

  it('creates one account-bound 128-bit base64url device id and reuses it', async () => {
    const driver = memoryDriver()
    const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())

    const created = await store.ensureDevice(accountId, 'Jordan’s laptop')
    const reused = await store.ensureDevice(accountId, 'Jordan’s laptop')

    expect(created).toEqual({
      version: 1,
      accountId,
      deviceId: 'AAECAwQFBgcICQoLDA0ODw',
      friendlyName: 'Jordan’s laptop',
      enabled: false,
      registration: 'unregistered',
    })
    expect(reused).toEqual(created)
    expect(Object.isFrozen(created)).toBe(true)
    expect(driver.dump()[SYNC_DEVICE_STORAGE_KEY]).toEqual(created)
  })

  it.each(['', ' '.repeat(2), 'x'.repeat(49), ' padded', 'padded ', 'bad\u0000name'])
  ('rejects invalid friendly name %j', async (friendlyName) => {
    const driver = memoryDriver()
    const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())
    await expect(store.ensureDevice(accountId, friendlyName)).rejects.toThrow('sync_device_name_invalid')
    expect(driver.dump()).toEqual({})
  })

  it('fails closed on account mismatch, unsupported versions, extra fields, and key material', async () => {
    const valid = {
      version: 1,
      accountId,
      deviceId: 'AAECAwQFBgcICQoLDA0ODw',
      friendlyName: 'Laptop',
      enabled: true,
      registration: 'active',
    }
    for (const malformed of [
      { ...valid, accountId: otherAccountId },
      { ...valid, version: 2 },
      { ...valid, dataKey: 'raw-key-must-not-survive' },
      { ...valid, deviceId: 'short' },
    ]) {
      const driver = memoryDriver({ [SYNC_DEVICE_STORAGE_KEY]: malformed })
      const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())
      await expect(store.readDevice(accountId)).resolves.toBeNull()
      expect(driver.dump()[SYNC_DEVICE_STORAGE_KEY]).toEqual(malformed)
    }
  })

  it('updates enablement and registration without allowing device identity replacement', async () => {
    const driver = memoryDriver()
    const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())
    await store.ensureDevice(accountId, 'Laptop')

    const active = await store.updateDevice(accountId, (current) => ({
      ...current,
      enabled: true,
      registration: 'active',
    }))

    expect(active.enabled).toBe(true)
    expect(active.registration).toBe('active')
    await expect(store.updateDevice(accountId, (current) => ({
      ...current,
      deviceId: 'AQEBAQEBAQEBAQEBAQEBAQ',
    }))).rejects.toThrow('sync_device_state_invalid')
  })

  it('serializes concurrent index updates under the storage authority without losing a revision', async () => {
    const driver = memoryDriver()
    const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())
    const digestA = digest(1)
    const digestB = digest(2)

    const update = (entityKey: string, digest: string, vaultVersion: number) =>
      store.updateIndex(accountId, (current) => ({
        ...current,
        lastVaultVersion: vaultVersion,
        entities: {
          ...current.entities,
          [entityKey]: { revision: 1, digest },
        },
      }))

    await Promise.all([
      update('notes:singleton', digestA, 1),
      update('settings:singleton', digestB, 2),
    ])

    await expect(store.readIndex(accountId)).resolves.toEqual({
      version: 1,
      accountId,
      lastVaultVersion: 2,
      entities: {
        'notes:singleton': { revision: 1, digest: digestA },
        'settings:singleton': { revision: 1, digest: digestB },
      },
    })
  })

  it('rejects malformed index writes and returns immutable values', async () => {
    const driver = memoryDriver()
    const store = createSyncLocalStateStore(driver, driver.authority, deterministicCrypto())
    await store.updateIndex(accountId, (value) => value)
    const index = await store.readIndex(accountId)

    expect(index).toEqual(emptySyncIndex(accountId))
    expect(Object.isFrozen(index)).toBe(true)
    expect(Object.isFrozen(index?.entities)).toBe(true)
    await expect(store.updateIndex(accountId, () => ({
      ...emptySyncIndex(accountId),
      rawRemotePayload: 'must-not-persist',
    } as SyncIndexStateV1))).rejects.toThrow('sync_index_invalid')
    await expect(store.updateIndex(accountId, (current) => ({
      ...current,
      entities: { 'focus:not-a-date': { revision: 1, digest: digest(4) } },
    }))).rejects.toThrow('sync_index_invalid')
  })

  it('uses the supplied cross-context authority for every read-modify-write', async () => {
    const driver = memoryDriver()
    const authority = createInProcessStorageAuthority()
    const runExclusive = vi.spyOn(authority, 'runExclusive')
    const store = createSyncLocalStateStore(driver, authority, deterministicCrypto())

    await store.ensureDevice(accountId, 'Laptop')
    await store.updateIndex(accountId, (value) => value)

    expect(runExclusive).toHaveBeenCalledTimes(2)
  })
})
