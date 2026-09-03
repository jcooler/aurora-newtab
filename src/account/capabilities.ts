import type { AccountSnapshot, PremiumCapability } from './types'
import type { ProviderId } from '../providers/types'

export function hasCapability(
  snapshot: AccountSnapshot,
  capability: PremiumCapability,
  now = Date.now(),
): boolean {
  const lease = snapshot.lease
  return snapshot.mode === 'signed_in'
    && snapshot.accountId !== null
    && lease?.verification === 'verified'
    && lease.accountId === snapshot.accountId
    && lease.issuedAt <= now
    && lease.expiresAt > now
    && lease.capabilities.includes(capability)
}

export function hasProviderCapability(
  snapshot: AccountSnapshot,
  provider: ProviderId,
  now = Date.now(),
): boolean {
  switch (provider) {
    case 'google_calendar':
      return hasCapability(snapshot, 'multi_account', now)
        && hasCapability(snapshot, 'google_calendar', now)
  }
}
