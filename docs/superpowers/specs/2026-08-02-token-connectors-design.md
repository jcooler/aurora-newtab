# Token & No-Auth Connectors — v2 sub-project 2

**Approved by Jon 2026-07-30** (roster + auth-type phasing). Builds on sub-project 1's connector framework (registry, snapshot cache, per-origin permissions, Connectors tab, secretFields-stripped backups) — read that spec first; nothing here re-designs the framework, each connector is a registry entry + pure service + widget block + card config.

## Scope

Six connectors, all authenticated by nothing or by a pasted token — no OAuth, no consent screens:

| Connector | Auth | Origins (user-granted per site) | Widget shows | TTL |
|---|---|---|---|---|
| **GitHub** | Fine-grained PAT (paste) | `https://api.github.com/*` | PRs awaiting your review, assigned issues, unread notification count | 5 min |
| **GitLab** | PAT (paste) + instance URL (default gitlab.com) | user's instance origin | Assigned MRs, todos count | 5 min |
| **Jira** | API token + email + site domain (`*.atlassian.net`) | user's site origin | Issues assigned to you (key, summary, status), count by status | 10 min |
| **Vercel** | API token (paste) | `https://api.vercel.com/*` | Latest deployments (project, state, age); failed deploys surfaced first | 5 min |
| **Crypto ticker** | None | `https://api.coingecko.com/*` | 2–5 chosen coins: price + 24h % (green/red tint via theme-safe classes) | 5 min |
| **Calendar (ICS)** | Secret ICS URL (paste) | the URL's origin | "Next: {event} in {time}" + today's remaining agenda (max 4 rows) | 15 min |

## Binding design points

- **Tokens are secrets**: every token/ICS-URL field is in the connector's `secretFields` (stripped from backups — framework mechanism, verified per connector by test). Stored in `chrome.storage.local` only; PRIVACY.md's Connectors section already covers the pattern — each connector adds its own one-line disclosure (endpoint + what's sent).
- **Validation on connect**: pasting a token triggers one live "who am I" call (GitHub `/user`, GitLab `/user`, Jira `/myself`, Vercel `/v2/user`) inside the same flow that requests the origin — card shows Connected-as-{login} or the API's error, `role="alert"` idiom. Never store a token that failed validation.
- **Rate-respect**: SWR + TTL only — no polling loops; one refresh per stale connector per tab open; `If-None-Match`/ETag reuse where the API provides it (GitHub does — store etag beside the snapshot and treat 304 as a fetchedAt touch).
- **Widget language**: each is a quiet glance panel in the established voice — `text-sm`, panel surface where content sits on a card (Jira/Vercel/GitHub lists) or `text-photo` floating rows where it doesn't (calendar next-event line). Every connector is an arrange-mode `BlockId` with a non-colliding default placement (plan pins exact spots with screenshot gates; defaults must not overlap each other when ALL are enabled — that combined-layout capture is a required harness gate).
- **Empty ≠ placeholder**: a connected connector with nothing to show renders its quiet empty line ("No PRs waiting on you 🎉" — real feedback, in-voice); a NOT-configured connector renders no widget at all.
- **Calendar note (Jon's question, answered in-product)**: the ICS card's helper text explains where to find the URL in Google Calendar/Outlook ("Settings → your calendar → Secret address in iCal format") — the widget is source-agnostic; sub-project 3 adds "Sign in with Google" as a second source on the SAME widget, replacing nothing.
- **ICS parsing**: RRULE support is bounded — expand daily/weekly/monthly rules 60 days out via a small pure expander (TDD hard: DST boundaries, COUNT/UNTIL, EXDATE); anything more exotic renders the base event only. No calendar library (no new runtime deps) unless the plan proves the expander exceeds ~300 lines — at which point STOP and re-decide with Jon.

## Out of scope

OAuth anything (sub-project 3); write operations to any service (all connectors are read-only glances); notifications; stocks (no clean keyless source — revisit only if Jon supplies a paid/keyed source).

## Compliance

No new install-time permissions; every origin user-granted at click time; all services reached directly (no proxy); tokens local-only and backup-stripped. Store-update listing: the Data Usage answers gain "Authentication information: yes — stored locally, never transmitted except to the service it belongs to" — the honest reading, same discipline as the Location disclosure.
