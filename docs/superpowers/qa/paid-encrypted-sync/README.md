# PM-P4 encrypted sync visual gate

**Packet:** PM-P4 Task 1

**Capture command:** `node scripts/capture-paid-encrypted-sync-mockups.mjs`

**Owner visual decision:** Approved in Codex on 2026-09-02

These static captures use Tab Two's established Settings geometry and semantic
visual tokens without importing or editing production React or CSS. The fixture
has no network, storage, account, billing, sync, permission, or backend behavior.

## Original-resolution inspection

| Capture | Dimensions | Hierarchy and status | Disclosure and recovery | Targets and focus | Overlap and clipping | Scroll ownership | Touch containment |
|---|---:|---|---|---|---|---|---|
| `sync-off-desktop.png` | 1600 x 900 | PASS, local authority and optional switch are immediate | PASS, exact included and always-local groups are equally readable | PASS, focused 36 px switch target | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |
| `first-sync-desktop.png` | 1600 x 900 | PASS, device naming precedes download | PASS, download-before-upload and always-local exclusions are explicit | PASS, focused 42 px device-name field | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |
| `up-to-date-desktop.png` | 1600 x 900 | PASS, success, last sync, quota, and active-device count scan in order | PASS, removal consequence and recovery behavior remain visible | PASS, focused 42 px Rename action | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |
| `offline-touch.png` | 390 x 844 | PASS, offline is distinct from failure and local availability leads | PASS, queued edits and automatic visible-page recovery need no maintenance action | PASS, focused 36 px switch target | PASS | PASS, Settings is the sole vertical owner and no overflow is active | PASS, all navigation, text, status, and controls remain within 390 x 844 |
| `conflict-recovery-desktop.png` | 1600 x 900 | PASS, attention state leads with preserved local work | PASS, one 30-day backup has explicit review, export, restore, and delete paths | PASS, focused 44 px Review backup action | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |
| `device-limit-desktop.png` | 1600 x 900 | PASS, five-device boundary and selected installation are unambiguous | PASS, no auto-eviction and local-data preservation are explicit | PASS, focused 44 px Verify with Google action | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |
| `deletion-desktop.png` | 1600 x 900 | PASS, completed vault deletion remains visible behind account confirmation | PASS, vault and account consequences are distinct and local preservation is repeated | PASS, focused 42 px destructive action plus verified identity and typed confirmation | PASS | PASS, Settings is the sole designated owner and no overflow is active | N/A |

## Design review

- The approved paid-surface language is preserved through the exact semantic
  accent, adaptive panel ink, hairlines, quiet actions, and readable muted copy.
- A single three-pixel trust line connects state, quota, and device meaning. It
  shifts to warning only for Offline, Needs attention, and Device limit.
- The narrow state keeps all six Settings destinations visible in a compact
  two-row rail and leaves the drawer as the only vertical scroll authority.
- The switch preserves a 36 px interaction target and uses a restrained accent
  underline for keyboard focus instead of an oversized circular ring.
- Recovery copy actions are subordinate to the preserved-work message; no
  automatic retry or silent overwrite is implied.
- The device-limit dialog names the exact selected installation and requires
  fresh Google verification before removal.
- The deletion state shows the completed cloud-vault outcome behind a separate
  account-deletion confirmation, making both consequences visible in one gate.

Automated Chromium capture passed exact PNG dimensions, one-document-only
request ledgers, zero failed requests, zero console or page errors, no root
horizontal overflow, no clipped controls, no overlapping control/state labels,
36 px minimum action targets, and visible keyboard focus for every state.
