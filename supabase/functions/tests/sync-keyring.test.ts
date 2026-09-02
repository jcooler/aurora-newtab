import { describe, expect, it, vi } from 'vitest'
import {
  createSyncKeyring,
  decodeBase64Url,
  encodeBase64Url,
} from '../_shared/syncKeyring'

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../gu) ?? [], (part) => Number.parseInt(part, 16))
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const kek = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
const dek = bytes('00112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f')

describe('SyncKeyring', () => {
  // RFC 3394 section 4.6: 256-bit KEK wrapping 256 bits of key data.
  it('matches the RFC 3394 256-bit KEK and 256-bit key-data vector', async () => {
    const keyring = await createSyncKeyring({ TAB_TWO_SYNC_KEK_V1: encodeBase64Url(kek) })

    const wrapped = await keyring.wrapDataKey(dek)

    expect(keyring.keyVersion).toBe(1)
    expect(hex(decodeBase64Url(wrapped))).toBe(
      '28c9f404c4b810f4cbccB35cfb87f8263f5786e2d80ed326cbc7f0e71a99f43bfb988b9b7a02dd21'.toLowerCase(),
    )
    await expect(keyring.unwrapDataKey(wrapped)).resolves.toEqual(dek)
  })

  it.each([
    [{}, 'sync_kek_unavailable'],
    [{ TAB_TWO_SYNC_KEK_V1: '***' }, 'sync_kek_invalid'],
    [{ TAB_TWO_SYNC_KEK_V1: encodeBase64Url(bytes('00'.repeat(31))) }, 'sync_kek_invalid'],
  ])('fails closed for missing or malformed version-one KEK material', async (environment, code) => {
    await expect(createSyncKeyring(environment)).rejects.toThrow(code)
  })

  it('wraps and unwraps only 32-byte data keys using strict canonical base64url', async () => {
    const keyring = await createSyncKeyring({ TAB_TWO_SYNC_KEK_V1: encodeBase64Url(kek) })

    await expect(keyring.wrapDataKey(bytes('00'.repeat(31)))).rejects.toThrow('sync_data_key_invalid')
    await expect(keyring.unwrapDataKey('AQID')).rejects.toThrow('sync_wrapped_key_invalid')
    await expect(keyring.unwrapDataKey(`${encodeBase64Url(bytes('00'.repeat(40)))}=`))
      .rejects.toThrow('sync_wrapped_key_invalid')
  })

  it('does not expose, persist, or log KEK or raw DEK material', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const keyring = await createSyncKeyring({ TAB_TWO_SYNC_KEK_V1: encodeBase64Url(kek) })
    const wrapped = await keyring.wrapDataKey(dek)
    await keyring.unwrapDataKey(wrapped)

    expect(Object.keys(keyring).sort()).toEqual(['keyVersion', 'unwrapDataKey', 'wrapDataKey'])
    expect(JSON.stringify(keyring)).not.toContain(encodeBase64Url(kek))
    expect(JSON.stringify(keyring)).not.toContain(encodeBase64Url(dek))
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    log.mockRestore()
    error.mockRestore()
  })
})
