function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function exactAccept(request, expected, provider) {
  expect(request.accept === expected, `${provider} Accept contract mismatch`)
}

function scenario({
  id,
  kind,
  tier,
  viewport = 'common',
  fixture,
  expected,
  allowedWriteKeys = [],
  requiredWriteKeys = [],
  expectOverflow = false,
}) {
  return Object.freeze({
    key: `${id}:${kind}:${tier}:${viewport}`,
    id,
    kind,
    tier,
    viewport,
    fixture,
    expected: Object.freeze([...expected]),
    allowedWriteKeys: Object.freeze([...allowedWriteKeys]),
    requiredWriteKeys: Object.freeze([...requiredWriteKeys]),
    expectOverflow,
  })
}

function tierScenarios(id, expected, { fullOverflow = false } = {}) {
  return [
    scenario({ id, kind: 'tier', tier: 'compact', fixture: 'live', expected, allowedWriteKeys: ['connectorSnapshots'], requiredWriteKeys: ['connectorSnapshots'] }),
    scenario({ id, kind: 'tier', tier: 'standard', fixture: 'snapshot', expected }),
    scenario({ id, kind: 'max-data', tier: 'full', fixture: 'snapshot', expected, expectOverflow: fullOverflow }),
    scenario({ id, kind: 'dock-detail', tier: 'docked', fixture: 'snapshot', expected }),
    scenario({ id, kind: 'short-window', tier: 'standard', viewport: 'exact-short', fixture: 'snapshot', expected }),
    scenario({ id, kind: 'short-window', tier: 'full', viewport: 'exact-short', fixture: 'snapshot', expected }),
  ]
}

export const AT_A_GLANCE_SCENARIOS = Object.freeze([
  ...tierScenarios('onThisDay', ['On This Day', 'Aurora history witness'], { fullOverflow: true }),
  ...tierScenarios('publicHolidays', ['Public Holidays', 'QA Holiday'], { fullOverflow: true }),
  ...tierScenarios('auroraKp', ['Kp', 'peak'], { fullOverflow: true }),
  scenario({ id: 'onThisDay', kind: 'empty', tier: 'standard', fixture: 'empty', expected: ['No event returned for today'] }),
  scenario({ id: 'onThisDay', kind: 'stale', tier: 'standard', fixture: 'stale-error', expected: ['Saved', 'Saved historical event'] }),
  scenario({ id: 'publicHolidays', kind: 'setup', tier: 'standard', fixture: 'setup', expected: ['Choose a country in Settings'] }),
  scenario({ id: 'publicHolidays', kind: 'empty', tier: 'standard', fixture: 'empty', expected: ['No upcoming national holidays returned for US'] }),
  scenario({ id: 'publicHolidays', kind: 'stale', tier: 'standard', fixture: 'stale-error', expected: ['Saved', 'QA Holiday'] }),
  scenario({ id: 'publicHolidays', kind: 'year-boundary', tier: 'full', fixture: 'year-boundary', expected: ['QA Holiday', String(new Date().getFullYear() + 1)], expectOverflow: true }),
  scenario({ id: 'publicHolidays', kind: 'error', tier: 'standard', fixture: 'error', expected: ['Public Holidays is unavailable'] }),
  scenario({ id: 'auroraKp', kind: 'empty', tier: 'standard', fixture: 'empty', expected: ['NOAA has no current Kp forecast'] }),
  scenario({ id: 'auroraKp', kind: 'stale', tier: 'standard', fixture: 'stale-error', expected: ['Saved', 'Kp'] }),
  scenario({ id: 'auroraKp', kind: 'error', tier: 'standard', fixture: 'error', expected: ['Aurora & Kp is unavailable'] }),
  scenario({ id: 'weather', kind: 'active', tier: 'compact', fixture: 'active-live', expected: ['Severe Thunderstorm Warning'], allowedWriteKeys: ['weatherAlertCache'], requiredWriteKeys: ['weatherAlertCache'] }),
  scenario({ id: 'weather', kind: 'active', tier: 'standard', fixture: 'active-snapshot', expected: ['Severe Thunderstorm Warning'] }),
  scenario({ id: 'weather', kind: 'max-data', tier: 'full', fixture: 'active-snapshot', expected: ['Severe Thunderstorm Warning'] }),
  scenario({ id: 'weather', kind: 'dock-detail', tier: 'docked', fixture: 'active-snapshot', expected: ['Severe Thunderstorm Warning'] }),
  scenario({ id: 'weather', kind: 'short-window', tier: 'standard', viewport: 'exact-short', fixture: 'active-snapshot', expected: ['Severe Thunderstorm Warning'] }),
  scenario({ id: 'weather', kind: 'empty', tier: 'standard', fixture: 'empty', expected: ['No active NWS alerts'], allowedWriteKeys: ['weatherAlertCache'], requiredWriteKeys: ['weatherAlertCache'] }),
  scenario({ id: 'weather', kind: 'unsupported', tier: 'standard', fixture: 'unsupported', expected: ['New York'], allowedWriteKeys: ['weatherAlertCache'], requiredWriteKeys: ['weatherAlertCache'] }),
  scenario({ id: 'weather', kind: 'error', tier: 'standard', fixture: 'error', expected: ['NWS alerts unavailable', 'New York'] }),
  scenario({ id: 'weather', kind: 'stale', tier: 'standard', fixture: 'stale-error', expected: ['Saved alert data', 'Severe Thunderstorm Warning'] }),
  // Keep clock emulation last so it cannot affect unrelated viewport or
  // background timers in earlier evidence.
  scenario({ id: 'onThisDay', kind: 'local-midnight', tier: 'standard', fixture: 'local-midnight', expected: ['After midnight witness'], allowedWriteKeys: ['connectorSnapshots'], requiredWriteKeys: ['connectorSnapshots'] }),
])

