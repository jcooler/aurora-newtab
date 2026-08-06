/** Routes every in-app search through Chrome's own Search API instead of
 *  Aurora building a provider URL itself.
 *
 *  BINDING — Chrome Web Store violation "Red Argon" (Single Purpose),
 *  v1.2.0 rejection: a prior release shipped an in-extension
 *  Google/DuckDuckGo/Bing picker (formerly src/lib/search.ts — deleted) that
 *  built a provider URL by hand and navigated straight to it. Google's
 *  review flagged that as changing the user's search experience without
 *  going through the platform's own mechanism: "If your new tab page
 *  includes a search experience, it must respect the user's selected
 *  settings by using the Chrome Search API." Aurora never touched
 *  chrome://settings' default provider — the picker itself, offering a
 *  choice Aurora decided among instead of Chrome, was the violation.
 *
 *  NEVER AGAIN: no engine picker, no provider URL, no hand-built query
 *  string, anywhere in this codebase. Every search — the search bar, the
 *  command palette's "Search the web for…" fallback, and any future
 *  search-shaped feature — MUST call searchWeb() below, which hands the raw
 *  text to chrome.search.query() and lets Chrome route it to whichever
 *  engine the user has actually selected in their own browser settings.
 *  Aurora never sees, and never needs to know, which engine that is.
 *
 *  This module is one of the few places in the codebase allowed to touch
 *  chrome.* directly (alongside the storage driver, services/bookmarks.ts's
 *  loadBarModel, and services/permissions.ts — see permissions.ts's roster
 *  comment). Callers (SearchBar.tsx, Palette.tsx) call searchWeb(), never
 *  chrome.search itself.
 *
 *  Quiet failure, same convention as the rest of the app (see
 *  services/weather/reverseGeocode.ts's doc comment) — a search bar isn't
 *  the place for an error banner, and chrome.search.query can reject (e.g.
 *  no default provider configured, or the call happens outside a user
 *  gesture on some Chrome versions).
 */
export async function searchWeb(text: string): Promise<void> {
  try {
    await chrome.search.query({ text, disposition: 'CURRENT_TAB' })
  } catch {
    // Quiet failure — see doc comment above.
  }
}
