export const CONNECTOR_SIZE_PROMISES = Object.freeze({
  ics: Object.freeze(['compact', 'standard']),
  status: Object.freeze(['compact', 'standard']),
  github: Object.freeze(['compact', 'standard', 'full']),
  gitlab: Object.freeze(['compact', 'standard', 'full']),
  jira: Object.freeze(['compact', 'standard', 'full']),
  vercel: Object.freeze(['compact', 'standard', 'full']),
  homeassistant: Object.freeze(['compact', 'standard', 'full']),
  rss: Object.freeze(['compact', 'standard', 'full']),
  crypto: Object.freeze(['compact', 'standard']),
})

export async function seedInformationFirstFixtures(page, { weatherFixture = null, contributionDayCount = 35 } = {}) {
  const day = await page.evaluate(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  await page.evaluate(async ({ day, weatherFixture, contributionDayCount }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['search', 'weather', 'todo', 'timer', 'bookmarks', 'notes', 'monthCal', 'quote']) widgets[key] = true

    const normalizeCoordinate = (value, minimum, maximum) => {
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error('invalid Weather coordinate')
      const rounded = Number(value.toFixed(4))
      return Object.is(rounded, -0) ? 0 : rounded
    }
    const weatherUrl = (lat, lon) => {
      const params = new URLSearchParams()
      params.set('temperature_unit', 'celsius')
      params.set('wind_speed_unit', 'kmh')
      params.set('forecast_hours', '12')
      params.set('forecast_days', '1')
      params.set('timezone', 'auto')
      params.set('timeformat', 'iso8601')
      params.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day')
      params.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
      params.set('daily', 'sunrise,sunset')
      params.set('latitude', String(normalizeCoordinate(lat, -90, 90)))
      params.set('longitude', String(normalizeCoordinate(lon, -180, 180)))
      return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    }
    const environmentUrl = (lat, lon) => {
      const params = new URLSearchParams()
      params.set('timezone', 'auto')
      params.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
      params.set('latitude', String(normalizeCoordinate(lat, -90, 90)))
      params.set('longitude', String(normalizeCoordinate(lon, -180, 180)))
      return `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`
    }
    const location = { lat: 33.749, lon: -84.388, label: 'Atlanta', manual: true }
    const now = Date.now()
    const configs = {
      ics: {
        enabled: true,
        calendars: [
          { name: 'Studio', url: 'https://calendar.invalid/studio.ics', color: 'emerald' },
          { name: 'Family', url: 'https://calendar.invalid/family.ics', color: 'fuchsia' },
        ],
        view: 'upcoming', upcomingCount: 5, meetLinks: true,
      },
      status: { enabled: true, services: [{ name: 'GitHub', url: 'https://status.invalid/github.json' }, { name: 'Vercel', url: 'https://status.invalid/vercel.json' }] },
      github: { enabled: true, token: 'fixture-github-token', username: 'fixture-user', views: { commitGraph: true, pulls: true, issues: true, notifications: true } },
      gitlab: { enabled: true, token: 'fixture-gitlab-token', instanceUrl: 'https://gitlab.invalid', username: 'fixture-user', views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true } },
      jira: { enabled: true, email: 'fixture@example.invalid', apiToken: 'fixture-jira-token', site: 'fixture.atlassian.net', displayName: 'Aurora Fixture', views: { assigned: true, dueSoon: true, statusChips: true } },
      vercel: { enabled: true, token: 'fixture-vercel-token', username: 'fixture-user', views: { deployments: true, statusSummary: true } },
      homeassistant: {
        enabled: true, instanceUrl: 'https://home.invalid', token: 'fixture-ha-token', locationName: 'Fixture Home',
        entities: [{ id: 'sensor.studio_temperature', name: 'Studio temperature' }, { id: 'light.desk', name: 'Desk light' }, { id: 'lock.front_door', name: 'Front door' }, { id: 'sensor.office_humidity', name: 'Office humidity' }, { id: 'binary_sensor.garage', name: 'Garage' }],
        actions: [{ id: 'scene.focus', name: 'Focus scene', domain: 'scene' }, { id: 'switch.office', name: 'Office switch', domain: 'switch' }, { id: 'scene.evening', name: 'Evening scene', domain: 'scene' }],
      },
      rss: { enabled: true, feeds: ['https://feeds.invalid/aurora.xml', 'https://feeds.invalid/release.xml'], shownCount: 8 },
      crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'solana'] },
    }
    const canonical = (value) => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const scope = async (id, config, runtimeScope) => {
      const eventConfig = id === 'ics'
        ? { ...config, calendars: config.calendars.map(({ color, ...calendar }) => calendar) }
        : config
      const runtime = runtimeScope === undefined ? '' : `\n${canonical(runtimeScope)}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}\n${canonical(eventConfig)}${runtime}`))
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:${id === 'homeassistant' || id === 'ics' ? 'v2' : 'v1'}:${hash}`
    }
    const noon = new Date(`${day}T12:00:00`).getTime()
    const contributionDays = (modulus) => Array.from({ length: contributionDayCount }, (_, index) => {
      const date = new Date(`${day}T12:00:00`)
      date.setDate(date.getDate() - (contributionDayCount - 1) + index)
      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        count: index % modulus,
      }
    })
    const snapshots = {
      ics: { fetchedAt: now, scope: await scope('ics', configs.ics, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), data: { events: [
        { summary: 'Release planning', start: noon + 60 * 60_000, end: noon + 90 * 60_000, allDay: false, cal: 0 },
        { summary: 'Family appointment', start: noon + 3 * 60 * 60_000, end: noon + 4 * 60 * 60_000, allDay: false, cal: 1 },
        { summary: 'Roadmap review', start: noon + 25 * 60 * 60_000, end: noon + 26 * 60 * 60_000, allDay: false, cal: 0 },
      ] } },
      status: { fetchedAt: now, scope: await scope('status', configs.status), data: { services: [{ name: 'GitHub', indicator: 'none', description: 'All systems operational' }, { name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' }] } },
      github: { fetchedAt: now, scope: await scope('github', configs.github), data: { prs: [{ title: 'Ship the information-first Canvas', url: 'https://github.invalid/aurora/pull/7', repo: 'aurora/canvas' }, { title: 'Preserve visual evidence', url: 'https://github.invalid/aurora/pull/8', repo: 'aurora/qa' }], issues: [{ title: 'Verify common displays', url: 'https://github.invalid/aurora/issues/21', repo: 'aurora/qa' }], notifications: 4, contributions: { total: 52, days: contributionDays(5) }, etags: {} } },
      gitlab: { fetchedAt: now, scope: await scope('gitlab', configs.gitlab), data: { mrs: [{ title: 'Review compact layout', url: 'https://gitlab.invalid/aurora/-/merge_requests/1', project: 'aurora/web' }, { title: 'Tighten responsive connector cards', url: 'https://gitlab.invalid/aurora/-/merge_requests/3', project: 'aurora/canvas' }], reviewMrs: [{ title: 'Approve calendar colors', url: 'https://gitlab.invalid/aurora/-/merge_requests/2', project: 'aurora/web' }, { title: 'Verify exact recovery', url: 'https://gitlab.invalid/aurora/-/merge_requests/4', project: 'aurora/storage' }], todos: 3, contributions: { total: 21, days: contributionDays(4) } } },
      jira: { fetchedAt: now, scope: await scope('jira', configs.jira), data: { issues: [{ key: 'AUR-101', summary: 'Prove the connector composition', status: 'In Progress', url: 'https://fixture.atlassian.net/browse/AUR-101' }, { key: 'AUR-102', summary: 'Inspect interaction traces', status: 'To Do', url: 'https://fixture.atlassian.net/browse/AUR-102' }], counts: { 'In Progress': 1, 'To Do': 1 }, dueSoon: [{ key: 'AUR-103', summary: 'Owner capture review', status: 'To Do', due: day, url: 'https://fixture.atlassian.net/browse/AUR-103' }] } },
      vercel: { fetchedAt: now, scope: await scope('vercel', configs.vercel), data: { deployments: [{ project: 'aurora', state: 'READY', url: 'aurora-fixture.vercel.app', createdAt: now }, { project: 'canvas-lab', state: 'ERROR', url: 'canvas-fixture.vercel.app', createdAt: now - 60_000 }, { project: 'connector-preview', state: 'BUILDING', url: 'connectors-fixture.vercel.app', createdAt: now - 120_000 }, { project: 'recovery-check', state: 'READY', url: 'recovery-fixture.vercel.app', createdAt: now - 180_000 }] } },
      homeassistant: { fetchedAt: now, scope: await scope('homeassistant', configs.homeassistant), data: { entities: [{ id: 'sensor.studio_temperature', state: '22.4', unit: '°C', friendlyName: 'Studio temperature', domain: 'sensor' }, { id: 'light.desk', state: 'on', unit: null, friendlyName: 'Desk light', domain: 'light' }, { id: 'lock.front_door', state: 'locked', unit: null, friendlyName: 'Front door', domain: 'lock' }, { id: 'sensor.office_humidity', state: '48', unit: '%', friendlyName: 'Office humidity', domain: 'sensor' }, { id: 'binary_sensor.garage', state: 'closed', unit: null, friendlyName: 'Garage', domain: 'binary_sensor' }] } },
      rss: { fetchedAt: now, scope: await scope('rss', configs.rss), data: Array.from({ length: 8 }, (_, index) => ({ source: index % 2 ? 'Release' : 'Aurora', title: ['Canvas gate opens', 'Calendar colors land', 'Common displays pass', 'Connector sizes stay useful', 'Settings remains bounded', 'Weather stays inside', 'Arrange scales truthfully', 'Recovery stays exact'][index], url: `https://news.invalid/item-${index + 1}`, publishedAt: now - index * 60_000 })) },
      crypto: { fetchedAt: now, scope: await scope('crypto', configs.crypto), data: { coins: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 102400, change24h: 2.4 }, { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3900, change24h: -1.1 }, { id: 'solana', symbol: 'SOL', name: 'Solana', price: 180, change24h: 4.2 }] } },
    }

    const compactY = (pixels) => pixels / 1800 * 100
    const layout = { version: 3, profiles: {
      compact: { mode: 'custom', coordinateHeight: 1800, placements: {
        bookmarks: { kind: 'canvas', x: 50, y: compactY(32), size: 'compact', layer: 1 },
        weather: { kind: 'canvas', x: 70, y: compactY(128), size: 'compact', layer: 2 },
        clock: { kind: 'canvas', x: 50, y: compactY(248), size: 'compact', layer: 3 },
        greeting: { kind: 'canvas', x: 50, y: compactY(340), size: 'compact', layer: 4 },
        search: { kind: 'canvas', x: 50, y: compactY(410), size: 'compact', layer: 5 },
        focus: { kind: 'canvas', x: 50, y: compactY(490), size: 'compact', layer: 6 },
        ics: { kind: 'canvas', x: 50, y: compactY(595), size: 'compact', layer: 7 },
        github: { kind: 'canvas', x: 50, y: compactY(735), size: 'compact', layer: 8 },
        rss: { kind: 'canvas', x: 50, y: compactY(875), size: 'compact', layer: 9 },
        crypto: { kind: 'canvas', x: 50, y: compactY(990), size: 'compact', layer: 10 },
        quote: { kind: 'canvas', x: 50, y: compactY(1090), size: 'compact', layer: 11 },
        monthCal: { kind: 'canvas', x: 50, y: compactY(1220), size: 'compact', layer: 12 },
        timer: { kind: 'bottom-bar', order: 0, size: 'compact' }, tasks: { kind: 'bottom-bar', order: 1, size: 'compact' }, notes: { kind: 'bottom-bar', order: 2, size: 'compact' },
      } },
      standard: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 5, size: 'standard', layer: 1 },
        weather: { kind: 'canvas', x: 15, y: 18, size: 'compact', layer: 2 },
        ics: { kind: 'canvas', x: 15, y: 42, size: 'compact', layer: 3 },
        monthCal: { kind: 'canvas', x: 15, y: 68, size: 'compact', layer: 4 },
        github: { kind: 'canvas', x: 85, y: 20, size: 'compact', layer: 5 },
        rss: { kind: 'canvas', x: 85, y: 43, size: 'compact', layer: 6 },
        crypto: { kind: 'canvas', x: 85, y: 62, size: 'compact', layer: 7 },
        status: { kind: 'canvas', x: 85, y: 78, size: 'compact', layer: 8 },
        clock: { kind: 'canvas', x: 50, y: 27, size: 'full', layer: 9 },
        greeting: { kind: 'canvas', x: 50, y: 48, size: 'compact', layer: 10 },
        search: { kind: 'canvas', x: 50, y: 57, size: 'compact', layer: 11 },
        focus: { kind: 'canvas', x: 50, y: 68, size: 'compact', layer: 12 },
        quote: { kind: 'canvas', x: 50, y: 84, size: 'compact', layer: 13 },
        timer: { kind: 'bottom-bar', order: 0, size: 'compact' }, tasks: { kind: 'bottom-bar', order: 1, size: 'compact' }, notes: { kind: 'bottom-bar', order: 2, size: 'compact' },
      } },
      display: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 4, size: 'standard', layer: 1 }, weather: { kind: 'canvas', x: 94, y: 10, size: 'standard', layer: 2 },
        clock: { kind: 'canvas', x: 50, y: 17, size: 'full', layer: 3 }, greeting: { kind: 'canvas', x: 50, y: 29, size: 'standard', layer: 4 }, search: { kind: 'canvas', x: 50, y: 36, size: 'standard', layer: 5 }, focus: { kind: 'canvas', x: 50, y: 44, size: 'standard', layer: 6 }, quote: { kind: 'canvas', x: 50, y: 54, size: 'standard', layer: 7 },
        ics: { kind: 'canvas', x: 7, y: 35, size: 'standard', layer: 20 }, status: { kind: 'canvas', x: 20, y: 35, size: 'standard', layer: 21 }, github: { kind: 'canvas', x: 33, y: 35, size: 'standard', layer: 22 },
        gitlab: { kind: 'canvas', x: 67, y: 35, size: 'standard', layer: 23 }, jira: { kind: 'canvas', x: 80, y: 35, size: 'standard', layer: 24 }, vercel: { kind: 'canvas', x: 93, y: 35, size: 'standard', layer: 25 },
        homeassistant: { kind: 'canvas', x: 7, y: 72, size: 'standard', layer: 26 }, rss: { kind: 'canvas', x: 20, y: 72, size: 'standard', layer: 27 }, crypto: { kind: 'canvas', x: 33, y: 72, size: 'standard', layer: 28 }, monthCal: { kind: 'canvas', x: 67, y: 72, size: 'standard', layer: 29 },
        timer: { kind: 'bottom-bar', order: 0, size: 'compact' }, tasks: { kind: 'bottom-bar', order: 1, size: 'compact' }, notes: { kind: 'bottom-bar', order: 2, size: 'compact' },
      } },
      ultrawide: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 4, size: 'standard', layer: 1 }, weather: { kind: 'canvas', x: 96, y: 10, size: 'standard', layer: 2 },
        clock: { kind: 'canvas', x: 50, y: 17, size: 'full', layer: 3 }, greeting: { kind: 'canvas', x: 50, y: 30, size: 'standard', layer: 4 }, search: { kind: 'canvas', x: 50, y: 37, size: 'standard', layer: 5 }, focus: { kind: 'canvas', x: 50, y: 44, size: 'standard', layer: 6 }, quote: { kind: 'canvas', x: 50, y: 54, size: 'standard', layer: 7 },
        ics: { kind: 'canvas', x: 7, y: 35, size: 'standard', layer: 20 }, status: { kind: 'canvas', x: 20, y: 35, size: 'standard', layer: 21 }, github: { kind: 'canvas', x: 33, y: 35, size: 'standard', layer: 22 },
        gitlab: { kind: 'canvas', x: 67, y: 35, size: 'standard', layer: 23 }, jira: { kind: 'canvas', x: 80, y: 35, size: 'standard', layer: 24 }, vercel: { kind: 'canvas', x: 93, y: 35, size: 'standard', layer: 25 },
        homeassistant: { kind: 'canvas', x: 7, y: 72, size: 'standard', layer: 26 }, rss: { kind: 'canvas', x: 20, y: 72, size: 'standard', layer: 27 }, crypto: { kind: 'canvas', x: 33, y: 72, size: 'standard', layer: 28 }, monthCal: { kind: 'canvas', x: 67, y: 72, size: 'standard', layer: 29 },
        timer: { kind: 'bottom-bar', order: 0, size: 'compact' }, tasks: { kind: 'bottom-bar', order: 1, size: 'compact' }, notes: { kind: 'bottom-bar', order: 2, size: 'compact' },
      } },
    } }

    await chrome.storage.local.set({
      settings: { ...settings, name: 'Aurora', layoutDensity: 'auto', briefingEnabled: false, widgets },
      focus: { text: 'Make the next tab useful', date: day, done: false },
      links: [{ id: 'roadmap', title: 'Roadmap', url: 'https://example.invalid/roadmap' }, { id: 'design', title: 'Design', url: 'https://example.invalid/design' }],
      todoLists: [{ id: 'today', name: 'Today', items: [{ id: 'qa', text: 'Inspect the common displays', done: false }, { id: 'notes', text: 'Review owner evidence', done: false }] }],
      notes: { text: 'Production readiness\n\nInformation first, with exact recovery.', updatedAt: now },
      timerConfig: { workMinutes: 25, breakMinutes: 5 },
      location: weatherFixture?.location ?? location,
      weatherCache: weatherFixture?.weatherCache ?? {
        current: { tempC: 28, feelsLikeC: 29, code: 0, windKmh: 11, humidity: 53, isDay: true },
        hourly: Array.from({ length: 12 }, (_, index) => ({ time: `${day}T${String(13 + index).padStart(2, '0')}:00`, tempC: 28 - Math.floor(index / 3), precipProb: index * 3, code: index > 6 ? 2 : 0, isDay: index < 7 })),
        fetchedAt: now,
        locationLabel: location.label,
        requestIdentity: `open-meteo:v1:${weatherUrl(location.lat, location.lon)}`,
        sunriseISO: `${day}T07:02`, sunsetISO: `${day}T20:23`,
        environment: {
          requestIdentity: `open-meteo-air:v1:${environmentUrl(location.lat, location.lon)}`,
          fetchedAt: now,
          status: 'available',
          usAqi: 42,
          uvIndex: 3.2,
          pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 2 }] },
        },
      },
      connectors: configs,
      connectorSnapshots: snapshots,
      layout,
      informationFirstFixture: { configs, snapshots, layout, widgets },
      photoPrefs: { mode: 'auto', index: 10, lastRotated: day },
    })

    if (chrome.bookmarks) {
      const tree = await chrome.bookmarks.getTree()
      const bar = tree[0]?.children?.find((node) => node.id === '1') ?? tree[0]?.children?.[0]
      if (bar) {
        const named = await chrome.bookmarks.create({ parentId: bar.id, title: 'Aurora' })
        await chrome.bookmarks.create({ parentId: named.id, title: 'Roadmap', url: 'https://example.invalid/roadmap' })
        await chrome.bookmarks.create({ parentId: bar.id, title: 'Reference', url: 'https://example.invalid/reference' })
        await chrome.bookmarks.create({ parentId: bar.id, title: '   ' })
      }
    }
  }, { day, weatherFixture, contributionDayCount })
}

