# Account & Sync visual gate

**Packet:** PM-P1 Task 1

**Source checkpoint:** `cd7e4afad12e2b6cd4c3c1eab90252a95677f8b8`

**Capture command:** `node scripts/capture-paid-account-shell-mockup.mjs`
**Owner visual decision:** Approved in Codex on 2026-09-01

These static captures reuse the production Settings geometry and Tab Two visual
tokens without importing or editing production React or CSS. The fixture has no
network, storage, account, billing, sync, permission, or backend behavior.

| Capture | Dimensions | Text clipping | Control overlap | Destructive hierarchy | Visible focus | Scroll ownership | Touch containment |
|---|---:|---|---|---|---|---|---|
| `account-local-desktop.png` | 1600 x 900 | PASS | PASS | PASS | PASS, Sign in with Google | PASS, drawer is the only designated owner and no overflow is active | N/A |
| `account-signed-in-desktop.png` | 1600 x 900 | PASS | PASS | PASS | PASS, Enable sync | PASS, drawer is the only designated owner and no overflow is active | N/A |
| `account-sync-touch.png` | 768 x 812 | PASS | PASS | PASS | PASS, sync switch | PASS, drawer is the only designated owner and no overflow is active | PASS, controls remain inside the 768 x 812 viewport |
| `account-device-limit.png` | 1600 x 900 | PASS | PASS | PASS | PASS, first Remove action | PASS, drawer is the only designated owner and no overflow is active | N/A |
| `account-delete-confirmation.png` | 1600 x 900 | PASS | PASS | PASS, destructive action is isolated in a fresh-auth dialog | PASS, Delete account | PASS, drawer is the only designated owner and no overflow is active | N/A |

## Original-resolution inspection

- Local mode keeps Sign in with Google and View plans optional and separates
  sign-in from sync or upload.
- Signed-in sync-off shows identity, subscription, Enable sync, last successful
  sync, quota, Sync now, devices, billing, vault deletion, sign-out, and account
  deletion without adding a canvas account control.
- Touch sync-on preserves 40 to 44 pixel control rows, a horizontal six-tab
  Settings rail, readable quota/status facts, and contained device actions.
- Device-limit treatment blocks only sync activation, shows all five active
  installations, requires an explicit removal choice, and states that local data
  is not remotely erased.
- Account deletion visually separates the destructive action, records fresh
  Google verification, requires explicit typed confirmation, and states that
  installation-local data remains.

Automated capture checks also passed exact PNG dimensions, horizontal overflow,
clipped controls, multiple scroll owners, visible focus, console errors, and
page errors for all five states.
