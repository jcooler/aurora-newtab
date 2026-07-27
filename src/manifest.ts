import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Aurora',
  version: '1.0.0',
  description: 'A calm, local-first new-tab dashboard. No accounts, no tracking.',
  permissions: ['storage', 'geolocation', 'favicon', 'bookmarks'],
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
})
