import { canonicalJson, canonicalUtf8 } from './canonical'
import { SYNC_ENTITY_TYPES, type SyncEntityType, type SyncEntityV1 } from './types'

const NONCE_BYTES = 12
const DATA_KEY_BYTES = 32
const GCM_TAG_BYTES = 16
const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u
const ENTITY_TYPES: ReadonlySet<string> = new Set(SYNC_ENTITY_TYPES)
const decoder = new TextDecoder('utf-8', { fatal: true })

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer
}

export interface SyncRecordHeaderV1 {
  envelopeVersion: 1
  accountId: string
  entityType: SyncEntityType
  entityId: string
  revision: number
  tombstone: boolean
}

export interface EncryptedSyncRecordV1 extends SyncRecordHeaderV1 {
  nonce: string
  ciphertext: string
}

export interface SyncCryptoOptions {
  crypto?: Crypto
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error('sync_record_authentication_failed')
  }
  const padding = '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
  } catch {
    throw new Error('sync_record_authentication_failed')
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (encodeBase64Url(bytes) !== value) throw new Error('sync_record_authentication_failed')
  return bytes
}

function validHeader(value: unknown): value is SyncRecordHeaderV1 {
  if (!value || typeof value !== 'object') return false
  const header = value as Partial<SyncRecordHeaderV1>
  return header.envelopeVersion === 1
    && typeof header.accountId === 'string'
    && ACCOUNT_UUID.test(header.accountId)
    && typeof header.entityType === 'string'
    && ENTITY_TYPES.has(header.entityType)
    && typeof header.entityId === 'string'
    && ENTITY_ID.test(header.entityId)
    && Number.isSafeInteger(header.revision)
    && (header.revision as number) > 0
    && typeof header.tombstone === 'boolean'
}

function aad(header: SyncRecordHeaderV1): Uint8Array {
  return canonicalUtf8({
    envelopeVersion: header.envelopeVersion,
    accountId: header.accountId,
    entityType: header.entityType,
    entityId: header.entityId,
    revision: header.revision,
    tombstone: header.tombstone,
  })
}

function validDataKey(key: CryptoKey): boolean {
  const algorithm = key.algorithm as AesKeyAlgorithm
  return key.type === 'secret'
    && algorithm.name === 'AES-GCM'
    && algorithm.length === 256
    && key.usages.includes('encrypt')
    && key.usages.includes('decrypt')
}

function assertPlaintextIdentity(
  header: SyncRecordHeaderV1,
  entity: SyncEntityV1 | null,
): void {
  if (header.tombstone) {
    if (entity !== null) throw new Error('sync_record_identity_invalid')
    return
  }
  if (!entity
    || entity.schemaVersion !== 1
    || entity.entityType !== header.entityType
    || entity.entityId !== header.entityId
    || Object.keys(entity).sort().join(',') !== 'entityId,entityType,schemaVersion,value') {
    throw new Error('sync_record_identity_invalid')
  }
}

export async function importDataKey(
  rawKey: Uint8Array,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== DATA_KEY_BYTES) {
    throw new Error('sync_data_key_invalid')
  }
  return cryptoImplementation.subtle.importKey(
    'raw',
    ownedBuffer(rawKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function generateDataKey(
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoImplementation.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSyncRecord(
  key: CryptoKey,
  header: SyncRecordHeaderV1,
  entity: SyncEntityV1 | null,
  options: SyncCryptoOptions = {},
): Promise<EncryptedSyncRecordV1> {
  if (!validDataKey(key)) throw new Error('sync_data_key_invalid')
  if (!validHeader(header)) throw new Error('sync_record_header_invalid')
  assertPlaintextIdentity(header, entity)

  const cryptoImplementation = options.crypto ?? globalThis.crypto
  const nonce = cryptoImplementation.getRandomValues(new Uint8Array(NONCE_BYTES))
  if (nonce.byteLength !== NONCE_BYTES) throw new Error('sync_nonce_invalid')

  const plaintext = canonicalUtf8(entity)
  const ciphertext = await cryptoImplementation.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ownedBuffer(nonce),
      additionalData: ownedBuffer(aad(header)),
      tagLength: 128,
    },
    key,
    ownedBuffer(plaintext),
  )
  return {
    envelopeVersion: header.envelopeVersion,
    accountId: header.accountId,
    entityType: header.entityType,
    entityId: header.entityId,
    revision: header.revision,
    tombstone: header.tombstone,
    nonce: encodeBase64Url(nonce),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  }
}

export async function decryptSyncRecord(
  key: CryptoKey,
  record: EncryptedSyncRecordV1,
  cryptoImplementation: Crypto = globalThis.crypto,
): Promise<SyncEntityV1 | null> {
  try {
    if (!validDataKey(key) || !validHeader(record)) throw new Error()
    const nonce = decodeBase64Url(record.nonce)
    const ciphertext = decodeBase64Url(record.ciphertext)
    if (nonce.byteLength !== NONCE_BYTES || ciphertext.byteLength < GCM_TAG_BYTES) throw new Error()

    const plaintext = await cryptoImplementation.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ownedBuffer(nonce),
        additionalData: ownedBuffer(aad(record)),
        tagLength: 128,
      },
      key,
      ownedBuffer(ciphertext),
    )
    const parsed: unknown = JSON.parse(decoder.decode(plaintext))
    if (canonicalJson(parsed) !== decoder.decode(plaintext)) throw new Error()
    assertPlaintextIdentity(record, parsed as SyncEntityV1 | null)
    return parsed as SyncEntityV1 | null
  } catch {
    throw new Error('sync_record_authentication_failed')
  }
}
