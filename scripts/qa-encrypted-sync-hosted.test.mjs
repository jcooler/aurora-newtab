import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDeviceId,
  encodeBase64Url,
  findEncryptedRecordShape,
  redactIdentifier,
} from './qa-encrypted-sync-hosted.mjs'

test('creates canonical 128-bit device ids', () => {
  const cryptoImplementation = {
    getRandomValues(value) {
      value.set(Array.from({ length: 16 }, (_, index) => index))
      return value
    },
  }
  assert.equal(createDeviceId(cryptoImplementation), 'AAECAwQFBgcICQoLDA0ODw')
})

test('encodes canonical unpadded base64url', () => {
  assert.equal(encodeBase64Url(Uint8Array.of(251, 255, 239)), '-__v')
})

test('finds a canonical encrypted fixture that occupies an exact stored size', () => {
  const shape = findEncryptedRecordShape(250_000, {
    entityType: 'notes',
    deviceId: 'AAECAwQFBgcICQoLDA0ODw',
    entityIdPrefix: 'quota:',
  })
  assert.equal(shape.storedSize, 250_000)
  assert.ok(shape.entityId.startsWith('quota:'))
  assert.ok(shape.entityId.length <= 256)
  assert.ok(shape.ciphertextLength <= 261_700)
  assert.ok(shape.ciphertextBytes >= 16)
  assert.ok(shape.payloadLength >= 0)
})

test('retains only a short irreversible identifier fingerprint', async () => {
  const redacted = await redactIdentifier('sensitive-complete-identifier')
  assert.match(redacted, /^sha256:[a-f0-9]{12}$/u)
  assert.doesNotMatch(redacted, /sensitive/u)
})
