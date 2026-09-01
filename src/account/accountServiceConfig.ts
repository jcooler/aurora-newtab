export interface AccountServiceConfig {
  supabaseUrl: string
  publishableKey: string
  trustedLeaseKeys: Readonly<Record<string, string>>
}

export interface ProductionAccountServiceDescriptor {
  supabaseUrl: string
  publishableKey: string
  trustedLeaseKeys: Readonly<Record<string, string>>
}

interface AccountServiceEnvironment {
  MODE?: string
  VITE_TAB_TWO_SUPABASE_URL?: string
  VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_TAB_TWO_TRUSTED_LEASE_KEYS?: string
}

const keyIdPattern = /^[A-Za-z0-9_-]{1,100}$/u
const base64UrlPattern = /^[A-Za-z0-9_-]{40,256}$/u
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{10,256}$/u
const productionSupabaseUrlPattern = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/u

function validateTrustedLeaseKeys(candidate: unknown): Readonly<Record<string, string>> | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const entries = Object.entries(candidate)
  if (
    entries.length < 1
    || entries.length > 4
    || entries.some(([keyId, spki]) => !keyIdPattern.test(keyId)
      || typeof spki !== 'string'
      || !base64UrlPattern.test(spki))
  ) {
    return null
  }
  return Object.freeze(Object.fromEntries(entries))
}

export function readAccountServiceConfig(
  environment: AccountServiceEnvironment = import.meta.env,
  productionDescriptor?: ProductionAccountServiceDescriptor,
): AccountServiceConfig | null {
  if (environment.MODE === 'production') {
    if (!productionDescriptor) return null
    const { supabaseUrl, publishableKey } = productionDescriptor
    const trustedLeaseKeys = validateTrustedLeaseKeys(productionDescriptor.trustedLeaseKeys)
    if (
      !productionSupabaseUrlPattern.test(supabaseUrl)
      || !publishableKeyPattern.test(publishableKey)
      || publishableKey.startsWith('sb_secret_')
      || !trustedLeaseKeys
    ) {
      return null
    }
    return Object.freeze({ supabaseUrl, publishableKey, trustedLeaseKeys })
  }

  if (environment.MODE !== 'account-local') return null
  if (environment.VITE_TAB_TWO_SUPABASE_URL !== 'http://127.0.0.1:54321') return null
  const publishableKey = environment.VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY
  if (
    !publishableKey
    || !publishableKeyPattern.test(publishableKey)
    || publishableKey.startsWith('sb_secret_')
  ) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(environment.VITE_TAB_TWO_TRUSTED_LEASE_KEYS ?? '')
  } catch {
    return null
  }
  const trustedLeaseKeys = validateTrustedLeaseKeys(parsed)
  if (!trustedLeaseKeys) return null
  return Object.freeze({
    supabaseUrl: 'http://127.0.0.1:54321' as const,
    publishableKey,
    trustedLeaseKeys,
  })
}
