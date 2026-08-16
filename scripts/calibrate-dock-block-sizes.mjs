// Focused source-measurement utility for the W3-P2 Dock block-size bridge.
// Requires a fresh `npm run build:preview`; it never contacts providers.
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-dock-calibration')
rmSync(profileDir, { recursive: true, force: true })

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

await context.addInitScript(() => {
  if (!globalThis.chrome?.storage?.local) return
  const canonical = (value) => {
    if (value === null) return 'null'
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  const scopeFor = async (id, config) => {
    const runtimeScope = id === 'ics' ? { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined
    const identity = runtimeScope === undefined
      ? `${id}\n${canonical(config)}`
      : `${id}\n${canonical(config)}\n${canonical(runtimeScope)}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${id}:${id === 'homeassistant' || id === 'ics' ? 'v2' : 'v1'}:${hex}`
  }
  globalThis.__setCalibratedStorage = async (patch) => {
    const snapshots = { ...(patch.connectorSnapshots ?? {}) }
    await Promise.all(Object.entries(snapshots).map(async ([id, snapshot]) => {
      if (patch.connectors[id]) snapshots[id] = { ...snapshot, scope: await scopeFor(id, patch.connectors[id]) }
    }))
    await chrome.storage.local.set({ ...patch, connectorSnapshots: snapshots })
  }
})

const allSchemaVariants = ['compact', 'standard', 'expanded']
const variantsById = Object.fromEntries([
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'quote', 'weather', 'timer', 'tasks', 'notes',
  'bookmarks', 'rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'habits', 'monthCal', 'sun', 'moon', 'status', 'homeassistant',
].map((id) => [id, allSchemaVariants]))
const widgetKeyById = {
  worldClocks: 'clocks', countdown: 'countdown', search: 'search', links: 'links', quote: 'quote', weather: 'weather',
  timer: 'timer', tasks: 'todo', notes: 'notes', bookmarks: 'bookmarks', habits: 'habits', monthCal: 'monthCal', sun: 'sun', moon: 'moon',
}
const connectorIds = ['rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'status', 'homeassistant']
const now = Date.now()
const configs = {
  rss: { enabled: true, feeds: ['https://feeds.example.test/main.xml'], shownCount: 8 },
  github: { enabled: true, token: 'fixture', username: 'aurora', views: { commitGraph: true, pulls: true, issues: true, notifications: true } },
  gitlab: { enabled: true, token: 'fixture', instanceUrl: 'https://gitlab.example.test', username: 'aurora', views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true } },
  jira: { enabled: true, email: 'aurora@example.test', apiToken: 'fixture', site: 'jira.example.test', displayName: 'Aurora', views: { assigned: true, statusChips: true, dueSoon: true } },
  vercel: { enabled: true, token: 'fixture', username: 'aurora', views: { deployments: true, statusSummary: true } },
  crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'dogecoin', 'solana', 'cardano'] },
  ics: { enabled: true, calendars: [{ name: 'Personal', url: 'https://calendar.example.test/private.ics' }], view: 'upcoming', upcomingCount: 4, meetLinks: true },
  status: { enabled: true, services: Array.from({ length: 5 }, (_, index) => ({ name: `Service ${index + 1}`, url: `https://status${index + 1}.example.test/status.json` })) },
  homeassistant: {
    enabled: true, instanceUrl: 'https://ha.example.test', token: 'fixture',
    entities: Array.from({ length: 6 }, (_, index) => ({ id: `sensor.room_${index}`, name: `Room ${index + 1}` })),
    actions: Array.from({ length: 6 }, (_, index) => ({ id: `scene.mode_${index}`, name: `Mode ${index + 1}`, domain: 'scene' })),
  },
}
const row = (prefix, index) => ({ title: `${prefix} ${index + 1} with a long representative title`, url: `https://example.test/${prefix}/${index + 1}`, repo: 'aurora/example', project: 'aurora/example' })
const contributionDays = Array.from({ length: 91 }, (_, index) => ({ date: new Date(now - (90 - index) * 86_400_000).toISOString().slice(0, 10), count: index % 5 }))
const snapshots = {
  rss: { fetchedAt: now, data: Array.from({ length: 8 }, (_, index) => ({ source: `Feed ${index + 1}`, title: `Headline ${index + 1} with representative content`, url: `https://news.example.test/${index + 1}`, publishedAt: now - index })) },
  github: { fetchedAt: now, data: { prs: Array.from({ length: 3 }, (_, index) => row('PR', index)), issues: Array.from({ length: 3 }, (_, index) => row('Issue', index)), notifications: 50, contributions: { total: 246, days: contributionDays }, etags: {} } },
  gitlab: { fetchedAt: now, data: { mrs: Array.from({ length: 4 }, (_, index) => row('MR', index)), reviewMrs: Array.from({ length: 3 }, (_, index) => row('Review', index)), todos: 20, contributions: { total: 246, days: contributionDays } } },
  jira: { fetchedAt: now, data: { issues: Array.from({ length: 4 }, (_, index) => ({ key: `AUR-${index + 1}`, summary: `Assigned issue ${index + 1} with representative content`, status: index % 2 ? 'To Do' : 'In Progress', url: `https://jira.example.test/browse/AUR-${index + 1}` })), counts: { 'In Progress': 7, 'To Do': 5 }, dueSoon: Array.from({ length: 3 }, (_, index) => ({ key: `DUE-${index + 1}`, summary: `Due issue ${index + 1}`, due: new Date(now + index * 86_400_000).toISOString().slice(0, 10), url: `https://jira.example.test/browse/DUE-${index + 1}` })) } },
  vercel: { fetchedAt: now, data: { deployments: Array.from({ length: 5 }, (_, index) => ({ project: `project-${index + 1}`, state: index === 0 ? 'ERROR' : index === 1 ? 'BUILDING' : 'READY', url: `https://vercel.example.test/${index + 1}`, createdAt: now - index * 60_000 })) } },
  crypto: { fetchedAt: now, data: { coins: configs.crypto.coins.map((id, index) => ({
    id,
    symbol: ['btc', 'eth', 'doge', 'sol', 'ada'][index],
    name: id,
    price: [67_412, 3_245, 0.1234, 178.5, 0.42][index],
    change24h: [2.4, -1.2, 0, 4.1, -0.6][index],
  })) } },
  ics: { fetchedAt: now, data: { events: Array.from({ length: 4 }, (_, index) => ({ summary: `Calendar event ${index + 1} with representative content`, start: now + (index + 1) * 3_600_000, end: now + (index + 2) * 3_600_000, cal: 0, allDay: false, meetUrl: `https://meet.example.test/${index + 1}` })) } },
  status: { fetchedAt: now, data: { services: configs.status.services.map((service, index) => ({ name: service.name, indicator: index === 0 ? 'major' : 'none', description: index === 0 ? 'Major outage' : 'All Systems Operational' })) } },
  homeassistant: { fetchedAt: now, data: { entities: configs.homeassistant.entities.map((entity, index) => ({ id: entity.id, state: String(20 + index), unit: '°C', friendlyName: entity.name, domain: 'sensor' })) } },
}
const auxiliary = {
  links: Array.from({ length: 8 }, (_, index) => ({ id: `link-${index}`, title: `Link ${index + 1}`, url: `https://links.example.test/${index + 1}` })),
  habits: Array.from({ length: 6 }, (_, index) => ({ id: `habit-${index}`, name: `Habit ${index + 1}`, createdAt: now - index, log: [] })),
  worldClocks: Array.from({ length: 6 }, (_, index) => ({ id: `clock-${index}`, label: `City ${index + 1}`, timeZone: 'UTC' })),
  countdowns: Array.from({ length: 5 }, (_, index) => ({ id: `countdown-${index}`, name: `Event ${index + 1}`, date: new Date(now + (index + 2) * 86_400_000).toISOString().slice(0, 10) })),
}

