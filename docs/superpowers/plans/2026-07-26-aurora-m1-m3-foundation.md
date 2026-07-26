# Aurora Foundation (M1–M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Aurora MV3 new-tab extension and build its foundation: typed storage layer (TDD), theme engine, background photo system, clock/greeting, focus line, search bar, and settings drawer — through user Pause 2.

**Architecture:** React components read/write only through a typed storage wrapper (`createStorage(driver)`) over a pluggable `StorageDriver`; `chromeDriver` binds `chrome.storage.local` in the app, `memoryDriver` is the test double. Themes are CSS-variable sets scoped by `data-theme` on `<html>`, surfaced to Tailwind v4 via `@theme inline`. All pure logic (formatting, rotation, focus rollover, migrations) lives in plain functions with Vitest tests; components stay thin.

**Tech Stack:** Vite 6 + @crxjs/vite-plugin 2 + React 19 + TypeScript 5 + Tailwind 4 (`@tailwindcss/vite`) + Vitest 3 (+ jsdom & @testing-library/react for the hook test).

**Spec:** `docs/superpowers/specs/2026-07-26-aurora-newtab-design.md`

## Global Constraints

- Manifest V3; new tab page via `chrome_url_overrides.newtab`.
- Local-first: NO outbound network calls in anything this plan builds (weather comes later, isolated in `src/services/`). The dev-time photo download script runs on the developer's machine only, never in the extension.
- No component may touch `chrome.storage` directly — only via the wrapper from `src/lib/storage/`.
- No new runtime dependencies beyond `react` + `react-dom`. No UI kit.
- Accessibility is not deferred: every interactive element keyboard-reachable, visible `focus-visible` ring, `prefers-reduced-motion` disables transitions, text over photos always sits above the scrim.
- Vite stays on major 6 (known-good with @crxjs/vite-plugin 2). Do not bump majors mid-plan.
- Pause points: after Task 1 (**Pause 1** — user loads the blank extension) and after Task 11 (**Pause 2** — user reviews the core layout). Stop and report at each pause.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (shown as `<footer>` in commit steps below).
- Working directory: `d:\DEV\Chrome plugin` (repo root). PowerShell is the shell; commands below are cross-shell npm/git unless noted.

**Deviations from spec (intentional, minor):** `order` fields dropped from `TodoItem`/`QuickLink` (arrays are already ordered; drag-reorder just reorders the array). `TimerConfig.muted` dropped (global `settings.muted` covers it). `weatherCache` key joins the schema in the M4 plan, when its type is real.

---

### Task 1: M1 Scaffold — blank new tab loads (⏸ Pause 1 after this task)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `src/manifest.ts`, `src/newtab/index.html`, `src/newtab/main.tsx`, `src/newtab/App.tsx`, `src/newtab/index.css`
- Create: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Produces: `todayKey(now?: Date): string` (local `YYYY-MM-DD`) — used by focus rollover (Task 8) and photo rotation (Task 6). Build commands `npm run dev|build|test` for all later tasks.

- [ ] **Step 1: Init npm and install pinned dependencies**

```bash
npm init -y
npm i react@19 react-dom@19
npm i -D vite@6 @vitejs/plugin-react@4 @crxjs/vite-plugin@2 tailwindcss@4 @tailwindcss/vite@4 vitest@3 typescript@5 @types/react@19 @types/react-dom@19 @types/chrome@latest
```

- [ ] **Step 2: Replace generated `package.json` fields** — keep the `dependencies`/`devDependencies` npm wrote; set the rest to:

```json
{
  "name": "aurora-newtab",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // lets @testing-library/react register its afterEach cleanup
  },
})
```

- [ ] **Step 5: Write `src/manifest.ts`**

```ts
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Aurora',
  version: '0.1.0',
  description: 'A calm, local-first new-tab dashboard. No accounts, no tracking.',
  permissions: ['storage'],
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
})
```

- [ ] **Step 6: Write the new-tab entry files**

```html
<!-- src/newtab/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New Tab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

```tsx
// src/newtab/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// src/newtab/App.tsx
export default function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-light tracking-[0.3em]">AURORA</h1>
    </main>
  )
}
```

```css
/* src/newtab/index.css */
@import "tailwindcss";

:root {
  color-scheme: dark;
}
```

- [ ] **Step 7: Write the failing test for `todayKey`**

```ts
// src/lib/dates.test.ts
import { describe, expect, it } from 'vitest'
import { todayKey } from './dates'

