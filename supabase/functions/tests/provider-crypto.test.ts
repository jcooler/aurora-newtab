import { describe, expect, it } from 'vitest'
import { createProviderCrypto, encodeProviderBase64Url } from '../_shared/providerCrypto'

const environment = {
  TAB_TWO_PROVIDER_TOKEN_KEK_V1: encodeProviderBase64Url(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  ),
}

const connectionContext = {
  purpose: 'refresh_token' as const,
  provider: 'google_calendar' as const,
  accountId: '43000000-0000-4000-8000-000000000001',
  objectId: '63000000-0000-4000-8000-000000000001',
}

describe('provider secret encryption', () => {
  it('round-trips a secret with versioned authenticated context and no plaintext output', async () => {
    const crypto = await createProviderCrypto(environment)
    const envelope = await crypto.encryptSecret('refresh-token-secret', connectionContext)

    expect(envelope).toEqual({
      keyVersion: 1,
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/u),
      ciphertext: expect.stringMatching(/^[A-Za-z0-9_-]+$/u),
      fingerprint: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    })
    expect(JSON.stringify(envelope)).not.toContain('refresh-token-secret')
    await expect(crypto.decryptSecret(envelope, connectionContext)).resolves.toBe('refresh-token-secret')
  })

  it('uses a fresh 96-bit nonce for identical plaintext', async () => {
    const crypto = await createProviderCrypto(environment)
    const first = await crypto.encryptSecret('same-secret', connectionContext)
    const second = await crypto.encryptSecret('same-secret', connectionContext)

    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(first.fingerprint).toBe(second.fingerprint)
  })

  it('rejects account, object, purpose, provider, and key-version substitution', async () => {
    const crypto = await createProviderCrypto(environment)
    const envelope = await crypto.encryptSecret('refresh-token-secret', connectionContext)

    for (const context of [
      { ...connectionContext, accountId: '43000000-0000-4000-8000-000000000002' },
      { ...connectionContext, objectId: '63000000-0000-4000-8000-000000000002' },
      { ...connectionContext, purpose: 'pkce_verifier' as const },
    ]) {
      await expect(crypto.decryptSecret(envelope, context)).rejects.toThrow('provider_secret_invalid')
    }
    await expect(crypto.decryptSecret({ ...envelope, keyVersion: 2 as 1 }, connectionContext))
      .rejects.toThrow('provider_secret_invalid')
  })

  it('rejects malformed keys, non-canonical encodings, and modified ciphertext', async () => {
    await expect(createProviderCrypto({ TAB_TWO_PROVIDER_TOKEN_KEK_V1: 'short' }))
      .rejects.toThrow('provider_kek_invalid')

    const crypto = await createProviderCrypto(environment)
    const envelope = await crypto.encryptSecret('refresh-token-secret', connectionContext)
    await expect(crypto.decryptSecret({ ...envelope, nonce: `${envelope.nonce}=` }, connectionContext))
      .rejects.toThrow('provider_secret_invalid')
    await expect(crypto.decryptSecret({
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}A`,
    }, connectionContext)).rejects.toThrow('provider_secret_invalid')
    await expect(crypto.decryptSecret({
      ...envelope,
      fingerprint: `${envelope.fingerprint[0] === 'A' ? 'B' : 'A'}${envelope.fingerprint.slice(1)}`,
    }, connectionContext)).rejects.toThrow('provider_secret_invalid')
  })
})
