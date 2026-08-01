/** Thin chrome.permissions wrapper, shared by every permission Aurora
 *  requests at RUNTIME instead of at install time — currently just
 *  'bookmarks' (see src/manifest.ts's `optional_permissions`).
 *
 *  IMPORTANT: this service is only for permissions Chrome actually allows
 *  to be optional. Chrome maintains a fixed allow-list for that — not every
 *  permission qualifies. `geolocation` does NOT: it was moved into
 *  `optional_permissions` once, and chrome://extensions responded with
 *  "Permission 'geolocation' cannot be listed as optional. This permission
 *  will be omitted" (see src/manifest.ts's comment for the full story),
 *  silently leaving nothing for chrome.permissions.request() to grant. So
 *  geolocation lives in install-time `permissions` instead, and
 *  LocationSetup.tsx's useDevice calls navigator.geolocation directly, with
 *  no request()/hasPermission() gate through this module at all. Before
 *  routing a new permission through hasPermission/ensurePermission below,
 *  confirm Chrome's docs actually list it as optional-capable — if not, it
 *  belongs in install-time `permissions` and the caller uses the browser
 *  API straight, the same way LocationSetup.tsx does.
 *
 *  Generalized out of what used to be bookmarks-only
 *  hasBookmarksPermission/ensureBookmarksPermission
 *  (src/services/bookmarks.ts), which now delegate here as thin,
 *  permission-pinned wrappers so their exported names — and every existing
 *  call site/test mock keyed on them — stay unchanged.
 *
 *  This module, alongside the storage driver (chrome.storage) and
 *  bookmarks.ts's loadBarModel (chrome.bookmarks.getTree), is one of the
 *  few places in the codebase allowed to touch chrome.* directly — every
 *  other caller goes through hasPermission/ensurePermission below rather
 *  than chrome.permissions itself. */

/** True if the extension currently holds the named optional permission —
 *  either because a caller previously granted it via ensurePermission
 *  below, or because Chrome carries a previously-granted permission forward
 *  across an update. */
export async function hasPermission(name: chrome.runtime.ManifestPermission): Promise<boolean> {
  return chrome.permissions.contains({ permissions: [name] })
}

/** Requests the named optional permission. MUST be called directly from
 *  within a user gesture (e.g. a click handler) — chrome.permissions.request
 *  only shows its prompt when called that way, and any await inserted before
 *  it (even a fast one, like a hasPermission() pre-check) is an IPC
 *  round-trip that can land outside the gesture window and break the prompt.
 *  So this calls request() straight away, with no pre-check: request()
 *  already resolves true with no prompt at all when the permission is
 *  already held, which is the same outcome a pre-check would have produced,
 *  just without the extra await in front of the gesture-consuming call.
 *  Resolves to whether the permission is held once this settles: true if it
 *  was already granted or the user approves the prompt, false if the user
 *  denies it. Callers should also expect this to reject (not just resolve
 *  false) — e.g. if the gesture context was somehow already lost — and
 *  handle that the same way as an explicit denial. */
export async function ensurePermission(name: chrome.runtime.ManifestPermission): Promise<boolean> {
  return chrome.permissions.request({ permissions: [name] })
}
