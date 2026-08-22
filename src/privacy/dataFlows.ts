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
  timerSession: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Current timer phase, deadline, progress, and Flow state.' },
  photoPrefs: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Background-photo mode and rotation state.' },
  location: { storage: 'chrome.storage.local', sensitivity: ['approximate-location'], export: 'included', transmission: 'provider-direct', description: 'Chosen or browser-provided coordinates and label.' },
  weatherCache: { storage: 'chrome.storage.local', sensitivity: ['provider-content'], export: 'included', transmission: 'none', description: 'Cached weather response for the selected location.' },
  notes: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'User-authored notes.' },
  worldClocks: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Selected world-clock cities.' },
  countdowns: { storage: 'chrome.storage.local', sensitivity: ['user-content'], export: 'included', transmission: 'none', description: 'User-authored countdown labels and dates.' },
  layout: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Dashboard layout and widget visibility.' },
  layouts: { storage: 'chrome.storage.local', sensitivity: ['preferences'], export: 'included', transmission: 'none', description: 'Named layout documents: layout names, widget placement, tiers, and dock order.' },
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
  destinationKind: 'fixed-provider' | 'configured-provider'
  destinations: readonly string[]
  trigger: readonly string[]
  methods: readonly ('GET' | 'POST')[]
  sends: readonly string[]
  receives: readonly string[]
  cache: 'connectorSnapshots-excluded-from-backup'
  backend: 'none'
  operations: readonly string[]
}

function connectorFlow(
  details: Omit<ConnectorDataFlow, 'permission' | 'transmission' | 'cache' | 'backend'>,
): ConnectorDataFlow {
  return {
    ...details,
    permission: 'optional-per-origin',
    transmission: 'provider-direct',
    cache: 'connectorSnapshots-excluded-from-backup',
    backend: 'none',
  }
}

