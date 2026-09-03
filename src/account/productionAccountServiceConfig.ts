import type { AccountServiceConfig } from './accountServiceConfig'

export interface ProductionAccountServiceDescriptor {
  supabaseUrl: string
  publishableKey: string
  trustedLeaseKeys: Readonly<Record<string, string>>
  encryptedSyncEnabled: boolean
  googleCalendarEnabled: boolean
  microsoftCalendarEnabled: boolean
}

interface ProductionEnvironment {
  MODE: string
}

const keyIdPattern = /^[A-Za-z0-9_-]{1,100}$/u
const base64UrlPattern = /^[A-Za-z0-9_-]{40,256}$/u
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{10,256}$/u
const PRODUCTION_SUPABASE_ORIGIN = 'https://ovlobmvxtryitupxwylg.supabase.co' as const

export const PRODUCTION_SUPABASE_HOST_PERMISSION =
  'https://ovlobmvxtryitupxwylg.supabase.co/*' as const

export const productionAccountServiceConfig: ProductionAccountServiceDescriptor = Object.freeze({
  supabaseUrl: PRODUCTION_SUPABASE_ORIGIN,
  publishableKey: 'sb_publishable_6bBAntosI02GD4QV89bddw_JAj3jrDs',
  trustedLeaseKeys: Object.freeze({
    'production-2026-09-01': 'MCowBQYDK2VwAyEA_HQX_9dTJSkjpDV-ZBiEC3bqu0bR6s81reGCbIJKlyg',
  }),
  encryptedSyncEnabled: true,
  // Hosted provider functions are active for the bounded PM-P6 OAuth-testing
  // cohort. Public OAuth publication remains a separate approval gate.
  googleCalendarEnabled: true,
  // Microsoft remains local/preview-only until the hosted Entra gate.
  microsoftCalendarEnabled: false,
})

export function readProductionAccountServiceConfig(
  environment: ProductionEnvironment = import.meta.env,
  descriptor: ProductionAccountServiceDescriptor = productionAccountServiceConfig,
): AccountServiceConfig | null {
  if (environment.MODE !== 'production') return null
  const trustedEntries = descriptor.trustedLeaseKeys && typeof descriptor.trustedLeaseKeys === 'object'
    && !Array.isArray(descriptor.trustedLeaseKeys)
    ? Object.entries(descriptor.trustedLeaseKeys)
    : []
  if (
    descriptor.supabaseUrl !== PRODUCTION_SUPABASE_ORIGIN
    || !publishableKeyPattern.test(descriptor.publishableKey)
    || descriptor.publishableKey.startsWith('sb_secret_')
    || typeof descriptor.encryptedSyncEnabled !== 'boolean'
    || typeof descriptor.googleCalendarEnabled !== 'boolean'
    || typeof descriptor.microsoftCalendarEnabled !== 'boolean'
    || trustedEntries.length < 1
    || trustedEntries.length > 4
    || trustedEntries.some(([keyId, spki]) => !keyIdPattern.test(keyId)
      || typeof spki !== 'string'
      || !base64UrlPattern.test(spki))
  ) {
    return null
  }
  return Object.freeze({
    supabaseUrl: descriptor.supabaseUrl,
    publishableKey: descriptor.publishableKey,
    trustedLeaseKeys: Object.freeze(Object.fromEntries(trustedEntries)),
    encryptedSyncEnabled: descriptor.encryptedSyncEnabled,
    googleCalendarEnabled: descriptor.googleCalendarEnabled,
    microsoftCalendarEnabled: descriptor.microsoftCalendarEnabled,
  })
}