const page = await context.newPage()
await page.goto('chrome://newtab/')
await page.waitForSelector('main[data-adaptive-stage]')
const defaults = await page.evaluate(() => chrome.storage.local.get(['settings']))
const results = []
if (process.env.AURORA_SKIP_DOCK_CALIBRATION !== '1') {
for (const [id, variants] of Object.entries(variantsById)) {
  for (const variant of variants) {
    for (const density of ['compact', 'balanced', 'spacious']) {
      const widgets = Object.fromEntries(Object.keys(defaults.settings.widgets).map((key) => [key, false]))
      if (widgetKeyById[id]) widgets[widgetKeyById[id]] = true
      const connectors = Object.fromEntries(connectorIds.map((connectorId) => [connectorId, {
        ...configs[connectorId], enabled: connectorId === id,
      }]))
      await page.evaluate(async ({ settings, widgets, connectors, snapshots, auxiliary, id, variant, density }) => {
        await globalThis.__setCalibratedStorage({
          settings: { ...settings, widgets, layoutDensity: density },
          connectors,
          connectorSnapshots: snapshots,
          ...auxiliary,
          location: { lat: 40.7128, lon: -74.006, label: 'New York', manual: true },
          layout: { version: 2, profiles: { standard: { [id]: {
            zone: 'dock', order: 0, colSpan: variant === 'compact' ? 1 : variant === 'standard' ? 2 : 3,
            rowSpan: 1, variant, priority: 'pinned', locked: true,
          } } } },
        })
      }, { settings: defaults.settings, widgets, connectors, snapshots, auxiliary, id, variant, density })
      try {
        await page.waitForFunction(({ id, variant, density }) => {
          const item = document.querySelector(`[data-block-id="${id}"][data-stage-zone="dock"]`)
          return document.documentElement.dataset.stageDensity === density && item?.getAttribute('data-stage-variant') === variant
        }, { id, variant, density }, { timeout: 5_000 })
      } catch (error) {
        const state = await page.evaluate((id) => ({
          density: document.documentElement.dataset.stageDensity,
          target: document.querySelector(`[data-block-id="${id}"]`)?.outerHTML.slice(0, 500) ?? null,
          layout: document.querySelector('main[data-adaptive-stage]')?.outerHTML.slice(0, 500) ?? null,
        }), id)
        throw new Error(`Calibration did not settle for ${id}/${variant}/${density}: ${JSON.stringify(state)}`, { cause: error })
      }
      await page.waitForTimeout(25)
      results.push(await page.evaluate(({ id, variant, density }) => {
        const item = document.querySelector(`[data-block-id="${id}"][data-stage-zone="dock"]`)
        const dock = document.querySelector('[data-stage-zone-container="dock"]')
        const child = item?.firstElementChild
        const rect = (node) => {
          const value = node.getBoundingClientRect()
          return { width: value.width, height: value.height, top: value.top, bottom: value.bottom }
        }
        return {
          id, variant, density,
          item: rect(item), child: child ? rect(child) : null, dock: rect(dock),
          itemScrollHeight: item.scrollHeight, dockScrollHeight: dock.scrollHeight,
        }
      }, { id, variant, density }))
    }
  }
}
const summary = Object.fromEntries(Object.keys(variantsById).map((id) => [id, Object.fromEntries(
  allSchemaVariants.map((variant) => [variant, Object.fromEntries(
    ['compact', 'balanced', 'spacious'].map((density) => {
      const value = results.find((result) => result.id === id && result.variant === variant && result.density === density)
      return [density, { dock: value.dock.height, item: value.item.height, child: value.child?.height ?? 0, scroll: value.dockScrollHeight }]
    }),
  )]),
)]))
console.log(`DOCK_BLOCK_SIZE_CALIBRATION=${JSON.stringify(summary)}`)
}

const settingsFor = (activeIds, density) => {
  const widgets = Object.fromEntries(Object.keys(defaults.settings.widgets).map((key) => [key, false]))
  for (const id of activeIds) if (widgetKeyById[id]) widgets[widgetKeyById[id]] = true
  return { ...defaults.settings, widgets, layoutDensity: density }
}
const connectorsFor = (activeIds) => Object.fromEntries(connectorIds.map((id) => [id, {
  ...configs[id], enabled: activeIds.includes(id),
}]))
const applyCase = async ({ activeIds, density, overrides }) => {
  const settings = settingsFor(activeIds, density)
  const connectors = connectorsFor(activeIds)
  await page.evaluate(async ({ settings, connectors, snapshots, auxiliary, overrides }) => {
    await globalThis.__setCalibratedStorage({
      settings, connectors, connectorSnapshots: snapshots, ...auxiliary,
      location: { lat: 40.7128, lon: -74.006, label: 'New York', manual: true },
      layout: { version: 2, profiles: { standard: overrides } },
    })
  }, { settings, connectors, snapshots, auxiliary, overrides })
  // A profile or density can retain the same root markers across successive
  // cases. Reload at the storage commit boundary so a same-marker case cannot
  // accidentally measure the predecessor's allocation while React processes
  // the native storage event.
  await page.reload()
  await page.waitForFunction(({ density, ids }) => (density === 'auto' || document.documentElement.dataset.stageDensity === density) &&
    ids.every((id) => document.querySelector(`[data-block-id="${id}"]`)), { density, ids: activeIds })
  await page.waitForTimeout(50)
}
const pinned = (id, order, variant, zone = 'dock') => [id, {
  zone, order, colSpan: zone === 'dock' ? (variant === 'compact' ? 1 : variant === 'standard' ? 2 : 3) : 1,
  rowSpan: 1, variant, priority: 'pinned', locked: true,
}]

