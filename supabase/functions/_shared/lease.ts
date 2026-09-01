import type {
  LeasePayloadV1,
  PremiumCapability,
  SignedEntitlementLeaseV1,
  SignedGrantSource,
} from '../../../src/account/types'

const capabilities = new Set<PremiumCapability>([
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
  'strava',
])
const grantSources = new Set<SignedGrantSource>(['stripe', 'complimentary_owner'])
const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function sortedUnique<T extends string>(
  values: readonly T[],
  allowed: ReadonlySet<T>,
): T[] {
  if (!values.length || values.some((value) => !allowed.has(value))) {
    throw new Error('invalid_lease_payload')
  }
  const result = [...values].sort()
  if (new Set(result).size !== result.length) throw new Error('invalid_lease_payload')
  return result
}

function boundedString(value: string): string {
  if (!value || value.length > 200) throw new Error('invalid_lease_payload')
  return value
}

export function canonicalLeasePayloadV1(payload: LeasePayloadV1): string {
  if (
    payload.version !== 1
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.expiresAt <= payload.issuedAt
  ) {
    throw new Error('invalid_lease_payload')
  }

  return JSON.stringify({
    version: 1,
    leaseId: boundedString(payload.leaseId),
    accountId: boundedString(payload.accountId),
    capabilities: sortedUnique(payload.capabilities, capabilities),
    grantSources: sortedUnique(payload.grantSources, grantSources),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  })
}

export async function signLeaseV1(
  payload: LeasePayloadV1,
  options: { keyId: string; privateKey: CryptoKey },
): Promise<SignedEntitlementLeaseV1> {
  if (!options.keyId || options.keyId.length > 100) throw new Error('invalid_signing_key')
  if (
    options.privateKey.type !== 'private'
    || options.privateKey.algorithm.name !== 'Ed25519'
    || !options.privateKey.usages.includes('sign')
  ) {
    throw new Error('invalid_signing_key')
  }

  const encoded = encoder.encode(canonicalLeasePayloadV1(payload))
  const signature = await crypto.subtle.sign('Ed25519', options.privateKey, encoded)
  return {
    algorithm: 'Ed25519',
    keyId: options.keyId,
    payload: base64Url(encoded),
    signature: base64Url(new Uint8Array(signature)),
  }
}
