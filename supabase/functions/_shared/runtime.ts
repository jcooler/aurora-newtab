import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createAccountHandlers } from './accountHandlers.ts'
import type { EffectiveEntitlement, ProviderNeutralAccount } from './accountHandlers.ts'
import { signLeaseV1 } from './lease.ts'
import type { PremiumCapability, SignedGrantSource } from './lease.ts'
import { authenticateBearerRequest } from './requestAuth.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

function decodePkcs8(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/_=-]+$/u.test(value)) throw new Error('signing_key_invalid')
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/u, '')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new Error('signing_key_invalid')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function oneRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
}

function accountRow(value: unknown): ProviderNeutralAccount | null {
  const row = oneRow(value)
  if (!row) return null
  return {
    accountId: row.account_id as string,
    email: row.email as string,
    displayName: (row.display_name ?? null) as string | null,
  }
}

function entitlementRow(value: unknown): EffectiveEntitlement {
  const row = oneRow(value)
  if (!row) return { capabilities: [], grantSources: [], earliestExpiry: null }
  const parsedExpiry = row.earliest_expiry === null || row.earliest_expiry === undefined
    ? null
    : Date.parse(String(row.earliest_expiry))
  return {
    capabilities: row.capabilities as PremiumCapability[],
    grantSources: row.grant_sources as SignedGrantSource[],
    earliestExpiry: parsedExpiry,
  }
}

export async function createRuntimeAccountHandlers(
  environment: RuntimeEnvironment,
  options: { signing: 'required' | 'unavailable' },
) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  let signingKeyId = ''
  let privateKey: CryptoKey | null = null
  if (options.signing === 'required') {
    signingKeyId = required(environment, 'TAB_TWO_LEASE_SIGNING_KEY_ID')
    const signingKeyBytes = decodePkcs8(required(environment, 'TAB_TWO_LEASE_SIGNING_KEY_PKCS8_B64'))
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      signingKeyBytes,
      'Ed25519',
      false,
      ['sign'],
    )
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  return createAccountHandlers({
    authenticate: (request) => authenticateBearerRequest(request, supabase.auth),
    repository: {
      async findAccountForAuthUser(authUserId) {
        const { data, error } = await supabase.rpc('tab_two_account_snapshot_for_auth', {
          target_auth_user_id: authUserId,
        })
        if (error) throw new Error('account_repository_unavailable')
        return accountRow(data)
      },
      async getEffectiveEntitlement(accountId, effectiveAt) {
        const { data, error } = await supabase.rpc('tab_two_effective_entitlement_for_account', {
          target_account_id: accountId,
          effective_at: new Date(effectiveAt).toISOString(),
        })
        if (error) throw new Error('entitlement_repository_unavailable')
        return entitlementRow(data)
      },
    },
    now: Date.now,
    randomUUID: crypto.randomUUID,
    signLease: (payload) => {
      if (!privateKey) throw new Error('signing_unavailable')
      return signLeaseV1(payload, { keyId: signingKeyId, privateKey })
    },
  })
}
