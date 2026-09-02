import { authenticateBearerRequest, type SupabaseAuthBoundary } from './requestAuth.ts'
import type { SyncRequestAuthentication } from './syncTypes.ts'

function authTimeFromVerifiedJwt(request: Request): number | null {
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
  const seconds = Reflect.get(payload, 'auth_time')
  if (!Number.isSafeInteger(seconds) || (seconds as number) < 0) return null
  const milliseconds = (seconds as number) * 1_000
  return Number.isSafeInteger(milliseconds) ? milliseconds : null
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
    authTime: authTimeFromVerifiedJwt(request),
  }
}