const EXPECTED_OPERATION_COUNTS = Object.freeze({
  // Aurora ships under React StrictMode. Fast live/error requests complete
  // between its development remounts, so those connector calls are witnessed
  // twice; the exact counts below intentionally include both real requests.
  'on-this-day': 5,
  'holiday-countries': 1,
  'public-holidays': 12,
  'aurora-kp': 6,
  'weather-alerts': 6,
})

export function validateAtAGlanceEvidence(evidence) {
  expect(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join(' | ')}`)
  expect(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join(' | ')}`)
  expect(evidence.failures.length === 0, `reported failures: ${evidence.failures.join(' | ')}`)

  const expectedKeys = new Set(AT_A_GLANCE_SCENARIOS.map((entry) => entry.key))
  const exactRows = (rows, label) => {
    const counts = new Map()
    for (const row of rows) counts.set(row.scenario, (counts.get(row.scenario) ?? 0) + 1)
    for (const key of expectedKeys) expect(counts.get(key) === 1, `${label} for scenario ${key} must appear exactly once`)
    for (const key of counts.keys()) expect(expectedKeys.has(key), `unexpected ${label} for scenario ${key}`)
  }
  exactRows(evidence.captures, 'scenario capture')
  exactRows(evidence.storage, 'scenario storage')

  for (const entry of AT_A_GLANCE_SCENARIOS) {
    const capture = evidence.captures.find((row) => row.scenario === entry.key)
    expect(capture.usefulness === 'useful', `scenario capture ${entry.key} is not useful`)
    if (entry.expectOverflow) {
      expect(
        capture.localScroll && capture.localScroll.scrollHeight > capture.localScroll.clientHeight,
        `scenario capture ${entry.key} did not prove local Full overflow`,
      )
    }

    const storage = evidence.storage.find((row) => row.scenario === entry.key)
    const written = new Set(storage.writes.flat())
    const observedMutation = new Set([...written, ...(storage.changedKeys ?? [])])
    expect(!written.has('layout'), `scenario storage ${entry.key} wrote legacy layout`)
    for (const key of written) {
      expect(entry.allowedWriteKeys.includes(key), `scenario storage ${entry.key} wrote unexpected key ${key}`)
    }
    for (const key of entry.requiredWriteKeys) {
      expect(observedMutation.has(key), `scenario storage ${entry.key} did not write required key ${key}`)
    }
  }

  const actualCounts = new Map()
  for (const request of evidence.requestLog) {
    actualCounts.set(request.operation, (actualCounts.get(request.operation) ?? 0) + 1)
  }
  for (const [operation, expectedCount] of Object.entries(EXPECTED_OPERATION_COUNTS)) {
    expect(actualCounts.get(operation) === expectedCount, `${operation} request count must be exactly ${expectedCount}`)
  }
  for (const operation of actualCounts.keys()) {
    expect(operation in EXPECTED_OPERATION_COUNTS, `unexpected provider operation ${operation}`)
  }
}

export function inspectAtAGlanceRequest(request) {
  const url = new URL(request.url)
  const method = String(request.method).toUpperCase()
  expect(method === 'GET', `Unexpected provider method: ${method}`)

  if (url.hostname === 'en.wikipedia.org') {
    expect(
      /^\/api\/rest_v1\/feed\/onthisday\/all\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(url.pathname) && url.search === '',
      `Unexpected Wikipedia request: ${url.href}`,
    )
    exactAccept(request, 'application/json', 'Wikipedia')
    return { provider: 'wikipedia', operation: 'on-this-day' }
  }

  if (url.hostname === 'date.nager.at') {
    expect(url.search === '', `Unexpected Nager query: ${url.search}`)
    if (url.pathname === '/api/v3/AvailableCountries') {
      return { provider: 'nager', operation: 'holiday-countries' }
    }
    const match = /^\/api\/v3\/PublicHolidays\/(\d{4})\/([A-Z]{2})$/.exec(url.pathname)
    expect(match, `Unexpected Nager request: ${url.href}`)
    return {
      provider: 'nager',
      operation: 'public-holidays',
      year: Number(match[1]),
      countryCode: match[2],
    }
  }

  if (url.hostname === 'services.swpc.noaa.gov') {
    expect(
      url.pathname === '/products/noaa-planetary-k-index-forecast.json' && url.search === '',
      `Unexpected SWPC request: ${url.href}`,
    )
    exactAccept(request, 'application/json', 'SWPC')
    return { provider: 'swpc', operation: 'aurora-kp' }
  }

  if (url.hostname === 'api.weather.gov') {
    expect(url.pathname === '/alerts/active', `Unexpected NWS path: ${url.pathname}`)
    const point = url.searchParams.get('point')
    expect(url.searchParams.size === 1 && typeof point === 'string', `Unexpected NWS query: ${url.search}`)
    const match = /^(-?\d+(?:\.\d{1,4})?),(-?\d+(?:\.\d{1,4})?)$/.exec(point)
    expect(match, `Unexpected NWS point: ${point}`)
    const lat = Number(match[1])
    const lon = Number(match[2])
    expect(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, `Unexpected NWS point: ${point}`)
    exactAccept(request, 'application/geo+json', 'NWS')
    return { provider: 'nws', operation: 'weather-alerts', point }
  }

  throw new Error(`Unexpected provider request: ${method} ${url.href}`)
}
