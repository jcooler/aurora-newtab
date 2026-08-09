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
// `geolocation` is install-time `permissions` in BOTH build modes, and MUST
// STAY THAT WAY — do not move it to `optional_permissions`, even though
// `bookmarks` above looks like a precedent for doing exactly that. It WAS
// tried: moving `geolocation` into `optional_permissions` loads fine, but
// chrome://extensions then shows this warning on the extension's card —
//
//   "Permission 'geolocation' cannot be listed as optional. This
//   permission will be omitted."
//
// — and Chrome means it literally: the permission is dropped from what
// actually gets requested, not merely deferred, so
// chrome.permissions.request({ permissions: ['geolocation'] }) has nothing
// to grant and always resolves as if declined. That made "Use my location"
// dead on arrival (the declined-message showed immediately on every click)
// and left a standing error badge on the extension. Chrome maintains a
// fixed allow-list of permissions that may be declared optional at all —
// geolocation is not on it (nor are a handful of others like `debugger` or
// `proxy`) — so unlike `bookmarks`, there is no build-mode split available
// here; it has to be install-time everywhere. LocationSetup.tsx's
// "Use my location" therefore calls navigator.geolocation.getCurrentPosition
// directly, with no chrome.permissions.request() gate in front of it — the
// permission is already held by the time that button can be clicked.
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
  version: '1.7.0',
  description: 'A calm, local-first new-tab dashboard. No accounts, no tracking, no backend.',
  // `search` (Red Argon remediation, v1.2.1): gives access to chrome.search
  // — see src/services/search.ts, the ONLY caller of chrome.search.query()
  // in this codebase. Chrome's optional-permissions allow-list (the same
  // one that rules out `geolocation` below) does NOT exclude `search` —
  // it's legal to request it at runtime instead of at install. It's placed
  // here anyway, install-time in BOTH build modes, as a deliberate product
  // choice, not a Chrome restriction: the search bar is a flagship,
  // default-on widget (settings.widgets.search defaults to true), visible
  // on every new tab from first launch. Gating it behind an on-first-search
  // permission prompt would put a native Chrome dialog between the user and
  // the very first thing they try to use — worse UX than `bookmarks`
  // below, which is off by default and easily deferred to a real user
  // gesture in Settings.
  permissions:
    env.mode === PREVIEW
      ? ['storage', 'favicon', 'bookmarks', 'geolocation', 'search']
      : ['storage', 'favicon', 'geolocation', 'search'],
  // Chrome disallows (warns/rejects) listing the same permission as both
  // install-time and optional, so the preview build drops `bookmarks` from
  // here rather than duplicating it — it MOVES, it doesn't get held twice.
  // `geolocation` can NEVER appear in this array, in either mode — see the
  // comment above the `permissions` array for the exact Chrome warning that
  // rules it out.
  optional_permissions: env.mode === PREVIEW ? [] : ['bookmarks'],
  // Per-origin host access for connectors (src/services/permissions.ts's
  // originPattern/hasOrigin/ensureOrigin/removeOrigin): every https origin
  // is requestable, but none is pre-granted — a connector still gets
  // Chrome's native per-site prompt via ensureOrigin the first time it's
  // added, scoped to that one origin, not this wildcard. Unlike `bookmarks`
  // above, this isn't build-mode-gated: there's no install-time equivalent
  // to move it to (an install-time `<all_urls>`-style host permission would
  // defeat the entire per-origin, ask-only-for-what-you-use point), so it's
  // identical in both build modes.
  optional_host_permissions: ['https://*/*'],
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
}))
