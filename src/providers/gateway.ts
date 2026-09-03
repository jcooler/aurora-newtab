import {
  GOOGLE_CALENDAR_SCOPES,
  replaceProviderConnections,
} from './connections'
import {
  createProviderGatewayCore,
  type ProviderGateway,
  type ProviderGatewayCoreDependencies,
  type ProviderGatewayResult,
} from './gatewayCore'
import {
  createGoogleCalendarOAuthAttempt,
  launchGoogleCalendarOAuth,
  type GoogleCalendarIdentityBoundary,
} from './googleOAuth'
import type { ProviderSession } from './types'

export type {
  ProviderGateway,
  ProviderGatewayAccount,
  ProviderGatewayErrorCode,
  ProviderGatewayResult,
} from './gatewayCore'

export interface ProviderGatewayDependencies extends Omit<
  ProviderGatewayCoreDependencies,
  'identity' | 'originPermission'
> {
  identity: GoogleCalendarIdentityBoundary
  requestGoogleOrigin(): Promise<boolean>
  removeGoogleOrigin(): Promise<boolean>
}

export function createProviderGateway(deps: ProviderGatewayDependencies): ProviderGateway {
  return createProviderGatewayCore({
    provider: 'google_calendar',
    capability: 'google_calendar',
    functionPrefix: 'google-calendar',
    scopes: GOOGLE_CALENDAR_SCOPES,
    createAttempt: () => createGoogleCalendarOAuthAttempt(deps.identity, deps.randomBytes),
    launch: (authorizationUrl, attempt) => (
      launchGoogleCalendarOAuth(deps.identity, authorizationUrl, attempt)
    ),
  }, {
    enabled: deps.enabled,
    origin: deps.origin,
    allowedOrigins: deps.allowedOrigins,
    fetch: (...args) => deps.fetch(...args),
    now: () => deps.now(),
    randomBytes: (size) => deps.randomBytes(size),
    getAccount: () => deps.getAccount(),
    getAccessToken: () => deps.getAccessToken(),
    invalidateAuthentication: () => deps.invalidateAuthentication(),
    identity: deps.identity,
    originPermission: {
      request: () => deps.requestGoogleOrigin(),
      remove: () => deps.removeGoogleOrigin(),
    },
  })
}

export function createPreviewProviderGateway(
  fixture: 'two-account',
  now: number,
): ProviderGateway {
  const accountId = '43000000-0000-4000-8000-000000000001'
  const connections = fixture === 'two-account' ? [
    {
      connectionId: '63000000-0000-4000-8000-000000000001',
      provider: 'google_calendar' as const,
      accountKind: null,
      displayEmail: 'alex@example.test',
      displayName: 'Alex',
      status: 'active' as const,
      grantedScopes: GOOGLE_CALENDAR_SCOPES,
      createdAt: now - 120_000,
      updatedAt: now - 60_000,
    },
    {
      connectionId: '63000000-0000-4000-8000-000000000002',
      provider: 'google_calendar' as const,
      accountKind: null,
      displayEmail: 'work@example.test',
      displayName: 'Work',
      status: 'active' as const,
      grantedScopes: GOOGLE_CALENDAR_SCOPES,
      createdAt: now - 60_000,
      updatedAt: now,
    },
  ] : []
  const state = replaceProviderConnections(null, accountId, connections)
  const session = (connectionId: string): ProviderGatewayResult<ProviderSession> => {
    if (!connections.some((connection) => connection.connectionId === connectionId)) {
      return { ok: false, code: 'connection_not_found' }
    }
    return {
      ok: true,
      value: {
        connectionId,
        provider: 'google_calendar',
        accessToken: 'preview-google-calendar-access-token',
        expiresAt: now + 3_600_000,
      },
    }
  }
  return {
    listConnections: async () => state.ok ? state : { ok: false, code: 'unavailable' },
    connect: async () => state.ok ? state : { ok: false, code: 'unavailable' },
    getSession: async (connectionId) => session(connectionId),
    disconnect: async () => ({
      ok: true,
      value: { revocationConfirmed: true, remainingConnections: connections.length },
    }),
    clearMemory: () => undefined,
  }
}
