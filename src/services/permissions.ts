/** Thin chrome.permissions wrapper, shared by every permission Aurora
 *  requests at RUNTIME instead of at install time — currently 'bookmarks'
 *  (see src/manifest.ts's `optional_permissions`) plus, via
 *  originPattern/hasOrigin/ensureOrigin/removeOrigin below, per-connector
 *  host access (see src/manifest.ts's `optional_host_permissions`).
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
 *  This module, alongside the storage driver (chrome.storage), bookmarks.ts's
 *  loadBarModel (chrome.bookmarks.getTree), and search.ts's searchWeb
 *  (chrome.search.query), is one of the few places in the codebase allowed
 *  to touch chrome.* directly — every other caller goes through
 *  hasPermission/ensurePermission/hasOrigin/ensureOrigin/removeOrigin below
 *  rather than chrome.permissions itself. `search` is install-time (not
 *  requested through this module) — see src/manifest.ts's comment for why. */

type PermissionBoundary = Pick<
  typeof chrome.permissions,
  'getAll' | 'contains' | 'request' | 'remove' | 'onAdded' | 'onRemoved'
>

let initializedBoundary: PermissionBoundary | null = null

/** Resolves the page-lifetime permission boundary exactly once, when the
 * mirror initializes before React mounts. Preview builds may consume the
 * harness-installed adapter that was already present at document start.
 * Product code never installs an adapter, and non-preview builds constant-fold
 * this branch away so every call below stays on chrome.permissions. */
export function initializePermissionBoundary(): PermissionBoundary {
  if (initializedBoundary) return initializedBoundary
  if (import.meta.env.MODE === 'preview') {
    const harness = (globalThis as typeof globalThis & {
      __auroraPermissionsHarnessApi?: PermissionBoundary
    }).__auroraPermissionsHarnessApi
    if (harness) {
      initializedBoundary = harness
      return initializedBoundary
    }
  }
  initializedBoundary = chrome.permissions
  return initializedBoundary
}

function permissionsBoundary(): PermissionBoundary {
  return initializedBoundary ?? chrome.permissions
}

/** True if the extension currently holds the named optional permission —
 *  either because a caller previously granted it via ensurePermission
 *  below, or because Chrome carries a previously-granted permission forward
 *  across an update. */
export async function hasPermission(name: chrome.runtime.ManifestPermission): Promise<boolean> {
  return permissionsBoundary().contains({ permissions: [name] })
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
  return permissionsBoundary().request({ permissions: [name] })
}

/** Observes one named optional permission without leaking unrelated changes
 * into a feature resource. The listener receives current ownership truth for
 * matching add/remove events and the returned cleanup releases both hooks. */
export function subscribePermission(
  name: chrome.runtime.ManifestPermission,
  listener: (held: boolean) => void,
): () => void {
  const boundary = permissionsBoundary()
  const onAdded = (permissions: chrome.permissions.Permissions) => {
    if (permissions.permissions?.includes(name)) listener(true)
  }
  const onRemoved = (permissions: chrome.permissions.Permissions) => {
    if (permissions.permissions?.includes(name)) listener(false)
  }
  boundary.onAdded.addListener(onAdded)
  boundary.onRemoved.addListener(onRemoved)
  return () => {
    boundary.onAdded.removeListener(onAdded)
    boundary.onRemoved.removeListener(onRemoved)
  }
}

/** Per-origin counterpart to the named-permission trio above, for connectors:
 *  each connector needs host access to exactly the site it fetches, granted
 *  and revoked independently of every other connector's site, rather than
 *  one blanket `<all_urls>` grant covering all of them. Backed by
 *  src/manifest.ts's `optional_host_permissions` wildcard entry (every
 *  https origin, any path), which puts every https origin on Chrome's
 *  requestable allow-list without
 *  pre-granting any of them — chrome.permissions.request below still shows
 *  its native per-site prompt, and chrome.permissions.contains/.remove still
 *  scope to the one pattern passed in, not the wildcard the manifest
 *  declares.
 *
 *  Converts a connector URL into the origin match pattern
 *  chrome.permissions.{contains,request,remove} expect: scheme + host (with
 *  port, if non-default) + '/*', with path and query stripped — Chrome
 *  matches permissions per-origin, not per-page, so
 *  https://news.ycombinator.com/item?id=1 and
 *  https://news.ycombinator.com/other both reduce to the same
 *  'https://news.ycombinator.com/*' pattern. Throws on a non-https URL (this
 *  codebase's connector URLs are validated https-only before they ever reach
 *  here — see the connector config validation, not this module) and on any
 *  string `new URL()` itself can't parse. */
export function originPattern(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error(`originPattern: expected an https URL, got ${JSON.stringify(url)}`)
  }
  return `https://${parsed.host}/*`
}

/** Canonicalizes a batch before any Chrome call. First-seen order is stable
 *  so callers can preserve exact acquisition records, while multiple URLs on
 *  one host collapse to the single match pattern Chrome grants. */
