# Aurora 2.0.0 Chrome Web Store Checklist

> **HARD STOP:** Do not upload, type into a Store field, save a draft, submit, publish, change distribution, or alter rollout until W6-P5 receives contemporaneous explicit owner approval.

## Local staging complete

- [x] Existing item preserved: Aurora `akjalbmacojpmebkgohhcaaiacicpgkh`, publisher `jcooler`.
- [x] Read-only live baseline recorded: public `1.2.1`, five V1 screenshots, no live change.
- [x] Source metadata synchronized at `2.0.0`.
- [x] Production ZIP built once from clean commit `6fae415803a1e4ec18f1f3d0b54afe7f7be05f9b`.
- [x] ZIP audited: `60,443,024` bytes, 59 entries, SHA-256 `31930FEC4A288992EC74FD3173F08FE444D132A00FA7EF51C0900B629F356116`.
- [x] No preview Bookmarks permission, source, test, harness, nested `dist/`, or sourcemap leakage.
- [x] Five current 1280x800 PNGs generated and inspected separately at original resolution.
- [x] Canonical listing, release notes, reviewer note, disclosure map, and dossier staged.
- [x] Store dashboard left unchanged.

## Exact local files

- Package: `release/aurora-2.0.0.zip`
- Dossier: `release/RELEASE-DOSSIER-2.0.0.md`
- Listing copy: `release/store-listing.md`
- Release/reviewer notes: `release/RELEASE-NOTES-2.0.0.md`
- Screenshots, in order:
  1. `release/store-shots/1-hero.png`
  2. `release/store-shots/2-arrange-mode.png`
  3. `release/store-shots/3-calendar-connectors.png`
  4. `release/store-shots/4-direct-tools.png`
  5. `release/store-shots/5-bookmarks-popover.png`

## After explicit W6-P5 approval only

- [ ] Reconfirm the dashboard is still the existing Aurora item and the live version remains below `2.0.0`.
- [ ] Reconfirm the local ZIP bytes and SHA-256 against the dossier immediately before upload.
- [ ] Upload only `release/aurora-2.0.0.zip`.
- [ ] Confirm the parsed manifest exposes optional `bookmarks` and request-only `https://*/*`, with no unexpected permission.
- [ ] Replace Summary, Detailed description, Category, Single purpose, and every permission justification with the exact blocks in `release/store-listing.md`.
- [ ] Keep Remote code set to `No`.
- [ ] Set Data Usage Yes for PII, Health, Authentication, Location, Web history, and Website content.
- [ ] Set Data Usage No for Financial/payment, Personal communications, and User activity.
- [ ] Keep the three currently visible Limited Use certifications checked only if their wording and behavior still match the reconciliation.
- [ ] Keep the canonical privacy-policy URL; set the staged homepage and support URLs.
- [ ] Replace the five V1 screenshots with the five numbered 2.0 images in exact order.
- [ ] Preserve the existing item identity, public distribution, countries/regions, and rollout unless the owner explicitly approves a different action.
- [ ] Review the rendered draft against the dossier before any Save or Submit action.
- [ ] Obtain separate explicit approval for Save draft, Submit for review, Publish, distribution, or rollout whenever the current authority does not already name that action.

## Manual observation ceilings

Do not convert automation into claims about native Chrome zoom, Windows mixed-DPI movement, real screen-reader speech, physical touch/pen hardware, native permission prompts, live connector/Home Assistant success, genuine sleep/wake, OS timezone changes, or unload-time persistence.

Current state: staged locally and stopped before the first Store mutation.
