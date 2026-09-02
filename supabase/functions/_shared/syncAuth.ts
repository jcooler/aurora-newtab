import { authenticateBearerRequest, type SupabaseAuthBoundary } from './requestAuth.ts'
import type { SyncRequestAuthentication } from './syncTypes.ts'

const INTERACTIVE_AUTHENTICATION_METHODS = new Set([
  'oauth',
  'oauth_provider/authorization_code',
  'password',
  'otp',
  'totp',
  'recovery',
  'invite',
  'sso/saml',
  'magiclink',
])

function authenticationTimeFromVerifiedJwt(request: Request): number | null {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u)
  if (!match) return null
  const encoded = match[2]
  const padding = '='.repeat((4 - encoded.length % 4) % 4)
  let binary: string
  try {
    binary = atob(encoded.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
  } catch {
    return null
  }
  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    ))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const methods = Reflect.get(payload, 'amr')
  if (!Array.isArray(methods) || methods.length > 16) return null
  let newestAuthenticationTime: number | null = null
  for (const entry of methods) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const method = Reflect.get(entry, 'method')
    const seconds = Reflect.get(entry, 'timestamp')
    if (typeof method !== 'string' || !Number.isSafeInteger(seconds) || (seconds as number) < 0) {
      return null
    }
    if (!INTERACTIVE_AUTHENTICATION_METHODS.has(method)) continue
    const milliseconds = (seconds as number) * 1_000
    if (!Number.isSafeInteger(milliseconds)) return null
    newestAuthenticationTime = Math.max(newestAuthenticationTime ?? 0, milliseconds)
  }
  return newestAuthenticationTime
}

export async function authenticateSyncBearerRequest(
  request: Request,
  auth: SupabaseAuthBoundary,
): Promise<SyncRequestAuthentication> {
  const verified = await authenticateBearerRequest(request, auth)
  if (!verified.ok) return { ok: false }
  return {
    ok: true,
    authUserId: verified.authUserId,
    authTime: authenticationTimeFromVerifiedJwt(request),
  }
}