export const CONNECTOR_DATA_FLOWS: Record<ConnectorId, ConnectorDataFlow> = {
  rss: connectorFlow({ account: 'none', authenticationFields: [], capabilityFields: ['feeds'], backup: 'redacted', destinationKind: 'configured-provider', destinations: ['each configured RSS feed origin'], trigger: ['configured refresh interval or explicit stale refresh'], methods: ['GET'], sends: ['full capability URL as the request target'], receives: ['feed XML and linked headline metadata'], operations: ['GET each configured feed URL'] }),
  github: connectorFlow({ account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', destinationKind: 'fixed-provider', destinations: ['api.github.com'], trigger: ['connect identity check and enabled-card refresh'], methods: ['GET'], sends: ['token and enabled account queries'], receives: ['pull requests, issues, notifications, and contribution data'], operations: ['GitHub API requests for the connected account'] }),
  gitlab: connectorFlow({ account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', destinationKind: 'configured-provider', destinations: ['configured GitLab instance'], trigger: ['connect identity check and enabled-card refresh'], methods: ['GET'], sends: ['token, username, and enabled account queries'], receives: ['merge requests, to-dos, and contribution data'], operations: ['GitLab API requests to the configured instance'] }),
  jira: connectorFlow({ account: 'third-party', authenticationFields: ['apiToken'], capabilityFields: [], backup: 'redacted', destinationKind: 'configured-provider', destinations: ['configured Jira Cloud site'], trigger: ['connect identity check and enabled-card refresh'], methods: ['GET'], sends: ['email, API token, and issue queries'], receives: ['assigned issue data'], operations: ['Jira API requests to the configured site'] }),
  vercel: connectorFlow({ account: 'third-party', authenticationFields: ['token'], capabilityFields: [], backup: 'redacted', destinationKind: 'fixed-provider', destinations: ['api.vercel.com'], trigger: ['connect identity check and enabled-card refresh'], methods: ['GET'], sends: ['token and deployment queries'], receives: ['deployment data'], operations: ['Vercel API requests for the connected account'] }),
  crypto: connectorFlow({ account: 'none', authenticationFields: [], capabilityFields: [], backup: 'included', destinationKind: 'fixed-provider', destinations: ['api.coingecko.com'], trigger: ['configured refresh interval or explicit stale refresh'], methods: ['GET'], sends: ['selected public coin identifiers'], receives: ['public price and change data'], operations: ['CoinGecko public API requests'] }),
  ics: connectorFlow({ account: 'none', authenticationFields: [], capabilityFields: ['url', 'calendars'], backup: 'redacted', destinationKind: 'configured-provider', destinations: ['each configured calendar origin'], trigger: ['configured refresh interval or explicit stale refresh'], methods: ['GET'], sends: ['full capability URL as the request target'], receives: ['calendar event data and embedded meeting links'], operations: ['GET each configured calendar URL'] }),
  status: connectorFlow({ account: 'none', authenticationFields: [], capabilityFields: [], backup: 'included', destinationKind: 'configured-provider', destinations: ['each selected public status origin'], trigger: ['configured refresh interval or explicit stale refresh'], methods: ['GET'], sends: ['selected public status endpoint request'], receives: ['public component and incident status'], operations: ['GET selected public status endpoints'] }),
  homeassistant: connectorFlow({
    account: 'third-party',
    authenticationFields: ['token'],
    capabilityFields: [],
    backup: 'redacted',
    destinationKind: 'configured-provider',
    destinations: ['configured Home Assistant instance'],
    trigger: ['connect, explicit picker open, selected-entity refresh, or action click'],
    methods: ['GET', 'POST'],
    sends: ['token, selected entity identifiers, and click-selected action body'],
    receives: ['instance identity, picker entity list, selected entity states, and action health'],
    operations: [
      'GET /api/config on connect',
      'GET /api/states in the explicit picker only',
      'GET /api/states/{entity_id} for regular selected-entity polling',
      'GET /api/ for action-only health',
      'POST /api/services/{domain}/{service} only on an action click',
    ],
  }),
}

interface FixedDataFlow {
  destinations: readonly string[]
  transmission: 'provider-direct'
  trigger: readonly string[]
  sends: readonly string[]
  receives: readonly string[]
  methods: readonly ['GET']
  permission: 'not-separately-requested-by-flow' | 'optional-per-origin'
  cache: 'none' | 'weatherCache-included-in-backup' | 'apodCache-excluded-from-backup'
  backend: 'none'
}

export const FIXED_DATA_FLOWS: Record<'weatherForecast' | 'citySearch' | 'reverseGeocode' | 'apod', FixedDataFlow> = {
  weatherForecast: { destinations: ['api.open-meteo.com'], transmission: 'provider-direct', trigger: ['enabled Weather widget with a selected location and a stale or mismatched cache'], sends: ['rounded coordinates'], receives: ['current, hourly, sunrise, and sunset forecast data'], methods: ['GET'], permission: 'not-separately-requested-by-flow', cache: 'weatherCache-included-in-backup', backend: 'none' },
  citySearch: { destinations: ['geocoding-api.open-meteo.com'], transmission: 'provider-direct', trigger: ['debounced active city query of at least two characters'], sends: ['city search text'], receives: ['matching place names and coordinates'], methods: ['GET'], permission: 'not-separately-requested-by-flow', cache: 'none', backend: 'none' },
  reverseGeocode: { destinations: ['api.bigdatacloud.net'], transmission: 'provider-direct', trigger: ['Use my location click after Chrome supplies coordinates'], sends: ['rounded coordinates'], receives: ['place label'], methods: ['GET'], permission: 'not-separately-requested-by-flow', cache: 'none', backend: 'none' },
  apod: { destinations: ['api.nasa.gov', 'apod.nasa.gov'], transmission: 'provider-direct', trigger: ['user selects APOD and the local-day cache needs a photo'], sends: ['shared NASA DEMO_KEY'], receives: ['APOD metadata', 'selected image bytes'], methods: ['GET'], permission: 'optional-per-origin', cache: 'apodCache-excluded-from-backup', backend: 'none' },
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
