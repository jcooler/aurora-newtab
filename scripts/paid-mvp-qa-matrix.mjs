const WIDGET_IDS = Object.freeze([
  'weather', 'ics', 'monthCal', 'sun', 'moon', 'quote', 'clock', 'greeting', 'worldClocks',
  'countdown', 'search', 'focus', 'links', 'habits', 'bookmarks', 'status', 'github', 'gitlab',
  'jira', 'vercel', 'homeassistant', 'rss', 'crypto', 'readingList', 'recentlyClosed', 'downloads',
  'tabGroups', 'timer', 'tasks', 'notes', 'linear', 'sentry', 'todoist', 'onThisDay',
  'publicHolidays', 'auroraKp', 'progress', 'metrics',
])

const CONNECTOR_IDS = Object.freeze([
  'rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'status', 'homeassistant',
  'linear', 'sentry', 'todoist', 'onThisDay', 'publicHolidays', 'auroraKp',
  'googleCalendar', 'microsoftCalendar',
])

const STANDARD_UNSUPPORTED = new Set(['timer', 'tasks', 'notes', 'progress'])
const FULL_SUPPORTED = new Set([
  'weather', 'ics', 'monthCal', 'clock', 'greeting', 'worldClocks', 'habits', 'github', 'gitlab',
  'jira', 'vercel', 'homeassistant', 'rss', 'readingList', 'recentlyClosed', 'downloads', 'tabGroups',
  'linear', 'sentry', 'todoist', 'onThisDay', 'publicHolidays', 'auroraKp', 'metrics',
])
const DOCK_SUPPORTED = new Set([
  'ics', 'monthCal', 'sun', 'moon', 'quote', 'worldClocks', 'countdown', 'links', 'habits',
  'bookmarks', 'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto',
  'readingList', 'recentlyClosed', 'downloads', 'tabGroups', 'timer', 'tasks', 'notes', 'linear',
  'sentry', 'todoist', 'onThisDay', 'publicHolidays', 'auroraKp', 'progress', 'metrics',
])
const CONNECTOR_WIDGETS = new Set(CONNECTOR_IDS.filter((id) => !['googleCalendar', 'microsoftCalendar'].includes(id)))
const BROWSER_PERMISSION_WIDGETS = new Set(['bookmarks', 'readingList', 'recentlyClosed', 'downloads', 'tabGroups'])
const NETWORK_WIDGETS = new Set([...CONNECTOR_WIDGETS, 'weather'])
const EMPTY_NOT_APPLICABLE = new Set(['clock', 'greeting', 'quote', 'search', 'focus', 'timer'])

function coverage(id, disposition, evidence, reason) {
  return Object.freeze({ id, disposition, evidence, reason })
}

function automated(id, evidence, reason) {
  return coverage(id, 'automated', evidence, reason)
}

function notApplicable(id, evidence, reason) {
  return coverage(id, 'not-applicable', evidence, reason)
}

function presentation(id, supported, evidence, reason) {
  return supported
    ? automated(id, evidence, reason)
    : notApplicable(id, 'src/newtab/widgetRegistry.ts', `${id} is not declared for this widget`)
}

function widgetEvidence(id) {
  if (id === 'metrics') return 'qa:tab-two-metrics'
  if (id === 'progress') return 'qa:tab-two-v2-progress'
  if (id === 'ics') return 'qa:google-calendar and qa:microsoft-calendar'
  if (CONNECTOR_WIDGETS.has(id)) return 'qa:tab-two-v2-connectors and qa:widget-redesign-production'
  return 'qa:widget-redesign-production'
}

function widgetPresentations(id) {
  const evidence = widgetEvidence(id)
  return Object.freeze([
    presentation('compact', true, evidence, 'Compact is a declared widget presentation'),
    presentation('standard', !STANDARD_UNSUPPORTED.has(id), evidence, 'Standard is a declared widget presentation'),
    presentation('full', FULL_SUPPORTED.has(id), evidence, 'Full is a declared widget presentation'),
    presentation('docked', DOCK_SUPPORTED.has(id), 'qa:widget-redesign-production', 'Docked rendering is registry-declared'),
    presentation('stacked', true, 'qa:widget-redesign-production', 'Named-layout stack rendering is exercised'),
  ])
}

function widgetStates(id) {
  const evidence = widgetEvidence(id)
  return Object.freeze([
    EMPTY_NOT_APPLICABLE.has(id)
      ? notApplicable('empty', evidence, 'The intrinsic surface has no empty data state')
      : automated('empty', evidence, 'The empty state has a deterministic fixture'),
    NETWORK_WIDGETS.has(id) || ['metrics', 'progress'].includes(id)
      ? automated('loading', evidence, 'The asynchronous loading state has a deterministic fixture')
      : notApplicable('loading', evidence, 'The surface does not wait on an asynchronous data source'),
    automated('ready', evidence, 'Ready content is exercised in its production renderer'),
    NETWORK_WIDGETS.has(id)
      ? automated('stale', evidence, 'Cached stale content has a deterministic fixture')
      : notApplicable('stale', evidence, 'The surface has no network cache freshness state'),
    NETWORK_WIDGETS.has(id) || ['metrics', 'progress'].includes(id)
      ? automated('error', evidence, 'Failure behavior has an executable fixture')
      : notApplicable('error', evidence, 'The intrinsic surface has no recoverable data error state'),
    BROWSER_PERMISSION_WIDGETS.has(id)
      ? automated('permission', 'qa:free-baseline', 'The extension-side granted and withheld states are automated')
      : notApplicable('permission', evidence, 'No browser permission state belongs to this surface'),
    CONNECTOR_WIDGETS.has(id)
      ? automated('reconnect', 'qa:tab-two-v2-connectors', 'The connector shell owns reconnect presentation')
      : notApplicable('reconnect', evidence, 'The surface has no connector credential lifecycle'),
    id === 'weather'
      ? automated('manual', 'qa:free-baseline', 'Manual weather location is an extension-controlled state')
      : notApplicable('manual', evidence, 'No Manual mode belongs to this surface'),
    ['ics', 'metrics'].includes(id)
      ? automated('locked', evidence, 'Premium lock presentation is covered without granting access')
      : notApplicable('locked', evidence, 'The surface is included without a premium lock'),
    ['ics', 'metrics'].includes(id)
      ? automated('entitled', evidence, 'Verified lease fixtures exercise entitled presentation')
      : notApplicable('entitled', evidence, 'The surface does not consume a premium entitlement'),
  ])
}