export function canonicalOriginPatterns(urls: readonly string[]): string[] {
  return [...new Set(urls.map(originPattern))]
}

/** True if the extension currently holds host access to the given URL's
 *  origin — either granted previously via ensureOrigin below, or carried
 *  forward by Chrome across an update, same as hasPermission above. */
export async function hasOrigin(url: string): Promise<boolean> {
  return permissionsBoundary().contains({ origins: [originPattern(url)] })
}

/** Batched access check used after a transaction enters the lifecycle lock. */
export async function hasOrigins(urls: readonly string[]): Promise<boolean> {
  return permissionsBoundary().contains({ origins: canonicalOriginPatterns(urls) })
}

/** Requests host access to the given URL's origin. Same gesture-chain
 *  discipline as ensurePermission above and for the same reason: MUST be
 *  called directly from within a user gesture, with zero awaits ahead of
 *  it — originPattern() above is synchronous, so computing the pattern
 *  doesn't cost the gesture window the way an await would. No contains()
 *  pre-check either, for the same reason: request() already resolves true
 *  with no prompt when the origin is already held. Resolves to whether the
 *  origin is held once this settles; also expect this to reject and treat
 *  that the same as a denial. */
export async function ensureOrigin(url: string): Promise<boolean> {
  return permissionsBoundary().request({ origins: [originPattern(url)] })
}

/** Plural counterpart to ensureOrigin above, for a caller that needs MULTIPLE
 *  origins granted via a SINGLE user gesture — the APOD background feature
 *  (Task 95) is the first: it needs both api.nasa.gov (the JSON endpoint) and
 *  apod.nasa.gov (the image host) from one settings-toggle click. Chrome
 *  shows its permission prompt only once per gesture, so this batches every
 *  pattern into ONE chrome.permissions.request({ origins }) call rather than
 *  one ensureOrigin() call per site — which would consume the gesture on the
 *  first request and silently no-op (or reject) on the rest. That's the
 *  entire reason this exists as its own function instead of a caller looping
 *  ensureOrigin: two origins, one prompt, one gesture.
 *
 *  Same gesture-chain discipline as ensureOrigin: MUST be called directly
 *  from within a user gesture, with zero awaits ahead of the request() call.
 *  originPattern() is synchronous, so computing every pattern up front costs
 *  nothing against the gesture window — but unlike the singular ensureOrigin
 *  (which lets a bad URL's throw propagate straight out), this resolves to
 *  `false` instead: a caller passing a batch wants "did the grant happen",
 *  not an exception from one bad entry, and computing every pattern BEFORE
 *  request() is called means a bad entry is caught with ZERO awaits and ZERO
 *  chrome.permissions.request calls made — not a request already in flight
 *  followed by a thrown error. All-or-nothing throughout: request() itself
 *  already grants every listed origin together or none at all, so there's no
 *  partial-grant case beyond the pattern-computation guard above. */
export async function ensureOrigins(urls: readonly string[]): Promise<boolean> {
  let origins: string[]
  try {
    origins = urls.map(originPattern)
  } catch {
    return false
  }
  return permissionsBoundary().request({ origins })
}

/** Revokes host access to a URL or canonical origin pattern. Chrome's boolean
 *  and any rejection are preserved so ownership-aware callers can distinguish
 *  a confirmed removal from an unverifiable failure and offer retry. */
export async function removeOrigin(patternOrUrl: string): Promise<boolean> {
  return permissionsBoundary().remove({ origins: [originPattern(patternOrUrl)] })
}

/** Google Calendar's direct-read boundary is deliberately pinned instead of
 * accepting a caller-supplied URL. The request must remain the first async
 * boundary reached from the Connect click so Chrome retains the gesture. */
export const GOOGLE_CALENDAR_API_ORIGIN = 'https://www.googleapis.com/*' as const

export async function ensureGoogleCalendarOrigin(): Promise<boolean> {
  return permissionsBoundary().request({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
}

export async function hasGoogleCalendarOrigin(): Promise<boolean> {
  return permissionsBoundary().contains({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
}

export async function removeGoogleCalendarOrigin(): Promise<boolean> {
  return permissionsBoundary().remove({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
}

/** Microsoft Calendar's direct-read boundary mirrors the Google lifecycle but
 * owns a separate exact origin so either provider can be removed independently. */
export const MICROSOFT_GRAPH_ORIGIN = 'https://graph.microsoft.com/*' as const

export async function ensureMicrosoftGraphOrigin(): Promise<boolean> {
  return permissionsBoundary().request({ origins: [MICROSOFT_GRAPH_ORIGIN] })
}

export async function hasMicrosoftGraphOrigin(): Promise<boolean> {
  return permissionsBoundary().contains({ origins: [MICROSOFT_GRAPH_ORIGIN] })
}

export async function removeMicrosoftGraphOrigin(): Promise<boolean> {
  return permissionsBoundary().remove({ origins: [MICROSOFT_GRAPH_ORIGIN] })
}