// Exact I2 no-fit witness: the preserved Month renderer stays expanded and
// reachable below the finite Board in the Stage-owned vertical scrollport.
const nowIds = ['clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'habits', 'bookmarks', 'crypto']
const i2Ids = [...nowIds, 'monthCal']
await applyCase({
  activeIds: i2Ids,
  density: 'auto',
  overrides: Object.fromEntries([
    ...nowIds.map((id, order) => pinned(id, order, 'compact', 'now')),
    pinned('monthCal', 99, 'expanded'),
  ]),
})
await page.setViewportSize({ width: 1200, height: 700 })
await page.waitForFunction(() => document.documentElement.dataset.stageDensity === 'compact' &&
  document.querySelector('main[data-adaptive-stage]')?.getAttribute('data-stage-viewport-overflow') === 'true')
const i2 = await page.evaluate(() => {
  const stage = document.querySelector('main[data-adaptive-stage]')
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const month = document.querySelector('[data-block-id="monthCal"]')
  const boardZones = [...document.querySelectorAll('[data-stage-zone-container]:not([data-stage-zone-container="dock"])')]
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
  }
  const dockRect = rect(dock)
  const boardRects = boardZones.map((node) => ({ zone: node.getAttribute('data-stage-zone-container'), ...rect(node) }))
  const boardPaintBottom = Math.max(...boardZones.flatMap((zone) => [...zone.querySelectorAll('*')]
    .filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
    .map((node) => node.getBoundingClientRect().bottom)))
  const before = stage.scrollTop
  stage.scrollTop = stage.scrollHeight
  return {
    density: document.documentElement.dataset.stageDensity,
    marker: stage.getAttribute('data-stage-viewport-overflow'),
    geometryFits: stage.getAttribute('data-stage-geometry-fits'),
    attempts: stage.getAttribute('data-stage-density-attempts'),
    dockBlockSize: getComputedStyle(dock).getPropertyValue('--stage-dock-block-size').trim(),
    monthVariant: month.getAttribute('data-stage-variant'),
    monthZone: month.getAttribute('data-stage-zone'),
    dockRect, boardRects, boardPaintBottom,
    noBoardDockIntersection: boardRects.every((row) => row.bottom <= dockRect.top + 0.5) && boardPaintBottom <= dockRect.top + 0.5,
    stage: { overflowY: getComputedStyle(stage).overflowY, clientHeight: stage.clientHeight, scrollHeight: stage.scrollHeight, before, after: stage.scrollTop },
    pageOwned: document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1,
  }
})
const i2KeyboardPrep = await page.evaluate(() => {
  const stage = document.querySelector('main[data-adaptive-stage]')
  const month = document.querySelector('[data-block-id="monthCal"]')
  const controls = [...document.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
  const monthIndex = controls.findIndex((node) => month.contains(node))
  const previous = monthIndex > 0 ? controls[monthIndex - 1] : null
  stage.scrollTop = 0
  previous?.focus({ preventScroll: true })
  return { monthIndex, previousFocused: document.activeElement === previous }
})
if (i2KeyboardPrep.previousFocused) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(50)
}
i2.keyboard = await page.evaluate((prep) => {
  const stage = document.querySelector('main[data-adaptive-stage]')
  const month = document.querySelector('[data-block-id="monthCal"]')
  const active = document.activeElement
  const rect = active?.getBoundingClientRect()
  const stageRect = stage.getBoundingClientRect()
  return {
    ...prep,
    reachedMonth: month?.contains(active) ?? false,
    activeLabel: active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? null,
    stageScrollTop: stage.scrollTop,
    fullyVisible: rect != null && rect.top >= stageRect.top - 1 && rect.bottom <= stageRect.bottom + 1,
    pageScrollTop: document.scrollingElement?.scrollTop ?? -1,
    pageOwned: document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1,
  }
}, i2KeyboardPrep)

// Populated C2/C3 witnesses at both condensation variants.
const populatedIds = ['ics', 'github', 'gitlab', 'jira', 'homeassistant', 'crypto']
const dockGeometry = []
for (const variant of ['compact', 'standard']) {
  await page.setViewportSize({ width: 1600, height: 900 })
  await applyCase({
    activeIds: populatedIds,
    density: 'compact',
    overrides: Object.fromEntries(populatedIds.map((id, order) => pinned(id, order, variant))),
  })
  dockGeometry.push(await page.evaluate(({ ids, variant }) => {
    const dock = document.querySelector('[data-stage-zone-container="dock"]')
    const dockRect = dock.getBoundingClientRect()
    const rows = ids.map((id) => {
      const item = document.querySelector(`[data-block-id="${id}"]`)
      const itemRect = item.getBoundingClientRect()
      const visible = [item, ...item.querySelectorAll('*')].filter((node) => {
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0.5 && rect.height > 0.5
      })
      const paintRects = visible.flatMap((node) => {
        const rects = [node.getBoundingClientRect()]
        if (id !== 'crypto') return rects
        for (const child of node.childNodes) {
          if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
          const range = document.createRange()
          range.selectNodeContents(child)
          rects.push(...range.getClientRects())
        }
        return rects
      })
      const paint = {
        left: Math.min(...paintRects.map((value) => value.left)), right: Math.max(...paintRects.map((value) => value.right)),
        top: Math.min(...paintRects.map((value) => value.top)), bottom: Math.max(...paintRects.map((value) => value.bottom)),
      }
      return {
        id, rect: { left: itemRect.left, right: itemRect.right, top: itemRect.top, bottom: itemRect.bottom }, paint,
        paintContained: paint.left >= itemRect.left - 0.5 && paint.right <= itemRect.right + 0.5 &&
          paint.top >= itemRect.top - 0.5 && paint.bottom <= itemRect.bottom + 0.5,
      }
    })
    const crypto = document.querySelector('[data-block-id="crypto"]')
    const cells = [...crypto.querySelectorAll(':scope > section > div > span')].map((cell) => {
      const rect = cell.getBoundingClientRect()
      return {
        text: cell.textContent.trim(), display: getComputedStyle(cell).display, width: rect.width, height: rect.height,
        complete: cell.scrollWidth <= cell.clientWidth + 1 && cell.scrollHeight <= cell.clientHeight + 1,
      }
    })
    const pairs = []
    for (let left = 0; left < rows.length; left += 1) for (let right = left + 1; right < rows.length; right += 1) {
      if (rows[left].rect.left < rows[right].rect.right - 0.5 && rows[left].rect.right > rows[right].rect.left + 0.5) {
        pairs.push([rows[left].id, rows[right].id])
      }
    }
    return {
      variant, dock: { clientWidth: dock.clientWidth, scrollWidth: dock.scrollWidth, left: dockRect.left, right: dockRect.right },
      rows, pairs, cells,
      allFiveCrypto: cells.length === 5 && cells.every((cell) => cell.display !== 'none' && cell.width > 0 && cell.height > 0 && cell.complete),
      contained: rows.every((row) => row.paintContained),
    }
  }, { ids: populatedIds, variant }))
}

