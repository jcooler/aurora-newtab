import { defineManifest } from '@crxjs/vite-plugin'

// `bookmarks` is normally an OPTIONAL permission: real users are never
// prompted for it just to load the extension — BookmarksBar.tsx requests it
// at runtime, from a click inside Settings, only once the widget is turned
// on. That's correct for production, but it makes the permission
// impossible to grant under Playwright automation (chrome.permissions
// .request() only shows its native prompt from a real user gesture, which
// automation can't supply, and there's no way to click through the OS-level
// dialog either) — so scripts/preview.mjs has always had to SKIP the entire
// bookmarks-bar/popover capture, printing an honest line rather than
// silently faking it. That gap is exactly how the bookmarks-popover
// stacking regression (see App.tsx's comment on the bookmarks
// PositionedBlock) shipped without any real-browser probe catching it.
//
// Fix: a PREVIEW build variant (`npm run build:preview`, i.e. `vite build
// --mode preview` — see package.json) moves `bookmarks` into install-time
// `permissions` instead. Chrome DOES auto-grant permissions already present
// in the manifest at install/load time (unlike ones added later or
// requested via the optional_permissions API), so a preview build loaded
// via `--load-extension` starts with the permission already held —
// scripts/preview.mjs's existing `chrome.permissions.contains()` check
// then finds it granted and runs the full real-Chromium bookmarks flow
// instead of skipping it. A normal (production) build still gets
// `bookmarks` as optional-only, byte-identical to before this change.
//
// `geolocation` made the same optional-permission move (LocationSetup.tsx's
// "Use my location" button now requests it at click time via
// ensurePermission('geolocation') — see src/services/permissions.ts), but
// UNLIKE bookmarks it stays optional-only in the preview build too: the
// preview harness (scripts/preview.mjs) seeds a manual location directly
// into chrome.storage.local and never clicks "Use my location", so there's
// no real-Chromium geolocation flow for install-time granting to unlock —
// nothing in the preview capture would exercise it either way.
//
// `env.mode` is Vite's build mode (`vite build` defaults to 'production';
// `--mode preview` sets it to 'preview'). This is the cleanest
// @crxjs-supported mechanism for the switch: `defineManifest` accepts
// `(env: ConfigEnv) => ManifestOptions` — see
// node_modules/@crxjs/vite-plugin/dist/index.d.ts (`ManifestV3Define`) —
// and Vite invokes it with the real ConfigEnv for whichever mode is
// building, so this recomputes per build with no extra env var or
// cross-build state to keep in sync beyond package.json's own scripts.
const PREVIEW = 'preview'

export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'Aurora',
  version: '1.2.0',
  description: 'A calm, local-first new-tab dashboard. No accounts, no tracking, no backend.',
  permissions:
    env.mode === PREVIEW
      ? ['storage', 'favicon', 'bookmarks']
      : ['storage', 'favicon'],
  // Chrome disallows (warns/rejects) listing the same permission as both
  // install-time and optional, so the preview build drops `bookmarks` from
  // here rather than duplicating it — it MOVES, it doesn't get held twice.
  // `geolocation` is optional in BOTH modes (see the comment above), so it
  // lives in this array unconditionally.
  optional_permissions: env.mode === PREVIEW ? ['geolocation'] : ['bookmarks', 'geolocation'],
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
}))
