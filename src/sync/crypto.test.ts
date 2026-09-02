import { describe, expect, it, vi } from 'vitest'
import type { SyncEntityV1 } from './types'
import {
  decryptSyncRecord,
  encryptSyncRecord,
  generateDataKey,
  importDataKey,
  type EncryptedSyncRecordV1,
  type SyncRecordHeaderV1,
} from './crypto'

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../gu) ?? [], (part) => Number.parseInt(part, 16))
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cryptoWithNonce(nonce: Uint8Array): Crypto {
  return {
    subtle: crypto.subtle,
    getRandomValues: ((target: Uint8Array) => {
      target.set(nonce)
      return nonce.byteLength === target.byteLength ? target : Uint8Array.from(nonce)
    }) as Crypto['getRandomValues'],
  } as Crypto
}

const header: SyncRecordHeaderV1 = {
  envelopeVersion: 1,
  accountId: '42000000-0000-4000-8000-000000000001',
  entityType: 'notes',
  entityId: 'singleton',
  revision: 7,
  tombstone: false,
}

const entity: SyncEntityV1 = {
  schemaVersion: 1,
  entityType: 'notes',
  entityId: 'singleton',
  value: { text: 'private note', updatedAt: 1_788_294_660_000 },
}

describe('sync record cryptography', () => {
  // NIST CAVP AES-256-GCM: zero key, 96-bit zero IV, empty plaintext and AAD.
  it('imports the NIST AES-256-GCM empty-plaintext vector as a non-extractable data key', async () => {
    const key = await importDataKey(bytes('00'.repeat(32)))
    const result = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(bytes('00'.repeat(12))).buffer },
      key,
      new Uint8Array(),
    )

    expect(key.extractable).toBe(false)
    expect(key.usages).toEqual(['encrypt', 'decrypt'])
    expect(hex(result)).toBe('530f8afbc74536b9a963b4f1c4cb738b')
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('uses exact canonical AAD and round-trips without exposing plaintext', async () => {
    const key = await importDataKey(bytes('11'.repeat(32)))
    const record = await encryptSyncRecord(key, header, entity, {
      crypto: cryptoWithNonce(bytes('0102030405060708090a0b0c')),
    })

    expect(record).toEqual({
      ...header,
      nonce: 'AQIDBAUGBwgJCgsM',
      ciphertext: 'ht0JwR4fhsjQPb96NOGOKe6Nq86u0RXK_EZ-CZ4EnE7M9sAGvXvRcRmiX9PfiJWkD5FCvgrhuIw9gpuVZKr0x_knlSbAJGyP-5bobQOFs8TnvrK1Q9O0RaPIY00miYwXMH9rVOeQYCDtC4ZYbnKLSbq_GJglpbJEJC95-I_j6kcNQuVJpS4XC38',
    })
    expect(JSON.stringify(record)).not.toContain('private note')
    await expect(decryptSyncRecord(key, record)).resolves.toEqual(entity)
  })

  it('uses a fresh 96-bit production nonce for every encryption', async () => {
    const key = await generateDataKey()
    const [first, second] = await Promise.all([
      encryptSyncRecord(key, header, entity),
      encryptSyncRecord(key, header, entity),
    ])

    expect(first.nonce).not.toBe(second.nonce)
    expect(first.nonce).toHaveLength(16)
    expect(second.nonce).toHaveLength(16)
  })

  it.each([
    ['account', { accountId: '42000000-0000-4000-8000-000000000002' }],
    ['entity type', { entityType: 'focus' }],
    ['entity id', { entityId: 'secondary' }],
    ['revision', { revision: 8 }],
    ['tombstone', { tombstone: true }],
    ['schema', { envelopeVersion: 2 }],
    ['nonce length', { nonce: 'AQID' }],
    ['ciphertext', { ciphertext: 'AAAA' }],
  ])('rejects altered %s before returning plaintext', async (_label, alteration) => {
    const key = await importDataKey(bytes('22'.repeat(32)))
    const record = await encryptSyncRecord(key, header, entity, {
      crypto: cryptoWithNonce(bytes('1112131415161718191a1b1c')),
    })

    await expect(decryptSyncRecord(
      key,
      { ...record, ...alteration } as EncryptedSyncRecordV1,
    )).rejects.toThrow(
      'sync_record_authentication_failed',
    )
  })

  it('rejects a decrypted entity whose identity differs from the authenticated header', async () => {
    const key = await importDataKey(bytes('33'.repeat(32)))
    const mismatched = { ...entity, entityId: 'other' }

    await expect(encryptSyncRecord(key, header, mismatched, {
      crypto: cryptoWithNonce(bytes('2122232425262728292a2b2c')),
    })).rejects.toThrow('sync_record_identity_invalid')
  })

  it('allows only a null tombstone payload and validates key and nonce material', async () => {
    const key = await importDataKey(bytes('44'.repeat(32)))
    const tombstoneHeader = { ...header, tombstone: true }
    const record = await encryptSyncRecord(key, tombstoneHeader, null, {
      crypto: cryptoWithNonce(bytes('3132333435363738393a3b3c')),
    })

    await expect(decryptSyncRecord(key, record)).resolves.toBeNull()
    await expect(encryptSyncRecord(key, tombstoneHeader, entity)).rejects.toThrow(
      'sync_record_identity_invalid',
    )
    await expect(importDataKey(bytes('00'.repeat(31)))).rejects.toThrow('sync_data_key_invalid')
    await expect(encryptSyncRecord(key, header, entity, {
      crypto: cryptoWithNonce(bytes('00'.repeat(11))),
    }))
      .rejects.toThrow('sync_nonce_invalid')
  })

  it('copies only authenticated header fields into the encrypted envelope', async () => {
    const key = await importDataKey(bytes('66'.repeat(32)))
    const record = await encryptSyncRecord(
      key,
      { ...header, accidentalPlaintext: 'must not escape' } as SyncRecordHeaderV1,
      entity,
    )

    expect(record).not.toHaveProperty('accidentalPlaintext')
  })

  it('never sends key or plaintext material to console output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const key = await importDataKey(bytes('55'.repeat(32)))
    const record = await encryptSyncRecord(key, header, entity)
    await decryptSyncRecord(key, record)

    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    log.mockRestore()
    error.mockRestore()
  })
})