const boardCrypto = []
for (const variant of ['compact', 'standard']) {
  await page.setViewportSize({ width: 1200, height: 900 })
  await applyCase({
    activeIds: ['crypto'],
    density: 'compact',
    overrides: { crypto: pinned('crypto', 0, variant, 'pulse')[1] },
  })
  boardCrypto.push(await page.evaluate((variant) => {
    const item = document.querySelector('[data-block-id="crypto"]')
    const itemRect = item.getBoundingClientRect()
    const cells = [...item.querySelectorAll(':scope > section > div > span')].filter((cell) => getComputedStyle(cell).display !== 'none')
    const descendants = [item, ...item.querySelectorAll('*')].filter((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0.5 && rect.height > 0.5 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const paintRows = descendants.flatMap((node) => {
      const rows = [{ rect: node.getBoundingClientRect(), kind: 'box', node: node.tagName, text: node.textContent?.trim().slice(0, 40) }]
      for (const child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(child)
        rows.push(...[...range.getClientRects()].map((rect) => ({ rect, kind: 'text', node: node.tagName, text: child.textContent.trim() })))
      }
      return rows
    })
    const paint = paintRows.map(({ rect }) => rect)
    const paintBounds = {
      left: Math.min(...paint.map((rect) => rect.left)),
      right: Math.max(...paint.map((rect) => rect.right)),
      top: Math.min(...paint.map((rect) => rect.top)),
      bottom: Math.max(...paint.map((rect) => rect.bottom)),
    }
    return {
      variant,
      item: { left: itemRect.left, right: itemRect.right, top: itemRect.top, bottom: itemRect.bottom },
      paint: paintBounds,
      escapedPaint: paintRows.filter(({ rect }) => rect.left < itemRect.left - 0.5 || rect.right > itemRect.right + 0.5 ||
        rect.top < itemRect.top - 0.5 || rect.bottom > itemRect.bottom + 0.5).map(({ rect, ...row }) => ({
          ...row, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        })),
      visibleCells: cells.length,
      fontSizes: cells.map((cell) => Number.parseFloat(getComputedStyle(cell).fontSize)),
      cellSizes: cells.map((cell) => ({
        clientWidth: cell.clientWidth, scrollWidth: cell.scrollWidth,
        clientHeight: cell.clientHeight, scrollHeight: cell.scrollHeight,
      })),
      complete: cells.every((cell) => {
        const style = getComputedStyle(cell)
        return style.textOverflow !== 'ellipsis' && !['hidden', 'clip'].includes(style.overflowX) &&
          !['hidden', 'clip'].includes(style.overflowY)
      }),
      contained: paint.every((rect) => rect.left >= itemRect.left - 0.5 && rect.right <= itemRect.right + 0.5 &&
        rect.top >= itemRect.top - 0.5 && rect.bottom <= itemRect.bottom + 0.5),
    }
  }, variant))
}

// W2's portaled Tasks panel retains the viewport-fit anchor authority, with
// one additional exact occlusion input: the live Dock top. Exercise the same
// 800x450/242px finding geometry in a built extension and contrast it with a
// short Dock at the viewport edge. The panel's list remains the sole scroll
// owner while its fixed header and add-task command line stay reachable.
await page.setViewportSize({ width: 800, height: 450 })
await applyCase({
  activeIds: ['tasks'],
  density: 'compact',
  overrides: Object.fromEntries([pinned('tasks', 0, 'compact', 'now')]),
})
await page.evaluate(async (now) => {
  await chrome.storage.local.set({
    todoLists: [{
      id: 'focused-tasks', name: 'Focused tasks',
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `focused-task-${index}`, text: `Focused task ${index + 1}`, done: index % 3 === 0,
      })),
    }],
  })
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const tasks = document.querySelector('[data-block-id="tasks"]')
  Object.assign(dock.style, {
    position: 'fixed', left: '0px', right: '0px', top: '450px', height: '0px', minBlockSize: '0px',
  })
  Object.assign(tasks.style, {
    position: 'fixed', left: '680px', top: '260px', width: '72px', height: '38px', zIndex: '50',
  })
}, now)
await page.evaluate(() => document.querySelector('[data-block-id="tasks"] button[aria-expanded]')?.click())
await page.waitForSelector('[role="dialog"][aria-label="Tasks"]')
await page.waitForTimeout(50)
const measureTasksPanel = () => page.evaluate(() => {
  const panel = document.querySelector('[role="dialog"][aria-label="Tasks"]')
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const listScroll = panel.children[1]
  const command = panel.querySelector('form:last-child')
  const close = panel.querySelector('button[aria-label="Close tasks"]')
  const addInput = panel.querySelector('input[aria-label="Add a task"], #todo-add-item')
  const addButton = panel.querySelector('button[aria-label="Add task"]')
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height }
  }
  const panelRect = rect(panel)
  const dockRect = rect(dock)
  const contained = (node) => {
    const value = rect(node)
    return value.top >= panelRect.top - 0.5 && value.bottom <= panelRect.bottom + 0.5 &&
      value.left >= panelRect.left - 0.5 && value.right <= panelRect.right + 0.5
  }
  return {
    panel: panelRect, dock: dockRect, maxHeight: getComputedStyle(panel).maxHeight,
    clearsDock: panelRect.bottom <= dockRect.top + 0.5,
    onScreen: panelRect.top >= -0.5 && panelRect.bottom <= innerHeight + 0.5 && panelRect.left >= -0.5 && panelRect.right <= innerWidth + 0.5,
    list: { clientHeight: listScroll.clientHeight, scrollHeight: listScroll.scrollHeight, overflowY: getComputedStyle(listScroll).overflowY },
    fixedControlsContained: [close, command, addInput, addButton].every((node) => node && contained(node)),
    pageOwned: document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1,
  }
})
const tasksShortDock = await measureTasksPanel()
await page.keyboard.press('Escape')
await page.evaluate(() => {
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  dock.style.top = '242px'
  dock.style.height = '208px'
})
await page.evaluate(() => document.querySelector('[data-block-id="tasks"] button[aria-expanded]')?.click())
await page.waitForSelector('[role="dialog"][aria-label="Tasks"]')
await page.waitForTimeout(50)
const tasksTallDock = await measureTasksPanel()
const tasksLastControl = await page.evaluate(() => {
  const panel = document.querySelector('[role="dialog"][aria-label="Tasks"]')
  const listScroll = panel.children[1]
  const controls = [...listScroll.querySelectorAll('input:not([disabled]),button:not([disabled])')]
  const last = controls.at(-1)
  listScroll.scrollTop = 0
  last?.focus()
  const activeRect = document.activeElement?.getBoundingClientRect()
  const listRect = listScroll.getBoundingClientRect()
  return {
    focused: document.activeElement === last,
    scrolled: listScroll.scrollTop > 0,
    fullyVisible: activeRect != null && activeRect.top >= listRect.top - 0.5 && activeRect.bottom <= listRect.bottom + 0.5,
  }
})
await page.keyboard.press('Escape')
await page.evaluate(() => {
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  for (const property of ['position', 'left', 'right', 'top', 'height', 'min-block-size']) dock.style.removeProperty(property)
  const tasks = document.querySelector('[data-block-id="tasks"]')
  for (const property of ['position', 'left', 'top', 'width', 'height', 'z-index']) tasks.style.removeProperty(property)
})

