import type { ProductionAccountServiceDescriptor } from './accountServiceConfig'

export const PRODUCTION_SUPABASE_HOST_PERMISSION =
  'https://ovlobmvxtryitupxwylg.supabase.co/*' as const

export const productionAccountServiceConfig: ProductionAccountServiceDescriptor = Object.freeze({
  supabaseUrl: 'https://ovlobmvxtryitupxwylg.supabase.co',
  publishableKey: 'sb_publishable_6bBAntosI02GD4QV89bddw_JAj3jrDs',
  trustedLeaseKeys: Object.freeze({
    'production-2026-09-01': 'MCowBQYDK2VwAyEA_HQX_9dTJSkjpDV-ZBiEC3bqu0bR6s81reGCbIJKlyg',
  }),
})
