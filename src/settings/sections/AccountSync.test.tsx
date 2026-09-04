// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../../account/AccountContext'
import type { AccountClient } from '../../account/client'
import type { AccountActions, AccountSnapshot } from '../../account/types'
import AccountSync, { RecoveryDownloadAction } from './AccountSync'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function actions(): AccountActions {
  return {
    beginSignIn: vi.fn(async () => ({ ok: true as const })),
    signOut: vi.fn(async () => {}),
    enableSync: vi.fn(async () => ({ status: 'completed' as const })),
    disableSync: vi.fn(async () => ({ status: 'completed' as const })),
    syncNow: vi.fn(async () => ({ status: 'completed' as const })),
    renameDevice: vi.fn(async () => ({ status: 'completed' as const })),
    revokeDevice: vi.fn(async () => ({ status: 'completed' as const })),
    restoreConflictBackup: vi.fn(async () => ({ status: 'completed' as const })),
    discardConflictBackup: vi.fn(async () => ({ status: 'completed' as const })),
    openPlans: vi.fn(async () => ({ status: 'opened' as const })),
    openBilling: vi.fn(async () => ({ status: 'opened' as const })),
    refreshBilling: vi.fn(async () => ({ status: 'refreshed' as const })),
    prepareAccountDataExport: vi.fn(async () => ({ status: 'data_unavailable' as const })),
    deleteVault: vi.fn(async () => ({ status: 'completed' as const })),
    deleteAccount: vi.fn(async () => ({ status: 'completed' as const })),
  }
}

function signedSnapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    mode: 'signed_in',
    accountId: 'account-1',
    email: 'alex@example.com',
    displayName: 'Alex Morgan',
    billing: {
      state: 'active',
      plan: 'monthly',
      currentPeriodEnd: Date.UTC(2026, 9, 1),
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      introductoryEligible: false,
    },
    lease: null,
    sync: {
      enabled: false,
      phase: 'disabled',
      lastSuccessAt: null,
      usedBytes: 0,
      quotaBytes: 2_097_152,
    },
    devices: [{ id: 'device-1', name: 'Studio PC', lastSyncAt: null, current: true, revoked: false }],
    ...overrides,
  }
}

function renderAccount(snapshot: AccountSnapshot, suppliedActions = actions(), accountDataExportEnabled?: boolean) {
  const client: AccountClient = {
    accountDataExportEnabled,
    getSnapshot: async () => snapshot,
    subscribe: () => () => {},
    actions: suppliedActions,
    syncGateway: null,
    providerGateways: {},
  }
  render(<AccountProvider client={client}><AccountSync /></AccountProvider>)
  return suppliedActions
}

function renderLiveAccount(snapshot: AccountSnapshot, suppliedActions = actions()) {
  let current = snapshot
  const listeners = new Set<(next: AccountSnapshot) => void>()
  const client: AccountClient = {
    getSnapshot: async () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions: suppliedActions,
    syncGateway: null,
    providerGateways: {},
  }
  render(<AccountProvider client={client}><AccountSync /></AccountProvider>)
  return {
    actions: suppliedActions,
    publish(next: AccountSnapshot) {
      current = next
      for (const listener of listeners) listener(next)
    },
  }
}

