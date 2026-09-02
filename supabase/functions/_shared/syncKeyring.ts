const KEK_SECRET = 'TAB_TWO_SYNC_KEK_V1'
const KEY_BYTES = 32
const WRAPPED_KEY_BYTES = 40

export interface SyncKeyringEnvironment {
  TAB_TWO_SYNC_KEK_V1?: string
}

export interface SyncKeyring {
  keyVersion: 1
  wrapDataKey(rawDataKey: Uint8Array): Promise<string>
  unwrapDataKey(wrappedDataKey: string): Promise<Uint8Array>
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('sync_base64url_invalid')
  const padding = '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
  } catch {
    throw new Error('sync_base64url_invalid')
  }
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new Error('sync_base64url_invalid')
  return decoded
}

export async function createSyncKeyring(
  environment: SyncKeyringEnvironment,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<SyncKeyring> {
  const encodedKek = environment[KEK_SECRET]
  if (!encodedKek) throw new Error('sync_kek_unavailable')

  let rawKek: Uint8Array
  try {
    rawKek = decodeBase64Url(encodedKek)
  } catch {
    throw new Error('sync_kek_invalid')
  }
  if (rawKek.byteLength !== KEY_BYTES) {
    rawKek.fill(0)
    throw new Error('sync_kek_invalid')
  }

  let kek: CryptoKey
  try {
    kek = await cryptoImplementation.subtle.importKey(
      'raw',
      rawKek,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    )
  } finally {
    rawKek.fill(0)
  }

  return {
    keyVersion: 1,
    async wrapDataKey(rawDataKey: Uint8Array): Promise<string> {
      if (!(rawDataKey instanceof Uint8Array) || rawDataKey.byteLength !== KEY_BYTES) {
        throw new Error('sync_data_key_invalid')
      }
      const temporaryDataKey = await cryptoImplementation.subtle.importKey(
        'raw',
        rawDataKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
      const wrapped = await cryptoImplementation.subtle.wrapKey('raw', temporaryDataKey, kek, 'AES-KW')
      return encodeBase64Url(new Uint8Array(wrapped))
    },
    async unwrapDataKey(wrappedDataKey: string): Promise<Uint8Array> {
      let wrapped: Uint8Array
      try {
        wrapped = decodeBase64Url(wrappedDataKey)
      } catch {
        throw new Error('sync_wrapped_key_invalid')
      }
      if (wrapped.byteLength !== WRAPPED_KEY_BYTES) throw new Error('sync_wrapped_key_invalid')
      try {
        const dataKey = await cryptoImplementation.subtle.unwrapKey(
          'raw',
          wrapped,
          kek,
          'AES-KW',
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt'],
        )
        const rawDataKey = new Uint8Array(await cryptoImplementation.subtle.exportKey('raw', dataKey))
        if (rawDataKey.byteLength !== KEY_BYTES) throw new Error()
        return rawDataKey
      } catch {
        throw new Error('sync_wrapped_key_invalid')
      }
    },
  }
}
