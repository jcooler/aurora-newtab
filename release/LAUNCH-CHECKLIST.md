# Aurora v1.2.0 — Chrome Web Store launch checklist

Everything in this repo that could be prepared in advance is done: the
version bump, `npm run package` (produces `release/aurora-1.2.0.zip`), the
five store screenshots (`release/store-shots/`), `PRIVACY.md`, and
`release/store-listing.md`. What's left below are the steps only you can
do — account ownership, a public-hosting decision, and the actual CWS
submission.

## 0. Before you start

Run this once, fresh, so you're uploading a zip built from what's actually
committed:

```
npm test
npm run package
```

Confirm it prints all green checks and ends with
`release\aurora-1.2.0.zip`. If anything fails, stop here — don't upload a
zip a failing check produced.

## 1. Chrome Web Store developer account ($5 one-time)

If you don't already have one: go to
https://chrome.google.com/webstore/devconsole, sign in with the Google
account you want to own this listing, and pay the one-time $5 registration
fee. This is a one-time fee per Google account, not per extension — skip if
you've registered before (e.g. for a previous extension).

## 2. Privacy policy hosting — decide where PRIVACY.md lives publicly

CWS requires a **publicly reachable URL** for the privacy policy — not a
file in a private repo. **`github.com/jcooler/aurora-newtab` is currently
PRIVATE**, so `PRIVACY.md`'s raw GitHub URL will 404 for CWS's reviewers and
for anyone else until you change that. Pick one:

| Option | Trade-off | What happens to the Contact link |
|---|---|---|
| **Make the whole repo public**, link `PRIVACY.md` directly (`github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md`) | Simplest, one decision, matches an open-source posture — but it also publishes the entire source, commit history, and internal dev docs (`docs/`, `.superpowers/`), not just the policy. | Works as-is. `PRIVACY.md`'s Contact section links `github.com/jcooler/aurora-newtab/issues` — the issues page goes public the same moment the repo does. Nothing else to do. |
| **Public GitHub Gist** with just the PRIVACY.md contents | Keeps the main repo private; five minutes to set up — but it's a second copy you have to remember to update by hand every time PRIVACY.md changes; easy for the two to drift apart. | **Still broken.** The repo stays private, so the Contact link 404s exactly like the raw policy URL would have. You must do ONE of: (a) make the repo public anyway (collapses this back to the row above), or (b) before hosting, edit `PRIVACY.md`'s own Contact section yourself to a channel that's actually reachable — e.g. a dedicated email address you control (simple, but one more inbox to check), or point it at the Gist's own comment thread (no new inbox, public and permanent, but you'll only see a reply if you go looking). I did not make this edit myself — it's your channel to choose. |
| **GitHub Pages**, publishing only `PRIVACY.md` (or a docs subfolder) as a static site | Stays out of search/browsing of the repo itself, a clean dedicated URL — but is the most setup (enabling Pages, picking a source branch/folder) for a single page. | **Same problem as Gist**, same two options: make the repo public anyway, or edit the Contact section to a dedicated email (or, if the Pages site has any comment/feedback mechanism you set up, that). Either way, decide and edit `PRIVACY.md` *before* publishing the Pages URL anywhere. |

Whichever you pick, the URL goes in the CWS dashboard's "Privacy policy"
field (step 4 below) and should replace the placeholder line in
`release/store-listing.md`'s description ("Read the full privacy policy:
[…]") before you paste that description in. If you land on Gist or Pages
and choose to edit the Contact section, do that edit — and commit it —
before this policy goes live anywhere; a reviewer or user hitting a 404 on
your stated contact channel is the same failure a 404 on the policy itself
would be.

## 3. Zip and screenshots — sanity-check before upload

- `release/aurora-1.2.0.zip` — built by `npm run package` (step 0). Contents
  are already verified (version match, no bookmarks-permission leak, no
  sourcemaps, icons + all 46 bundled photo files present) — see that
  command's own output for the size/content summary.
- `release/store-shots/` — five PNGs, each exactly 1280×800 (verified):
  `1-hero.png`, `2-arrange-mode.png`, `3-weather-location-search.png`,
  `4-glass-theme-panels.png`, `5-bookmarks-popover.png`. Open each once
  yourself before uploading — you know Aurora's actual look better than any
  description of it.

## 4. Dashboard walkthrough — where each prepared text goes

In the Developer Dashboard, create a new item, upload
`release/aurora-1.2.0.zip`, then fill in the **Store listing** tab:

- **Item name** → `Aurora` (from `release/store-listing.md`)
- **Summary** → the 132-char line in `release/store-listing.md`'s "Summary" section
- **Description** → the "Detailed description" block in the same file —
  fill in the privacy-policy URL placeholder first (step 2)
- **Category** → Productivity
- **Screenshots** → the five files in `release/store-shots/`, in the
  numbered order they're named (1 through 5) — CWS lets you reorder after
  upload if you'd rather lead with a different one
- **Single purpose** field → the one-paragraph statement in
  `release/store-listing.md`
- **Permissions justification** fields (one box per permission CWS lists:
  storage, favicon, bookmarks, geolocation) → the matching bullet in
  `release/store-listing.md`'s "Per-permission justifications" section
- **Privacy practices / Data Usage tab** → the table and three
  certification checkboxes in `release/store-listing.md`'s "Data Usage
  disclosure" section — **read that section's closing flag before you tick
  anything**; the disclosure written there differs from the original task
  brief on purpose (Location is honestly marked "collected" because the
  weather feature really does send coordinates to Open-Meteo/BigDataCloud
  when granted) and needs your sign-off
- **Privacy policy URL** → wherever you hosted `PRIVACY.md` in step 2

## 5. Submit

Save, then submit for review. CWS will run its own automated + manual
review.

**Timeline — stated honestly, not a promise:** Google's own guidance is
that most reviews complete within a few hours to a few business days;
first-time submissions and anything requesting sensitive permissions
(Aurora's `bookmarks` and `geolocation`, both optional, both runtime-gated)
sometimes take longer — up to a couple of weeks isn't unheard of, especially
if a reviewer has follow-up questions about permission use. There's no
guaranteed SLA. If it's rejected, the dashboard names the specific policy
section; `PRIVACY.md` and the permission justifications above were written
to answer exactly that class of question, so a rejection likely means
something to fix in the listing text or the hosted URL, not the code.

## 6. After approval

Tag the release that shipped, so the git history matches what's actually
live on the store:

```
git tag -a v1.2.0 -m "Aurora v1.2.0 — Chrome Web Store launch"
git push origin v1.2.0
```

Then:

- Grab the store listing URL CWS gives you once it's live.
- If you want people other than yourself to install it: the repo is
  private (step 2) — decide independently of the privacy-policy hosting
  question whether you want the *store listing* public (anyone with the
  link, or public in CWS search) or unlisted (only people you send the link
  to can install it). CWS's own visibility setting controls this
  separately from your GitHub repo's visibility.
- For your own machine: uninstall the unpacked dev copy
  (`chrome://extensions` → remove the one pointing at this repo's `dist/`)
  and install the published store version instead, so you're running the
  same artifact everyone else is.
