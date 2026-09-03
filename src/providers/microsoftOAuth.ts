import type {
  ProviderIdentityBoundary,
  ProviderOAuthAttempt,
  ProviderOAuthResult,
} from './gatewayCore'

export type MicrosoftCalendarOAuthAttempt = ProviderOAuthAttempt

const CHROMIUM_APP_HOST = /^[a-p]{32}\.chromiumapp\.org$/u
const NONCE = /^[A-Za-z0-9_-]{43}$/u

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function validBaseRedirect(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && CHROMIUM_APP_HOST.test(url.hostname)
      && url.pathname === '/microsoft-calendar'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.search === ''
      && url.hash === ''
  } catch {
    return false
  }
}

function validMicrosoftAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'login.microsoftonline.com'
      && url.pathname === '/common/oauth2/v2.0/authorize'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hash === ''
  } catch {
    return false
  }
}

export function createMicrosoftCalendarOAuthAttempt(
  identity: ProviderIdentityBoundary,
  randomBytes: (size: number) => Uint8Array,
): MicrosoftCalendarOAuthAttempt | null {
  try {
    const baseRedirect = identity.getRedirectURL('microsoft-calendar')
    const bytes = randomBytes(32)
    if (!validBaseRedirect(baseRedirect) || bytes.byteLength !== 32) return null
    const clientNonce = base64Url(bytes)
    if (!NONCE.test(clientNonce)) return null
    return {
      clientNonce,
      baseRedirect,
      finalRedirect: `${baseRedirect}?nonce=${clientNonce}`,
    }
  } catch {
    return null
  }
}

export function validateMicrosoftCalendarOAuthReturn(
  value: string,
  attempt: MicrosoftCalendarOAuthAttempt,
): ProviderOAuthResult {
  if (!validBaseRedirect(attempt.baseRedirect) || !NONCE.test(attempt.clientNonce)) {
    return { ok: false, code: 'invalid_return' }
  }
  if (attempt.finalRedirect !== `${attempt.baseRedirect}?nonce=${attempt.clientNonce}`) {
    return { ok: false, code: 'invalid_return' }
  }
  try {
    const returned = new URL(value)
    const expected = new URL(attempt.baseRedirect)
    if (returned.origin !== expected.origin
      || returned.pathname !== expected.pathname
      || returned.username !== ''
      || returned.password !== ''
      || returned.port !== ''
      || returned.hash !== '') return { ok: false, code: 'invalid_return' }
    const keys = [...returned.searchParams.keys()].sort()
    if (keys.length !== 2 || keys[0] !== 'nonce' || keys[1] !== 'result') {
      return { ok: false, code: 'invalid_return' }
    }
    if (returned.searchParams.getAll('nonce').length !== 1
      || returned.searchParams.getAll('result').length !== 1
      || returned.searchParams.get('nonce') !== attempt.clientNonce) {
      return { ok: false, code: 'invalid_return' }
    }
    switch (returned.searchParams.get('result')) {
      case 'success': return { ok: true }
      case 'access_denied':
      case 'provider_denied': return { ok: false, code: 'provider_denied' }
      case 'organization_approval_required':
        return { ok: false, code: 'organization_approval_required' }
      case 'scope_mismatch':
      case 'refresh_token_required':
      case 'grant_invalid': return { ok: false, code: 'reconnect_required' }
      case 'entitlement_required': return { ok: false, code: 'entitlement_required' }
      case 'provider_unavailable':
      case 'transaction_expired':
      case 'identity_invalid': return { ok: false, code: 'provider_unavailable' }
      default: return { ok: false, code: 'invalid_return' }
    }
  } catch {
    return { ok: false, code: 'invalid_return' }
  }
}

export async function launchMicrosoftCalendarOAuth(
  identity: ProviderIdentityBoundary,
  authorizationUrl: string,
  attempt: MicrosoftCalendarOAuthAttempt,
): Promise<ProviderOAuthResult> {
  if (!validMicrosoftAuthorizationUrl(authorizationUrl)) {
    return { ok: false, code: 'invalid_authorization_url' }
  }
  try {
    const returned = await identity.launchWebAuthFlow({ url: authorizationUrl, interactive: true })
    if (!returned) return { ok: false, code: 'popup_closed' }
    return validateMicrosoftCalendarOAuthReturn(returned, attempt)
  } catch {
    return { ok: false, code: 'popup_closed' }
  }
}
