/// <reference types="vite/client" />

// Injected by Vite's `define` (see vite.config.ts / vitest.config.ts) from
// package.json's version — the single source of truth for the version
// string shown in the Settings drawer footer (src/settings/sections/About.tsx).
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_TAB_TWO_SUPABASE_URL?: string
  readonly VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_TAB_TWO_TRUSTED_LEASE_KEYS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
