import type { DataKey } from '../lib/storage/schema'
import type { ConnectorId } from '../services/connectors/types'

type DataSensitivity =
  | 'preferences'
  | 'personal-identifier'
  | 'user-content'
  | 'approximate-location'
  | 'authentication'
  | 'capability-url'
  | 'provider-content'
  | 'public-selection'

type ExportDisposition = 'included' | 'redacted' | 'excluded' | 'outside-json-backup'
type TransmissionBoundary = 'none' | 'browser-mediated' | 'provider-direct'

interface StoredDataFlow {
  storage: 'chrome.storage.local'
  sensitivity: DataSensitivity[]
  export: ExportDisposition
  transmission: TransmissionBoundary
  description: string
}

export const STORED_DATA_FLOWS: Record<DataKey, StoredDataFlow> = {
  settings: { storage: 'chrome.storage.local', sensitivity: ['preferences', 'personal-identifier'], export: 'included', transmission: 'none', description: 'Display, search, and greeting preferences.' },
  focus: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'Focus-session history.' },
  todoLists: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'Task list names and items.' },
  links: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'browser-mediated', description: 'Quick Link titles and safe HTTP(S) destinations.' },
  timerConfig: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Timer durations.' },
  photoPrefs: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Background-photo mode and rotation state.' },
  location: { storage: 'chrome.storage.local', sensitivity: ['approximate-location'], export: 'included', transmission: 'provider-direct', description: 'Chosen or browser-provided coordinates and label.' },
  weatherCache: { storage: 'chrome.storage.local', sensitivity: ['provider-content'], export: 'included', transmission: 'none', description: 'Cached weather response for the selected location.' },
  notes: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'User-authored notes.' },
  worldClocks: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Selected world-clock cities.' },
  countdowns: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'User-authored countdown labels and dates.' },
  layout: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Dashboard layout and widget visibility.' },
  connectors: { storage: 'chrome.storage.local', sensitivity: ['preferences', 'authentication', 'capability-url', 'public-selection'], export: 'redacted', transmission: 'provider-direct', description: 'Connector configuration, credentials, capability URLs, and selected resources.' },
  connectorSnapshots: { storage: 'chrome.storage.local', sensitivity: ['provider-content'], export: 'excluded', transmission: 'none', description: 'Rebuildable connector response cache.' },
  habits: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'Habit names and completion history.' },
  apodCache: { storage: 'chrome.storage.local', sensitivity: ['provider-content'], export: 'excluded', transmission: 'none', description: 'Rebuildable NASA photo metadata cache.' },
}

export const OTHER_LOCAL_DATA_FLOWS = {
  uploadedPhotos: {
    storage: 'indexedDB',
    sensitivity: ['user-content'] as DataSensitivity[],
    export: 'outside-json-backup' as ExportDisposition,
    transmission: 'none' as TransmissionBoundary,
    description: 'User-selected photo files remain in the extension IndexedDB store.',
  },
  schemaVersion: {
    key: 'aurora:version',
    storage: 'chrome.storage.local',
    sensitivity: ['preferences'] as DataSensitivity[],
    export: 'outside-json-backup' as ExportDisposition,
    transmission: 'none' as TransmissionBoundary,
    description: 'Non-user schema metadata used only for local migrations.',
  },
} as const

interface ConnectorDataFlow {
  account: 'none' | 'third-party'
  authenticationFields: readonly string[]
  capabilityFields: readonly string[]
  backup: 'included' | 'redacted'
  permission: 'optional-per-origin'
  transmission: 'provider-direct'
  operations: readonly string[]
}

export const CONNECTOR_DATA_FLOWS: Record<ConnectorId, ConnectorDataFlow> = {
  rss: { account: 'none', authenticationFields: [], capabilityFields: ['feeds'], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['GET each configured feed URL'] },
  github: { account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['GitHub API requests for the connected account'] },
  gitlab: { account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['GitLab API requests to the configured instance'] },
  jira: { account: 'third-party', authenticationFields: ['apiToken'], capabilityFields: [], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['Jira API requests to the configured site'] },
  vercel: { account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['Vercel API requests for the connected account'] },
  crypto: { account: 'none', authenticationFields: [], capabilityFields: [], backup: 'included', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['CoinGecko public API requests'] },
  ics: { account: 'none', authenticationFields: [], capabilityFields: ['url', 'calendars'], backup: 'redacted', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['GET each configured calendar URL'] },
  status: { account: 'none', authenticationFields: [], capabilityFields: [], backup: 'included', permission: 'optional-per-origin', transmission: 'provider-direct', operations: ['GET selected public status endpoints'] },
  homeassistant: {
    account: 'third-party',
    authenticationFields: ['token'],
    capabilityFields: [],
    backup: 'redacted',
    permission: 'optional-per-origin',
    transmission: 'provider-direct',
    operations: [
      'GET /api/config on connect',
      'GET /api/states in the explicit picker only',
      'GET /api/states/{entity_id} for regular selected-entity polling',
      'GET /api/ for action-only health',
      'POST /api/services/{domain}/{service} only on an action click',
    ],
  },
}

export const FIXED_DATA_FLOWS = {
  weatherForecast: { destination: 'api.open-meteo.com', transmission: 'provider-direct' as const, data: ['coordinates'] },
  citySearch: { destination: 'geocoding-api.open-meteo.com', transmission: 'provider-direct' as const, data: ['city query'] },
  reverseGeocode: { destination: 'api.bigdatacloud.net', transmission: 'provider-direct' as const, data: ['coordinates'] },
  apod: { destination: 'api.nasa.gov', transmission: 'provider-direct' as const, data: ['requested date'] },
}

export const BROWSER_DATA_FLOWS = {
  search: { transmission: 'browser-mediated' as const, description: 'Search text is handed to Chrome search.' },
  bookmarks: { transmission: 'none' as const, description: 'Bookmarks are read through the optional Chrome bookmarks API.' },
  favicon: { transmission: 'browser-mediated' as const, description: 'Chrome supplies favicons through its local extension API.' },
  navigation: { transmission: 'browser-mediated' as const, description: 'Opening a Quick Link hands its safe HTTP(S) URL to Chrome.' },
  geolocation: { transmission: 'none' as const, description: 'Chrome provides coordinates; Aurora sends them only in the separately listed weather flows.' },
}

export const MANIFEST_PRIVACY_DESCRIPTION =
  'A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.' as const

export const LOCAL_SECRET_STORAGE_NOTICE =
  'Connector credentials and RSS feed/calendar URLs are stored as local plaintext protected by this Chrome/OS profile—not encrypted or vault-grade. On a shared or untrusted profile, disconnect connectors or clear Aurora’s extension data after use.' as const
