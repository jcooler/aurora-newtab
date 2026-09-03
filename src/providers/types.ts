export const PROVIDER_IDS = ['google_calendar', 'microsoft_calendar'] as const
export type ProviderId = typeof PROVIDER_IDS[number]

export const PROVIDER_CONNECTION_STATUSES = [
  'active',
  'reconnect_required',
  'revoked',
] as const
export type ProviderConnectionStatus = typeof PROVIDER_CONNECTION_STATUSES[number]

export type GoogleCalendarScope =
  | 'openid'
  | 'email'
  | 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
  | 'https://www.googleapis.com/auth/calendar.events.readonly'

export type MicrosoftCalendarScope =
  | 'openid'
  | 'offline_access'
  | 'https://graph.microsoft.com/User.Read'
  | 'https://graph.microsoft.com/Calendars.ReadBasic'

export type ProviderScope = GoogleCalendarScope | MicrosoftCalendarScope

export type ProviderAccountKind = 'personal' | 'work_or_school'

export interface ProviderConnection {
  connectionId: string
  provider: ProviderId
  accountKind: ProviderAccountKind | null
  displayEmail: string
  displayName: string | null
  status: ProviderConnectionStatus
  grantedScopes: readonly ProviderScope[]
  createdAt: number
  updatedAt: number
}

export interface ProviderSession {
  connectionId: string
  provider: ProviderId
  accessToken: string
  expiresAt: number
}

export interface ProviderConnectionsState {
  accountId: string
  connections: readonly ProviderConnection[]
}

export type ProviderConnectionErrorCode =
  | 'invalid_account'
  | 'invalid_connection'
  | 'duplicate_connection'
  | 'connection_limit'
  | 'connection_not_found'
  | 'stale_connection'

export type ProviderConnectionResult =
  | { ok: true; value: ProviderConnectionsState }
  | { ok: false; code: ProviderConnectionErrorCode }

export type ProviderConnectionAction =
  | { type: 'upsert'; connection: unknown }
  | { type: 'revoke'; connectionId: string; updatedAt: number }
  | { type: 'remove'; connectionId: string }