export const PAID_MVP_WIDGET_MATRIX = Object.freeze(WIDGET_IDS.map((id) => Object.freeze({
  id,
  presentations: widgetPresentations(id),
  states: widgetStates(id),
})))

function connectorEvidence(id) {
  if (id === 'googleCalendar') return 'qa:google-calendar'
  if (id === 'microsoftCalendar') return 'qa:microsoft-calendar'
  return 'qa:tab-two-v2-connectors'
}

function connectorStates(id) {
  const evidence = connectorEvidence(id)
  const reconnect = !['crypto', 'status', 'onThisDay', 'publicHolidays', 'auroraKp'].includes(id)
  const premium = ['googleCalendar', 'microsoftCalendar'].includes(id)
  return Object.freeze([
    automated('empty', evidence, 'Configured empty content is exercised'),
    automated('loading', evidence, 'Loading presentation is controlled by a deterministic boundary'),
    automated('ready', evidence, 'Ready content and settings are exercised'),
    automated('stale', evidence, 'Cache freshness presentation is exercised'),
    automated('error', evidence, 'Provider failure presentation is exercised without a live provider'),
    automated('permission', evidence, 'Extension-side permission outcomes are simulated deterministically'),
    reconnect
      ? automated('reconnect', evidence, 'Credential recovery presentation is exercised')
      : notApplicable('reconnect', evidence, 'This connector has no credential lifecycle'),
    notApplicable('manual', evidence, 'The connector has no Manual mode'),
    premium
      ? automated('locked', evidence, 'Missing entitlement keeps the provider connector locked')
      : notApplicable('locked', evidence, 'This launch connector remains free'),
    premium
      ? automated('entitled', evidence, 'A verified lease fixture exercises premium access')
      : notApplicable('entitled', evidence, 'This launch connector remains free'),
  ])
}

export const PAID_MVP_CONNECTOR_MATRIX = Object.freeze(CONNECTOR_IDS.map((id) => {
  const evidence = connectorEvidence(id)
  return Object.freeze({
    id,
    presentations: Object.freeze([
      automated('settings-card', evidence, 'Connector discovery and management use the production settings card'),
      automated('canvas-surface', evidence, 'Connected content is exercised in the production canvas surface'),
    ]),
    states: connectorStates(id),
  })
}))

const FLOW_EVIDENCE = Object.freeze({
  'drag-drop': 'qa:widget-redesign-production',
  keyboard: 'qa:free-baseline and qa:paid-mvp-support',
  touch: 'qa:free-baseline and qa:paid-mvp-support',
  'named-layouts': 'qa:widget-redesign-production',
  stacks: 'qa:widget-redesign-production',
  docks: 'qa:widget-redesign-production',
  persistence: 'qa:free-baseline',
  account: 'qa:account-sync-shell and qa:account-auth-production',
  billing: 'qa:stripe-billing and qa:account-sync-shell',
  sync: 'qa:account-sync-shell',
  metrics: 'qa:tab-two-metrics',
  'google-calendar': 'qa:google-calendar',
  'microsoft-calendar': 'qa:microsoft-calendar',
  quota: 'qa:account-sync-shell',
  conflicts: 'qa:account-sync-shell',
  deletion: 'qa:account-sync-shell',
  backup: 'qa:free-baseline',
  help: 'qa:paid-mvp-support',
  diagnostics: 'qa:paid-mvp-support',
})

export const PAID_MVP_FLOW_MATRIX = Object.freeze(Object.entries(FLOW_EVIDENCE).map(([id, evidence]) => (
  automated(id, evidence, 'The production flow has an executable specialist evidence owner')
)))

export const PAID_MVP_MANUAL_CEILINGS = Object.freeze([
  coverage('native-permission-prompts', 'manual-ceiling', 'owner final QA', 'Browser-owned prompt chrome and wording cannot be validated by page automation'),
  coverage('real-provider-consent-revocation', 'manual-ceiling', 'owner final QA', 'Real Google and Microsoft consent and revocation require owner-controlled accounts'),
  coverage('assistive-technology-speech', 'manual-ceiling', 'owner final QA', 'The accessibility tree does not prove real screen-reader speech'),
  coverage('physical-touch-trackpad', 'manual-ceiling', 'owner final QA', 'Emulated touch does not prove physical touch or trackpad behavior'),
  coverage('mixed-dpi-hardware', 'manual-ceiling', 'owner final QA', 'Device scale emulation does not prove a real mixed-DPI monitor transition'),
  coverage('macbook-behavior', 'manual-ceiling', 'owner final QA', 'Windows Chromium cannot prove macOS or MacBook hardware behavior'),
])
