export interface AccountServiceConfig {
  supabaseUrl: 'http://127.0.0.1:54321'
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

export function readAccountServiceConfig(
  environment: AccountServiceEnvironment = import.meta.env,
): AccountServiceConfig | null {
  if (environment.MODE !== 'account-local') return null
  if (environment.VITE_TAB_TWO_SUPABASE_URL !== 'http://127.0.0.1:54321') return null
  const publishableKey = environment.VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY
  if (
    !publishableKey
    || !/^sb_publishable_[A-Za-z0-9_-]{10,256}$/u.test(publishableKey)
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const entries = Object.entries(parsed)
  if (
    entries.length < 1
    || entries.length > 4
    || entries.some(([keyId, spki]) => !keyIdPattern.test(keyId)
      || typeof spki !== 'string'
      || !base64UrlPattern.test(spki))
  ) {
    return null
  }
  return Object.freeze({
    supabaseUrl: 'http://127.0.0.1:54321' as const,
    publishableKey,
    trustedLeaseKeys: Object.freeze(Object.fromEntries(entries)),
  })
}
