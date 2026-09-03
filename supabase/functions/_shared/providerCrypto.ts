const PROVIDER_KEK_SECRET = 'TAB_TWO_PROVIDER_TOKEN_KEK_V1'
const KEY_BYTES = 32
const NONCE_BYTES = 12
const MAX_SECRET_BYTES = 4096

export type ProviderSecretPurpose = 'refresh_token' | 'pkce_verifier'

export interface ProviderSecretContext {
  purpose: ProviderSecretPurpose
  provider: 'google_calendar' | 'microsoft_calendar'
  accountId: string
  objectId: string
}

export interface ProviderSecretEnvelope {
  keyVersion: 1
  nonce: string
  ciphertext: string
  fingerprint: string
}

export interface ProviderCryptoEnvironment {
  TAB_TWO_PROVIDER_TOKEN_KEK_V1?: string
}

export interface ProviderCrypto {
  keyVersion: 1
  encryptSecret(secret: string, context: ProviderSecretContext): Promise<ProviderSecretEnvelope>
  decryptSecret(envelope: ProviderSecretEnvelope, context: ProviderSecretContext): Promise<string>
}

export function encodeProviderBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

export function decodeProviderBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('provider_base64url_invalid')
  const padding = '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
  } catch {
    throw new Error('provider_base64url_invalid')
  }
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (encodeProviderBase64Url(decoded) !== value) throw new Error('provider_base64url_invalid')
  return decoded
}

function validContext(context: ProviderSecretContext): boolean {
  return (
    (context.purpose === 'refresh_token' || context.purpose === 'pkce_verifier')
    && (context.provider === 'google_calendar' || context.provider === 'microsoft_calendar')
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(context.accountId)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(context.objectId)
  )
}

function associatedData(context: ProviderSecretContext): Uint8Array {
  if (!validContext(context)) throw new Error('provider_secret_invalid')
  return new TextEncoder().encode([
    'tab-two-provider-secret',
    '1',
    context.purpose,
    context.provider,
    context.accountId.toLowerCase(),
    context.objectId.toLowerCase(),
    '1',
  ].join('\u001f'))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export async function createProviderCrypto(
  environment: ProviderCryptoEnvironment,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<ProviderCrypto> {
  const encodedKek = environment[PROVIDER_KEK_SECRET]
  if (!encodedKek) throw new Error('provider_kek_unavailable')

  return createProviderCryptoFromKek(encodedKek, cryptoImplementation)
}

/** Builds the provider envelope boundary from an already selected KEK. This
 * lets each provider runtime require its own secret without widening the
 * legacy Google environment contract. */
export async function createProviderCryptoFromKek(
  encodedKek: string,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<ProviderCrypto> {

  let rawKek: Uint8Array
  try {
    rawKek = decodeProviderBase64Url(encodedKek)
  } catch {
    throw new Error('provider_kek_invalid')
  }
  if (rawKek.byteLength !== KEY_BYTES) {
    rawKek.fill(0)
    throw new Error('provider_kek_invalid')
  }

  let encryptionKey: CryptoKey
  let fingerprintKey: CryptoKey
  try {
    encryptionKey = await cryptoImplementation.subtle.importKey(
      'raw', rawKek, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    )
    fingerprintKey = await cryptoImplementation.subtle.importKey(
      'raw', rawKek, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
  } catch {
    throw new Error('provider_kek_invalid')
  } finally {
    rawKek.fill(0)
  }

  return {
    keyVersion: 1,
    async encryptSecret(secret, context) {
      const plaintext = new TextEncoder().encode(secret)
      if (!secret || plaintext.byteLength > MAX_SECRET_BYTES) {
        plaintext.fill(0)
        throw new Error('provider_secret_invalid')
      }
      const nonce = cryptoImplementation.getRandomValues(new Uint8Array(NONCE_BYTES))
      try {
        const [ciphertext, fingerprint] = await Promise.all([
          cryptoImplementation.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: associatedData(context), tagLength: 128 },
            encryptionKey,
            plaintext,
          ),
          cryptoImplementation.subtle.sign('HMAC', fingerprintKey, plaintext),
        ])
        return {
          keyVersion: 1,
          nonce: encodeProviderBase64Url(nonce),
          ciphertext: encodeProviderBase64Url(new Uint8Array(ciphertext)),
          fingerprint: encodeProviderBase64Url(new Uint8Array(fingerprint)),
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'provider_secret_invalid') throw error
        throw new Error('provider_secret_invalid')
      } finally {
        plaintext.fill(0)
        nonce.fill(0)
      }
    },
    async decryptSecret(envelope, context) {
      if (envelope.keyVersion !== 1) throw new Error('provider_secret_invalid')
      let nonce: Uint8Array
      let ciphertext: Uint8Array
      let expectedFingerprint: Uint8Array
      try {
        nonce = decodeProviderBase64Url(envelope.nonce)
        ciphertext = decodeProviderBase64Url(envelope.ciphertext)
        expectedFingerprint = decodeProviderBase64Url(envelope.fingerprint)
      } catch {
        throw new Error('provider_secret_invalid')
      }
      if (
        nonce.byteLength !== NONCE_BYTES
        || ciphertext.byteLength < 17
        || ciphertext.byteLength > MAX_SECRET_BYTES + 16
        || expectedFingerprint.byteLength !== KEY_BYTES
      ) {
        nonce.fill(0)
        ciphertext.fill(0)
        expectedFingerprint.fill(0)
        throw new Error('provider_secret_invalid')
      }
      try {
        const plaintext = new Uint8Array(await cryptoImplementation.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce, additionalData: associatedData(context), tagLength: 128 },
          encryptionKey,
          ciphertext,
        ))
        try {
          const actualFingerprint = new Uint8Array(await cryptoImplementation.subtle.sign(
            'HMAC', fingerprintKey, plaintext,
          ))
          try {
            if (!equalBytes(actualFingerprint, expectedFingerprint)) throw new Error()
          } finally {
            actualFingerprint.fill(0)
          }
          const value = new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
          if (!value) throw new Error()
          return value
        } finally {
          plaintext.fill(0)
        }
      } catch {
        throw new Error('provider_secret_invalid')
      } finally {
        nonce.fill(0)
        ciphertext.fill(0)
        expectedFingerprint.fill(0)
      }
    },
  }
}
