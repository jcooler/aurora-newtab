import type {
  LeasePayloadV1,
  PremiumCapability,
  SignedEntitlementLeaseV1,
  SignedGrantSource,
  VerifiedEntitlementLease,
} from './types'

const capabilityValues = [
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
  'strava',
] as const satisfies readonly PremiumCapability[]
const grantSourceValues = [
  'stripe',
  'complimentary_owner',
] as const satisfies readonly SignedGrantSource[]
const capabilities = new Set<string>(capabilityValues)
const grantSources = new Set<string>(grantSourceValues)
const envelopeKeys = ['algorithm', 'keyId', 'payload', 'signature']
const payloadKeys = [
  'version',
  'leaseId',
  'accountId',
  'capabilities',
  'grantSources',
  'issuedAt',
  'expiresAt',
]
const decoder = new TextDecoder('utf-8', { fatal: true })

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function decodeBase64Url(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/u.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    let canonical = ''
    for (const byte of bytes) canonical += String.fromCharCode(byte)
    canonical = btoa(canonical).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
    return canonical === value ? bytes : null
  } catch {
    return null
  }
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

function isSortedUniqueAllowed<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): value is T[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    return false
  }
  const typed = value as string[]
  return typed.every((item) => allowed.has(item))
    && typed.every((item, index) => index === 0 || typed[index - 1] < item)
}

function parsePayload(value: unknown): LeasePayloadV1 | null {
  if (!isExactRecord(value, payloadKeys)) return null
  if (
    value.version !== 1
    || !isBoundedString(value.leaseId)
    || !isBoundedString(value.accountId)
    || !isSortedUniqueAllowed<PremiumCapability>(value.capabilities, capabilities)
    || !isSortedUniqueAllowed<SignedGrantSource>(value.grantSources, grantSources)
    || !Number.isSafeInteger(value.issuedAt)
    || !Number.isSafeInteger(value.expiresAt)
  ) {
    return null
  }
  return value as unknown as LeasePayloadV1
}

function canonicalPayload(payload: LeasePayloadV1): string {
  return JSON.stringify({
    version: 1,
    leaseId: payload.leaseId,
    accountId: payload.accountId,
    capabilities: payload.capabilities,
    grantSources: payload.grantSources,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  })
}

export async function verifyEntitlementLeaseV1(
  envelope: SignedEntitlementLeaseV1,
  options: {
    expectedAccountId: string
    now: number
    trustedKeys: Readonly<Record<string, string>>
  },
): Promise<VerifiedEntitlementLease | null> {
  try {
    if (
      !isExactRecord(envelope, envelopeKeys)
      || envelope.algorithm !== 'Ed25519'
      || !isBoundedString(envelope.keyId)
      || !Number.isSafeInteger(options.now)
      || !isBoundedString(options.expectedAccountId)
    ) {
      return null
    }
    const trustedKey = options.trustedKeys[envelope.keyId]
    const payloadBytes = decodeBase64Url(envelope.payload)
    const signatureBytes = decodeBase64Url(envelope.signature)
    const publicKeyBytes = decodeBase64Url(trustedKey)
    if (!payloadBytes || !signatureBytes || signatureBytes.length !== 64 || !publicKeyBytes) return null

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes,
      'Ed25519',
      false,
      ['verify'],
    )
    if (!await crypto.subtle.verify('Ed25519', publicKey, signatureBytes, payloadBytes)) return null

    const payload = parsePayload(JSON.parse(decoder.decode(payloadBytes)))
    if (!payload || canonicalPayload(payload) !== decoder.decode(payloadBytes)) return null
    if (
      payload.accountId !== options.expectedAccountId
      || payload.issuedAt > options.now
      || payload.expiresAt <= options.now
      || payload.expiresAt <= payload.issuedAt
    ) {
      return null
    }

    return Object.freeze({
      verification: 'verified',
      leaseVersion: 1,
      keyId: envelope.keyId,
      leaseId: payload.leaseId,
      accountId: payload.accountId,
      capabilities: Object.freeze([...payload.capabilities]),
      grantSources: Object.freeze([...payload.grantSources]),
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    })
  } catch {
    return null
  }
}
