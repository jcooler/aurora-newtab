// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AccountDataExportSourceV1 } from '../../account/dataExport'
import type { AccountActions } from '../../account/types'
import AccountDataExport from './AccountDataExport'

const accountId = '44000000-0000-4000-8000-000000000001'
const exportedAt = Date.parse('2026-09-04T12:00:00.000Z')

function source(): AccountDataExportSourceV1 {
  return {
    account: {
      accountId,
      email: 'alex@example.test',
      displayName: 'Alex Morgan',
      createdAt: exportedAt - 3_000,
      identityCreatedAt: exportedAt - 2_000,
      identityUpdatedAt: exportedAt - 1_000,
    },
    connectedAccounts: [],
    subscription: {
      state: 'complimentary', plan: null, currentPeriodStart: null, currentPeriodEnd: null,
      courtesyEnd: null, cancelAtPeriodEnd: false, createdAt: null, updatedAt: null,
    },
    entitlement: { capabilities: ['encrypted_sync'], grantSources: ['complimentary_owner'], expiresAt: null },
    devices: [],
    syncedData: { status: 'empty', vaultVersion: 0, storedBytes: 0, records: [] },
  }
}

function actions(): Pick<AccountActions, 'beginSignIn' | 'prepareAccountDataExport'> {
  return {
    beginSignIn: vi.fn(async () => ({ ok: true as const })),
    prepareAccountDataExport: vi.fn(async () => ({ status: 'ready' as const, value: source() })),
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AccountDataExport', () => {
  it('is absent unless the build explicitly enables account export', () => {
    render(<AccountDataExport accountId={accountId} enabled={false} actions={actions()} />)
    expect(screen.queryByRole('region', { name: 'Your data' })).toBeNull()
  })

  it('explains the private export before requesting it and restores focus when cancelled or escaped', async () => {
    const accountActions = actions()
    render(<AccountDataExport accountId={accountId} enabled actions={accountActions} />)

    const invoker = screen.getByRole('button', { name: 'Download account data' })
    fireEvent.click(invoker)
    const dialog = screen.getByRole('dialog', { name: 'Download your account data?' })
    expect(within(dialog).getByText(/never includes passwords, sign-in sessions, payment IDs/i)).toBeTruthy()
    expect(accountActions.beginSignIn).not.toHaveBeenCalled()
    expect(accountActions.prepareAccountDataExport).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(invoker))
    fireEvent.click(invoker)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })

  it('requires fresh Google verification, serializes once, and downloads readable JSON locally', async () => {
    const accountActions = actions()
    const now = vi.fn(() => exportedAt)
    const download = vi.fn()
    render(
      <AccountDataExport
        accountId={accountId}
        enabled
        actions={accountActions}
        now={now}
        download={download}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))

    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(vi.mocked(accountActions.beginSignIn).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(accountActions.prepareAccountDataExport).mock.invocationCallOrder[0]!)
    expect(accountActions.prepareAccountDataExport).toHaveBeenCalledOnce()
    expect(now).toHaveBeenCalledOnce()
    expect(download).toHaveBeenCalledWith(
      expect.stringContaining('"kind": "account-data"'),
      'tab-two-account-data-2026-09-04.json',
    )
    expect((await screen.findByRole('status')).textContent).toBe('Account data downloaded.')
  })

  it('shows progress, prevents a duplicate request, and offers Try again only after failure', async () => {
    let finish!: (value: Awaited<ReturnType<AccountActions['prepareAccountDataExport']>>) => void
    const pending = new Promise<Awaited<ReturnType<AccountActions['prepareAccountDataExport']>>>((resolve) => { finish = resolve })
    const accountActions = actions()
    vi.mocked(accountActions.prepareAccountDataExport).mockReturnValue(pending)
    const download = vi.fn()
    render(<AccountDataExport accountId={accountId} enabled actions={accountActions} download={download} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))
    const preparing = await screen.findByRole('button', { name: 'Preparing download...' })
    expect(preparing.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(preparing)
    expect(accountActions.prepareAccountDataExport).toHaveBeenCalledOnce()

    finish({ status: 'data_unavailable' })
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('alert').textContent).toBe('Tab Two could not prepare a complete download. Nothing was changed.')
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(retry)
    expect(screen.getByRole('dialog', { name: 'Download your account data?' })).toBeTruthy()
    expect(accountActions.beginSignIn).toHaveBeenCalledOnce()
  })

  it.each([
    ['authentication_required', 'Sign in with Google to continue.'],
    ['verification_required', 'Google verification is required before downloading.'],
    ['offline', 'You’re offline. Nothing was downloaded; try again when connected.'],
    ['rate_limited', 'Too many download attempts. Please wait and try again.'],
  ] as const)('maps %s to safe actionable copy', async (status, copy) => {
    const accountActions = actions()
    vi.mocked(accountActions.prepareAccountDataExport).mockResolvedValue({ status })
    render(<AccountDataExport accountId={accountId} enabled actions={accountActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))
    expect((await screen.findByRole('alert')).textContent).toBe(copy)
  })

  it.each([
    [{ ok: false as const, code: 'cancelled' as const }, 'Google verification was cancelled. Nothing was downloaded.'],
    [{ ok: false as const, code: 'not_configured' as const }, 'Google verification is not configured in this build.'],
    [{ ok: false as const, code: 'failed' as const }, 'Google verification could not be completed. Try again.'],
  ])('does not request account data when fresh verification is blocked', async (verification, copy) => {
    const accountActions = actions()
    vi.mocked(accountActions.beginSignIn).mockResolvedValue(verification)
    render(<AccountDataExport accountId={accountId} enabled actions={accountActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))
    expect((await screen.findByRole('alert')).textContent).toBe(copy)
    expect(accountActions.prepareAccountDataExport).not.toHaveBeenCalled()
  })

  it('keeps a download-boundary failure safe and retryable', async () => {
    const download = vi.fn(() => { throw new Error('download blocked') })
    render(<AccountDataExport accountId={accountId} enabled actions={actions()} download={download} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The download could not be saved. Nothing was changed.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
