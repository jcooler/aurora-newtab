import { defineConfig, configDefaults } from 'vitest/config'
import pkg from './package.json'

// Same __APP_VERSION__ define as vite.config.ts (see its comment) —
// duplicated because Vitest ignores vite.config.ts entirely once a
// vitest.config.ts exists, so the real app build and the test build each
// need their own copy of this `define` to keep SettingsPanel.test.tsx's
// version assertion (About.tsx) working under `npm test`.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // Never scan agent worktrees (`.claude/worktrees/*` — transient isolated
    // checkouts other Claude Code sessions leave behind). Their duplicated
    // *.test.tsx files otherwise double the suite AND drag in another branch's
    // in-progress, sometimes-failing tests, making `npm test` non-deterministic.
    // The real project's tests all live outside `.claude/`.
    //
    // preview-information-first.test.mjs is a `node:test` suite (run it with
    // `node --test scripts/preview-information-first.test.mjs`; its six
    // harness-contract checks pass there) — vitest sees the .test.mjs name,
    // finds no vitest suite inside, and fails the whole `npm test` run with
    // "No test suite found". scripts/adaptive-stage-probe.test.mjs is a real
    // vitest suite and stays included.
    exclude: [...configDefaults.exclude, '**/.claude/**', 'scripts/preview-information-first.test.mjs'],
    environment: 'node',
    globals: true, // lets @testing-library/react register its afterEach cleanup
    css: true, // otherwise Vitest mocks CSS imports as empty — themes.test.ts reads themes.css via `?raw` and needs its real content
  },
})
