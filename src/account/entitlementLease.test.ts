import { beforeAll, describe, expect, it } from 'vitest'
import { signLeaseV1 } from '../../supabase/functions/_shared/lease'
import { verifyEntitlementLeaseV1 } from './entitlementLease'
import type { LeasePayloadV1, SignedEntitlementLeaseV1 } from './types'

const now = Date.UTC(2026, 8, 1, 14, 0, 0)
const encoder = new TextEncoder()

let privateKey: CryptoKey
let publicKeySpki = ''

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

async function signedRawPayload(payload: unknown): Promise<SignedEntitlementLeaseV1> {
  const encoded = encoder.encode(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('Ed25519', privateKey, encoded)
  return {
    algorithm: 'Ed25519',
    keyId: 'local-test-key',
    payload: base64Url(encoded),
    signature: base64Url(new Uint8Array(signature)),
  }
}

const validPayload: LeasePayloadV1 = {
  version: 1,
  leaseId: 'lease-a',
  accountId: 'account-a',
  capabilities: ['encrypted_sync', 'metrics_history'],
  grantSources: ['complimentary_owner'],
  issuedAt: now - 60_000,
  expiresAt: now + 60_000,
}

function options(overrides: Partial<Parameters<typeof verifyEntitlementLeaseV1>[1]> = {}) {
  return {
    expectedAccountId: 'account-a',
    now,
    trustedKeys: { 'local-test-key': publicKeySpki },
    ...overrides,
  }
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  privateKey = pair.privateKey
  publicKeySpki = base64Url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)))
})

describe('verifyEntitlementLeaseV1', () => {
  it('verifies a canonical Ed25519 lease and returns only trusted fields', async () => {
    const envelope = await signLeaseV1(validPayload, {
      keyId: 'local-test-key',
      privateKey,
    })

    await expect(verifyEntitlementLeaseV1(envelope, options())).resolves.toEqual({
      verification: 'verified',
      leaseVersion: 1,
      keyId: 'local-test-key',
      leaseId: 'lease-a',
      accountId: 'account-a',
      capabilities: ['encrypted_sync', 'metrics_history'],
      grantSources: ['complimentary_owner'],
      issuedAt: now - 60_000,
      expiresAt: now + 60_000,
    })
  })

  it('rejects payload mutation after signing', async () => {
    const envelope = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })
    const mutated = {
      ...envelope,
      payload: base64Url(encoder.encode(JSON.stringify({ ...validPayload, accountId: 'account-b' }))),
    }
    await expect(verifyEntitlementLeaseV1(mutated, options())).resolves.toBeNull()
  })

  it('rejects signature mutation', async () => {
    const envelope = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })
    const last = envelope.signature.at(-1) === 'A' ? 'B' : 'A'
    await expect(
      verifyEntitlementLeaseV1(
        { ...envelope, signature: `${envelope.signature.slice(0, -1)}${last}` },
        options(),
      ),
    ).resolves.toBeNull()
  })

  it('rejects an unknown signing key id', async () => {
    const envelope = await signLeaseV1(validPayload, { keyId: 'unknown-key', privateKey })
    await expect(verifyEntitlementLeaseV1(envelope, options())).resolves.toBeNull()
  })

  it('rejects a lease bound to another account', async () => {
    const envelope = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })
    await expect(
      verifyEntitlementLeaseV1(envelope, options({ expectedAccountId: 'account-b' })),
    ).resolves.toBeNull()
  })

  it.each([
    ['future issue time', { issuedAt: now + 1, expiresAt: now + 60_000 }],
    ['expiry boundary', { issuedAt: now - 60_000, expiresAt: now }],
    ['expiry before issue', { issuedAt: now - 1, expiresAt: now - 2 }],
  ])('rejects an invalid %s', async (_name, times) => {
    const envelope = await signedRawPayload({ ...validPayload, ...times })
    await expect(verifyEntitlementLeaseV1(envelope, options())).resolves.toBeNull()
  })

  it.each([
    ['duplicate capabilities', ['encrypted_sync', 'encrypted_sync'], ['complimentary_owner']],
    ['unknown capabilities', ['encrypted_sync', 'future_capability'], ['complimentary_owner']],
    ['unsorted capabilities', ['metrics_history', 'encrypted_sync'], ['complimentary_owner']],
    ['duplicate grant sources', ['encrypted_sync'], ['stripe', 'stripe']],
    ['unsorted grant sources', ['encrypted_sync'], ['stripe', 'complimentary_owner']],
    ['preview fixture grant source', ['encrypted_sync'], ['preview_fixture']],
  ])('rejects %s even when signed', async (_name, capabilities, grantSources) => {
    const envelope = await signedRawPayload({ ...validPayload, capabilities, grantSources })
    await expect(verifyEntitlementLeaseV1(envelope, options())).resolves.toBeNull()
  })

  it('rejects unsupported versions and algorithms', async () => {
    const version = await signedRawPayload({ ...validPayload, version: 2 })
    const valid = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })

    await expect(verifyEntitlementLeaseV1(version, options())).resolves.toBeNull()
    await expect(
      verifyEntitlementLeaseV1({ ...valid, algorithm: 'ES256' } as never, options()),
    ).resolves.toBeNull()
  })

  it('rejects malformed or non-canonical base64url', async () => {
    const valid = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })
    await expect(
      verifyEntitlementLeaseV1({ ...valid, payload: `${valid.payload}=` }, options()),
    ).resolves.toBeNull()
    await expect(
      verifyEntitlementLeaseV1({ ...valid, signature: 'not+base64/url' }, options()),
    ).resolves.toBeNull()
  })

  it('rejects a signed payload whose JSON property order is non-canonical', async () => {
    const envelope = await signedRawPayload({
      accountId: validPayload.accountId,
      version: validPayload.version,
      leaseId: validPayload.leaseId,
      capabilities: validPayload.capabilities,
      grantSources: validPayload.grantSources,
      issuedAt: validPayload.issuedAt,
      expiresAt: validPayload.expiresAt,
    })
    await expect(verifyEntitlementLeaseV1(envelope, options())).resolves.toBeNull()
  })

  it('rejects unknown payload and envelope properties', async () => {
    const payload = await signedRawPayload({ ...validPayload, extra: true })
    const valid = await signLeaseV1(validPayload, { keyId: 'local-test-key', privateKey })

    await expect(verifyEntitlementLeaseV1(payload, options())).resolves.toBeNull()
    await expect(
      verifyEntitlementLeaseV1({ ...valid, extra: true } as never, options()),
    ).resolves.toBeNull()
  })
})
