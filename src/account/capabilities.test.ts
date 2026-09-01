import { describe, expect, it } from 'vitest'
import { hasCapability } from './capabilities'
import type { AccountSnapshot, VerifiedEntitlementLease } from './types'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)

function snapshot(lease: VerifiedEntitlementLease | null): AccountSnapshot {
  return {
    mode: lease ? 'signed_in' : 'local',
    accountId: lease?.accountId ?? null,
    email: lease ? 'alex@example.com' : null,
    displayName: lease ? 'Alex Morgan' : null,
    subscription: lease ? 'active' : 'none',
    lease,
    sync: {
      enabled: false,
      phase: 'disabled',
      lastSuccessAt: null,
      usedBytes: 0,
      quotaBytes: 2_097_152,
    },
    devices: [],
  }
}

const activeLease: VerifiedEntitlementLease = {
  verification: 'verified',
  accountId: 'account-123',
  capabilities: ['encrypted_sync', 'metrics_history'],
  grantSources: ['stripe'],
  issuedAt: now - 60_000,
  expiresAt: now + 60_000,
  leaseId: 'lease-123',
}

describe('hasCapability', () => {
  it('keeps Local mode outside every premium capability', () => {
    expect(hasCapability(snapshot(null), 'encrypted_sync', now)).toBe(false)
  })

  it('grants only an exact capability on a verified unexpired lease', () => {
    const active = snapshot(activeLease)

    expect(hasCapability(active, 'encrypted_sync', now)).toBe(true)
    expect(hasCapability(active, 'metrics_history', now)).toBe(true)
    expect(hasCapability(active, 'strava', now)).toBe(false)
  })

  it.each([
    ['expired', { ...activeLease, expiresAt: now - 1 }],
    ['at the expiry boundary', { ...activeLease, expiresAt: now }],
    ['not yet verified', { ...activeLease, verification: 'unverified' }],
  ])('rejects a %s lease', (_name, lease) => {
    expect(
      hasCapability(snapshot(lease as VerifiedEntitlementLease), 'encrypted_sync', now),
    ).toBe(false)
  })

  it.each(['none', 'past_due', 'canceling', 'expired'] as const)(
    'does not infer capability from %s subscription state without a lease',
    (subscription) => {
      expect(hasCapability({ ...snapshot(null), mode: 'signed_in', subscription }, 'encrypted_sync', now)).toBe(false)
    },
  )
})
