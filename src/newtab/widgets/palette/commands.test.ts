import { describe, expect, it, vi } from 'vitest'
import { buildCommands, filterCommands, type CommandContext } from './commands'
import type { QuickLink, Settings } from '../../../lib/storage/schema'

function makeCtx(links: QuickLink[] = []): CommandContext {
  const settings: Settings = {
    name: '',
    use24Hour: false,
    panelColor: null,
    widgetTextColor: null,
    photoTextColor: null,
    photoClockColor: null,
    photoGreetingColor: null,
    photoQuoteColor: null,
    units: 'metric',
    muted: false,
    flowAmbience: 'off',
    flowVolume: 15,
    layoutDensity: 'auto',
    widgets: {
      search: true,
      weather: true,
      links: true,
      todo: true,
      timer: false,
      quote: true,
      bookmarks: false,
      notes: true,
      clocks: false,
      countdown: false,
      habits: false,
      monthCal: false,
      sun: false,
      moon: false,
      readingList: false,
      recentlyClosed: false,
      downloads: false,
      tabGroups: false,
    },
  }
  return {
    links,
    settings,
    openUrl: vi.fn(),
    webSearch: vi.fn(),
    addTodo: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn(),
  }
}

describe('buildCommands', () => {
  it('builds a link command per quick link, then settings (themes retired, Task 60)', () => {
    const ctx = makeCtx([{ id: 'l1', title: 'GitHub', url: 'https://github.com' }])
    const commands = buildCommands(ctx)
    expect(commands.map((c) => c.id)).toEqual(['link:l1', 'settings'])
  })

  it('running a link command opens its url', () => {
    const ctx = makeCtx([{ id: 'l1', title: 'GitHub', url: 'https://github.com' }])
    void buildCommands(ctx)[0]!.run()
    expect(ctx.openUrl).toHaveBeenCalledWith('https://github.com')
  })

  it('running the settings command opens settings', () => {
    const ctx = makeCtx()
    const settingsCmd = buildCommands(ctx).find((c) => c.id === 'settings')!
    settingsCmd.run()
    expect(ctx.openSettings).toHaveBeenCalled()
  })
})

describe('filterCommands', () => {
  it('returns every command, in built order, for an empty query', () => {
    const ctx = makeCtx([{ id: 'l1', title: 'GitHub', url: 'https://github.com' }])
    const commands = buildCommands(ctx)
    expect(filterCommands(commands, '', ctx)).toEqual(commands)
  })

  it('fuzzy-matches by label, ranking the best match first', () => {
    const ctx = makeCtx([{ id: 'l1', title: 'GitHub', url: 'https://github.com' }])
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'git', ctx)
    expect(result[0]!.id).toBe('link:l1')
  })

  it('appends exactly one web-search fallback whose label contains the query when nothing matches', () => {
    const ctx = makeCtx()
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'zzzznomatch', ctx)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('web-search')
    expect(result[0]!.label).toContain('zzzznomatch')
  })

  it('still appends the web-search fallback after fuzzy matches', () => {
    const ctx = makeCtx([{ id: 'l1', title: 'GitHub', url: 'https://github.com' }])
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'git', ctx)
    expect(result.at(-1)!.id).toBe('web-search')
  })

  it('running the web-search fallback calls ctx.webSearch with the query', () => {
    const ctx = makeCtx()
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'cats', ctx)
    void result[0]!.run()
    expect(ctx.webSearch).toHaveBeenCalledWith('cats')
  })

  it('a "todo:"-prefixed query yields a single add-to-do command carrying the remainder', () => {
    const ctx = makeCtx()
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'todo: buy milk', ctx)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('todo:add')
    void result[0]!.run()
    expect(ctx.addTodo).toHaveBeenCalledWith('buy milk')
  })

  it('an "add todo:"-prefixed query also yields the add-to-do command', () => {
    const ctx = makeCtx()
    const commands = buildCommands(ctx)
    const result = filterCommands(commands, 'add todo: walk the dog', ctx)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('todo:add')
    void result[0]!.run()
    expect(ctx.addTodo).toHaveBeenCalledWith('walk the dog')
  })
})
