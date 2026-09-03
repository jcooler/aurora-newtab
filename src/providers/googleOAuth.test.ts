import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleCalendarOAuthAttempt,
  launchGoogleCalendarOAuth,
  validateGoogleCalendarOAuthReturn,
} from './googleOAuth'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const baseRedirect = `https://${extensionId}.chromiumapp.org/google-calendar`
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('Google Calendar browser OAuth boundary', () => {
  it('creates one 256-bit nonce bound to the exact chromiumapp return', () => {
    const identity = { getRedirectURL: vi.fn(() => baseRedirect), launchWebAuthFlow: vi.fn() }
    expect(createGoogleCalendarOAuthAttempt(
      identity,
      () => new Uint8Array(32),
    )).toEqual({
      clientNonce: nonce,
      baseRedirect,
      finalRedirect: `${baseRedirect}?nonce=${nonce}`,
    })
    expect(identity.getRedirectURL).toHaveBeenCalledWith('google-calendar')
  })

  it('fails closed before OAuth when Chrome returns a substituted redirect or entropy length', () => {
    expect(createGoogleCalendarOAuthAttempt({
      getRedirectURL: () => 'https://evil.example/google-calendar',
      launchWebAuthFlow: vi.fn(),
    }, () => new Uint8Array(32))).toBeNull()
    expect(createGoogleCalendarOAuthAttempt({
      getRedirectURL: () => baseRedirect,
      launchWebAuthFlow: vi.fn(),
    }, () => new Uint8Array(16))).toBeNull()
  })

  it.each([
    [`https://${extensionId}.chromiumapp.org/other?nonce=${nonce}&result=success`],
    [`https://evil.example/google-calendar?nonce=${nonce}&result=success`],
    [`${baseRedirect}?nonce=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB&result=success`],
    [`${baseRedirect}?nonce=${nonce}&result=success&code=secret`],
    [`${baseRedirect}?nonce=${nonce}&result=success#token`],
    [`${baseRedirect}?result=success`],
  ])('rejects substituted, extra, or incomplete final redirects', (returnedUrl) => {
    expect(validateGoogleCalendarOAuthReturn(returnedUrl, {
      clientNonce: nonce,
      baseRedirect,
      finalRedirect: `${baseRedirect}?nonce=${nonce}`,
    })).toEqual({ ok: false, code: 'invalid_return' })
  })

  it('distinguishes success, provider denial, broker failure, and popup closure', async () => {
    const attempt = { clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}` }
    const identity = {
      getRedirectURL: vi.fn(() => baseRedirect),
      launchWebAuthFlow: vi.fn()
        .mockResolvedValueOnce(`${attempt.finalRedirect}&result=success`)
        .mockResolvedValueOnce(`${attempt.finalRedirect}&result=access_denied`)
        .mockResolvedValueOnce(`${attempt.finalRedirect}&result=provider_unavailable`)
        .mockRejectedValueOnce(new Error('The user closed the window')),
    }

    await expect(launchGoogleCalendarOAuth(identity, 'https://accounts.google.com/o/oauth2/v2/auth?x=1', attempt))
      .resolves.toEqual({ ok: true })
    await expect(launchGoogleCalendarOAuth(identity, 'https://accounts.google.com/o/oauth2/v2/auth?x=1', attempt))
      .resolves.toEqual({ ok: false, code: 'provider_denied' })
    await expect(launchGoogleCalendarOAuth(identity, 'https://accounts.google.com/o/oauth2/v2/auth?x=1', attempt))
      .resolves.toEqual({ ok: false, code: 'provider_unavailable' })
    await expect(launchGoogleCalendarOAuth(identity, 'https://accounts.google.com/o/oauth2/v2/auth?x=1', attempt))
      .resolves.toEqual({ ok: false, code: 'popup_closed' })
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      interactive: true,
    })
  })

  it('never opens a non-Google authorization endpoint', async () => {
    const identity = { getRedirectURL: vi.fn(() => baseRedirect), launchWebAuthFlow: vi.fn() }
    await expect(launchGoogleCalendarOAuth(identity, 'https://evil.example/oauth', {
      clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}`,
    })).resolves.toEqual({ ok: false, code: 'invalid_authorization_url' })
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled()
  })

  it('maps only the broker result allowlist into stable public outcomes', () => {
    const attempt = { clientNonce: nonce, baseRedirect, finalRedirect: `${baseRedirect}?nonce=${nonce}` }
    expect(validateGoogleCalendarOAuthReturn(`${attempt.finalRedirect}&result=entitlement_required`, attempt))
      .toEqual({ ok: false, code: 'entitlement_required' })
    expect(validateGoogleCalendarOAuthReturn(`${attempt.finalRedirect}&result=transaction_expired`, attempt))
      .toEqual({ ok: false, code: 'provider_unavailable' })
    expect(validateGoogleCalendarOAuthReturn(`${attempt.finalRedirect}&result=identity_invalid`, attempt))
      .toEqual({ ok: false, code: 'provider_unavailable' })
  })
})
