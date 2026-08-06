# Resubmission notes — Aurora v1.2.1 (Red Argon remediation)

v1.2.0 was rejected by Chrome Web Store review for Single Purpose violation
**"Red Argon"**: the new-tab page's search bar included an in-extension
Google/DuckDuckGo/Bing engine picker that built its own search-provider URL
and navigated to it directly, rather than respecting the user's own default
search engine via the Chrome Search API. This release removes that picker
entirely and routes every search through `chrome.search.query()`. No other
functional changes are included.

## (a) Reviewer note — paste into the CWS dashboard's "Notes for reviewer" field

Character count: 813 (limit 1000).

```
Violation: Single Purpose ("Red Argon") - v1.2.0 shipped an in-extension search-engine picker (Google/DuckDuckGo/Bing) that built its own provider URL and navigated to it directly, instead of using the Chrome Search API.

Fix in v1.2.1: the engine picker is removed entirely - there is no in-extension search-engine setting anymore. Every search action (the new-tab search bar, and the command palette's "Search the web" command) now calls chrome.search.query() with CURRENT_TAB disposition, so Chrome routes each query to whichever search engine the user has actually selected in their own browser settings. Aurora no longer builds a search URL and no longer offers any engine choice of its own.

No other functional changes are included in this release - it is a scoped fix for the single violation cited above.
```

## (b) Jon's resubmission steps, in order

1. **Upload the new package.** In the CWS Developer Dashboard, go to the
   Aurora item → Package tab → Upload new package, and select
   `release/aurora-1.2.1.zip` (built via `npm run package` from this
   commit's production `dist/`).
2. **Update the listing description.** Store listing → Description: replace
   the current text with the corrected copy in `release/store-listing.md`'s
   "Detailed description" section — specifically, the search-bar bullet no
   longer says "Google, DuckDuckGo, or Bing — your choice." Copy the whole
   block over rather than hand-editing, so wording stays in sync with what's
   reviewed here.
3. **Add the new permission's justification.** Privacy practices →
   Permissions justification: add the `search` permission entry from
   `release/store-listing.md`'s "Per-permission justifications" section (the
   dashboard will show `search` as a newly-requested permission since it
   wasn't in the previously-approved v1.2.0 manifest).
4. **Paste the reviewer note.** Privacy practices (or wherever CWS surfaces
   the current submission's review-notes field) → paste the text block from
   part (a) above verbatim.
5. **Re-check the Data Usage disclosure** against the table in
   `release/store-listing.md` — no answers changed by this release (search
   text goes through `chrome.search.query()`, a local browser-API call, not
   a network request Aurora makes), but confirm the dashboard's saved
   answers still match before submitting.
6. **Submit for review.**
