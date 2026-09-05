import { describe, expect, it } from 'vitest'

import { readAccountServiceConfig } from './accountServiceConfig'
import {
  productionAccountServiceConfig,
  readProductionAccountServiceConfig,
  type ProductionAccountServiceDescriptor,
} from './productionAccountServiceConfig'

const publicKey = 'MCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const productionDescriptor = Object.freeze({
  supabaseUrl: 'https://ovlobmvxtryitupxwylg.supabase.co',
  publishableKey: 'sb_publishable_production-test-value',
  trustedLeaseKeys: Object.freeze({ 'production-2026-09-01': publicKey }),
  encryptedSyncEnabled: false,
  googleCalendarEnabled: false,
  microsoftCalendarEnabled: false,
  accountDataExportEnabled: false,
})

describe('readAccountServiceConfig', () => {
  it('accepts a complete exact production descriptor', () => {
    expect(readProductionAccountServiceConfig({ MODE: 'production' }, productionDescriptor)).toEqual(
      productionDescriptor,
    )
  })

  it('enables Google Calendar for the approved production account service', () => {
    expect(readProductionAccountServiceConfig({ MODE: 'production' }, productionAccountServiceConfig))
      .toMatchObject({ googleCalendarEnabled: true })
  })

  it('enables Microsoft Calendar after the approved hosted activation', () => {
    expect(readProductionAccountServiceConfig({ MODE: 'production' }, productionAccountServiceConfig))
      .toMatchObject({ microsoftCalendarEnabled: true })
  })

  it('enables production account export after its approved hosted proof', () => {
    expect(readProductionAccountServiceConfig({ MODE: 'production' }, productionAccountServiceConfig))
      .toMatchObject({ accountDataExportEnabled: true })
  })

  it.each([
    ['http origin', { ...productionDescriptor, supabaseUrl: 'http://ovlobmvxtryitupxwylg.supabase.co' }],
    ['localhost', { ...productionDescriptor, supabaseUrl: 'http://127.0.0.1:54321' }],
    ['foreign host', { ...productionDescriptor, supabaseUrl: 'https://example.com' }],
    ['foreign Supabase project', { ...productionDescriptor, supabaseUrl: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }],
    ['path', { ...productionDescriptor, supabaseUrl: 'https://ovlobmvxtryitupxwylg.supabase.co/auth' }],
    ['secret key', { ...productionDescriptor, publishableKey: 'sb_secret_forbidden-value' }],
    ['missing trusted key', { ...productionDescriptor, trustedLeaseKeys: {} }],
    ['missing Microsoft flag', (({ microsoftCalendarEnabled: _flag, ...descriptor }) => descriptor)(productionDescriptor)],
    ['malformed Microsoft flag', { ...productionDescriptor, microsoftCalendarEnabled: 'yes' }],
    ['missing account export flag', (({ accountDataExportEnabled: _flag, ...descriptor }) => descriptor)(productionDescriptor)],
    ['malformed account export flag', { ...productionDescriptor, accountDataExportEnabled: 'yes' }],
  ])('rejects production %s', (_name, descriptor) => {
    expect(readProductionAccountServiceConfig(
      { MODE: 'production' },
      descriptor as unknown as ProductionAccountServiceDescriptor,
    )).toBeNull()
  })

  it('preserves the exact account-local boundary', () => {
    expect(readAccountServiceConfig({
      MODE: 'account-local',
      VITE_TAB_TWO_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test-value',
      VITE_TAB_TWO_TRUSTED_LEASE_KEYS: JSON.stringify({ 'local-test-key': publicKey }),
    })).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_local-test-value',
      trustedLeaseKeys: { 'local-test-key': publicKey },
      encryptedSyncEnabled: true,
      googleCalendarEnabled: true,
      microsoftCalendarEnabled: true,
      accountDataExportEnabled: true,
    })
  })

  it('keeps preview disabled even when a production descriptor exists', () => {
    expect(readProductionAccountServiceConfig({ MODE: 'preview' }, productionDescriptor)).toBeNull()
  })
})
