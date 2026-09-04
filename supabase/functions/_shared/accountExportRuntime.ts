import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createAccountExportHandler } from './accountExportHandlers.ts'
import {
  createAccountExportRepository,
  type AccountExportRpcClient,
} from './accountExportRepository.ts'
import { authenticateSyncBearerRequest } from './syncAuth.ts'
import { createSyncKeyring, decodeBase64Url, encodeBase64Url } from './syncKeyring.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

export async function createRuntimeAccountExportHandler(environment: RuntimeEnvironment) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const encodedKek = required(environment, 'TAB_TWO_SYNC_KEK_V1')
  const keyring = await createSyncKeyring({ TAB_TWO_SYNC_KEK_V1: encodedKek })
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

  return createAccountExportHandler({
    authenticate: (request) => authenticateSyncBearerRequest(request, supabase.auth),
    repository: createAccountExportRepository(supabase as unknown as AccountExportRpcClient),
    keyring,
    now: Date.now,
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
  })
}