// I1 inventory and M1 nearest-scroll/pointer stability share one dense Dock.
const a11yIds = ['links', 'habits', 'monthCal', 'homeassistant', 'crypto', 'github', 'gitlab', 'jira', 'ics']
await page.setViewportSize({ width: 1600, height: 900 })
await applyCase({
  activeIds: a11yIds,
  density: 'compact',
  overrides: Object.fromEntries(a11yIds.map((id, order) => pinned(id, order, 'compact'))),
})
const i1 = await page.evaluate(() => {
  const visible = (selector) => [...document.querySelectorAll(selector)].filter((node) => {
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  })
  const textSelectors = {
    links: '[data-block-id="links"] > section > div > span',
    homeassistant: '[data-block-id="homeassistant"] button[aria-label^="Run "]',
    crypto: '[data-block-id="crypto"] > section > div > span',
    monthDays: '[data-block-id="monthCal"] td span:first-child',
    monthLabel: '[data-block-id="monthCal"] [data-monthcal-label]',
  }
  const targetSelectors = {
    monthNav: '[data-block-id="monthCal"] [data-monthcal-header] > button',
    habits: '[data-block-id="habits"] > div > button',
  }
  const text = Object.fromEntries(Object.entries(textSelectors).map(([name, selector]) => [name, visible(selector).map((node) => ({
    value: node.textContent.trim(), fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
  }))]))
  const targets = Object.fromEntries(Object.entries(targetSelectors).map(([name, selector]) => [name, visible(selector).map((node) => {
    const rect = node.getBoundingClientRect()
    return { label: node.getAttribute('aria-label') ?? node.textContent.trim(), width: rect.width, height: rect.height }
  })]))
  return {
    text, targets,
    ordinaryOk: Object.values(text).every((rows) => rows.length > 0 && rows.every((row) => row.fontSize >= 14)),
    targetsOk: Object.values(targets).every((rows) => rows.length > 0 && rows.every((row) => row.width >= 35.5 && row.height >= 35.5)),
  }
})
const m1Prep = await page.evaluate(async () => {
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const controls = () => [...dock.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')].filter((node) => node.getClientRects().length > 0)
  dock.scrollLeft = 0
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const dockRect = dock.getBoundingClientRect()
  const visibleTarget = controls().find((node) => {
    const rect = node.getBoundingClientRect()
    return rect.left >= dockRect.left && rect.right <= dockRect.right
  })
  const visibleBefore = dock.scrollLeft
  visibleTarget.focus({ preventScroll: true })
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const visibleAfter = dock.scrollLeft
  dock.scrollLeft = 0
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const all = controls()
  const targetIndex = all.findIndex((node) => node.getBoundingClientRect().right > dockRect.right + 1)
  const offscreenTarget = all[targetIndex]
  const previous = all[targetIndex - 1]
  const initial = offscreenTarget.getBoundingClientRect()
  const expectedDelta = initial.right - dockRect.right
  previous.focus({ preventScroll: true })
  return {
    visible: { before: visibleBefore, after: visibleAfter },
    targetIndex,
    previousFocused: document.activeElement === previous,
    targetLabel: offscreenTarget.getAttribute('aria-label') ?? offscreenTarget.textContent.trim(),
    initial: { left: initial.left, right: initial.right },
    expectedDelta,
  }
})
if (m1Prep.previousFocused) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(50)
}
const m1 = await page.evaluate(async (prep) => {
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const controls = [...dock.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')].filter((node) => node.getClientRects().length > 0)
  const target = controls.find((node) => (node.getAttribute('aria-label') ?? node.textContent.trim()) === prep.targetLabel)
  if (!target) return {
    visible: prep.visible,
    previousFocused: prep.previousFocused,
    keyboard: {
      ...prep,
      reached: false,
      missing: true,
      activeLabel: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? null,
      controlLabels: controls.map((node) => node.getAttribute('aria-label') ?? node.textContent.trim()),
    },
    pointer: { initialLeft: null, beforeFocus: null, afterFocus: null },
  }
  const dockRect = dock.getBoundingClientRect()
  const final = target.getBoundingClientRect()
  const keyboard = {
    label: prep.targetLabel,
    initial: prep.initial,
    expectedDelta: prep.expectedDelta,
    after: dock.scrollLeft,
    final: { left: final.left, right: final.right },
    reached: document.activeElement === target,
    fullyVisible: final.left >= dockRect.left - 1 && final.right <= dockRect.right + 1,
  }
  // Pointer activation can only begin on content that is already visible.
  // Put this same target fully in view, then prove focus/click does not pan.
  dock.scrollLeft = Math.max(0, prep.initial.left - dockRect.left)
  await new Promise((resolve) => requestAnimationFrame(resolve))
  document.body.tabIndex = -1
  document.body.focus({ preventScroll: true })
  document.body.removeAttribute('tabindex')
  const pointerInitial = target.getBoundingClientRect()
  const pointerBeforeFocus = dock.scrollLeft
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
  target.focus()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const pointerAfterFocus = dock.scrollLeft
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
  target.click()
  return {
    visible: prep.visible,
    previousFocused: prep.previousFocused,
    keyboard,
    pointer: { initialLeft: pointerInitial.left, beforeFocus: pointerBeforeFocus, afterFocus: pointerAfterFocus },
  }
}, m1Prep)

// Exact predecessor witnesses that caught review-fix geometry missed by the
// task aggregate: dense Compact at 1420x550 must not create an unowned Stage
// scrollport, and a compact Month directly above Quote in Standard's six-row
// Day grid must keep all of its paint in its one-track allocation.
const predecessorIds = Object.keys(variantsById).filter((id) => !['status', 'homeassistant'].includes(id))
await page.setViewportSize({ width: 1600, height: 900 })
await applyCase({ activeIds: predecessorIds, density: 'compact', overrides: {} })
// Match the canonical sweep's precondition: the standard Month is first
// advanced off today and then advanced to a six-row month before live resize.
await page.click('[data-block-id="monthCal"] button[aria-label="Next month"]')
await page.waitForTimeout(30)
for (let index = 0; index < 18; index += 1) {
  const cells = await page.locator('[data-block-id="monthCal"] td').count()
  if (cells === 42) break
  await page.click('[data-block-id="monthCal"] button[aria-label="Next month"]')
  await page.waitForTimeout(30)
}
for (const viewport of [
  { width: 1536, height: 864 },
  { width: 1420, height: 900 },
  { width: 1280, height: 800 },
  { width: 1420, height: 550 },
]) {
  await page.setViewportSize(viewport)
  const expectedProfile = viewport.width < 900 || viewport.height < 700
    ? 'compact'
    : viewport.width >= 1600 && viewport.width / viewport.height >= 2.1
      ? 'ultrawide'
      : viewport.width >= 2200 && viewport.height >= 1100 ? 'display' : 'standard'
  await page.waitForFunction((profile) => document.documentElement.dataset.stageProfile === profile, expectedProfile)
  await page.waitForTimeout(320)
}
const predecessorShort = await page.evaluate(() => {
  const stage = document.querySelector('main[data-adaptive-stage]')
  const grid = stage.querySelector('.adaptive-stage__grid')
  const dock = document.querySelector('[data-stage-zone-container="dock"]')
  const board = [...document.querySelectorAll('[data-stage-zone-container]:not([data-stage-zone-container="dock"])')]
  const items = [...document.querySelectorAll('.board-item[data-block-id]')]
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return { top: value.top, bottom: value.bottom, height: value.height }
  }
  return {
    profile: document.documentElement.dataset.stageProfile,
    density: document.documentElement.dataset.stageDensity,
    viewportOverflow: stage.getAttribute('data-stage-viewport-overflow'),
    geometryFits: stage.getAttribute('data-stage-geometry-fits'),
    stage: { ...rect(stage), clientHeight: stage.clientHeight, scrollHeight: stage.scrollHeight, padding: getComputedStyle(stage).padding, boxSizing: getComputedStyle(stage).boxSizing },
    grid: { ...rect(grid), height: getComputedStyle(grid).height, minHeight: getComputedStyle(grid).minHeight, inlineStyle: grid.getAttribute('style') },
    dock: rect(dock),
    board: board.map((node) => ({ zone: node.getAttribute('data-stage-zone-container'), ...rect(node) })),
    items: items.map((node) => ({
      id: node.getAttribute('data-block-id'), zone: node.getAttribute('data-stage-zone'), variant: node.getAttribute('data-stage-variant'),
      rect: rect(node), minHeight: getComputedStyle(node).minHeight, scrollHeight: node.scrollHeight,
      child: node.firstElementChild ? { rect: rect(node.firstElementChild), minHeight: getComputedStyle(node.firstElementChild).minHeight, scrollHeight: node.firstElementChild.scrollHeight } : null,
    })),
    intendedOverflow: stage.getAttribute('data-stage-viewport-overflow') === 'true' &&
      stage.getAttribute('data-stage-geometry-fits') === 'false',
    owned: stage.scrollHeight <= stage.clientHeight + 1,
    finiteScrollContained: items.filter((item) => item.getAttribute('data-stage-zone') !== 'dock')
      .every((item) => item.scrollHeight <= item.clientHeight + 1),
    finiteElementsContained: items.filter((item) => item.getAttribute('data-stage-zone') !== 'dock').every((item) => {
      const itemRect = item.getBoundingClientRect()
      return [...item.querySelectorAll('*')].filter((node) => {
        const nodeRect = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return nodeRect.width > 0.5 && nodeRect.height > 0.5 && style.display !== 'none' && style.visibility !== 'hidden'
      }).every((node) => {
        const nodeRect = node.getBoundingClientRect()
        return nodeRect.left >= itemRect.left - 1 && nodeRect.top >= itemRect.top - 1 &&
          nodeRect.right <= itemRect.right + 1 && nodeRect.bottom <= itemRect.bottom + 1
      })
    }),
  }
})

