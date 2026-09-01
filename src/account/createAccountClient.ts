import type { AccountClient } from './client'
import { localAccountClient } from './localAccountClient'

export async function createAccountClient(): Promise<AccountClient> {
  if (import.meta.env.MODE === 'preview') {
    const { createPreviewAccountClient } = await import('./previewAccountClient')
    return createPreviewAccountClient()
  }
  if (import.meta.env.MODE === 'production') {
    const {
      productionAccountServiceConfig,
      readProductionAccountServiceConfig,
    } = await import('./productionAccountServiceConfig')
    const config = readProductionAccountServiceConfig(import.meta.env, productionAccountServiceConfig)
    if (config) {
      const { createConfiguredSupabaseAccountClient } = await import('./supabaseAccountClient')
      return createConfiguredSupabaseAccountClient(config)
    }
  }
  if (import.meta.env.MODE === 'account-local') {
    const { readAccountServiceConfig } = await import('./accountServiceConfig')
    const config = readAccountServiceConfig()
    if (config) {
      const { createConfiguredSupabaseAccountClient } = await import('./supabaseAccountClient')
      return createConfiguredSupabaseAccountClient(config)
    }
  }
  return localAccountClient
}
