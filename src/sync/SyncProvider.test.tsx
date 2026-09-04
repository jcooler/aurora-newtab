// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider, useAccount } from '../account/AccountContext'
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
    providerGateways: {},
  }
}

function Probe() {
  const { state } = useSync()
  return <output>{state.enabled ? state.phase : 'disabled'}</output>
}

function RecoveryExportProbe({ recoveryId, receive }: { recoveryId: string; receive: (value: unknown) => void }) {
  const { actions } = useSync()
  const { snapshot } = useAccount()
  return (
    <button
      type="button"
      disabled={snapshot.mode !== 'signed_in'}
      onClick={() => void actions.prepareRecoveryExport(recoveryId).then(receive)}
    >
      Prepare recovery
    </button>
  )
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

  it('lets Sync now retry a failed first bootstrap before a coordinator exists', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'unregistered' }))
    const api = gateway()
    vi.mocked(api.bootstrap)
      .mockResolvedValueOnce({ ok: false, kind: 'needs_attention' })
      .mockResolvedValueOnce({ ok: true, value: {
        dataKey: await generateDataKey(),
        summary: { vaultVersion: 0, usedBytes: 0, currentDeviceId: 'AAECAwQFBgcICQoLDA0ODw', devices: [] },
      } })
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

    expect(await screen.findByRole('heading', { name: 'Primary needs attention' })).toBeTruthy()
    expect(api.bootstrap).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(api.bootstrap).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Primary is protected' })).toBeTruthy()
  })

  it('treats another tab coordinator as healthy standby and lets Sync now take ownership', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    const api = gateway()
    const request = vi.fn(async (_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
      if (options.steal && options.signal) {
        throw new DOMException('The signal and steal options cannot be used together.', 'NotSupportedError')
      }
      return callback(request.mock.calls.length === 1
        ? null
        : { name: 'tab-two:encrypted-sync:v1', mode: 'exclusive' } as Lock)
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><AccountSync /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Primary is protected' })).toBeTruthy()
    expect(screen.getByText('Sync is active in another Tab Two tab.')).toBeTruthy()
    expect(api.bootstrap).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(api.bootstrap).toHaveBeenCalledOnce())
    expect(request).toHaveBeenNthCalledWith(2, 'tab-two:encrypted-sync:v1', expect.objectContaining({
      mode: 'exclusive', steal: true,
    }), expect.any(Function))
    expect(request.mock.calls[1]?.[1]).not.toHaveProperty('ifAvailable')
    expect(request.mock.calls[1]?.[1]).not.toHaveProperty('signal')
    expect(await screen.findByRole('heading', { name: 'Primary is protected' })).toBeTruthy()
  })

  it('starts syncing after enable and preserves the chosen device name if bootstrap needs attention', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const api = gateway()
    vi.mocked(api.bootstrap).mockResolvedValue({ ok: false, kind: 'needs_attention' })
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

    fireEvent.click(await screen.findByRole('switch', { name: 'Enable sync' }))
    const dialog = screen.getByRole('dialog', { name: 'Name this installation' })
    fireEvent.change(within(dialog).getByLabelText('Device name'), { target: { value: 'Desktop' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable encrypted sync' }))

    await waitFor(() => expect(api.bootstrap).toHaveBeenCalledOnce())
    expect(await screen.findByText('Desktop')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeTruthy()
  })

  it('turns off a locally enabled device that never completed server registration', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'unregistered' }))
    const api = gateway()
    vi.mocked(api.bootstrap).mockResolvedValue({ ok: false, kind: 'needs_attention' })
    vi.mocked(api.deactivateDevice).mockResolvedValue({ ok: false, kind: 'needs_attention' })
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

    expect(await screen.findByRole('heading', { name: 'Primary needs attention' })).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable sync' }))

    await waitFor(async () => expect((await local.readDevice(accountId))?.enabled).toBe(false))
    expect(api.deactivateDevice).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Sync is off' })).toBeTruthy()
  })

  it('turns off locally when a stale active registration cannot be deactivated remotely', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    const driver = memoryDriver()
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    await local.updateDevice(accountId, (current) => ({ ...current, enabled: true, registration: 'active' }))
    const api = gateway()
    vi.mocked(api.bootstrap).mockResolvedValue({ ok: false, kind: 'needs_attention' })
    vi.mocked(api.deactivateDevice).mockResolvedValue({ ok: false, kind: 'needs_attention' })
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

    expect(await screen.findByRole('heading', { name: 'Primary needs attention' })).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable sync' }))

    await waitFor(async () => expect((await local.readDevice(accountId))?.enabled).toBe(false))
    expect(api.deactivateDevice).toHaveBeenCalledOnce()
    expect(screen.getByRole('switch', { name: 'Enable sync' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('heading', { name: 'Sync is off' })).toBeTruthy()
    expect(screen.getByText('Sync is off on this device. Tab Two could not confirm the device-list update; no local data was removed.')).toBeTruthy()
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

  it('prepares an immutable recovery export from local storage without network or storage writes', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const driver = memoryDriver(defaults() as unknown as Record<string, unknown>)
    const local = createSyncLocalStateStore(driver, driver.authority)
    await local.ensureDevice(accountId, 'Primary')
    const created = await appendConflictBackup({ driver, authority: driver.authority }, accountId, {
      schemaVersion: 1,
      entityType: 'notes',
      entityId: 'singleton',
      value: { text: 'private local recovery text', updatedAt: 1 },
    }, 2, Date.parse('2026-09-04T11:00:00.000Z'))
    const stored = await local.readConflictBackups(accountId)
    const api = gateway()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const writeSpy = vi.spyOn(driver, 'write')
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-04T12:00:00.000Z'))
    const receive = vi.fn()

    render(
      <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority: driver.authority }}>
        <AccountProvider client={client(snapshot(), api)}>
          <SyncProvider><RecoveryExportProbe recoveryId={created.id} receive={receive} /></SyncProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    writeSpy.mockClear()
    const prepareButton = screen.getByRole('button', { name: 'Prepare recovery' })
    await waitFor(() => expect(prepareButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(prepareButton)

    await waitFor(() => expect(receive).toHaveBeenCalledOnce())
    const result = receive.mock.calls[0]![0]
    expect(result).toMatchObject({
      status: 'ready',
      value: {
        kind: 'sync-conflict-recovery',
        exportedAt: '2026-09-04T12:00:00.000Z',
        recovery: { id: created.id, entity: { value: { text: 'private local recovery text' } } },
      },
    })
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(await local.readConflictBackups(accountId)).toEqual(stored)
    expect(writeSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    for (const operation of Object.values(api)) expect(operation).not.toHaveBeenCalled()
  })

  it('publishes only safe recovery metadata and lets the UI download or discard the local recovery copy', async () => {
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
    const rowActions = within(recoveries).getAllByRole('button').map((button) => button.textContent)
    expect(rowActions).toEqual(['Restore', 'Download copy', 'Discard'])
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createObjectURL = vi.fn(() => 'blob:recovery-copy')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    fireEvent.click(within(recoveries).getByRole('button', { name: 'Download copy' }))
    expect((await within(recoveries).findByRole('status')).textContent).toBe('Recovery copy downloaded.')
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery-copy')
    expect(await local.readConflictBackups(accountId)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Recovery copies' })).toBeNull())
    await expect(local.readConflictBackups(accountId)).resolves.toEqual([])
    expect(backup.entity.value).toEqual({ text: 'private local recovery text', updatedAt: 1 })
  })
})