const clockCapMatrix = []
for (const height of [549, 550, 551]) {
  await page.setViewportSize({ width: 1420, height })
  await page.waitForFunction(() => document.documentElement.dataset.stageProfile === 'compact')
  await page.waitForTimeout(160)
  clockCapMatrix.push(await page.evaluate((viewportHeight) => {
    const stage = document.querySelector('main[data-adaptive-stage]')
    const item = document.querySelector('.board-item[data-stage-variant="compact"]:not(.board-item--dock)[data-block-id="clock"]')
    const glyph = item?.querySelector('time')
    const itemRect = item?.getBoundingClientRect()
    const glyphRect = glyph?.getBoundingClientRect()
    return {
      viewportHeight,
      fontSize: glyph ? Number.parseFloat(getComputedStyle(glyph).fontSize) : null,
      item: itemRect ? { top: itemRect.top, bottom: itemRect.bottom, height: itemRect.height, scrollHeight: item.scrollHeight } : null,
      glyph: glyphRect ? { top: glyphRect.top, bottom: glyphRect.bottom, height: glyphRect.height } : null,
      contained: Boolean(itemRect && glyphRect && glyphRect.top >= itemRect.top - 1 && glyphRect.bottom <= itemRect.bottom + 1),
      scrollContained: Boolean(item && item.scrollHeight <= item.clientHeight + 1),
      stageOwned: stage instanceof HTMLElement && stage.scrollHeight <= stage.clientHeight + 1,
    }
  }, height))
}

