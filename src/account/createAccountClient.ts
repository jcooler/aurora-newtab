import type { AccountClient } from './client'
import { localAccountClient } from './localAccountClient'

export async function createAccountClient(): Promise<AccountClient> {
  if (import.meta.env.MODE === 'preview') {
    const { createPreviewAccountClient } = await import('./previewAccountClient')
    return createPreviewAccountClient()
  }
  if (import.meta.env.MODE === 'production' || import.meta.env.MODE === 'account-local') {
    const { readAccountServiceConfig } = await import('./accountServiceConfig')
    const productionDescriptor = import.meta.env.MODE === 'production'
      ? (await import('./productionAccountServiceConfig')).productionAccountServiceConfig
      : undefined
    const config = readAccountServiceConfig(import.meta.env, productionDescriptor)
    if (config) {
      const { createConfiguredSupabaseAccountClient } = await import('./supabaseAccountClient')
      return createConfiguredSupabaseAccountClient(config)
    }
  }
  return localAccountClient
}
