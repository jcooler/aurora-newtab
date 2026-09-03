import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { authenticateBearerRequest } from './requestAuth.ts'
import { createMicrosoftProviderHandlers } from './providerMicrosoftAuth.ts'
import { createProviderMicrosoftGateway } from './providerMicrosoft.ts'
import {
  createProviderCryptoFromKek,
  decodeProviderBase64Url,
  encodeProviderBase64Url,
} from './providerCrypto.ts'
import { createProviderRepository, type ProviderRpcClient } from './providerRepository.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

const productionExtensionId = 'akjalbmacojpmebkgohhcaaiacicpgkh'

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

async function sha256Base64Url(value: string): Promise<string> {
  return encodeProviderBase64Url(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value),
  )))
}

export async function createRuntimeMicrosoftProviderHandlers(environment: RuntimeEnvironment) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const encodedKek = required(environment, 'TAB_TWO_MICROSOFT_TOKEN_KEK_V1')
  const oauthClientId = required(environment, 'MICROSOFT_CALENDAR_OAUTH_CLIENT_ID')
  const oauthClientSecret = required(environment, 'MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET')
  const providerCrypto = await createProviderCryptoFromKek(encodedKek)

  const rawFingerprintKey = decodeProviderBase64Url(encodedKek)
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

  return createMicrosoftProviderHandlers({
    authenticate: (request) => authenticateBearerRequest(request, supabase.auth),
    repository: createProviderRepository(supabase as unknown as ProviderRpcClient),
    crypto: providerCrypto,
    microsoft: createProviderMicrosoftGateway({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
    }),
    now: Date.now,
    randomUUID: () => crypto.randomUUID(),
    randomBytes(length) {
      return crypto.getRandomValues(new Uint8Array(length))
    },
    hash: sha256Base64Url,
    async requestFingerprint(request) {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
      const candidate = request.headers.get('cf-connecting-ip')?.trim()
        || request.headers.get('x-real-ip')?.trim()
        || forwarded
        || 'unknown'
      const normalized = candidate.length <= 64 && /^[0-9a-f:.]+$/iu.test(candidate)
        ? candidate.toLowerCase()
        : 'unknown'
      return encodeProviderBase64Url(new Uint8Array(await crypto.subtle.sign(
        'HMAC', fingerprintKey, new TextEncoder().encode(normalized),
      )))
    },
    oauthCallbackUrl: `${supabaseUrl.replace(/\/+$/u, '')}/functions/v1/microsoft-calendar-oauth-callback`,
    allowedExtensionId: productionExtensionId,
  })
}
