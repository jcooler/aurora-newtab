const HERO_CONNECTORS = new Set(['github', 'jira'])
const CALENDAR_CONNECTORS = new Set(['ics', 'rss', 'status'])

export async function seedStoreShotHero(page) {
  await page.evaluate(async ({ heroConnectorIds }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['search', 'weather', 'todo', 'timer', 'bookmarks', 'notes', 'monthCal']) widgets[key] = true

    const now = Date.now()
    const local = new Date()
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    const noon = new Date(`${day}T12:00:00`).getTime()
    const location = { lat: 33.749, lon: -84.388, label: 'Atlanta', manual: true }

    const normalize = (value, minimum, maximum) => {
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error('invalid weather coordinate')
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
      params.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day')
      params.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
      params.set('daily', 'sunrise,sunset')
      params.set('latitude', String(normalize(lat, -90, 90)))
      params.set('longitude', String(normalize(lon, -180, 180)))
      return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    }

    const configs = {
      ics: {
        enabled: true,
        calendars: [
          { name: 'Studio', url: 'https://calendar.invalid/studio.ics', color: 'emerald' },
          { name: 'Family', url: 'https://calendar.invalid/family.ics' },
        ],
        view: 'upcoming', upcomingCount: 3, meetLinks: true,
      },
      status: { enabled: true, services: [{ name: 'GitHub', url: 'https://status.invalid/github.json' }, { name: 'Vercel', url: 'https://status.invalid/vercel.json' }] },
      github: { enabled: true, token: 'fixture-github-token', username: 'fixture-aurora', views: { commitGraph: true, pulls: true, issues: true, notifications: true } },
      gitlab: { enabled: true, token: 'fixture-gitlab-token', instanceUrl: 'https://gitlab.invalid', username: 'fixture-aurora', views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true } },
      jira: { enabled: true, email: 'fixture@example.invalid', apiToken: 'fixture-jira-token', site: 'jira.invalid', displayName: 'Aurora', views: { assigned: true, dueSoon: true, statusChips: true } },
      vercel: { enabled: true, token: 'fixture-vercel-token', username: 'fixture-aurora', views: { deployments: true, statusSummary: true } },
      homeassistant: {
        enabled: true, instanceUrl: 'https://home.invalid', token: 'fixture-ha-token', locationName: 'Fixture Home',
        entities: [{ id: 'sensor.studio_temperature', name: 'Studio temperature' }, { id: 'light.desk', name: 'Desk light' }],
        actions: [{ id: 'scene.focus', name: 'Focus scene', domain: 'scene' }],
      },
      rss: { enabled: true, feeds: ['https://feeds.invalid/aurora.xml'], shownCount: 5 },
      crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'solana'] },
    }

    const canonical = (value) => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const scope = async (id, config, runtimeScope) => {
      const eventConfig = id === 'ics' && Array.isArray(config.calendars)
        ? { ...config, calendars: config.calendars.map(({ color, ...calendar }) => calendar) }
        : config
      const runtime = runtimeScope === undefined ? '' : `\n${canonical(runtimeScope)}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}\n${canonical(eventConfig)}${runtime}`))
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:${id === 'homeassistant' || id === 'ics' ? 'v2' : 'v1'}:${hash}`
    }
    const contributionDays = (modulus) => Array.from({ length: 28 }, (_, index) => {
      const date = new Date(`${day}T12:00:00`)
      date.setDate(date.getDate() - 27 + index)
      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        count: index % modulus,
      }
    })

    const snapshots = {
      ics: { fetchedAt: now, scope: await scope('ics', configs.ics, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), data: { events: [
        { summary: 'Release planning', start: noon + 60 * 60_000, end: noon + 90 * 60_000, allDay: false, cal: 0 },
        { summary: 'Family dinner', start: noon + 6 * 60 * 60_000, end: noon + 7 * 60 * 60_000, allDay: false, cal: 1 },
        { summary: 'Design review', start: noon + 25 * 60 * 60_000, end: noon + 26 * 60 * 60_000, allDay: false, cal: 0 },
      ] } },
      status: { fetchedAt: now, scope: await scope('status', configs.status), data: { services: [{ name: 'GitHub', indicator: 'none', description: 'All systems operational' }, { name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' }] } },
      github: { fetchedAt: now, scope: await scope('github', configs.github), data: { prs: [{ title: 'Ship Aurora 2.0', url: 'https://github.invalid/aurora/pull/20', repo: 'aurora/newtab' }, { title: 'Review release screenshots', url: 'https://github.invalid/aurora/pull/21', repo: 'aurora/newtab' }], issues: [{ title: 'Prepare the release dossier', url: 'https://github.invalid/aurora/issues/22', repo: 'aurora/release' }], notifications: 4, contributions: { total: 42, days: contributionDays(5) }, etags: {} } },
      gitlab: { fetchedAt: now, scope: await scope('gitlab', configs.gitlab), data: { mrs: [{ title: 'Review compact layout', url: 'https://gitlab.invalid/aurora/-/merge_requests/1', project: 'aurora/web' }], reviewMrs: [{ title: 'Approve calendar colors', url: 'https://gitlab.invalid/aurora/-/merge_requests/2', project: 'aurora/web' }], todos: 3, contributions: { total: 18, days: contributionDays(4) } } },
      jira: { fetchedAt: now, scope: await scope('jira', configs.jira), data: { issues: [{ key: 'AUR-200', summary: 'Package the release candidate', status: 'In Progress', url: 'https://jira.invalid/browse/AUR-200' }, { key: 'AUR-201', summary: 'Inspect Store captures', status: 'To Do', url: 'https://jira.invalid/browse/AUR-201' }], counts: { 'In Progress': 1, 'To Do': 1 }, dueSoon: [{ key: 'AUR-202', summary: 'Review submission copy', status: 'To Do', due: day, url: 'https://jira.invalid/browse/AUR-202' }] } },
      vercel: { fetchedAt: now, scope: await scope('vercel', configs.vercel), data: { deployments: [{ project: 'aurora', state: 'READY', url: 'aurora-fixture.vercel.app', createdAt: now }] } },
      homeassistant: { fetchedAt: now, scope: await scope('homeassistant', configs.homeassistant), data: { entities: [{ id: 'sensor.studio_temperature', state: '22.4', unit: '°C', friendlyName: 'Studio temperature', domain: 'sensor' }, { id: 'light.desk', state: 'on', unit: null, friendlyName: 'Desk light', domain: 'light' }] } },
      rss: { fetchedAt: now, scope: await scope('rss', configs.rss), data: [{ source: 'Aurora', title: 'Canvas release candidate ready', url: 'https://news.invalid/aurora-release', publishedAt: now }, { source: 'Design', title: 'Calendar colors follow their sources', url: 'https://news.invalid/calendar-colors', publishedAt: now - 60_000 }] },
      crypto: { fetchedAt: now, scope: await scope('crypto', configs.crypto), data: { coins: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 102400, change24h: 2.4 }, { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3900, change24h: -1.1 }, { id: 'solana', symbol: 'SOL', name: 'Solana', price: 180, change24h: 4.2 }] } },
    }

    const heroConnectors = new Set(heroConnectorIds)
    await chrome.storage.local.set({
      settings: { ...settings, name: 'Alex', briefingEnabled: false, widgets },
      focus: { text: 'Ship Aurora 2.0', date: day, done: false },
      links: [
        { id: 'roadmap', title: 'Roadmap', url: 'https://example.invalid/roadmap' },
        { id: 'design', title: 'Design', url: 'https://example.invalid/design' },
        { id: 'release', title: 'Release notes', url: 'https://example.invalid/releases' },
      ],
      todoLists: [{ id: 'today', name: 'Today', items: [{ id: 'qa', text: 'Inspect Store captures', done: false }, { id: 'package', text: 'Audit the release package', done: true }] }],
      notes: { text: 'Aurora 2.0\n\nPhoto-first Canvas, direct arrangement, and rich connectors.', updatedAt: now },
      timerConfig: { workMinutes: 25, breakMinutes: 5 },
      location,
      weatherCache: {
        current: { tempC: 24, feelsLikeC: 24, code: 1, windKmh: 8, humidity: 48, isDay: true },
        hourly: [{ time: `${day}T13:00`, tempC: 24, precipProb: 10, code: 1, isDay: true }],
        fetchedAt: now,
        locationLabel: location.label,
        requestIdentity: `open-meteo:v1:${weatherUrl(location.lat, location.lon)}`,
        sunriseISO: `${day}T06:11`,
        sunsetISO: `${day}T19:52`,
      },
      connectors: Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, { ...config, enabled: heroConnectors.has(id) }])),
      connectorSnapshots: snapshots,
      photoPrefs: { mode: 'auto', index: 3, lastRotated: day },
      layout: { version: 3, profiles: {
        standard: { mode: 'custom', placements: {
          bookmarks: { kind: 'canvas', x: 50, y: 7, size: 'standard', layer: 1 },
          clock: { kind: 'canvas', x: 50, y: 27.5, size: 'full', layer: 2 },
          focus: { kind: 'canvas', x: 50, y: 49.25, size: 'standard', layer: 3 },
          search: { kind: 'canvas', x: 50, y: 60, size: 'standard', layer: 4 },
          greeting: { kind: 'canvas', x: 50, y: 70, size: 'standard', layer: 5 },
          weather: { kind: 'canvas', x: 10, y: 35, size: 'compact', layer: 6 },
          monthCal: { kind: 'canvas', x: 12, y: 73, size: 'compact', layer: 7 },
          timer: { kind: 'canvas', x: 94, y: 14, size: 'compact', layer: 8 },
          tasks: { kind: 'canvas', x: 94, y: 22, size: 'compact', layer: 9 },
          notes: { kind: 'canvas', x: 94, y: 30, size: 'compact', layer: 10 },
          github: { kind: 'canvas', x: 85, y: 48, size: 'standard', layer: 11 },
          jira: { kind: 'canvas', x: 85, y: 78, size: 'standard', layer: 12 },
        } },
      } },
    })

    const tree = await chrome.bookmarks.getTree()
    const bar = tree[0]?.children?.find((node) => node.id === '1') ?? tree[0]?.children?.[0]
    if (bar) {
      const aurora = await chrome.bookmarks.create({ parentId: bar.id, title: 'Aurora' })
      await chrome.bookmarks.create({ parentId: aurora.id, title: 'Roadmap', url: 'https://example.invalid/roadmap' })
      await chrome.bookmarks.create({ parentId: aurora.id, title: 'Release notes', url: 'https://example.invalid/releases' })
      const design = await chrome.bookmarks.create({ parentId: bar.id, title: 'Design' })
      await chrome.bookmarks.create({ parentId: design.id, title: 'Canvas specification', url: 'https://example.invalid/canvas' })
      await chrome.bookmarks.create({ parentId: bar.id, title: 'Docs', url: 'https://example.invalid/docs' })
    }
  }, { heroConnectorIds: [...HERO_CONNECTORS] })
}

export async function seedStoreShotArrange(page) {
  await page.evaluate(async () => {
    const { settings, connectors, layout } = await chrome.storage.local.get(['settings', 'connectors', 'layout'])
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['search', 'todo', 'timer', 'bookmarks', 'notes']) widgets[key] = true
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      connectors: Object.fromEntries(Object.entries(connectors).map(([id, config]) => [id, { ...config, enabled: false }])),
      layout: { ...layout, profiles: { ...layout.profiles, standard: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 8, size: 'standard', layer: 1 },
        clock: { kind: 'canvas', x: 50, y: 30, size: 'standard', layer: 2 },
        focus: { kind: 'canvas', x: 50, y: 52, size: 'standard', layer: 3 },
        search: { kind: 'canvas', x: 50, y: 64, size: 'standard', layer: 4 },
        greeting: { kind: 'canvas', x: 50, y: 76, size: 'standard', layer: 5 },
        timer: { kind: 'canvas', x: 92, y: 20, size: 'compact', layer: 6 },
        tasks: { kind: 'canvas', x: 92, y: 30, size: 'compact', layer: 7 },
        notes: { kind: 'canvas', x: 92, y: 40, size: 'compact', layer: 8 },
      } } } },
    })
  })
}

export async function seedStoreShotCalendar(page) {
  await page.evaluate(async ({ calendarConnectorIds }) => {
    const { settings, connectors, layout } = await chrome.storage.local.get(['settings', 'connectors', 'layout'])
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['weather', 'todo', 'timer', 'bookmarks', 'notes', 'monthCal']) widgets[key] = true
    const enabled = new Set(calendarConnectorIds)
    if (!connectors) throw new Error('hero connector fixture missing')
    const nextConnectors = Object.fromEntries(Object.entries(connectors).map(([id, config]) => [id, { ...config, enabled: enabled.has(id) }]))
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      connectors: nextConnectors,
      layout: { ...layout, profiles: { ...layout.profiles, standard: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 7, size: 'standard', layer: 1 },
        clock: { kind: 'canvas', x: 50, y: 23.6, size: 'standard', layer: 2 },
        focus: { kind: 'canvas', x: 50, y: 41.6, size: 'standard', layer: 3 },
        greeting: { kind: 'canvas', x: 50, y: 95, size: 'standard', layer: 4 },
        weather: { kind: 'canvas', x: 10, y: 20, size: 'compact', layer: 5 },
        timer: { kind: 'canvas', x: 94, y: 14, size: 'compact', layer: 6 },
        tasks: { kind: 'canvas', x: 94, y: 22, size: 'compact', layer: 7 },
        notes: { kind: 'canvas', x: 94, y: 30, size: 'compact', layer: 8 },
        status: { kind: 'canvas', x: 88, y: 46, size: 'compact', layer: 9 },
        ics: { kind: 'canvas', x: 23, y: 72, size: 'full', layer: 10 },
        monthCal: { kind: 'canvas', x: 67, y: 70, size: 'standard', layer: 11 },
        rss: { kind: 'canvas', x: 89, y: 90, size: 'compact', layer: 12 },
      } } } },
    })
  }, { calendarConnectorIds: [...CALENDAR_CONNECTORS] })
}

export async function seedStoreShotTools(page) {
  await page.evaluate(async () => {
    const { settings, connectors, layout } = await chrome.storage.local.get(['settings', 'connectors', 'layout'])
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['weather', 'todo', 'timer', 'bookmarks', 'notes', 'monthCal']) widgets[key] = true
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      connectors: Object.fromEntries(Object.entries(connectors).map(([id, config]) => [id, { ...config, enabled: false }])),
      layout: { ...layout, profiles: { ...layout.profiles, standard: { mode: 'custom', placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 7, size: 'standard', layer: 1 },
        clock: { kind: 'canvas', x: 50, y: 27, size: 'standard', layer: 2 },
        focus: { kind: 'canvas', x: 50, y: 47, size: 'standard', layer: 3 },
        greeting: { kind: 'canvas', x: 50, y: 95, size: 'standard', layer: 4 },
        weather: { kind: 'canvas', x: 10, y: 20, size: 'compact', layer: 5 },
        monthCal: { kind: 'canvas', x: 16, y: 75, size: 'compact', layer: 6 },
        timer: { kind: 'canvas', x: 94, y: 14, size: 'compact', layer: 7 },
        tasks: { kind: 'canvas', x: 94, y: 24, size: 'compact', layer: 8 },
        notes: { kind: 'canvas', x: 94, y: 72, size: 'compact', layer: 9 },
      } } } },
    })
  })
}
