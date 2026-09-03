import { describe, expect, it, vi } from 'vitest'
import {
  createMicrosoftCalendarOAuthAttempt,
  launchMicrosoftCalendarOAuth,
  validateMicrosoftCalendarOAuthReturn,
} from './microsoftOAuth'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const baseRedirect = `https://${extensionId}.chromiumapp.org/microsoft-calendar`
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('Microsoft Calendar browser OAuth boundary', () => {
  it('creates one 256-bit nonce bound to the exact Microsoft return path', () => {
    const identity = { getRedirectURL: vi.fn(() => baseRedirect), launchWebAuthFlow: vi.fn() }

    expect(createMicrosoftCalendarOAuthAttempt(identity, () => new Uint8Array(32))).toEqual({
      clientNonce: nonce,
      baseRedirect,
      finalRedirect: `${baseRedirect}?nonce=${nonce}`,
    })
    expect(identity.getRedirectURL).toHaveBeenCalledWith('microsoft-calendar')
  })

  it('fails closed for substituted redirects, invalid entropy, duplicate keys, and fragments', () => {
    expect(createMicrosoftCalendarOAuthAttempt({
      getRedirectURL: () => 'https://evil.example/microsoft-calendar',
      launchWebAuthFlow: vi.fn(),
    }, () => new Uint8Array(32))).toBeNull()
    expect(createMicrosoftCalendarOAuthAttempt({
      getRedirectURL: () => baseRedirect,
      launchWebAuthFlow: vi.fn(),
    }, () => new Uint8Array(16))).toBeNull()

    const attempt = { clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}` }
    for (const returned of [
      `https://${extensionId}.chromiumapp.org/google-calendar?nonce=${nonce}&result=success`,
      `${baseRedirect}?nonce=${nonce}&nonce=${nonce}&result=success`,
      `${baseRedirect}?nonce=${nonce}&result=success&code=secret`,
      `${baseRedirect}?nonce=${nonce}&result=success#token`,
      `${baseRedirect}?result=success`,
    ]) {
      expect(validateMicrosoftCalendarOAuthReturn(returned, attempt)).toEqual({
        ok: false,
        code: 'invalid_return',
      })
    }
  })

  it('opens only the common Microsoft v2 authorization endpoint', async () => {
    const attempt = { clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}` }
    const identity = {
      getRedirectURL: vi.fn(() => baseRedirect),
      launchWebAuthFlow: vi.fn(async () => `${attempt.finalRedirect}&result=success`),
    }

    await expect(launchMicrosoftCalendarOAuth(
      identity,
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test',
      attempt,
    )).resolves.toEqual({ ok: true })
    await expect(launchMicrosoftCalendarOAuth(
      identity,
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test',
      attempt,
    )).resolves.toEqual({ ok: false, code: 'invalid_authorization_url' })
    await expect(launchMicrosoftCalendarOAuth(
      identity,
      'https://evil.example/common/oauth2/v2.0/authorize',
      attempt,
    )).resolves.toEqual({ ok: false, code: 'invalid_authorization_url' })
    expect(identity.launchWebAuthFlow).toHaveBeenCalledTimes(1)
  })

  it('maps only approved broker results, including organization approval', async () => {
    const attempt = { clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}` }
    expect(validateMicrosoftCalendarOAuthReturn(`${attempt.finalRedirect}&result=access_denied`, attempt))
      .toEqual({ ok: false, code: 'provider_denied' })
    expect(validateMicrosoftCalendarOAuthReturn(
      `${attempt.finalRedirect}&result=organization_approval_required`, attempt,
    )).toEqual({ ok: false, code: 'organization_approval_required' })
    expect(validateMicrosoftCalendarOAuthReturn(`${attempt.finalRedirect}&result=scope_mismatch`, attempt))
      .toEqual({ ok: false, code: 'reconnect_required' })
    expect(validateMicrosoftCalendarOAuthReturn(`${attempt.finalRedirect}&result=entitlement_required`, attempt))
      .toEqual({ ok: false, code: 'entitlement_required' })
    expect(validateMicrosoftCalendarOAuthReturn(`${attempt.finalRedirect}&result=identity_invalid`, attempt))
      .toEqual({ ok: false, code: 'provider_unavailable' })
    expect(validateMicrosoftCalendarOAuthReturn(`${attempt.finalRedirect}&result=unexpected`, attempt))
      .toEqual({ ok: false, code: 'invalid_return' })

    const identity = {
      getRedirectURL: vi.fn(() => baseRedirect),
      launchWebAuthFlow: vi.fn(async () => undefined),
    }
    await expect(launchMicrosoftCalendarOAuth(
      identity,
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      attempt,
    )).resolves.toEqual({ ok: false, code: 'popup_closed' })
  })
})