describe('todayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 6, 26))).toBe('2026-07-26')
  })
  it('zero-pads month and day', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 9: Implement `src/lib/dates.ts`**

```ts
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test` — Expected: 2 passed.

- [ ] **Step 11: Build and verify the extension output**

Run: `npm run build`
Expected: `dist/` exists; `dist/manifest.json` contains `"chrome_url_overrides"` with a `newtab` html path; the referenced html file exists in `dist/`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Aurora MV3 extension (Vite + crxjs + React + Tailwind + Vitest)

<footer>"
```

- [ ] **Step 13: ⏸ PAUSE 1 — report to user.** Load steps to give them: 1) `npm run build` (already done), 2) open `chrome://extensions`, 3) enable Developer mode, 4) Load unpacked → select `d:\DEV\Chrome plugin\dist`, 5) open a new tab → dark page with "AURORA". For live-reload development: `npm run dev`, then Load unpacked → `dist` (crxjs serves HMR through it).

---

### Task 2: Storage schema, defaults, and migrations (pure, TDD)

**Files:**
- Create: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`
- Test: `src/lib/storage/migrations.test.ts`

**Interfaces:**
- Produces (schema.ts): `CURRENT_VERSION = 1`; types `ThemeId ('glass'|'mono'|'aurora')`, `WidgetToggles`, `Settings`, `Focus`, `TodoItem`, `TodoList`, `QuickLink`, `TimerConfig`, `PhotoPrefs`, `StoredLocation`, `AuroraData`, `DataKey = keyof AuroraData`; `defaults(): AuroraData`.
- Produces (migrations.ts): `migrate(snapshot: Record<string, unknown>, fromVersion: number, registry?: Record<number, Migration>): AuroraData`; `migrations` registry (empty at v1); `type Migration = (data: Record<string, unknown>) => Record<string, unknown>`.

- [ ] **Step 1: Write `src/lib/storage/schema.ts`**

```ts
export const CURRENT_VERSION = 1

export type ThemeId = 'glass' | 'mono' | 'aurora'

export interface WidgetToggles {
  search: boolean
  weather: boolean
  links: boolean
  todo: boolean
  timer: boolean
  quote: boolean
}

export interface Settings {
  name: string
  use24Hour: boolean
  theme: ThemeId
  units: 'metric' | 'imperial'
  searchEngine: 'google' | 'duckduckgo' | 'bing'
  muted: boolean
  widgets: WidgetToggles
}

/** date is a local YYYY-MM-DD key; the focus resets when it stops matching today. */
export interface Focus {
  text: string
  date: string
  done: boolean
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface TodoList {
  id: string
  name: string
  items: TodoItem[]
}

export interface QuickLink {
  id: string
  title: string
  url: string
}

export interface TimerConfig {
  workMinutes: number
  breakMinutes: number
}

export interface PhotoPrefs {
  mode: 'auto' | 'upload' | 'gradient'
  index: number
  lastRotated: string
}

export interface StoredLocation {
  lat: number
  lon: number
  label: string
  manual: boolean
}

export interface AuroraData {
  settings: Settings
  focus: Focus | null
  todoLists: TodoList[]
  links: QuickLink[]
  timerConfig: TimerConfig
  photoPrefs: PhotoPrefs
  location: StoredLocation | null
}

export type DataKey = keyof AuroraData

export function defaults(): AuroraData {
  return {
    settings: {
      name: '',
      use24Hour: false,
      theme: 'aurora',
      units: 'metric',
      searchEngine: 'google',
      muted: false,
      widgets: {
        search: true,
        weather: true,
        links: true,
        todo: true,
        timer: false,
        quote: true,
      },
    },
    focus: null,
    todoLists: [],
    links: [],
    timerConfig: { workMinutes: 25, breakMinutes: 5 },
    photoPrefs: { mode: 'auto', index: 0, lastRotated: '' },
    location: null,
  }
}
```

- [ ] **Step 2: Write the failing migration tests**

```ts
// src/lib/storage/migrations.test.ts
import { describe, expect, it } from 'vitest'
import { defaults } from './schema'
import { migrate, type Migration } from './migrations'

describe('migrate', () => {
  it('fills an empty snapshot with defaults', () => {
    expect(migrate({}, 1)).toEqual(defaults())
  })

  it('preserves stored values over defaults', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon' } }, 1)
    expect(out.settings.name).toBe('Jon')
    expect(out.timerConfig).toEqual({ workMinutes: 25, breakMinutes: 5 })
  })

  it('runs registered migrations in order up to the current version', () => {
    const calls: number[] = []
    const registry: Record<number, Migration> = {
      // registry[0] upgrades v0 -> v1 (CURRENT_VERSION)
      0: (data) => {
        calls.push(0)
        return { ...data, focus: { text: 'migrated', date: '2026-07-26', done: false } }
      },
    }
    const out = migrate({}, 0, registry)
    expect(calls).toEqual([0])
    expect(out.focus?.text).toBe('migrated')
  })

  it('throws when a migration step is missing', () => {
    expect(() => migrate({}, -1, {})).toThrow(/No migration/)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail** — `npm test`, expected: cannot resolve `./migrations`.

- [ ] **Step 4: Write `src/lib/storage/migrations.ts`**

```ts
import { CURRENT_VERSION, defaults, type AuroraData } from './schema'

type Snapshot = Record<string, unknown>

export type Migration = (data: Snapshot) => Snapshot

/** Keyed by the version being upgraded FROM: migrations[1] upgrades v1 -> v2. */
export const migrations: Record<number, Migration> = {}

export function migrate(
  snapshot: Snapshot,
  fromVersion: number,
  registry: Record<number, Migration> = migrations,
): AuroraData {
  let data = snapshot
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const step = registry[v]
    if (!step) throw new Error(`No migration from schema v${v}`)
    data = step(data)
  }
  // Top-level keys missing from storage fall back to defaults.
  return { ...defaults(), ...data } as AuroraData
}
```

- [ ] **Step 5: Run tests to verify they pass** — `npm test`, expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage
git commit -m "feat: typed storage schema v1 with migration machinery

<footer>"
```

---

### Task 3: Storage wrapper over a pluggable driver (TDD)

**Files:**
- Create: `src/lib/storage/driver.ts`, `src/lib/storage/index.ts`
- Test: `src/lib/storage/index.test.ts`

**Interfaces:**
- Consumes: `schema.ts` types/`defaults`, `migrate` (Task 2).
- Produces (driver.ts): `interface StorageDriver { read(keys: string[] | null): Promise<Record<string, unknown>>; write(patch: Record<string, unknown>): Promise<void>; onChanged(cb: (changes: Record<string, unknown>) => void): () => void }`; `memoryDriver(seed?)` returning `StorageDriver & { dump(): Record<string, unknown> }`.
- Produces (index.ts): `createStorage(driver: StorageDriver): AuroraStorage` where `AuroraStorage` = `{ init(): Promise<void>; get<K extends DataKey>(key: K): Promise<AuroraData[K]>; set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>; update<K extends DataKey>(key: K, fn: (v: AuroraData[K]) => AuroraData[K]): Promise<AuroraData[K]>; subscribe<K extends DataKey>(key: K, cb: (v: AuroraData[K]) => void): () => void }`. Version stored under the `'aurora:version'` storage key; each `DataKey` stored under its own storage key.

- [ ] **Step 1: Write `src/lib/storage/driver.ts`** (the test double is part of the contract, so it comes with the interface)

```ts
export type Changes = Record<string, unknown>

export interface StorageDriver {
  read(keys: string[] | null): Promise<Record<string, unknown>>
  write(patch: Record<string, unknown>): Promise<void>
  onChanged(cb: (changes: Changes) => void): () => void
}

/** In-memory driver for tests. `write` notifies listeners like chrome.storage does. */
export function memoryDriver(
  seed: Record<string, unknown> = {},
): StorageDriver & { dump(): Record<string, unknown> } {
  const store: Record<string, unknown> = { ...seed }
  const listeners = new Set<(c: Changes) => void>()
  return {
    async read(keys) {
      if (keys === null) return { ...store }
      const out: Record<string, unknown> = {}
      for (const k of keys) if (k in store) out[k] = store[k]
      return out
    },
    async write(patch) {
      Object.assign(store, patch)
      for (const cb of listeners) cb({ ...patch })
    },
    onChanged(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    dump: () => ({ ...store }),
  }
}
```

- [ ] **Step 2: Write the failing wrapper tests**

```ts
// src/lib/storage/index.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createStorage } from './index'
import { memoryDriver } from './driver'
import { CURRENT_VERSION, defaults } from './schema'

describe('createStorage', () => {
  it('init seeds defaults and stamps the version on first run', async () => {
    const driver = memoryDriver()
    await createStorage(driver).init()
    expect(driver.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect(driver.dump()['settings']).toEqual(defaults().settings)
  })

  it('init preserves existing data at the current version', async () => {
    const driver = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      settings: { ...defaults().settings, name: 'Jon' },
    })
    const storage = createStorage(driver)
    await storage.init()
    expect((await storage.get('settings')).name).toBe('Jon')
  })

  it('get falls back to defaults for a missing key', async () => {
    const storage = createStorage(memoryDriver({ 'aurora:version': CURRENT_VERSION }))
    await storage.init()
    expect(await storage.get('timerConfig')).toEqual({ workMinutes: 25, breakMinutes: 5 })
  })

  it('set/get round-trips', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('focus', { text: 'Ship M2', date: '2026-07-26', done: false })
    expect((await storage.get('focus'))?.text).toBe('Ship M2')
  })

  it('update applies a function to the current value', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('links', [{ id: 'a', title: 'A', url: 'https://a.example' }])
    const out = await storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])
    expect(out.map((l) => l.id)).toEqual(['a', 'b'])
    expect(await storage.get('links')).toEqual(out)
  })

  it('subscribe fires for its key only, and unsubscribe stops it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onFocus = vi.fn()
    const unsub = storage.subscribe('focus', onFocus)
    await storage.set('links', [])
    expect(onFocus).not.toHaveBeenCalled()
    await storage.set('focus', { text: 'x', date: '2026-07-26', done: false })
    expect(onFocus).toHaveBeenCalledWith({ text: 'x', date: '2026-07-26', done: false })
    unsub()
    await storage.set('focus', null)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail** — `npm test`, expected: cannot resolve `./index`.

- [ ] **Step 4: Write `src/lib/storage/index.ts`**

```ts
import {
  CURRENT_VERSION,
  defaults,
  type AuroraData,
  type DataKey,
} from './schema'
import { migrate } from './migrations'
import type { StorageDriver } from './driver'

const VERSION_KEY = 'aurora:version'

export interface AuroraStorage {
  init(): Promise<void>
  get<K extends DataKey>(key: K): Promise<AuroraData[K]>
  set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void>
  update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]>
  subscribe<K extends DataKey>(key: K, cb: (value: AuroraData[K]) => void): () => void
}

export function createStorage(driver: StorageDriver): AuroraStorage {
  return {
    async init() {
      const all = await driver.read(null)
      const stored = all[VERSION_KEY]
      if (typeof stored !== 'number') {
        await driver.write({ ...defaults(), [VERSION_KEY]: CURRENT_VERSION })
        return
      }
      if (stored < CURRENT_VERSION) {
        const { [VERSION_KEY]: _v, ...snapshot } = all
        const migrated = migrate(snapshot, stored)
        await driver.write({ ...migrated, [VERSION_KEY]: CURRENT_VERSION })
        return
      }
      if (stored > CURRENT_VERSION) {
        console.warn(`Aurora data is schema v${stored}, app expects v${CURRENT_VERSION}`)
      }
    },

    async get(key) {
      const found = await driver.read([key])
      return (key in found ? found[key] : defaults()[key]) as AuroraData[typeof key]
    },

    async set(key, value) {
      await driver.write({ [key]: value })
    },

    async update(key, fn) {
      const next = fn(await this.get(key))
      await this.set(key, next)
      return next
    },

    subscribe(key, cb) {
      return driver.onChanged((changes) => {
        if (key in changes) cb(changes[key] as AuroraData[typeof key])
      })
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass** — `npm test`, expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage
git commit -m "feat: storage wrapper with versioned init over pluggable driver

<footer>"
```

---

### Task 4: Chrome driver, storage context, and `useStoredKey` hook

**Files:**
- Create: `src/lib/storage/chrome.ts`, `src/lib/storage/context.tsx`, `src/lib/hooks/useStoredKey.ts`
- Modify: `src/newtab/main.tsx`
- Test: `src/lib/hooks/useStoredKey.test.tsx`

**Interfaces:**
- Consumes: `createStorage`, `memoryDriver`, `StorageDriver` (Task 3); `AuroraData`, `DataKey` (Task 2).
- Produces: `chromeDriver(): StorageDriver`; `<StorageProvider storage={...}>`; `useStorage(): AuroraStorage`; `useStoredKey<K extends DataKey>(key: K): readonly [AuroraData[K] | undefined, (v: AuroraData[K]) => void]` (value is `undefined` only before first load).

- [ ] **Step 1: Install test-only DOM tooling**

```bash
npm i -D jsdom @testing-library/react @testing-library/dom
```

- [ ] **Step 2: Write `src/lib/storage/chrome.ts`**

```ts
import type { Changes, StorageDriver } from './driver'

export function chromeDriver(): StorageDriver {
  return {
    read: (keys) => chrome.storage.local.get(keys),
    write: (patch) => chrome.storage.local.set(patch),
    onChanged(cb) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== 'local') return
        const flat: Changes = {}
        for (const [key, change] of Object.entries(changes)) flat[key] = change.newValue
        cb(flat)
      }
      chrome.storage.onChanged.addListener(listener)
      return () => chrome.storage.onChanged.removeListener(listener)
    },
  }
}
```

- [ ] **Step 3: Write `src/lib/storage/context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { AuroraStorage } from './index'

const StorageContext = createContext<AuroraStorage | null>(null)

export function StorageProvider({
  storage,
  children,
}: {
  storage: AuroraStorage
  children: ReactNode
}) {
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>
}

export function useStorage(): AuroraStorage {
  const storage = useContext(StorageContext)
  if (!storage) throw new Error('useStorage must be used inside <StorageProvider>')
  return storage
}
```

- [ ] **Step 4: Write the failing hook test**

```tsx
// src/lib/hooks/useStoredKey.test.tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import { useStoredKey } from './useStoredKey'

function Probe() {
  const [settings, save] = useStoredKey('settings')
  if (!settings) return <p>loading</p>
  return (
    <button onClick={() => save({ ...settings, name: 'Jon' })}>
      name:{settings.name === '' ? '(unset)' : settings.name}
    </button>
  )
}

describe('useStoredKey', () => {
  it('loads the stored value, saves updates, and reflects them', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )
    const button = await screen.findByText('name:(unset)')
    await act(async () => {
      button.click()
    })
    await screen.findByText('name:Jon')
    expect((await storage.get('settings')).name).toBe('Jon')
  })

  it('second subscriber sees a write made through storage directly', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )
    await screen.findByText('name:(unset)')
    await act(async () => {
      await storage.set('settings', {
        ...(await storage.get('settings')),
        name: 'Ada',
      })
    })
    await screen.findByText('name:Ada')
  })
})
```

- [ ] **Step 5: Run tests to verify they fail** — `npm test`, expected: cannot resolve `./useStoredKey`.

- [ ] **Step 6: Write `src/lib/hooks/useStoredKey.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import type { AuroraData, DataKey } from '../storage/schema'
import { useStorage } from '../storage/context'

export function useStoredKey<K extends DataKey>(key: K) {
  const storage = useStorage()
  const [value, setValue] = useState<AuroraData[K] | undefined>(undefined)

  useEffect(() => {
    let live = true
    let gotUpdate = false
    // Subscribe BEFORE the initial read, and let any subscribed update win:
    // otherwise a slow get() can resolve after a fresher onChanged value and
    // clobber it with stale data.
    const unsubscribe = storage.subscribe(key, (v) => {
      gotUpdate = true
      setValue(v)
    })
    void storage.get(key).then((v) => {
      if (live && !gotUpdate) setValue(v)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [key, storage])

  const save = useCallback(
    (next: AuroraData[K]) => {
      setValue(next) // optimistic; subscribe confirms
      storage.set(key, next).catch((error: unknown) => {
        // Persist failed (quota, invalidated context): re-sync from storage
        // so local state doesn't silently diverge from what's persisted.
        console.error(`[aurora] failed to persist ${key}:`, error)
        void storage.get(key).then((v) => setValue(v))
      })
    },
    [key, storage],
  )

  return [value, save] as const
}
```

- [ ] **Step 7: Run tests to verify they pass** — `npm test`, expected: all green.

- [ ] **Step 8: Wire real storage into `src/newtab/main.tsx`** (replace file)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createStorage } from '../lib/storage/index'
import { chromeDriver } from '../lib/storage/chrome'
import { StorageProvider } from '../lib/storage/context'
import './index.css'

const storage = createStorage(chromeDriver())
await storage.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StorageProvider storage={storage}>
      <App />
    </StorageProvider>
  </StrictMode>,
)
```

- [ ] **Step 9: Verify the build still works** — `npm run build`, expected: success.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: chrome storage driver, provider context, useStoredKey hook

<footer>"
```

---

### Task 5: Theme engine (Glass / Mono / Aurora)

**Files:**
- Create: `src/theme/themes.css`, `src/theme/index.ts`
- Modify: `src/newtab/index.css`, `src/newtab/App.tsx`

**Interfaces:**
- Consumes: `useStoredKey` (Task 4), `ThemeId` (Task 2).
- Produces: `THEMES: { id: ThemeId; label: string }[]` and `applyTheme(id: ThemeId): void` from `src/theme/index.ts`. CSS variables `--fg --fg-muted --accent --panel --panel-border --panel-blur --radius --scrim --bg-fallback`, surfaced as Tailwind utilities `text-fg`, `text-fg-muted`, `text-accent`, `bg-panel`, `border-panel-border`, `rounded-panel`.

- [ ] **Step 1: Write `src/theme/themes.css`**

```css
/* Aurora (default) — rich gradients */
:root,
[data-theme='aurora'] {
  --fg: #f5f5f4;
  --fg-muted: rgb(245 245 244 / 0.68);
  --accent: #7dd3fc;
  --panel: rgb(20 20 30 / 0.5);
  --panel-border: rgb(255 255 255 / 0.12);
  --panel-blur: 14px;
  --radius: 1rem;
  --scrim: linear-gradient(rgb(2 6 23 / 0.3), rgb(2 6 23 / 0.55));
  --bg-fallback: linear-gradient(160deg, #0f172a, #312e81 55%, #4c1d95);
}

/* Glass — glassmorphism, soft blur */
[data-theme='glass'] {
  --fg: #ffffff;
  --fg-muted: rgb(255 255 255 / 0.72);
  --accent: #e0f2fe;
  --panel: rgb(255 255 255 / 0.14);
  --panel-border: rgb(255 255 255 / 0.28);
  --panel-blur: 24px;
  --radius: 1.25rem;
  --scrim: linear-gradient(rgb(15 23 42 / 0.25), rgb(15 23 42 / 0.5));
  --bg-fallback: linear-gradient(150deg, #334155, #0ea5e9 120%);
}

/* Mono — minimal monochrome, typographic */
[data-theme='mono'] {
  --fg: #fafafa;
  --fg-muted: rgb(250 250 250 / 0.6);
  --accent: #fafafa;
  --panel: rgb(0 0 0 / 0.4);
  --panel-border: transparent;
  --panel-blur: 0px;
  --radius: 0px;
  --scrim: linear-gradient(rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.62));
  --bg-fallback: #101010;
}

/* System light mode: lift the fallback + panels; photo text stays scrim-protected. */
@media (prefers-color-scheme: light) {
  :root,
  [data-theme='aurora'] {
    --bg-fallback: linear-gradient(160deg, #bfdbfe, #c7d2fe 55%, #ddd6fe);
  }
  [data-theme='glass'] {
    --bg-fallback: linear-gradient(150deg, #e2e8f0, #bae6fd 120%);
  }
  [data-theme='mono'] {
    --bg-fallback: #ececec;
    --scrim: linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.65));
  }
}
```

- [ ] **Step 2: Write `src/theme/index.ts`**

```ts
import type { ThemeId } from '../lib/storage/schema'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'glass', label: 'Glass' },
  { id: 'mono', label: 'Mono' },
]

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}
```

- [ ] **Step 3: Surface variables to Tailwind in `src/newtab/index.css`** (replace file)

```css
@import "tailwindcss";
@import "../theme/themes.css";

@theme inline {
  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-accent: var(--accent);
  --color-panel: var(--panel);
  --color-panel-border: var(--panel-border);
  --radius-panel: var(--radius);
}

:root {
  color-scheme: dark light;
}
```

- [ ] **Step 4: Apply the stored theme in `src/newtab/App.tsx`** (replace file; interim layout until Task 11)

```tsx
import { useEffect } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'

export default function App() {
  const [settings] = useStoredKey('settings')

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings) return null
  return (
    <main
      className="flex h-screen items-center justify-center text-fg"
      style={{ background: 'var(--bg-fallback)' }}
    >
      <h1 className="text-2xl font-light tracking-[0.3em]">AURORA</h1>
    </main>
  )
}
```

- [ ] **Step 5: Verify** — `npm test` (still green) and `npm run build` (succeeds). In a dev tab, flipping `document.documentElement.dataset.theme = 'mono'` in DevTools changes the fallback background.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: CSS-variable theme engine with Aurora, Glass, and Mono

<footer>"
```

---

### Task 6: Background photo system (bundled set → upload → gradient)

**Files:**
- Create: `scripts/fetch-photos.mjs` (dev-time only), `public/photos/*.webp` + `src/services/photos/photos.json` (script output, committed)
- Create: `src/services/photos/rotation.ts`, `src/services/photos/index.ts`, `src/lib/idb.ts`
- Create: `src/newtab/components/Background.tsx`
- Test: `src/services/photos/rotation.test.ts`

**Interfaces:**
- Consumes: `todayKey` (Task 1), `PhotoPrefs` (Task 2), `useStoredKey` (Task 4).
- Produces: `resolvePhoto(prefs: PhotoPrefs, today: string, count: number): { index: number; rotated: boolean }`; `nextPhoto(prefs: PhotoPrefs, today: string, count: number): PhotoPrefs`; `BUNDLED: { file: string; label: string; author: string; source: string }[]` and `bundledUrl(index: number): string` from `src/services/photos/index.ts`; `putUpload(blob: Blob) / getUpload(): Promise<Blob | null> / clearUpload()` from `src/lib/idb.ts`; `<Background prefs={...} onPrefsChange={...}>` renders photo + scrim + refresh control.

- [ ] **Step 1: Write `scripts/fetch-photos.mjs`**

```js
// Dev-time only. Downloads the bundled background set from picsum.photos
// (Unsplash-sourced) into public/photos/ and writes credits to
// src/services/photos/photos.json. Never ships in or runs from the extension.
import { mkdir, writeFile } from 'node:fs/promises'

// Candidate Picsum image ids (calm landscapes). Review the downloads visually;
// replace any id that isn't a calm landscape, keep 10.
const PICKS = [1015, 1016, 1018, 1036, 1039, 1043, 1044, 1053, 1064, 1080, 110, 234]

await mkdir('public/photos', { recursive: true })
const manifest = []
for (const id of PICKS.slice(0, 12)) {
  const res = await fetch(`https://picsum.photos/id/${id}/1920/1200.webp`)
  if (!res.ok) {
    console.warn(`skip id ${id}: HTTP ${res.status}`)
    continue
  }
  const file = `p${String(manifest.length + 1).padStart(2, '0')}.webp`
  await writeFile(`public/photos/${file}`, Buffer.from(await res.arrayBuffer()))
  const info = await (await fetch(`https://picsum.photos/id/${id}/info`)).json()
  manifest.push({ file, label: `Photo by ${info.author}`, author: info.author, source: info.url })
  console.log(`saved ${file} (picsum id ${id}, by ${info.author})`)
}
await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2))
console.log(`wrote manifest with ${manifest.length} photos`)
```

- [ ] **Step 2: Run it and curate**

Run: `node scripts/fetch-photos.mjs` (after `mkdir src/services/photos` if needed).
Then open `public/photos/` and view each image. Delete non-landscape/busy images AND their manifest entries; keep 10. If fewer than 10 remain, add replacement ids to `PICKS` and re-run. Renumber files/manifest consistently if you delete any (simplest: adjust PICKS to exactly the 10 good ids and re-run the script from scratch).

- [ ] **Step 3: Write the failing rotation tests**

```ts
// src/services/photos/rotation.test.ts
import { describe, expect, it } from 'vitest'
import { nextPhoto, resolvePhoto } from './rotation'

describe('resolvePhoto', () => {
  it('rotates to a deterministic daily index on a new day', () => {
    const prefs = { mode: 'auto' as const, index: 2, lastRotated: '2026-07-25' }
    const a = resolvePhoto(prefs, '2026-07-26', 10)
    const b = resolvePhoto(prefs, '2026-07-26', 10)
    expect(a).toEqual(b)
    expect(a.rotated).toBe(true)
    expect(a.index).toBeGreaterThanOrEqual(0)
    expect(a.index).toBeLessThan(10)
  })

  it('keeps the stored index within the same day', () => {
    const prefs = { mode: 'auto' as const, index: 7, lastRotated: '2026-07-26' }
    expect(resolvePhoto(prefs, '2026-07-26', 10)).toEqual({ index: 7, rotated: false })
  })

  it('clamps a stale index when the photo count shrank', () => {
    const prefs = { mode: 'auto' as const, index: 99, lastRotated: '2026-07-26' }
    expect(resolvePhoto(prefs, '2026-07-26', 10).index).toBeLessThan(10)
  })

  it('handles an empty photo set', () => {
    const prefs = { mode: 'auto' as const, index: 0, lastRotated: '' }
    expect(resolvePhoto(prefs, '2026-07-26', 0)).toEqual({ index: 0, rotated: false })
  })
})

describe('nextPhoto', () => {
  it('advances with wraparound and marks today as rotated', () => {
    const prefs = { mode: 'auto' as const, index: 9, lastRotated: '2026-07-25' }
    expect(nextPhoto(prefs, '2026-07-26', 10)).toEqual({
      mode: 'auto',
      index: 0,
      lastRotated: '2026-07-26',
    })
  })
})
```

- [ ] **Step 4: Run tests to verify they fail** — `npm test`, expected: cannot resolve `./rotation`.

- [ ] **Step 5: Write `src/services/photos/rotation.ts`**

```ts
import type { PhotoPrefs } from '../../lib/storage/schema'

function hashDay(dateKey: string): number {
  let h = 0
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export function resolvePhoto(
  prefs: PhotoPrefs,
  today: string,
  count: number,
): { index: number; rotated: boolean } {
  if (count <= 0) return { index: 0, rotated: false }
  if (prefs.lastRotated !== today) return { index: hashDay(today) % count, rotated: true }
  return { index: prefs.index % count, rotated: false }
}

export function nextPhoto(prefs: PhotoPrefs, today: string, count: number): PhotoPrefs {
  if (count <= 0) return prefs
  const { index } = resolvePhoto(prefs, today, count)
  return { ...prefs, index: (index + 1) % count, lastRotated: today }
}
```

- [ ] **Step 6: Run tests to verify they pass** — `npm test`.

- [ ] **Step 7: Write `src/services/photos/index.ts` and `src/lib/idb.ts`**

```ts
// src/services/photos/index.ts
import manifest from './photos.json'

export interface BundledPhoto {
  file: string
  label: string
  author: string
  source: string
}

export const BUNDLED: BundledPhoto[] = manifest

/** Absolute extension URL for a bundled photo. */
export function bundledUrl(index: number): string {
  return `/photos/${BUNDLED[index]!.file}`
}

export { nextPhoto, resolvePhoto } from './rotation'
```

```ts
// src/lib/idb.ts — single-slot store for the user-uploaded background.
const DB_NAME = 'aurora'
const STORE = 'photos'
const SLOT = 'user-photo'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function putUpload(blob: Blob): Promise<IDBValidKey> {
  return withStore('readwrite', (s) => s.put(blob, SLOT))
}

export async function getUpload(): Promise<Blob | null> {
  const value = await withStore<unknown>('readonly', (s) => s.get(SLOT))
  return value instanceof Blob ? value : null
}

export function clearUpload(): Promise<undefined> {
  return withStore('readwrite', (s) => s.delete(SLOT))
}
```

- [ ] **Step 8: Write `src/newtab/components/Background.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { getUpload } from '../../lib/idb'
import { BUNDLED, bundledUrl, nextPhoto, resolvePhoto } from '../../services/photos/index'
import { todayKey } from '../../lib/dates'

export default function Background({
  prefs,
  onPrefsChange,
}: {
  prefs: PhotoPrefs
  onPrefsChange: (next: PhotoPrefs) => void
}) {
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const today = todayKey()

  useEffect(() => {
    if (prefs.mode !== 'upload') {
      setUploadUrl(null)
      return
    }
    let url: string | null = null
    void getUpload().then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob)
        setUploadUrl(url)
      }
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
    // depend on the prefs object, not just mode: saving prefs after a new upload
    // must re-read the IDB slot even though mode is still 'upload'
  }, [prefs])

  const { index, rotated } = resolvePhoto(prefs, today, BUNDLED.length)
  useEffect(() => {
    if (rotated) onPrefsChange({ ...prefs, index, lastRotated: today })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per rotation
  }, [rotated, index, today])

  const showPhoto =
    (prefs.mode === 'upload' && uploadUrl) ||
    (prefs.mode === 'auto' && BUNDLED.length > 0)
  const src = prefs.mode === 'upload' ? uploadUrl : bundledUrl(index)
  const credit = prefs.mode === 'auto' && BUNDLED[index] ? BUNDLED[index] : null

  return (
    <div aria-hidden className="fixed inset-0 -z-10" style={{ background: 'var(--bg-fallback)' }}>
      {showPhoto && src && (
        <img
          key={src}
          src={src}
          alt=""
          className="h-full w-full object-cover opacity-0 transition-opacity duration-700 motion-reduce:transition-none"
          onLoad={(e) => e.currentTarget.classList.replace('opacity-0', 'opacity-100')}
        />
      )}
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
      {prefs.mode === 'auto' && BUNDLED.length > 0 && (
        <button
          type="button"
          aria-label="New background photo"
          title={credit ? `${credit.label} — click for a new photo` : 'New photo'}
          onClick={() => onPrefsChange(nextPhoto(prefs, today, BUNDLED.length))}
          className="pointer-events-auto absolute bottom-4 left-4 rounded-full bg-panel p-2 text-fg-muted backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
```

Note: `Background` sits behind everything (`-z-10`) and is `aria-hidden` except the refresh button, which must remain focusable — that's why the button uses `pointer-events-auto` and lives inside; move the button OUTSIDE the `aria-hidden` wrapper if a screen reader can't reach it (verify in Step 10). If it can't be reached, render the button as a sibling in the same component root instead.

- [ ] **Step 9: Mount it in `App.tsx`** — add to the interim App from Task 5:

```tsx
import { useEffect } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import Background from './components/Background'

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings || !photoPrefs) return null
  return (
    <main className="relative flex h-screen items-center justify-center text-fg">
      <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />
      <h1 className="text-2xl font-light tracking-[0.3em]">AURORA</h1>
    </main>
  )
}
```

- [ ] **Step 10: Verify** — `npm test` green; `npm run build` succeeds; in the loaded extension: photo shows with scrim, refresh button advances it, Tab reaches the refresh button with a visible focus ring.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: background photo system with daily rotation, upload slot, gradient fallback

<footer>"
```

---

### Task 7: Clock and greeting (TDD on formatting)

**Files:**
- Create: `src/lib/clock.ts`, `src/lib/hooks/useNow.ts`, `src/newtab/components/Clock.tsx`, `src/newtab/components/Greeting.tsx`
- Test: `src/lib/clock.test.ts`

**Interfaces:**
- Consumes: `useStoredKey` (Task 4).
- Produces: `formatClock(d: Date, use24Hour: boolean): string`; `greetingFor(hour: number, name: string): string`; `useNow(intervalMs?: number): Date`; `<Clock />`, `<Greeting />` (both read `settings` themselves via `useStoredKey`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/clock.test.ts
import { describe, expect, it } from 'vitest'
import { formatClock, greetingFor } from './clock'

describe('formatClock', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 26, h, m)
  it('formats 24-hour time zero-padded', () => {
    expect(formatClock(at(9, 5), true)).toBe('09:05')
    expect(formatClock(at(0, 0), true)).toBe('00:00')
  })
  it('formats 12-hour time without leading zero', () => {
    expect(formatClock(at(15, 40), false)).toBe('3:40')
    expect(formatClock(at(12, 0), false)).toBe('12:00')
    expect(formatClock(at(0, 30), false)).toBe('12:30')
  })
})

describe('greetingFor', () => {
  it('picks the day part by hour', () => {
    expect(greetingFor(6, '')).toBe('Good morning.')
    expect(greetingFor(13, '')).toBe('Good afternoon.')
    expect(greetingFor(19, '')).toBe('Good evening.')
    expect(greetingFor(3, '')).toBe('Good evening.')
  })
  it('includes the name when set', () => {
    expect(greetingFor(6, 'Jon')).toBe('Good morning, Jon.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test`, expected: cannot resolve `./clock`.

- [ ] **Step 3: Write `src/lib/clock.ts`**

```ts
export function formatClock(d: Date, use24Hour: boolean): string {
  const minutes = String(d.getMinutes()).padStart(2, '0')
  if (use24Hour) return `${String(d.getHours()).padStart(2, '0')}:${minutes}`
  const hours = d.getHours() % 12 || 12
  return `${hours}:${minutes}`
}

export function greetingFor(hour: number, name: string): string {
  const part =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 18
        ? 'Good afternoon'
        : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}
```

- [ ] **Step 4: Run tests to verify they pass** — `npm test`.

- [ ] **Step 5: Write hook and components**

```ts
// src/lib/hooks/useNow.ts
import { useEffect, useState } from 'react'

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

```tsx
// src/newtab/components/Clock.tsx
import { formatClock } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Clock() {
  const [settings] = useStoredKey('settings')
  const now = useNow()
  if (!settings) return null
  return (
    <time
      dateTime={now.toISOString()}
      className="text-8xl font-extralight tabular-nums tracking-tight"
    >
      {formatClock(now, settings.use24Hour)}
    </time>
  )
}
```

```tsx
// src/newtab/components/Greeting.tsx
import { greetingFor } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Greeting() {
  const [settings] = useStoredKey('settings')
  const now = useNow(30_000)
  if (!settings) return null
  return <p className="mt-2 text-2xl font-light text-fg">{greetingFor(now.getHours(), settings.name)}</p>
}
```

- [ ] **Step 6: Mount in `App.tsx`** — replace the `<h1>AURORA</h1>` line with:

```tsx
      <div className="flex flex-col items-center">
        <Clock />
        <Greeting />
      </div>
```

(and add `import Clock from './components/Clock'` / `import Greeting from './components/Greeting'`.)

- [ ] **Step 7: Verify** — `npm test` green; `npm run build`; loaded tab shows live clock + greeting.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: clock and time-based greeting

<footer>"
```

---

### Task 8: Focus line (TDD on rollover logic)

**Files:**
- Create: `src/newtab/components/focusLogic.ts`, `src/newtab/components/FocusLine.tsx`
- Test: `src/newtab/components/focusLogic.test.ts`

**Interfaces:**
- Consumes: `Focus` (Task 2), `useStoredKey` (Task 4), `todayKey` (Task 1).
- Produces: `currentFocus(f: Focus | null, today: string): Focus | null`; `setFocusText(text: string, today: string): Focus | null`; `<FocusLine />`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/newtab/components/focusLogic.test.ts
import { describe, expect, it } from 'vitest'
import { currentFocus, setFocusText } from './focusLogic'

describe('currentFocus', () => {
  it('returns the focus when it is from today', () => {
    const f = { text: 'Ship it', date: '2026-07-26', done: false }
    expect(currentFocus(f, '2026-07-26')).toEqual(f)
  })
  it('drops a stale focus from a previous day', () => {
    expect(currentFocus({ text: 'Old', date: '2026-07-25', done: true }, '2026-07-26')).toBeNull()
  })
  it('handles null', () => {
    expect(currentFocus(null, '2026-07-26')).toBeNull()
  })
})

describe('setFocusText', () => {
  it('creates an undone focus for today from trimmed text', () => {
    expect(setFocusText('  Ship it  ', '2026-07-26')).toEqual({
      text: 'Ship it',
      date: '2026-07-26',
      done: false,
    })
  })
  it('clears the focus when the text is blank', () => {
    expect(setFocusText('   ', '2026-07-26')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test`.

- [ ] **Step 3: Write `src/newtab/components/focusLogic.ts`**

```ts
import type { Focus } from '../../lib/storage/schema'

export function currentFocus(focus: Focus | null, today: string): Focus | null {
  return focus && focus.date === today ? focus : null
}

export function setFocusText(text: string, today: string): Focus | null {
  const trimmed = text.trim()
  return trimmed ? { text: trimmed, date: today, done: false } : null
}
```

- [ ] **Step 4: Run tests to verify they pass** — `npm test`.

- [ ] **Step 5: Write `src/newtab/components/FocusLine.tsx`**

```tsx
import { useState } from 'react'
import { todayKey } from '../../lib/dates'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { currentFocus, setFocusText } from './focusLogic'

export default function FocusLine() {
  const [stored, save] = useStoredKey('focus')
  const [editing, setEditing] = useState(false)
  if (stored === undefined) return null

  const today = todayKey()
  const focus = currentFocus(stored, today)

  if (!focus || editing) {
    return (
      <form
        className="mt-10 flex flex-col items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const input = new FormData(e.currentTarget).get('focus')
          save(setFocusText(String(input ?? ''), today))
          setEditing(false)
        }}
      >
        <label htmlFor="focus-input" className="text-lg font-light text-fg-muted">
          What&rsquo;s your main focus today?
        </label>
        <input
          id="focus-input"
          name="focus"
          autoComplete="off"
          defaultValue={focus?.text ?? ''}
          onBlur={(e) => {
            if (editing) {
              save(setFocusText(e.currentTarget.value, today))
              setEditing(false)
            }
          }}
          className="mt-2 w-72 border-b border-panel-border bg-transparent pb-1 text-center text-xl text-fg outline-none focus-visible:border-accent"
        />
      </form>
    )
  }

  return (
    <div className="group mt-10 flex items-center gap-3" aria-live="polite">
      <input
        id="focus-done"
        type="checkbox"
        checked={focus.done}
        onChange={() => save({ ...focus, done: !focus.done })}
        className="size-5 accent-(--accent)"
      />
      <label
        htmlFor="focus-done"
        className={`text-xl transition-opacity motion-reduce:transition-none ${
          focus.done ? 'text-fg-muted line-through opacity-70' : 'text-fg'
        }`}
      >
        {focus.text}
      </label>
      {focus.done && <span className="text-sm text-accent">Nice.</span>}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-fg-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Edit
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Mount `<FocusLine />` in `App.tsx`** below `<Greeting />`.

- [ ] **Step 7: Verify** — `npm test` green; build; in the tab: set a focus, check it done ("Nice." appears, announced politely), Edit works, focus persists across tab reloads.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: daily focus line with done state and next-day reset

<footer>"
```

---

### Task 9: Search bar (toggleable)

**Files:**
- Create: `src/lib/search.ts`, `src/newtab/components/SearchBar.tsx`
- Test: `src/lib/search.test.ts`

**Interfaces:**
- Consumes: `Settings['searchEngine']` (Task 2), `useStoredKey` (Task 4).
- Produces: `ENGINES: Record<'google' | 'duckduckgo' | 'bing', { label: string; url: string }>`; `searchUrl(engine: keyof typeof ENGINES, query: string): string`; `<SearchBar />` (renders `null` when `settings.widgets.search` is false).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/search.test.ts
import { describe, expect, it } from 'vitest'
import { searchUrl } from './search'

describe('searchUrl', () => {
  it('builds an encoded query URL for the chosen engine', () => {
    expect(searchUrl('google', 'hello world')).toBe(
      'https://www.google.com/search?q=hello%20world',
    )
    expect(searchUrl('duckduckgo', 'a&b')).toBe('https://duckduckgo.com/?q=a%26b')
  })
  it('trims the query', () => {
    expect(searchUrl('bing', '  cats  ')).toBe('https://www.bing.com/search?q=cats')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test`.

- [ ] **Step 3: Write `src/lib/search.ts`**

```ts
export const ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
} as const

export function searchUrl(engine: keyof typeof ENGINES, query: string): string {
  return ENGINES[engine].url + encodeURIComponent(query.trim())
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`.

- [ ] **Step 5: Write `src/newtab/components/SearchBar.tsx`**

```tsx
import { searchUrl } from '../../lib/search'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function SearchBar() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.search) return null
  return (
    <form
      role="search"
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault()
        const q = String(new FormData(e.currentTarget).get('q') ?? '')
        if (q.trim()) window.location.assign(searchUrl(settings.searchEngine, q))
      }}
    >
      <input
        name="q"
        type="search"
        placeholder="Search the web"
        aria-label="Search the web"
        autoComplete="off"
        className="w-80 rounded-panel border border-panel-border bg-panel px-4 py-2 text-center text-fg placeholder:text-fg-muted backdrop-blur-[var(--panel-blur)] outline-none focus-visible:border-accent"
      />
    </form>
  )
}
```

- [ ] **Step 6: Mount `<SearchBar />` in `App.tsx`** between `<Greeting />` and `<FocusLine />`.

- [ ] **Step 7: Verify** — tests green; build; searching navigates the tab to the engine.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: toggleable web search bar

<footer>"
```

---

### Task 10: Settings drawer

**Files:**
- Create: `src/lib/hooks/useFocusTrap.ts`, `src/settings/Drawer.tsx`, `src/settings/SettingsPanel.tsx`
- Modify: `src/newtab/App.tsx`

**Interfaces:**
- Consumes: `useStoredKey`, `Settings`, `WidgetToggles`, `PhotoPrefs`, `THEMES`, `ENGINES`, `putUpload` (earlier tasks).
- Produces: `<SettingsButton />`-style gear toggle inside `App`; `<Drawer open onClose>{children}</Drawer>`; `<SettingsPanel />` editing every `Settings` field. `useFocusTrap(ref, active)` hook.

- [ ] **Step 1: Write `src/lib/hooks/useFocusTrap.ts`**

```ts
import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return
    const node = ref.current
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusables()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [ref, active])
}
```

- [ ] **Step 2: Write `src/settings/Drawer.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/hooks/useFocusTrap'

export default function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30"
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        inert={!open} // off-screen drawer must not stay in the tab order
        className={`fixed inset-y-0 right-0 z-50 w-96 max-w-full overflow-y-auto border-l border-panel-border bg-panel p-6 text-fg backdrop-blur-[var(--panel-blur)] transition-transform duration-300 motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Write `src/settings/SettingsPanel.tsx`**

```tsx
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { THEMES } from '../theme/index'
import { ENGINES } from '../lib/search'
import { putUpload } from '../lib/idb'
import type { PhotoPrefs, Settings, WidgetToggles } from '../lib/storage/schema'

const WIDGET_LABELS: Record<keyof WidgetToggles, string> = {
  search: 'Search bar',
  weather: 'Weather',
  links: 'Quick links',
  todo: 'To-do lists',
  timer: 'Focus timer',
  quote: 'Daily quote',
}

const row = 'flex items-center justify-between gap-4 py-2'
const label = 'text-sm text-fg-muted'
const control =
  'rounded border border-panel-border bg-transparent px-2 py-1 text-sm text-fg outline-none focus-visible:border-accent'

export default function SettingsPanel() {
  const [settings, save] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  if (!settings) return null
  const patch = (p: Partial<Settings>) => save({ ...settings, ...p })

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Profile">
        <div className={row}>
          <label htmlFor="set-name" className={label}>
            Your name
          </label>
          <input
            id="set-name"
            defaultValue={settings.name}
            onBlur={(e) => patch({ name: e.currentTarget.value.trim() })}
            className={control}
          />
        </div>
      </section>

      <section aria-label="Appearance">
        <div className={row}>
          <span className={label} id="theme-label">
            Theme
          </span>
          <div role="radiogroup" aria-labelledby="theme-label" className="flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={settings.theme === t.id}
                onClick={() => patch({ theme: t.id })}
                className={`rounded-full border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
                  settings.theme === t.id
                    ? 'border-accent text-fg'
                    : 'border-panel-border text-fg-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Clock and units">
        <div className={row}>
          <label htmlFor="set-24h" className={label}>
            24-hour clock
          </label>
          <input
            id="set-24h"
            type="checkbox"
            checked={settings.use24Hour}
            onChange={(e) => patch({ use24Hour: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
        <div className={row}>
          <label htmlFor="set-units" className={label}>
            Units
          </label>
          <select
            id="set-units"
            value={settings.units}
            onChange={(e) => patch({ units: e.currentTarget.value as Settings['units'] })}
            className={control}
          >
            <option value="metric">Celsius</option>
            <option value="imperial">Fahrenheit</option>
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-engine" className={label}>
            Search engine
          </label>
          <select
            id="set-engine"
            value={settings.searchEngine}
            onChange={(e) =>
              patch({ searchEngine: e.currentTarget.value as Settings['searchEngine'] })
            }
            className={control}
          >
            {Object.entries(ENGINES).map(([id, engine]) => (
              <option key={id} value={id}>
                {engine.label}
              </option>
            ))}
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-muted" className={label}>
            Mute sounds
          </label>
          <input
            id="set-muted"
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => patch({ muted: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
      </section>

      <section aria-label="Background">
        <h3 className="mb-1 text-sm font-medium text-fg">Background</h3>
        <div className={row}>
          <label htmlFor="set-bg-mode" className={label}>
            Source
          </label>
          <select
            id="set-bg-mode"
            value={photoPrefs?.mode ?? 'auto'}
            onChange={(e) =>
              photoPrefs &&
              savePhotoPrefs({ ...photoPrefs, mode: e.currentTarget.value as PhotoPrefs['mode'] })
            }
            className={control}
          >
            <option value="auto">Daily photo</option>
            <option value="upload">My photo</option>
            <option value="gradient">Gradient</option>
          </select>
        </div>
        {photoPrefs?.mode === 'upload' && (
          <div className={row}>
            <label htmlFor="set-bg-file" className={label}>
              Image file
            </label>
            <input
              id="set-bg-file"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                if (file) {
                  await putUpload(file)
                  // re-save prefs so Background re-reads the upload slot
                  savePhotoPrefs({ ...photoPrefs })
                }
              }}
              className="max-w-48 text-sm text-fg-muted file:mr-2 file:rounded file:border file:border-panel-border file:bg-transparent file:px-2 file:py-1 file:text-fg"
            />
          </div>
        )}
      </section>

      <section aria-label="Widgets">
        <h3 className="mb-1 text-sm font-medium text-fg">Widgets</h3>
        {(Object.keys(WIDGET_LABELS) as (keyof WidgetToggles)[]).map((key) => (
          <div key={key} className={row}>
            <label htmlFor={`w-${key}`} className={label}>
              {WIDGET_LABELS[key]}
            </label>
            <input
              id={`w-${key}`}
              type="checkbox"
              checked={settings.widgets[key]}
              onChange={(e) =>
                patch({ widgets: { ...settings.widgets, [key]: e.currentTarget.checked } })
              }
              className="size-4 accent-(--accent)"
            />
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Add the gear button + drawer to `App.tsx`**

```tsx
// additions to App component body:
const [settingsOpen, setSettingsOpen] = useState(false)

// after </div> that closes the center column, inside <main>:
<button
  type="button"
  aria-label="Open settings"
  onClick={() => setSettingsOpen(true)}
  className="fixed bottom-4 right-4 rounded-full bg-panel p-2 text-fg-muted backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
</button>
<Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
  <SettingsPanel />
</Drawer>
```

(add `import { useState } from 'react'`, `import Drawer from '../settings/Drawer'`, `import SettingsPanel from '../settings/SettingsPanel'`.)

- [ ] **Step 5: Verify** — tests green; build; in the tab: gear opens drawer, focus lands inside and is trapped, Esc closes and returns focus to the gear, every field persists (reload the tab to confirm), theme radio switches instantly, toggling "Search bar" hides/shows it, switching Background source to "My photo" + choosing a file shows the upload, "Gradient" shows the theme fallback.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: settings drawer with theme, clock, units, widget toggles

<footer>"
```

---

### Task 11: App shell composition + widget error boundary (⏸ Pause 2 after this task)

**Files:**
- Create: `src/newtab/components/WidgetBoundary.tsx`
- Modify: `src/newtab/App.tsx` (final M3 form)

**Interfaces:**
- Consumes: everything above.
- Produces: `<WidgetBoundary name="...">` — later widget milestones MUST wrap every widget in it. Final `App.tsx` layout that M4+ widgets slot into.

- [ ] **Step 1: Write `src/newtab/components/WidgetBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react'

interface Props {
  name: string
  children: ReactNode
}

export default class WidgetBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[aurora] ${this.props.name} widget crashed:`, error)
  }

  render() {
    if (this.state.failed) return null // a broken widget must never break the page
    return this.props.children
  }
}
```

- [ ] **Step 2: Final `src/newtab/App.tsx` for M3**

```tsx
import { useEffect, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import Background from './components/Background'
import Clock from './components/Clock'
import Greeting from './components/Greeting'
import FocusLine from './components/FocusLine'
import SearchBar from './components/SearchBar'
import WidgetBoundary from './components/WidgetBoundary'
import Drawer from '../settings/Drawer'
import SettingsPanel from '../settings/SettingsPanel'

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings || !photoPrefs) return null

  return (
    <main className="relative h-screen overflow-hidden text-fg">
      <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />

      <div className="flex h-full flex-col items-center justify-center">
        <WidgetBoundary name="clock">
          <Clock />
          <Greeting />
        </WidgetBoundary>
        <WidgetBoundary name="search">
          <SearchBar />
        </WidgetBoundary>
        <WidgetBoundary name="focus">
          <FocusLine />
        </WidgetBoundary>
      </div>

      <button
        type="button"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-4 right-4 rounded-full bg-panel p-2 text-fg-muted backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsPanel />
      </Drawer>
    </main>
  )
}
```

- [ ] **Step 3: Full verification pass**

Run: `npm test` (all suites green) and `npm run build` (clean).
Manual checklist in the loaded extension:
- New tab shows photo + scrim, clock, greeting, search, focus line.
- Keyboard-only walk: Tab reaches search → focus line → photo refresh → gear; every stop has a visible focus ring; drawer traps focus; Esc closes.
- DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → no transitions.
- All three themes look distinct and text stays readable on the brightest bundled photo.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: M3 core layout — composed shell with widget boundaries

<footer>"
```

- [ ] **Step 5: ⏸ PAUSE 2 — report to user.** Summarize what's visible, remind them to press the reload icon on `chrome://extensions` after pulling new builds, and collect feedback before the widget milestones (M4+, separate plan).

---

## Out of scope for this plan

M4–M9 (weather, quick links, to-do, focus timer, quote, command palette) and M10 (polish + README) get their own plan after Pause 2 feedback — the spec's milestone list is unchanged; only the planning is staged.
