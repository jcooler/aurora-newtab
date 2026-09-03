import { MICROSOFT_CALENDAR_SCOPES } from './connections'
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