await page.setViewportSize({ width: 960, height: 1010 })
await page.waitForFunction(() => document.documentElement.dataset.stageProfile === 'standard')
await page.waitForTimeout(200)
const predecessorNarrowMonth = await page.evaluate(() => {
  const item = document.querySelector('.board-item[data-stage-variant="compact"][data-block-id="monthCal"]')
  const header = item?.querySelector('[data-monthcal-header]')
  const table = item?.querySelector('table')
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
  }
  const itemRect = rect(item)
  const visible = [...item.querySelectorAll('*')].filter((node) => {
    const value = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return value.width > 0.5 && value.height > 0.5 && style.display !== 'none' && style.visibility !== 'hidden' &&
      !node.closest('.sr-only')
  })
  const paintRects = visible.flatMap((node) => {
    const rows = [node.getBoundingClientRect()]
    for (const child of node.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(child)
      rows.push(...range.getClientRects())
    }
    return rows
  })
  const controls = [...header.querySelectorAll(':scope > button')].map((node) => ({
    label: node.getAttribute('aria-label'),
    rect: rect(node),
  }))
  const paint = {
    left: Math.min(...paintRects.map((value) => value.left)),
    top: Math.min(...paintRects.map((value) => value.top)),
    right: Math.max(...paintRects.map((value) => value.right)),
    bottom: Math.max(...paintRects.map((value) => value.bottom)),
  }
  return {
    item: { ...itemRect, clientWidth: item.clientWidth, clientHeight: item.clientHeight, scrollWidth: item.scrollWidth, scrollHeight: item.scrollHeight },
    content: rect(item.firstElementChild),
    header: rect(header),
    table: rect(table),
    controls,
    paint,
    contained: paint.left >= itemRect.left - 0.5 && paint.top >= itemRect.top - 0.5 &&
      paint.right <= itemRect.right + 0.5 && paint.bottom <= itemRect.bottom + 0.5 &&
      item.scrollWidth <= item.clientWidth + 1 && item.scrollHeight <= item.clientHeight + 1,
    targetsOk: controls.every(({ rect: value }) => value.width >= 36 && value.height >= 36),
    controlsDisjoint: controls.length === 2 && (controls[0].rect.right <= controls[1].rect.left + 0.5 ||
      controls[0].rect.bottom <= controls[1].rect.top + 0.5),
  }
})

