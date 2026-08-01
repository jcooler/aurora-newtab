import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'
import pkg from './package.json'

// __APP_VERSION__: single source of truth for the version shown in the
// Settings drawer footer (see src/settings/sections/About.tsx) — read from
// package.json at build time (via a plain JSON import, resolveJsonModule is
// already on in tsconfig.json) rather than duplicated as a literal that
// could drift, and rather than calling chrome.runtime.getManifest()
// (settings components don't touch chrome.* — confined to the storage
// driver + services/bookmarks.ts + services/permissions.ts). vitest.config.ts
// defines the same constant separately (Vitest ignores vite.config.ts
// entirely once a vitest.config.ts exists), so both must be kept in sync if
// this ever changes.
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
  },
})
