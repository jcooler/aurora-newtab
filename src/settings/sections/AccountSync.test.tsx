// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../../account/AccountContext'
import type { AccountClient } from '../../account/client'
import type { AccountActions, AccountSnapshot } from '../../account/types'
import AccountSync from './AccountSync'

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

function renderAccount(snapshot: AccountSnapshot, suppliedActions = actions()) {
  const client: AccountClient = {
    getSnapshot: async () => snapshot,
    subscribe: () => () => {},
    actions: suppliedActions,
    syncGateway: null,
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
    expect(screen.getByText('Passwords, tokens, sessions, and feed/calendar URLs')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Encrypted when sync is on' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Always stays on this device' })).toBeTruthy()

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
    expect(await screen.findByText('You’re offline. Changes stay safe on this device and will sync automatically.')).toBeTruthy()
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
    expect(await screen.findByText('Sync needs attention. Your local data has not been removed.')).toBeTruthy()
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
