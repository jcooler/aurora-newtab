import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { authenticateSyncBearerRequest } from './syncAuth.ts'
import { createSyncHandlers } from './syncHandlers.ts'
import { createSyncKeyring, decodeBase64Url, encodeBase64Url } from './syncKeyring.ts'
import { createSyncRepository, type SyncRpcClient } from './syncRepository.ts'
import { createStripeGateway } from './stripeGateway.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

export async function createRuntimeSyncHandlers(
  environment: RuntimeEnvironment,
  options: { accountDeletion?: boolean } = {},
) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const encodedKek = required(environment, 'TAB_TWO_SYNC_KEK_V1')
  const keyring = await createSyncKeyring({
    TAB_TWO_SYNC_KEK_V1: encodedKek,
  })
  const rawFingerprintKey = decodeBase64Url(encodedKek)
  let fingerprintKey: CryptoKey
  try {
    fingerprintKey = await crypto.subtle.importKey(
      'raw', rawFingerprintKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
  } finally {
    rawFingerprintKey.fill(0)
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
  const stripe = options.accountDeletion
    ? createStripeGateway(required(environment, 'STRIPE_SECRET_KEY'))
    : null

  return createSyncHandlers({
    authenticate: (request) => authenticateSyncBearerRequest(request, supabase.auth),
    repository: createSyncRepository(supabase as unknown as SyncRpcClient),
    keyring,
    now: Date.now,
    randomBytes(length) {
      return crypto.getRandomValues(new Uint8Array(length))
    },
    async requestFingerprint(request) {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
      const candidate = request.headers.get('cf-connecting-ip')?.trim()
        || request.headers.get('x-real-ip')?.trim()
        || forwarded
        || 'unknown'
      const normalized = candidate.length <= 64 && /^[0-9a-f:.]+$/iu.test(candidate)
        ? candidate.toLowerCase()
        : 'unknown'
      const digest = await crypto.subtle.sign(
        'HMAC', fingerprintKey, new TextEncoder().encode(normalized),
      )
      return encodeBase64Url(new Uint8Array(digest))
    },
    cancelSandboxSubscription(subscriptionId) {
      if (!stripe) throw new Error('account_deletion_unavailable')
      return stripe.cancelSandboxSubscription(subscriptionId)
    },
    async deleteAuthUser(authUserId) {
      if (!options.accountDeletion) throw new Error('account_deletion_unavailable')
      const { error } = await supabase.auth.admin.deleteUser(authUserId)
      if (error) throw new Error('auth_user_delete_failed')
    },
  })
}