export async function restoreInformationFirstFixtures(page) {
  await page.evaluate(async () => {
    const { informationFirstFixture, settings } = await chrome.storage.local.get(['informationFirstFixture', 'settings'])
    await chrome.storage.local.set({
      settings: { ...settings, widgets: informationFirstFixture.widgets },
      connectors: informationFirstFixture.configs,
      connectorSnapshots: informationFirstFixture.snapshots,
      layout: informationFirstFixture.layout,
    })
  })
}

export async function applyConnectorSizeFixture(page, connectorId, size) {
  await page.evaluate(async ({ connectorId, size }) => {
    const { informationFirstFixture, settings } = await chrome.storage.local.get(['informationFirstFixture', 'settings'])
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    const connectors = Object.fromEntries(Object.entries(informationFirstFixture.configs).map(([id, config]) => [
      id, { ...config, enabled: id === connectorId },
    ]))
    const placements = {
      clock: { kind: 'canvas', x: 18, y: 15, size: 'compact', layer: 1 },
      greeting: { kind: 'canvas', x: 50, y: 12, size: 'compact', layer: 2 },
      focus: { kind: 'canvas', x: 82, y: 15, size: 'compact', layer: 3 },
      [connectorId]: { kind: 'canvas', x: 50, y: 54, size, layer: 10 },
    }
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      connectors,
      connectorSnapshots: informationFirstFixture.snapshots,
      layout: { version: 3, profiles: { standard: { mode: 'custom', placements } } },
    })
  }, { connectorId, size })
}