await page.setViewportSize({ width: 1024, height: 768 })
await applyCase({
  activeIds: predecessorIds,
  density: 'compact',
  overrides: {},
})
await page.click('[data-block-id="monthCal"] button[aria-label="Next month"]')
await page.waitForTimeout(30)
for (let index = 0; index < 18; index += 1) {
  const cells = await page.locator('[data-block-id="monthCal"] td').count()
  if (cells === 42) break
  await page.click('[data-block-id="monthCal"] button[aria-label="Next month"]')
  await page.waitForTimeout(30)
}
const predecessorMonth = await page.evaluate(() => {
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
  }
  const measure = (id) => {
    const item = document.querySelector(`[data-block-id="${id}"]`)
    const itemRect = item.getBoundingClientRect()
    const visible = [...item.querySelectorAll('*')].filter((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const painted = visible.flatMap((node) => {
      const rects = [node.getBoundingClientRect()]
      for (const child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(child)
        rects.push(...range.getClientRects())
      }
      return rects
    })
    return {
      item: { left: itemRect.left, top: itemRect.top, right: itemRect.right, bottom: itemRect.bottom, width: itemRect.width, height: itemRect.height },
      paint: {
        left: Math.min(...painted.map((rect) => rect.left)), top: Math.min(...painted.map((rect) => rect.top)),
        right: Math.max(...painted.map((rect) => rect.right)), bottom: Math.max(...painted.map((rect) => rect.bottom)),
      },
      escapes: visible.flatMap((node) => {
        const rows = []
        const nodeRect = node.getBoundingClientRect()
        if (nodeRect.left < itemRect.left - 0.5 || nodeRect.right > itemRect.right + 0.5 ||
            nodeRect.top < itemRect.top - 0.5 || nodeRect.bottom > itemRect.bottom + 0.5) {
          rows.push({ kind: 'element', tag: node.tagName, text: node.textContent?.trim().slice(0, 40), className: node.getAttribute('class'), rect: rect(node) })
        }
        for (const child of node.childNodes) {
          if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
          const range = document.createRange()
          range.selectNodeContents(child)
          for (const rangeRect of range.getClientRects()) {
            if (rangeRect.left < itemRect.left - 0.5 || rangeRect.right > itemRect.right + 0.5 ||
                rangeRect.top < itemRect.top - 0.5 || rangeRect.bottom > itemRect.bottom + 0.5) {
              rows.push({ kind: 'text', tag: node.tagName, text: child.textContent.trim().slice(0, 40), className: node.getAttribute('class'), rect: {
                left: rangeRect.left, top: rangeRect.top, right: rangeRect.right, bottom: rangeRect.bottom,
                width: rangeRect.width, height: rangeRect.height,
              } })
            }
          }
        }
        return rows
      }),
      elementsContained: visible.every((node) => {
        const nodeRect = node.getBoundingClientRect()
        return nodeRect.left >= itemRect.left - 1 && nodeRect.top >= itemRect.top - 1 &&
          nodeRect.right <= itemRect.right + 1 && nodeRect.bottom <= itemRect.bottom + 1
      }),
    }
  }
  const month = measure('monthCal')
  const quote = measure('quote')
  const monthItem = document.querySelector('[data-block-id="monthCal"]')
  const monthHeader = monthItem.querySelector('[data-monthcal-header]')
  const monthLabel = monthHeader.querySelector('[data-monthcal-label]')
  const today = monthHeader.querySelector('button[aria-label="Back to today"]')
  const dayGlyphs = [...monthItem.querySelectorAll('tbody tr')]
    .filter((row) => getComputedStyle(row).display !== 'none')
    .flatMap((row) => [...row.querySelectorAll('td span:first-child')].map((span) => {
      const cellRect = span.closest('td').getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(span)
      const glyphRects = [...range.getClientRects()]
      return {
        text: span.textContent,
        cell: rect(span.closest('td')),
        fontFamily: getComputedStyle(span).fontFamily,
        fontSize: getComputedStyle(span).fontSize,
        lineHeight: getComputedStyle(span).lineHeight,
        glyphs: glyphRects.map((glyph) => ({ left: glyph.left, right: glyph.right, top: glyph.top, bottom: glyph.bottom })),
        contained: glyphRects.every((glyph) => glyph.left >= monthItem.getBoundingClientRect().left - 0.5 &&
          glyph.right <= monthItem.getBoundingClientRect().right + 0.5 && glyph.top >= monthItem.getBoundingClientRect().top - 0.5 &&
          glyph.bottom <= monthItem.getBoundingClientRect().bottom + 0.5),
      }
    }))
  return {
    month,
    quote,
    monthLayout: {
      content: rect(monthItem.firstElementChild),
      header: rect(monthHeader),
      headerHeightWithToday: monthHeader.getBoundingClientRect().height,
      label: {
        ...rect(monthLabel), text: monthLabel.textContent,
        clientWidth: monthLabel.clientWidth, scrollWidth: monthLabel.scrollWidth,
        clientHeight: monthLabel.clientHeight, scrollHeight: monthLabel.scrollHeight,
        overflow: getComputedStyle(monthLabel).overflow,
        whiteSpace: getComputedStyle(monthLabel).whiteSpace,
      },
      today: today ? rect(today) : null,
      buttons: [...monthHeader.querySelectorAll(':scope > button')].map(rect),
      table: rect(monthItem.querySelector('table')),
      visibleRows: [...monthItem.querySelectorAll('tbody tr')]
        .filter((row) => getComputedStyle(row).display !== 'none')
        .map(rect),
      dayGlyphs,
    },
    contained: month.elementsContained && monthLabel.scrollWidth <= monthLabel.clientWidth + 1 &&
      getComputedStyle(monthLabel).overflow === 'visible' && getComputedStyle(monthLabel).whiteSpace === 'normal',
    disjoint: month.paint.bottom <= quote.paint.top + 0.5 || month.paint.right <= quote.paint.left + 0.5 ||
      month.paint.left >= quote.paint.right - 0.5,
  }
})

const predecessorMonthHeaderWithoutToday = await page.locator(
  '[data-block-id="monthCal"] button[aria-label="Back to today"]',
).count() > 0
  ? (await page.click('[data-block-id="monthCal"] button[aria-label="Back to today"]'), await page.waitForTimeout(50),
      await page.locator('[data-block-id="monthCal"] [data-monthcal-header]').evaluate((header) => header.getBoundingClientRect().height))
  : null

const verification = { i2, dockGeometry, boardCrypto, tasks: { shortDock: tasksShortDock, tallDock: tasksTallDock, lastControl: tasksLastControl }, i1, m1, predecessorShort, clockCapMatrix, predecessorNarrowMonth, predecessorMonth, predecessorMonthHeaderWithoutToday }
const verificationOk = i2.density === 'compact' && i2.marker === 'true' && i2.geometryFits === 'false' &&
  i2.attempts === 'spacious:overflow:0,balanced:overflow:0,compact:overflow:0' && i2.monthVariant === 'expanded' &&
  i2.monthZone === 'dock' && i2.noBoardDockIntersection && i2.stage.scrollHeight > i2.stage.clientHeight &&
  i2.stage.after > 0 && i2.pageOwned && i2.keyboard.previousFocused && i2.keyboard.reachedMonth &&
  i2.keyboard.stageScrollTop > 0 && i2.keyboard.fullyVisible && i2.keyboard.pageScrollTop === 0 && i2.keyboard.pageOwned &&
  dockGeometry.every((row) => row.allFiveCrypto && row.contained && row.pairs.length === 0) &&
  boardCrypto.every((row) => row.visibleCells === (row.variant === 'compact' ? 1 : 2) && row.complete && row.contained &&
    row.fontSizes.every((size) => size >= 14)) &&
  tasksShortDock.panel.height > tasksTallDock.panel.height && tasksShortDock.maxHeight === '434px' && tasksShortDock.onScreen &&
  tasksTallDock.panel.bottom <= 234.5 && tasksTallDock.maxHeight === '226px' && tasksTallDock.clearsDock && tasksTallDock.onScreen &&
  tasksTallDock.list.scrollHeight > tasksTallDock.list.clientHeight && tasksTallDock.list.overflowY === 'auto' &&
  tasksTallDock.fixedControlsContained && tasksTallDock.pageOwned && tasksLastControl.focused && tasksLastControl.scrolled && tasksLastControl.fullyVisible &&
  i1.ordinaryOk && i1.targetsOk && m1.visible.before === m1.visible.after && m1.previousFocused && m1.keyboard.reached && m1.keyboard.after > 0 &&
  Math.abs(m1.keyboard.after - m1.keyboard.expectedDelta) <= 2 && m1.keyboard.fullyVisible &&
  m1.pointer.afterFocus === m1.pointer.beforeFocus && predecessorShort.owned && predecessorShort.finiteScrollContained &&
  predecessorShort.finiteElementsContained &&
  clockCapMatrix.length === 3 && clockCapMatrix.every((row) => row.contained && row.scrollContained && row.stageOwned) &&
  clockCapMatrix.every((row, index) => index === 0 || Math.abs(row.fontSize - clockCapMatrix[index - 1].fontSize) <= 0.25) &&
  predecessorNarrowMonth.contained && predecessorNarrowMonth.targetsOk && predecessorNarrowMonth.controlsDisjoint &&
  predecessorMonth.contained && predecessorMonth.disjoint &&
  predecessorMonth.monthLayout.dayGlyphs.every((row) => row.contained) &&
  predecessorMonthHeaderWithoutToday !== null &&
  Math.abs(predecessorMonth.monthLayout.headerHeightWithToday - predecessorMonthHeaderWithoutToday) <= 0.5
console.log(`W3_P2_REVIEW_FIXES=${JSON.stringify(verification)}`)
console.log(verificationOk ? 'PASS: W3-P2 whole-review focused browser fixes' : 'FAIL: W3-P2 whole-review focused browser fixes')
if (!verificationOk) process.exitCode = 1
await context.close()
rmSync(profileDir, { recursive: true, force: true })
