import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Aurora',
  version: '0.1.0',
  description: 'A calm, local-first new-tab dashboard. No accounts, no tracking.',
  permissions: ['storage', 'geolocation', 'favicon'],
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
})
