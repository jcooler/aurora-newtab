// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountClient } from './client'
import type { AccountActions, AccountSnapshot } from './types'

vi.mock('../lib/storage/context', () => ({
  useStorage: () => {
    throw new Error('AccountProvider must not consult AuroraStorage')
  },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const signedInSnapshot: AccountSnapshot = {
  mode: 'signed_in',
  accountId: 'account-1',
  email: 'alex@example.com',
  displayName: 'Alex Morgan',
  billing: {
    state: 'active', plan: 'monthly', currentPeriodEnd: null, courtesyEnd: null,
    cancelAtPeriodEnd: false, introductoryEligible: false,
  },
  lease: null,
  sync: {
    enabled: false,
    phase: 'disabled',
    lastSuccessAt: null,
    usedBytes: 0,
    quotaBytes: 2_097_152,
  },
  devices: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => { resolve = fulfill })
  return { promise, resolve }
}

function fakeClient(initial: Promise<AccountSnapshot>) {
  let listener: ((snapshot: AccountSnapshot) => void) | null = null
  const unsubscribe = vi.fn()
  const actions: AccountActions = {
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
  const client: AccountClient = {
    getSnapshot: vi.fn(() => initial),
    subscribe: vi.fn((next) => {
      listener = next
      return unsubscribe
    }),
    actions,
    syncGateway: null,
    providerGateway: null,
  }
  return {
    client,
    actions,
    unsubscribe,
    emit(snapshot: AccountSnapshot) { listener?.(snapshot) },
  }
}

describe('AccountProvider', () => {
  it('renders Local mode until asynchronous client hydration completes', async () => {
    const hydration = deferred<AccountSnapshot>()
    const fixture = fakeClient(hydration.promise)
    const { AccountProvider, useAccount } = await import('./AccountContext')

    function Probe() {
      const { snapshot } = useAccount()
      return <p>{snapshot.mode}</p>
    }

    render(<AccountProvider client={fixture.client}><Probe /></AccountProvider>)
    expect(screen.getByText('local')).toBeTruthy()

    hydration.resolve(signedInSnapshot)
    expect(await screen.findByText('signed_in')).toBeTruthy()
  })

  it('publishes subscription updates and keeps the actions reference stable', async () => {
    const fixture = fakeClient(Promise.resolve(signedInSnapshot))
    const seenActions: AccountActions[] = []
    const { AccountProvider, useAccount } = await import('./AccountContext')

    function Probe() {
      const { snapshot, actions } = useAccount()
      seenActions.push(actions)
      return <button type="button" onClick={() => void actions.syncNow()}>{snapshot.sync.phase}</button>
    }

    render(<AccountProvider client={fixture.client}><Probe /></AccountProvider>)
    expect(await screen.findByRole('button', { name: 'disabled' })).toBeTruthy()
    act(() => {
      fixture.emit({ ...signedInSnapshot, sync: { ...signedInSnapshot.sync, enabled: true, phase: 'syncing' } })
    })
    expect(await screen.findByRole('button', { name: 'syncing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'syncing' }))

    expect(fixture.actions.syncNow).toHaveBeenCalledOnce()
    expect(new Set(seenActions)).toEqual(new Set([fixture.actions]))
  })

  it('unsubscribes from the injected client on unmount', async () => {
    const fixture = fakeClient(Promise.resolve(signedInSnapshot))
    const { AccountProvider, useAccount } = await import('./AccountContext')

    function Probe() {
      return <p>{useAccount().snapshot.mode}</p>
    }

    const rendered = render(<AccountProvider client={fixture.client}><Probe /></AccountProvider>)
    await waitFor(() => expect(fixture.client.subscribe).toHaveBeenCalledOnce())
    rendered.unmount()

    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
  })
})
