# OAuth Wave: Gmail, Google Calendar, Spotify — v2 sub-project 3

**Approved by Jon 2026-07-30.** Last of the connector waves because its cost is mostly PAPERWORK, not code — and Google's process favors an established published listing, which v1.2.0 (+ the sub-project-2 store update) gives us. Builds on the same framework; read sub-projects 1–2's specs first.

## The honest cost table (read before scheduling)

| Connector | Mechanism | Verification burden |
|---|---|---|
| **Spotify** | `chrome.identity.launchWebAuthFlow` + PKCE (public client, no secret) | None beyond a free Spotify developer app registration. **Do this one first** — it proves the OAuth plumbing with zero Google process. |
| **Google Calendar** | `chrome.identity` + manifest `oauth2` client, scope `calendar.readonly` | Google OAuth verification: consent screen, brand verification, scope justification. SENSITIVE scope — verification review, no security assessment. Weeks, not days; free. |
| **Gmail** | Same client, scope `gmail.readonly` (or `gmail.metadata`) | RESTRICTED scope — everything Calendar needs PLUS a CASA security assessment (self-scan tier exists; annual renewal). This is the single most expensive item on the entire roster. The spec's position: ship Calendar first, start Gmail's paperwork in parallel, and let Jon decide at that fork whether the unread-count widget justifies CASA — a scope-reduced alternative (Gmail label metadata only) does NOT escape the restricted tier, so there is no cheap Gmail. |

Jon owns the Google Cloud console steps (project, consent screen, brand verification submissions) — the sub-project's plan must produce a paperwork checklist artifact for him, same pattern as the launch checklist, and treat verification wait-states as non-blocking (code lands behind the framework's card states; a connector whose OAuth app is unverified shows nothing in production — no-placeholder rule — and is exercised via the developer's own test-mode account in the harness-adjacent manual checklist).

## Design

- **OAuth plumbing (once, in the framework)**: `auth: 'oauth'` descriptor support — token acquisition via `chrome.identity` (Google: `getAuthToken` with the manifest `oauth2` key; Spotify: `launchWebAuthFlow` + PKCE + refresh-token rotation), token/refresh-token in `secretFields`-covered config, automatic refresh on 401 with single-retry, Disconnect = token revocation call + local wipe. The `identity` permission joins the manifest — check Chrome's optional-permission allow-list for it during planning; if not allowed optional (memory: verify, don't assume — the geolocation lesson), it becomes install-time with a justification, disclosed like geolocation.
- **Spotify widget**: now playing (track — artist, progress-free; no seek/scrub), play/pause + next via the Web API's player endpoints (the one WRITE exception in the connector roster — called out in its disclosure line). Requires Spotify Premium for control endpoints — card copy states this honestly; free accounts get read-only now-playing.
- **Google Calendar**: becomes source #2 on the SAME calendar widget shipped in sub-project 2 (source switch in the card: ICS URL ⇄ Google account; identical widget rendering either way; multiple-calendar selection, primary default).
- **Gmail widget** (if Jon greenlights at the CASA fork): unread count + latest 3 subjects/senders, read-only, links open Gmail. Nothing else — no bodies, no send, scope-minimal.

## Out of scope

Any additional Google scopes; multi-account; background sync; Spotify library management. Any connector whose verification stalls ships nothing rather than a degraded card.

## Compliance

Every OAuth grant is per-user via the provider's own consent UI; tokens local, backup-stripped, revocable in-card. PRIVACY.md gains per-connector lines; the store listing's Data Usage answers extend ("Personal communications: no — Gmail subjects are displayed, never stored beyond the snapshot cache, never transmitted onward" — exact wording written at ship time against what the code actually does, per the accuracy directive).
