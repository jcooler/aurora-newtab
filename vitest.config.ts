import { defineConfig } from 'vitest/config'
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
    environment: 'node',
    globals: true, // lets @testing-library/react register its afterEach cleanup
    css: true, // otherwise Vitest mocks CSS imports as empty — themes.test.ts reads themes.css via `?raw` and needs its real content
  },
})
