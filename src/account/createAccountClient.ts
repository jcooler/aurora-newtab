import type { AccountClient } from './client'
import { localAccountClient } from './localAccountClient'

export async function createAccountClient(): Promise<AccountClient> {
  if (import.meta.env.MODE === 'preview') {
    const { createPreviewAccountClient } = await import('./previewAccountClient')
    return createPreviewAccountClient()
  }
  return localAccountClient
}