describe('AccountSync', () => {
  it('mounts the flat account download section only when the client enables it', async () => {
    const disabledView = renderAccount(signedSnapshot())
    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Your data' })).toBeNull()
    cleanup()

    renderAccount(signedSnapshot(), disabledView, true)
    const data = await screen.findByRole('region', { name: 'Your data' })
    expect(within(data).getByRole('button', { name: 'Download account data' })).toBeTruthy()
    expect(within(data).getByText(/readable JSON copy/i)).toBeTruthy()
  })

  it('keeps recovery download progress and failure scoped to its own row', async () => {
    const prepare = vi.fn(async () => ({ status: 'data_unavailable' as const }))
    const download = vi.fn()
    render(
      <div>
        <div data-testid="first-recovery">
          <RecoveryDownloadAction recoveryId="recovery-1" prepare={prepare} download={download} />
        </div>
        <div data-testid="second-recovery">
          <RecoveryDownloadAction recoveryId="recovery-2" prepare={prepare} download={download} />
        </div>
      </div>,
    )

    const first = screen.getByTestId('first-recovery')
    const second = screen.getByTestId('second-recovery')
    fireEvent.click(within(first).getByRole('button', { name: 'Download copy' }))
    expect(await within(first).findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(within(first).getByRole('alert').textContent).toBe('Tab Two could not prepare this copy. Nothing was changed.')
    expect(within(second).getByRole('button', { name: 'Download copy' })).toBeTruthy()
    expect(within(second).queryByRole('alert')).toBeNull()
    expect(prepare).toHaveBeenCalledWith('recovery-1')
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps Local mode optional and associates unavailable sign-in feedback with its action', async () => {
    const localActions = actions()
    vi.mocked(localActions.beginSignIn).mockResolvedValue({ ok: false, code: 'not_configured' })
    renderAccount({
      mode: 'local', accountId: null, email: null, displayName: null,
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: true }, lease: null,
      sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
      devices: [],
    }, localActions)

    expect(await screen.findByRole('heading', { name: 'Local mode' })).toBeTruthy()
    expect(screen.getByText('Your Tab Two data stays on this device.')).toBeTruthy()
    expect(screen.getByText('Signing in does not enable sync or upload local data.')).toBeTruthy()
    expect(screen.getByText('Passwords and sign-in sessions')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Encrypted & synced' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Always stays local' })).toBeTruthy()

    const signIn = screen.getByRole('button', { name: 'Sign in with Google' })
    fireEvent.click(signIn)
    const status = await screen.findByRole('status')
    expect(status.textContent).toBe('Google sign-in is not configured in this build.')
    expect(signIn.getAttribute('aria-describedby')).toBe(status.id)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Choose monthly' })) })
    expect(localActions.openPlans).toHaveBeenCalledWith('monthly')
  })

  it('does not enable sync or invoke any data action after a successful sign-in click', async () => {
    const localActions = actions()
    renderAccount({
      mode: 'local', accountId: null, email: null, displayName: null,
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: true }, lease: null,
      sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
      devices: [],
    }, localActions)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))
    await waitFor(() => expect(localActions.beginSignIn).toHaveBeenCalledOnce())
    expect(localActions.enableSync).not.toHaveBeenCalled()
    expect(localActions.syncNow).not.toHaveBeenCalled()
    expect(localActions.deleteVault).not.toHaveBeenCalled()
    expect(screen.getByText('Signing in does not enable sync or upload local data.')).toBeTruthy()
  })

  it('shows the complete signed-in sync-off surface and routes its actions', async () => {
    const signedActions = renderAccount(signedSnapshot())

    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeTruthy()
    expect(screen.getByText('Active subscription')).toBeTruthy()
    expect(screen.getByText('$1.99')).toBeTruthy()
    expect(screen.getByText('$19.99')).toBeTruthy()
    expect(screen.queryByText('$9.99')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Enable sync' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Not synced yet')).toBeTruthy()
    expect(screen.getByText('0 KB of 2 MB')).toBeTruthy()
    expect(screen.getByText('Studio PC')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable sync' }))
    const naming = screen.getByRole('dialog', { name: 'Name this installation' })
    const name = within(naming).getByLabelText('Device name')
    fireEvent.change(name, { target: { value: '  ' } })
    expect(within(naming).getByRole('button', { name: 'Enable encrypted sync' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(name, { target: { value: 'Studio PC' } })
    await act(async () => { fireEvent.click(within(naming).getByRole('button', { name: 'Enable encrypted sync' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Manage billing' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signedActions.enableSync).toHaveBeenCalledWith('Studio PC')
    expect(signedActions.openBilling).toHaveBeenCalledOnce()
    expect(signedActions.signOut).toHaveBeenCalledOnce()
  })

  it('uses calm automatic status copy for offline local edits and recoverable attention', async () => {
    const live = renderLiveAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'offline',
        lastSuccessAt: Date.UTC(2026, 8, 2, 12),
        usedBytes: 524_288,
        quotaBytes: 2_097_152,
      },
    }))
    expect(await screen.findByText('Your changes are safe here and will sync automatically when you’re back online.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(live.actions.syncNow).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull()

    act(() => live.publish(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'needs_attention',
        lastSuccessAt: Date.UTC(2026, 8, 2, 12),
        usedBytes: 524_288,
        quotaBytes: 2_097_152,
      },
    })))
    expect(await screen.findByRole('heading', { name: 'Studio PC needs attention' })).toBeTruthy()
    expect(screen.getByText('Your local data is still safe on this device.')).toBeTruthy()
  })

  it('shows one actionable sync status, names this device, and balances the protection disclosure', async () => {
    renderAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'needs_attention',
        lastSuccessAt: null,
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    }))

    const status = await screen.findByRole('region', { name: 'Sync status' })
    expect(within(status).getByRole('heading', { name: 'Desktop needs attention' })).toBeTruthy()
    expect(within(status).getByText('Your local data is still safe on this device.')).toBeTruthy()
    expect(within(status).getByRole('button', { name: 'Sync now' })).toBeTruthy()
    expect(within(status).queryByText('Status')).toBeNull()

    const devices = screen.getByRole('region', { name: 'Devices' })
    expect(within(devices).getByText('Desktop')).toBeTruthy()
    expect(within(devices).getByText('This device')).toBeTruthy()

    const encrypted = screen.getByRole('region', { name: 'Encrypted & synced' })
    const local = screen.getByRole('region', { name: 'Always stays local' })
    expect(within(encrypted).getAllByRole('listitem')).toHaveLength(3)
    expect(within(local).getAllByRole('listitem')).toHaveLength(3)
  })

  it('makes sync progress visible and prevents duplicate sync requests', async () => {
    const signedActions = actions()
    let finish!: (value: { status: 'completed' }) => void
    vi.mocked(signedActions.syncNow).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'needs_attention',
        lastSuccessAt: null,
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    }), signedActions)

    const syncNow = await screen.findByRole('button', { name: 'Sync now' })
    fireEvent.click(syncNow)
    const pending = await screen.findByRole('button', { name: 'Syncing…' })
    expect(pending.getAttribute('aria-busy')).toBe('true')
    expect(pending.querySelector('.account-sync-status__spinner')?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(pending)
    expect(signedActions.syncNow).toHaveBeenCalledOnce()
    await act(async () => { finish({ status: 'completed' }) })
  })

  it('shows Try again only alongside a visible sync failure message', async () => {
    const signedActions = actions()
    vi.mocked(signedActions.syncNow).mockResolvedValue({ status: 'needs_attention' })
    renderAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'needs_attention',
        lastSuccessAt: null,
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    }), signedActions)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))

    const status = screen.getByRole('region', { name: 'Sync status' })
    expect((await within(status).findByRole('alert')).textContent).toBe(
      'Sync could not complete safely. Your local data has not been removed.',
    )
    expect(within(status).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('keeps a previously protected status visually stable during a routine sync', async () => {
    const signedActions = actions()
    let finish!: (value: { status: 'completed' }) => void
    vi.mocked(signedActions.syncNow).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const live = renderLiveAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'up_to_date',
        lastSuccessAt: Date.UTC(2026, 8, 2, 18, 22, 53),
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: Date.UTC(2026, 8, 2, 18, 22, 53), current: true, revoked: false }],
    }), signedActions)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    act(() => live.publish(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'syncing',
        lastSuccessAt: Date.UTC(2026, 8, 2, 18, 22, 53),
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: Date.UTC(2026, 8, 2, 18, 22, 53), current: true, revoked: false }],
    })))

    expect(screen.getByRole('heading', { name: 'Desktop is protected' })).toBeTruthy()
    expect(screen.getByText('Encrypted changes are safely up to date.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Protecting Desktop' })).toBeNull()
    await act(async () => { finish({ status: 'completed' }) })
  })

  it('keeps disable progress distinct from syncing and reports partial server cleanup calmly', async () => {
    const signedActions = actions()
    let finish!: (value: { status: 'deactivation_unconfirmed' }) => void
    vi.mocked(signedActions.disableSync).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const live = renderLiveAccount(signedSnapshot({
      sync: {
        enabled: true,
        phase: 'needs_attention',
        lastSuccessAt: null,
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [{ id: 'device-1', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    }), signedActions)

    fireEvent.click(await screen.findByRole('switch', { name: 'Enable sync' }))
    expect(screen.getByRole('button', { name: 'Sync now' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Syncing…' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Enable sync' }).hasAttribute('disabled')).toBe(true)

    act(() => live.publish(signedSnapshot({ devices: [], sync: {
      enabled: false,
      phase: 'disabled',
      lastSuccessAt: null,
      usedBytes: 0,
      quotaBytes: 2_097_152,
    } })))
    await act(async () => { finish({ status: 'deactivation_unconfirmed' }) })

    expect(screen.getByRole('heading', { name: 'Sync is off' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Sync status' })).getAllByRole('status')[1]?.textContent).toBe(
      'Sync is off on this device. Tab Two could not confirm the device-list update; no local data was removed.',
    )
    expect(screen.queryByText('Sync could not complete safely. Your local data has not been removed.')).toBeNull()
  })

  it('presents one highlighted introductory annual choice with a muted renewal disclosure', async () => {
    const signedActions = renderAccount(signedSnapshot({
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: true },
    }))

    const plans = await screen.findByRole('region', { name: 'Plans' })
    expect(within(plans).getByText('50% off first year')).toBeTruthy()
    expect(within(plans).getByText('$9.99')).toBeTruthy()
    expect(within(plans).getByText('first year')).toBeTruthy()
    expect(within(plans).getByText('Renews at $19.99/year.')).toBeTruthy()
    expect(within(plans).queryByText('$19.99')).toBeNull()
    expect(within(plans).getAllByRole('button')).toHaveLength(2)

    fireEvent.click(within(plans).getByRole('button', { name: 'Start annual plan' }))
    await waitFor(() => expect(signedActions.openPlans).toHaveBeenCalledWith('intro_annual'))
  })

  it('replaces the introductory annual offer with the standard annual choice when ineligible', async () => {
    const signedActions = renderAccount(signedSnapshot({
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: false },
    }))

    const plans = await screen.findByRole('region', { name: 'Plans' })
    expect(within(plans).getByText('$19.99')).toBeTruthy()
    expect(within(plans).getByText('/year')).toBeTruthy()
    expect(within(plans).queryByText('50% off first year')).toBeNull()
    expect(within(plans).queryByText('Renews at $19.99/year.')).toBeNull()
    expect(within(plans).getAllByRole('button')).toHaveLength(2)

    fireEvent.click(within(plans).getByRole('button', { name: 'Choose annual' }))
    await waitFor(() => expect(signedActions.openPlans).toHaveBeenCalledWith('annual'))
  })

  it('disables billing actions while opening and reports a typed handoff failure', async () => {
    const signedActions = actions()
    let resolve!: (value: { status: 'unavailable' }) => void
    vi.mocked(signedActions.openPlans).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAccount(signedSnapshot({
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: true },
    }), signedActions)

    const choose = await screen.findByRole('button', { name: 'Start annual plan' })
    fireEvent.click(choose)
    expect(choose.hasAttribute('disabled')).toBe(true)
    await act(async () => { resolve({ status: 'unavailable' }) })

    const plans = screen.getByRole('region', { name: 'Plans' })
    expect((await within(plans).findByRole('alert')).textContent).toBe('Billing is unavailable right now. Try again.')
    expect(choose.hasAttribute('disabled')).toBe(false)
  })

  it('refreshes signed billing automatically on mount and focus without exposing a manual control', async () => {
    const signedActions = actions()
    renderAccount(signedSnapshot({
      billing: { state: 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: true },
    }), signedActions)

    await waitFor(() => expect(signedActions.refreshBilling).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Refresh billing' })).toBeNull()

    fireEvent.focus(window)
    await waitFor(() => expect(signedActions.refreshBilling).toHaveBeenCalledTimes(2))
  })

  it('retries a hosted billing handoff until the server-verified status converges', async () => {
    vi.useFakeTimers()
    const signedActions = actions()
    let publish = (_next: AccountSnapshot) => {}
    vi.mocked(signedActions.refreshBilling).mockImplementation(async () => {
      if (vi.mocked(signedActions.refreshBilling).mock.calls.length === 3) {
        publish(signedSnapshot({
          billing: {
            state: 'canceling',
            plan: 'monthly',
            currentPeriodEnd: Date.UTC(2026, 9, 1),
            courtesyEnd: null,
            cancelAtPeriodEnd: true,
            introductoryEligible: false,
          },
        }))
      }
      return { status: 'refreshed' }
    })
    const live = renderLiveAccount(signedSnapshot(), signedActions)
    publish = live.publish

    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(signedActions.refreshBilling).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
      await Promise.resolve()
    })
    expect(signedActions.openBilling).toHaveBeenCalledOnce()
    await act(async () => {
      fireEvent.focus(window)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(signedActions.refreshBilling).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.runAllTimersAsync() })
    expect(signedActions.refreshBilling).toHaveBeenCalledTimes(4)
    expect(screen.getByText('Subscription canceling')).toBeTruthy()
    expect(screen.getByText(/Access continues through/)).toBeTruthy()
  })

  it('preserves the last verified billing state when automatic revalidation is unavailable', async () => {
    const signedActions = actions()
    vi.mocked(signedActions.refreshBilling).mockResolvedValue({ status: 'unavailable' })
    renderAccount(signedSnapshot(), signedActions)

    await waitFor(() => expect(signedActions.refreshBilling).toHaveBeenCalledOnce())
    expect(screen.getByText('Active subscription')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('prevents a second Checkout while an existing subscription is active', async () => {
    const signedActions = renderAccount(signedSnapshot())

    expect((await screen.findByRole('button', { name: 'Choose monthly' })).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Choose annual' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByRole('button', { name: /Choose monthly|Choose annual/ })).toHaveLength(2)
    expect(signedActions.openPlans).not.toHaveBeenCalled()
  })

  it('blocks only sync activation when five devices are active and never auto-evicts', async () => {
    const devices = Array.from({ length: 5 }, (_, index) => ({
      id: `device-${index + 1}`,
      name: `Device ${index + 1}`,
      lastSyncAt: null,
      current: index === 0,
      revoked: false,
    }))
    const signedActions = renderAccount(signedSnapshot({
      sync: { enabled: false, phase: 'needs_attention', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
      devices,
    }))

    expect((await screen.findByRole('alert')).textContent).toContain('Five installations are already syncing')
    expect(screen.getByRole('switch', { name: 'Enable sync' }).getAttribute('aria-disabled')).toBe('true')
    const list = screen.getByRole('region', { name: 'Devices' })
    expect(within(list).getAllByRole('button', { name: /^Remove / })).toHaveLength(4)
    expect(signedActions.revokeDevice).not.toHaveBeenCalled()

    fireEvent.click(within(list).getByRole('button', { name: 'Remove Device 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Device 2?' })
    expect(signedActions.revokeDevice).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify with Google' }))
    expect(await within(dialog).findByText('Google account verified')).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove device' }))
    })
    expect(signedActions.revokeDevice).toHaveBeenCalledWith('device-2')
  })

  it('renames the current installation through the same validated device-name dialog', async () => {
    const signedActions = renderAccount(signedSnapshot({
      sync: { enabled: true, phase: 'up_to_date', lastSuccessAt: 1, usedBytes: 128, quotaBytes: 2_097_152 },
    }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename installation' })
    fireEvent.change(within(dialog).getByLabelText('Device name'), { target: { value: 'Home office' } })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' })) })
    expect(signedActions.renameDevice).toHaveBeenCalledWith('device-1', 'Home office')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('requires fresh Google verification and explicit text before deleting an account', async () => {
    const signedActions = renderAccount(signedSnapshot())
    const invoker = await screen.findByRole('button', { name: 'Delete account' })
    invoker.focus()
    fireEvent.click(invoker)

    const dialog = screen.getByRole('dialog', { name: 'Delete your Tab Two account?' })
    expect(within(dialog).getByText('Does not erase local data on this or any other installation.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify with Google' }))
    expect(await within(dialog).findByText('Google account verified')).toBeTruthy()

    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(signedActions.deleteAccount).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })
})
