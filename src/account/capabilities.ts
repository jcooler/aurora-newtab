import type { AccountSnapshot, PremiumCapability } from './types'

export function hasCapability(
  snapshot: AccountSnapshot,
  capability: PremiumCapability,
  now = Date.now(),
): boolean {
  const lease = snapshot.lease
  return snapshot.mode === 'signed_in'
    && lease?.verification === 'verified'
    && lease.expiresAt > now
    && lease.capabilities.includes(capability)
}
