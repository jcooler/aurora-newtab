// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AccountSnapshot } from '../../account/types'
import type { SyncViewState } from '../../sync/SyncProvider'
import { HelpSupportView } from './HelpSupport'

const ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'

function account(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    mode: 'signed_in',
    accountId: ACCOUNT_ID,
    email: 'private-owner@example.test',
    displayName: 'Private Owner',
    billing: {
      state: 'active',
      plan: 'annual',
      currentPeriodEnd: Date.parse('2027-09-03T18:00:00.000Z'),
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      introductoryEligible: false,
    },
    lease: {
      verification: 'verified',
      leaseVersion: 1,
      keyId: 'private-key-id',
      accountId: ACCOUNT_ID,
      capabilities: ['encrypted_sync', 'metrics_history'],
      grantSources: ['stripe'],
      issuedAt: Date.parse('2026-09-03T17:00:00.000Z'),
      expiresAt: Date.parse('2026-10-03T17:00:00.000Z'),
      leaseId: 'private-lease-id',
    },
    sync: {
      enabled: true,
      phase: 'up_to_date',
      lastSuccessAt: Date.parse('2026-09-03T17:55:00.000Z'),
      usedBytes: 128,
      quotaBytes: 2_097_152,
    },
    devices: [{ id: 'private-device-id', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    ...overrides,
  }
}

function sync(overrides: Partial<SyncViewState> = {}): SyncViewState {
  return {
    enabled: true,
    phase: 'up_to_date',
    attention: null,
    lastSuccessAt: Date.parse('2026-09-03T17:55:00.000Z'),
    usedBytes: 128,
    quotaBytes: 2_097_152,
    devices: [{ id: 'private-device-id', name: 'Desktop', lastSyncAt: null, current: true, revoked: false }],
    recoveries: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Help and troubleshooting', () => {
  it('shows an authored product-health spine for the current account, billing, and sync state', () => {
    render(<HelpSupportView account={account()} sync={sync()} now={() => Date.parse('2026-09-03T18:00:00.000Z')} />)

    expect(screen.getByRole('heading', { name: 'Keep Tab Two working' })).toBeTruthy()
    const health = screen.getByRole('region', { name: 'Tab Two status' })
    expect(within(health).getByText('Signed in')).toBeTruthy()
    expect(within(health).getByText('Active subscription')).toBeTruthy()
    expect(within(health).getByText('Desktop is protected')).toBeTruthy()
    expect(health.className).toContain('border-accent')
  })

  it.each([
    [{ mode: 'local' }, {}, 'Local mode'],
    [{ billing: { ...account().billing, state: 'complimentary', plan: null } }, {}, 'Complimentary subscription'],
    [{ billing: { ...account().billing, state: 'canceling' } }, {}, 'Subscription cancelling'],
    [{ billing: { ...account().billing, state: 'past_due' } }, {}, 'Payment needs attention'],
    [{}, { enabled: false, phase: 'disabled' }, 'Sync is off'],
    [{}, { phase: 'syncing' }, 'Syncing now'],
    [{}, { phase: 'offline', attention: 'offline' }, 'Offline, local data is safe'],
    [{}, { phase: 'needs_attention', attention: 'needs_attention' }, 'Sync needs attention'],
  ] as const)('derives truthful status copy for %#', (accountPatch, syncPatch, expected) => {
    render(<HelpSupportView account={account(accountPatch as Partial<AccountSnapshot>)} sync={sync(syncPatch as Partial<SyncViewState>)} />)
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('keeps recovery guidance specific, positive, and keyboard-native', () => {
    render(<HelpSupportView account={account()} sync={sync()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign-in and billing' }))
    expect(screen.getByText(/Account & Sync updates your subscription automatically/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Encrypted sync' }))
    expect(screen.getByText(/Sync now starts a fresh protected update/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Google Calendar' }))
    expect(screen.getByText(/Reconnect only the account that needs attention/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Microsoft Calendar' }))
    expect(screen.getByText(/personal and work or school accounts stay separate/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Backup and deletion' }))
    expect(screen.getByText(
      'Data creates the local backup used to restore this installation. Account & Sync can download readable account and synced data after Google verification. Recovery copies can be downloaded locally before restore or discard.',
    )).toBeTruthy()
  })

  it('does not send customers to an unavailable public support destination', () => {
    render(<HelpSupportView account={account()} sync={sync()} />)

    expect(screen.queryByRole('link', { name: 'Open the public support board' })).toBeNull()
    expect(screen.getByText(/A monitored private support channel will be available before launch/i)).toBeTruthy()
  })

  it('requires review before download and never reads storage or sends a request', () => {
    const download = vi.fn()
    const fetch = vi.fn()
    const storageGet = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('chrome', { storage: { local: { get: storageGet } } })
    render(<HelpSupportView account={account()} sync={sync()} download={download} now={() => Date.parse('2026-09-03T18:00:00.000Z')} />)

    expect(screen.getByText('Your diagnostic stays on this device until you download it.')).toBeTruthy()
    const create = screen.getByRole('button', { name: 'Create diagnostic report' })
    create.focus()
    fireEvent.click(create)

    const dialog = screen.getByRole('dialog', { name: 'Review diagnostic report' })
    const preview = within(dialog).getByRole('textbox', { name: 'Diagnostic report contents' })
    expect(preview.textContent).toContain('"billingState": "active"')
    expect(preview.textContent).not.toContain('private-owner@example.test')
    expect(preview.textContent).not.toContain('private-device-id')
    expect(preview.textContent).not.toContain('Desktop')
    expect(download).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(storageGet).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Download report' }))
    expect(download).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
    expect(storageGet).not.toHaveBeenCalled()
  })

  it('cancels with Escape, discards the report, and restores the invoker', async () => {
    render(<HelpSupportView account={account()} sync={sync()} />)
    const create = screen.getByRole('button', { name: 'Create diagnostic report' })
    create.focus()
    fireEvent.click(create)
    expect(screen.getByRole('dialog', { name: 'Review diagnostic report' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Review diagnostic report' })).toBeNull()
      expect(document.activeElement).toBe(create)
    })
  })
})
