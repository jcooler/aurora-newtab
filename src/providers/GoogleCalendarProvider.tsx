import { createContext, useContext, type ReactNode } from 'react'
import { hasProviderCapability } from '../account/capabilities'
import { useAccount } from '../account/AccountContext'
import { zonedLocalDayRange } from '../lib/dates'
import { useConnectorSnapshot } from '../lib/hooks/useConnectorSnapshot'
import { useLocalDay } from '../lib/hooks/useLocalDay'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import {
  GoogleCalendarRequestError,
  isGoogleCalendarSnapshot,
  parseGoogleCalendarConfig,
  refreshGoogleCalendarSnapshot,
} from '../services/connectors/googleCalendar'
import type {
  GoogleCalendarConfig,
  GoogleCalendarConnectionIssueCode,
  GoogleCalendarSnapshot,
} from '../services/connectors/types'
import type { ProviderGateway, ProviderGatewayErrorCode } from './gateway'

const HALF_DAY_MS = 12 * 60 * 60_000
const MIN_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

function secureUnitInterval(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return (value[0] ?? 0) / 0x1_0000_0000
}

/** Applies 20% jitter while keeping retries in the approved 1s to 30s window. */
export function googleCalendarRetryDelay(
  baseMs: number,
  random: () => number = secureUnitInterval,
): number {
  const unit = Math.min(Math.max(random(), 0), 1)
  const nominal = Math.min(Math.max(baseMs, 1_250), 25_000)
  return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, Math.round(nominal * (0.8 + unit * 0.4))))
}

function partialGoogleCalendarSnapshot(snapshot: GoogleCalendarSnapshot): boolean {
  return Boolean(snapshot.connectionIssues?.length)
}

export interface GoogleCalendarRuntimeState {
  entitled: boolean
  snapshot: GoogleCalendarSnapshot | null
  refreshing: boolean
  lastError: string | null
}

const EMPTY_RUNTIME: GoogleCalendarRuntimeState = Object.freeze({
  entitled: false,
  snapshot: null,
  refreshing: false,
  lastError: null,
})

const GoogleCalendarContext = createContext<GoogleCalendarRuntimeState>(EMPTY_RUNTIME)

export function useGoogleCalendar(): GoogleCalendarRuntimeState {
  return useContext(GoogleCalendarContext)
}

/** Returns midnight-to-midnight bounds for 31 local days before today,
 * today itself, and 61 local days after today. Stepping through local
 * midnights preserves DST transitions instead of assuming every day is 24h. */
export function googleCalendarWindow(now: number, timeZone: string): { start: number; end: number } {
  const today = zonedLocalDayRange(now, timeZone)
  let start = today.start
  for (let index = 0; index < 31; index += 1) {
    start = zonedLocalDayRange(start - HALF_DAY_MS, timeZone).start
  }
  let end = today.end
  for (let index = 0; index < 61; index += 1) {
    end = zonedLocalDayRange(end + HALF_DAY_MS, timeZone).end
  }
  return { start, end }
}

function providerIssue(code: ProviderGatewayErrorCode): GoogleCalendarConnectionIssueCode {
  switch (code) {
    case 'authentication_required': return 'unauthorized'
    case 'entitlement_required': return 'entitlement_required'
    case 'reconnect_required':
    case 'connection_not_found': return 'reconnect_required'
    case 'rate_limited': return 'rate_limited'
    default: return 'provider_error'
  }
}

function RefreshOwner({
  children,
  config,
  gateway,
  fetchFn,
  now,
}: {
  children: ReactNode
  config: GoogleCalendarConfig
  gateway: ProviderGateway
  fetchFn: typeof fetch
  now: () => number
}) {
  const localDay = useLocalDay()
  const window = googleCalendarWindow(now(), localDay.timeZone)
  const resource = useConnectorSnapshot<GoogleCalendarSnapshot>(
    'googleCalendar',
    config,
    (previous) => refreshGoogleCalendarSnapshot({
      config,
      previous,
      windowStart: window.start,
      windowEnd: window.end,
      now,
      fetchFn,
      getAccessToken: async (connectionId) => {
        const result = await gateway.getSession(connectionId)
        if (!result.ok) throw new GoogleCalendarRequestError(providerIssue(result.code))
        return result.value.accessToken
      },
    }),
    undefined,
    { accountId: config.accountId, timeZone: localDay.timeZone },
    isGoogleCalendarSnapshot,
    { retryDelayMs: googleCalendarRetryDelay, shouldRetry: partialGoogleCalendarSnapshot },
  )
  return (
    <GoogleCalendarContext.Provider value={{
      entitled: true,
      snapshot: resource.data,
      refreshing: resource.refreshing,
      lastError: resource.lastError,
    }}>
      {children}
    </GoogleCalendarContext.Provider>
  )
}

export function GoogleCalendarProvider({
  children,
  fetchFn = globalThis.fetch.bind(globalThis),
  now = Date.now,
}: {
  children: ReactNode
  fetchFn?: typeof fetch
  now?: () => number
}) {
  const [connectors] = useStoredKey('connectors')
  const [snapshots] = useStoredKey('connectorSnapshots')
  const account = useAccount()
  const config = parseGoogleCalendarConfig(connectors?.googleCalendar)
  const sameAccount = Boolean(
    config
    && account.snapshot.mode === 'signed_in'
    && account.snapshot.accountId === config.accountId,
  )
  const cached = sameAccount && isGoogleCalendarSnapshot(snapshots?.googleCalendar?.data)
    ? snapshots.googleCalendar.data
    : null
  const entitled = Boolean(
    config
    && sameAccount
    && account.hydrated
    && hasProviderCapability(account.snapshot, 'google_calendar', now()),
  )
  const gateway = account.client.providerGateway

  if (!config || !config.enabled || !entitled || !gateway) {
    return (
      <GoogleCalendarContext.Provider value={{
        entitled,
        snapshot: cached,
        refreshing: false,
        lastError: null,
      }}>
        {children}
      </GoogleCalendarContext.Provider>
    )
  }

  return (
    <RefreshOwner config={config} gateway={gateway} fetchFn={fetchFn} now={now}>
      {children}
    </RefreshOwner>
  )
}
