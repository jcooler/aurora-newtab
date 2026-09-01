import { describe, expect, it } from 'vitest'

import { readAccountServiceConfig } from './accountServiceConfig'

const publicKey = 'MCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const productionDescriptor = Object.freeze({
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_production-test-value',
  trustedLeaseKeys: Object.freeze({ 'production-2026-09-01': publicKey }),
})

describe('readAccountServiceConfig', () => {
  it('accepts a complete exact production descriptor', () => {
    expect(readAccountServiceConfig({ MODE: 'production' }, productionDescriptor)).toEqual(
      productionDescriptor,
    )
  })

  it.each([
    ['http origin', { ...productionDescriptor, supabaseUrl: 'http://abcdefghijklmnopqrst.supabase.co' }],
    ['localhost', { ...productionDescriptor, supabaseUrl: 'http://127.0.0.1:54321' }],
    ['foreign host', { ...productionDescriptor, supabaseUrl: 'https://example.com' }],
    ['path', { ...productionDescriptor, supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth' }],
    ['secret key', { ...productionDescriptor, publishableKey: 'sb_secret_forbidden-value' }],
    ['missing trusted key', { ...productionDescriptor, trustedLeaseKeys: {} }],
  ])('rejects production %s', (_name, descriptor) => {
    expect(readAccountServiceConfig({ MODE: 'production' }, descriptor)).toBeNull()
  })

  it('preserves the exact account-local boundary', () => {
    expect(readAccountServiceConfig({
      MODE: 'account-local',
      VITE_TAB_TWO_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test-value',
      VITE_TAB_TWO_TRUSTED_LEASE_KEYS: JSON.stringify({ 'local-test-key': publicKey }),
    }, productionDescriptor)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_local-test-value',
      trustedLeaseKeys: { 'local-test-key': publicKey },
    })
  })

  it('keeps preview disabled even when a production descriptor exists', () => {
    expect(readAccountServiceConfig({ MODE: 'preview' }, productionDescriptor)).toBeNull()
  })
})
