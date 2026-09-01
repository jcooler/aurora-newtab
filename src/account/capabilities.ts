import type { AccountSnapshot, PremiumCapability } from './types'

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
