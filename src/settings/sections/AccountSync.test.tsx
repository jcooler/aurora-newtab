// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../../account/AccountContext'
import type { AccountClient } from '../../account/client'
import type { AccountActions, AccountSnapshot } from '../../account/types'
import AccountSync from './AccountSync'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function actions(): AccountActions {
  return {
    beginSignIn: vi.fn(async () => ({ ok: true as const })),
    signOut: vi.fn(async () => {}),
    enableSync: vi.fn(async () => {}),
    disableSync: vi.fn(async () => {}),
    syncNow: vi.fn(async () => {}),
    revokeDevice: vi.fn(async () => {}),
    openPlans: vi.fn(async () => {}),
    openBilling: vi.fn(async () => {}),
    deleteVault: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
  }
}

function signedSnapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    mode: 'signed_in',
    accountId: 'account-1',
    email: 'alex@example.com',
    displayName: 'Alex Morgan',
    subscription: 'active',
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
  }
  render(<AccountProvider client={client}><AccountSync /></AccountProvider>)
  return suppliedActions
}

describe('AccountSync', () => {
  it('keeps Local mode optional and associates unavailable sign-in feedback with its action', async () => {
    const localActions = actions()
    vi.mocked(localActions.beginSignIn).mockResolvedValue({ ok: false, code: 'not_configured' })
    renderAccount({
      mode: 'local', accountId: null, email: null, displayName: null, subscription: 'none', lease: null,
      sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
      devices: [],
    }, localActions)

    expect(await screen.findByRole('heading', { name: 'Local mode' })).toBeTruthy()
    expect(screen.getByText('Your Tab Two data stays on this device.')).toBeTruthy()
    expect(screen.getByText('Signing in does not enable sync or upload local data.')).toBeTruthy()
    expect(screen.getByText('Passwords, tokens, sessions, and feed URLs')).toBeTruthy()

    const signIn = screen.getByRole('button', { name: 'Sign in with Google' })
    fireEvent.click(signIn)
    const status = await screen.findByRole('status')
    expect(status.textContent).toBe('Google sign-in is not configured in this build.')
    expect(signIn.getAttribute('aria-describedby')).toBe(status.id)

    fireEvent.click(screen.getByRole('button', { name: 'View plans' }))
    expect(localActions.openPlans).toHaveBeenCalledOnce()
  })

  it('shows the complete signed-in sync-off surface and routes its actions', async () => {
    const signedActions = renderAccount(signedSnapshot())

    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeTruthy()
    expect(screen.getByText('Active subscription')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Enable sync' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Not synced yet')).toBeTruthy()
    expect(screen.getByText('0 KB of 2 MB')).toBeTruthy()
    expect(screen.getByText('Studio PC')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable sync' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signedActions.enableSync).toHaveBeenCalledOnce()
    expect(signedActions.syncNow).toHaveBeenCalledOnce()
    expect(signedActions.openBilling).toHaveBeenCalledOnce()
    expect(signedActions.signOut).toHaveBeenCalledOnce()
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
