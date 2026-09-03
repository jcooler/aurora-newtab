import { MICROSOFT_CALENDAR_SCOPES, replaceProviderConnections } from './connections'
import {
  createProviderGatewayCore,
  type ProviderGateway,
  type ProviderGatewayCoreDependencies,
} from './gatewayCore'
import {
  createMicrosoftCalendarOAuthAttempt,
  launchMicrosoftCalendarOAuth,
} from './microsoftOAuth'

export interface MicrosoftCalendarGatewayDependencies extends Omit<
  ProviderGatewayCoreDependencies,
  'originPermission'
> {
  requestMicrosoftOrigin(): Promise<boolean>
  removeMicrosoftOrigin(): Promise<boolean>
}

export function createMicrosoftCalendarGateway(
  deps: MicrosoftCalendarGatewayDependencies,
): ProviderGateway {
  return createProviderGatewayCore({
    provider: 'microsoft_calendar',
    capability: 'microsoft_calendar',
    functionPrefix: 'microsoft-calendar',
    scopes: MICROSOFT_CALENDAR_SCOPES,
    createAttempt: () => createMicrosoftCalendarOAuthAttempt(deps.identity, deps.randomBytes),
    launch: (authorizationUrl, attempt) => (
      launchMicrosoftCalendarOAuth(deps.identity, authorizationUrl, attempt)
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
      request: () => deps.requestMicrosoftOrigin(),
      remove: () => deps.removeMicrosoftOrigin(),
    },
  })
}

export function createPreviewMicrosoftCalendarGateway(
  fixture: 'two-account',
  now: number,
): ProviderGateway {
  const accountId = '43000000-0000-4000-8000-000000000001'
  const connections = fixture === 'two-account' ? [
    {
      connectionId: '64000000-0000-4000-8000-000000000001',
      provider: 'microsoft_calendar' as const,
      accountKind: 'personal' as const,
      displayEmail: 'alex@outlook.test',
      displayName: 'Alex Morgan',
      status: 'active' as const,
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      createdAt: now - 120_000,
      updatedAt: now - 60_000,
    },
    {
      connectionId: '64000000-0000-4000-8000-000000000002',
      provider: 'microsoft_calendar' as const,
      accountKind: 'work_or_school' as const,
      displayEmail: 'alex@contoso.test',
      displayName: 'Alex Morgan',
      status: 'active' as const,
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      createdAt: now - 60_000,
      updatedAt: now,
    },
  ] : []
  const state = replaceProviderConnections(null, accountId, connections)
  const requestedState = () => new URLSearchParams(globalThis.location?.search ?? '')
    .get('microsoftState')
  return {
    listConnections: async () => state.ok ? state : { ok: false, code: 'unavailable' },
    async connect() {
      if (requestedState() === 'organization-approval') {
        return { ok: false, code: 'organization_approval_required' }
      }
      if (requestedState() === 'connecting') {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      return state.ok ? state : { ok: false, code: 'unavailable' }
    },
    async getSession(connectionId) {
      if (!connections.some((connection) => connection.connectionId === connectionId)) {
        return { ok: false, code: 'connection_not_found' }
      }
      return {
        ok: true,
        value: {
          connectionId,
          provider: 'microsoft_calendar',
          accessToken: 'preview-microsoft-calendar-authority',
          expiresAt: now + 3_600_000,
        },
      }
    },
    disconnect: async () => ({
      ok: true,
      value: { revocationConfirmed: false, remainingConnections: Math.max(0, connections.length - 1) },
    }),
    clearMemory: () => undefined,
  }
}
