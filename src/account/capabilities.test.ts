import { describe, expect, it } from 'vitest'
import { hasCapability, hasProviderCapability } from './capabilities'
import type { AccountSnapshot, VerifiedEntitlementLease } from './types'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)

function snapshot(lease: VerifiedEntitlementLease | null): AccountSnapshot {
  return {
    mode: lease ? 'signed_in' : 'local',
    accountId: lease?.accountId ?? null,
    email: lease ? 'alex@example.com' : null,
    displayName: lease ? 'Alex Morgan' : null,
    billing: {
      state: lease ? 'active' : 'none', plan: lease ? 'monthly' : null,
      currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false,
      introductoryEligible: !lease,
    },
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
  leaseVersion: 1,
  keyId: 'test-key',
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
    ['not yet issued', { ...activeLease, issuedAt: now + 1 }],
    ['not yet verified', { ...activeLease, verification: 'unverified' }],
  ])('rejects a %s lease', (_name, lease) => {
    expect(
      hasCapability(snapshot(lease as VerifiedEntitlementLease), 'encrypted_sync', now),
    ).toBe(false)
  })

  it.each(['none', 'past_due', 'canceling', 'expired'] as const)(
    'does not infer capability from %s subscription state without a lease',
    (state) => {
      expect(hasCapability({
        ...snapshot(null),
        mode: 'signed_in',
        billing: { ...snapshot(null).billing, state },
      }, 'encrypted_sync', now)).toBe(false)
    },
  )

  it('rejects a verified lease bound to a different account', () => {
    const active = { ...snapshot(activeLease), accountId: 'account-456' }
    expect(hasCapability(active, 'encrypted_sync', now)).toBe(false)
  })
})

describe('hasProviderCapability', () => {
  it('requires both the exact provider and multi-account capabilities', () => {
    const fullLease: VerifiedEntitlementLease = {
      ...activeLease,
      capabilities: ['multi_account', 'google_calendar'],
    }

    expect(hasProviderCapability(snapshot(fullLease), 'google_calendar', now)).toBe(true)
    expect(hasProviderCapability(snapshot({
      ...fullLease,
      capabilities: ['google_calendar'],
    }), 'google_calendar', now)).toBe(false)
    expect(hasProviderCapability(snapshot({
      ...fullLease,
      capabilities: ['multi_account'],
    }), 'google_calendar', now)).toBe(false)
  })

  it('preserves the signed Microsoft Calendar capability behind multi-account access', () => {
    const fullLease: VerifiedEntitlementLease = {
      ...activeLease,
      capabilities: ['multi_account', 'microsoft_calendar'],
    }

    expect(hasProviderCapability(snapshot(fullLease), 'microsoft_calendar', now)).toBe(true)
    expect(hasProviderCapability(snapshot({
      ...fullLease,
      capabilities: ['microsoft_calendar'],
    }), 'microsoft_calendar', now)).toBe(false)
    expect(hasProviderCapability(snapshot({
      ...fullLease,
      capabilities: ['multi_account'],
    }), 'microsoft_calendar', now)).toBe(false)
  })

  it('inherits account binding, verification, issue-time, and expiry checks', () => {
    const lease: VerifiedEntitlementLease = {
      ...activeLease,
      capabilities: ['multi_account', 'google_calendar'],
      expiresAt: now,
    }

    expect(hasProviderCapability(snapshot(lease), 'google_calendar', now)).toBe(false)
  })
})
