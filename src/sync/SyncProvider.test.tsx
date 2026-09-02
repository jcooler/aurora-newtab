// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../account/AccountContext'
import type { AccountClient } from '../account/client'
import { localAccountClient } from '../account/localAccountClient'
import type { AccountSnapshot } from '../account/types'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import type { AuroraStorage } from '../lib/storage'
import { generateDataKey } from './crypto'
import type { SyncGateway } from './gateway'
import { createSyncLocalStateStore } from './localState'
import { SyncProvider, useSync } from './SyncProvider'
import { appendConflictBackup } from './conflictBackups'
import AccountSync from '../settings/sections/AccountSync'
import { defaults } from '../lib/storage/schema'

const accountId = '42000000-0000-4000-8000-000000000001'

function snapshot(entitled = true): AccountSnapshot {
  return {
    mode: 'signed_in', accountId, email: 'qa@example.test', displayName: 'QA',
    billing: {
      state: 'active', plan: 'annual', currentPeriodEnd: 1, courtesyEnd: null,
      cancelAtPeriodEnd: false, introductoryEligible: false,
    },
    lease: entitled ? {
      verification: 'verified', leaseVersion: 1, keyId: 'test', accountId,
      capabilities: ['encrypted_sync'], grantSources: ['stripe'], issuedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER, leaseId: 'lease',
    } : null,
    sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
    devices: [],
  }
}

function gateway(): SyncGateway {
  return {
    bootstrap: vi.fn(async () => ({ ok: true as const, value: {
      dataKey: await generateDataKey(),
      summary: {
        vaultVersion: 0, usedBytes: 0, currentDeviceId: 'AAECAwQFBgcICQoLDA0ODw',
        devices: [{ id: 'AAECAwQFBgcICQoLDA0ODw', name: 'Primary', lastSyncAt: null, current: true, revoked: false }],
      },
    } })),
    pull: vi.fn(async () => ({ ok: true as const, value: { records: [], nextCursor: null, vaultVersion: 0 } })),
    push: vi.fn(async (input: Parameters<SyncGateway['push']>[0]) => ({
      ok: true as const,
      value: input.mutations.map((mutation, index) => ({
      status: 'accepted' as const,
      entityType: mutation.record.entityType,
      entityId: mutation.record.entityId,
      revision: mutation.record.revision,
      vaultVersion: index + 1,
      })),
    })),
    deactivateDevice: vi.fn(), renameDevice: vi.fn(), revokeDevice: vi.fn(),
    deleteVault: vi.fn(), deleteAccount: vi.fn(),
  }
}

function client(value: AccountSnapshot, syncGateway: SyncGateway): AccountClient {
  return {
    getSnapshot: vi.fn(async () => value),
    subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions,
    syncGateway,
  }
}

function Probe() {
  const { state } = useSync()
  return <output>{state.enabled ? state.phase : 'disabled'}</output>
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
})

describe('SyncProvider lifecycle ownership', () => {
  it('acquires the exact Web Lock and starts only for a visible signed-in entitled enabled device', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    const api = gateway()
    let heldSignal: AbortSignal | undefined
    const request = vi.fn(async (_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
      heldSignal = options.signal
      return callback({ name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const view = render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><Probe /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await waitFor(() => expect(api.bootstrap).toHaveBeenCalledOnce())
    await waitFor(() => expect(api.pull).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith('tab-two:encrypted-sync:v1', expect.objectContaining({
      mode: 'exclusive', ifAvailable: true, signal: expect.any(AbortSignal),
    }), expect.any(Function))
    await waitFor(() => expect(screen.getByText('up_to_date')).toBeTruthy())
    view.unmount()
    expect(heldSignal?.aborted).toBe(true)
  })

  it('does not request a lock, bootstrap, or network without verified entitlement', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    const api = gateway()
    const request = vi.fn()
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(false), api)}>
          <SyncProvider><Probe /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await waitFor(() => expect(screen.getByText('needs_attention')).toBeTruthy())
    expect(request).not.toHaveBeenCalled()
    expect(api.bootstrap).not.toHaveBeenCalled()
    expect(api.pull).not.toHaveBeenCalled()
  })

  it('rejects a late bootstrap completion after unmount', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const api = gateway()
    vi.mocked(api.bootstrap).mockImplementation(async () => {
      await pending
      return { ok: true, value: {
        dataKey: await generateDataKey(),
        summary: { vaultVersion: 0, usedBytes: 0, currentDeviceId: 'AAECAwQFBgcICQoLDA0ODw', devices: [] },
      } }
    })
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => (
      callback({ name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    ))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const view = render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><Probe /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await waitFor(() => expect(api.bootstrap).toHaveBeenCalledOnce())
    view.unmount()
    finish()
    await pending
    await Promise.resolve()
    expect(api.pull).not.toHaveBeenCalled()
  })

  it('retries an offline first bootstrap after the visible backoff', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'unregistered' }))
    const api = gateway()
    vi.mocked(api.bootstrap)
      .mockResolvedValueOnce({ ok: false, kind: 'offline' })
      .mockResolvedValueOnce({ ok: true, value: {
        dataKey: await generateDataKey(),
        summary: { vaultVersion: 0, usedBytes: 0, currentDeviceId: 'AAECAwQFBgcICQoLDA0ODw', devices: [] },
      } })
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => (
      callback({ name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    ))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const view = render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><Probe /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(api.bootstrap).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999) })
    expect(api.bootstrap).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(api.bootstrap).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it('rolls back a rejected sixth installation and explains how to recover', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Sixth browser')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'unregistered' }))
    const api = gateway()
    vi.mocked(api.bootstrap).mockResolvedValue({ ok: false, kind: 'device_limit' })
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => (
      callback({ name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    ))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><AccountSync /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    expect(await screen.findByText(/Open Tab Two on an existing synced installation and remove one there/i)).toBeTruthy()
    await waitFor(async () => expect((await local.readDevice(accountId))?.enabled).toBe(false))
    expect(api.pull).not.toHaveBeenCalled()
  })

  it('publishes only safe recovery metadata and lets the UI discard the local recovery copy', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver(defaults() as unknown as Record<string, unknown>)
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    const backup = await appendConflictBackup({ driver, authority: driver.authority }, accountId, {
      schemaVersion: 1,
      entityType: 'notes',
      entityId: 'singleton',
      value: { text: 'private local recovery text', updatedAt: 1 },
    }, 2)
    const api = gateway()
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => (
      callback({ name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    ))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><AccountSync /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    const recoveries = await screen.findByRole('region', { name: 'Recovery copies' })
    expect(recoveries.textContent).not.toContain('private local recovery text')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Recovery copies' })).toBeNull())
    await expect(local.readConflictBackups(accountId)).resolves.toEqual([])
    expect(backup.entity.value).toEqual({ text: 'private local recovery text', updatedAt: 1 })
  })
})
