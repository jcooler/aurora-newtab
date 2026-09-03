# Tab Two Microsoft Calendar Visual Approval Spec

**Status:** Owner approved on 2026-09-03. Production Microsoft Calendar React and CSS remain unchanged at this checkpoint.

**Packet:** PM-P7 Microsoft Calendar

**Design authority:** `docs/superpowers/specs/2026-09-03-tab-two-microsoft-calendar-design.md`

## Design intent

Microsoft Calendar should feel like a natural expansion of the Calendar experience the customer already trusts, not a separate enterprise administration screen. The page has one job: help a signed-in customer confidently connect the personal and work calendars they recognize.

The hierarchy follows a calm four-step path:

1. lead with the value of one schedule across Outlook.com and Microsoft 365;
2. establish read-only control and the direct-browser privacy path before Microsoft opens;
3. let Microsoft own account selection and consent;
4. return to a focused calendar picker and an account-owned connection summary.

The customer never sees an exhaustive limitations panel. Organization policy, reconnect, and disconnect states explain the exact next action while preserving the last complete local schedule.

## Design system plan

### Subject and single job

- **Subject:** a paid, privacy-conscious calendar connection inside Tab Two.
- **Audience:** an individual combining personal Outlook.com calendars with one or more Microsoft 365 work or school accounts.
- **Single job:** connect an account and choose calendars without questioning what Tab Two can change, where event data travels, or which account a calendar belongs to.

### Palette

- **Night:** `#111312` for the photographic canvas veil and deepest background.
- **Charcoal:** `#151716` for the primary Settings field.
- **Graphite:** `#1E2221` for elevated operational surfaces.
- **Tab Two cyan:** `#7DD3FC` for the primary action, selected navigation, focus, and connection rail.
- **Clear sky:** `#38BDF8` for restrained active depth and pending emphasis.
- **Paper:** `#F3F4F2` for primary text, with alpha variants for secondary and tertiary copy.

Microsoft's red, green, blue, and yellow appear only in the provider mark. They do not compete with Tab Two's action color. Individual calendar colors remain provider data and always have adjacent text.

### Typography

- **Display:** Space Grotesk, medium weights, tight tracking, used for decisive page and state headings.
- **Body:** Inter, regular and semibold, used for instructions, calendar names, controls, and status.
- **Operational labels:** Inter uppercase with measured tracking for provider, account-kind, and section labels.

### Layout concept

Desktop Settings keeps its established left navigation and gives the provider detail a single wide reading column. Consent uses an editorial split between benefit and trust. Calendar selection uses an explanatory left rail and a scan-friendly right list. Connected accounts are horizontal records separated by quiet rules rather than a card grid.

```text
+------------------+-------------------------------------------------------+
| Tab Two          | MICROSOFT CALENDAR          [Premium / Connected]    |
|                  | Microsoft Calendar                                    |
| General          |-------------------------------------------------------|
| Progress         |                                                       |
| Widgets          |  Outcome / state copy       Calendar or account work |
| Connectors  |    |  and one primary action     surface                  |
| Data       cyan  |                                                       |
| Account & Sync   |-------------------------------------------------------|
|                  | Quiet privacy or retained-data truth                  |
+------------------+-------------------------------------------------------+
```

Touch width becomes one deliberate column. The calendar list scrolls within the content region while Back and Add remain in a stable footer with 44 px minimum targets.

### Signature element

The **connection rail** is the single distinctive element: a restrained cyan line begins at the connected account identity, then resolves into the selected Microsoft calendar-color swatches. It visually explains that several provider-owned calendars feed one Tab Two schedule without a diagram, ornamental gradient, or nested-card dashboard.

### Motion

Motion is operational. The primary action reserves its width and gains a 15 px inline spinner while Microsoft opens, calendars load, or a selection saves. A single orbit around the Microsoft mark communicates transfer to the provider-owned account window. Under `prefers-reduced-motion: reduce`, rotation stops and the incomplete ring plus text remain sufficient. No ambient animation, staggered reveal, or decorative hover travel is used.

## Self-critique and revision

The first direction risked becoming the familiar dark SaaS pattern of multiple rounded cards with provider-colored gradients. That would obscure account ownership and repeat a generic dashboard style. The revision removes the card grid, limits Microsoft color to the provider mark, uses rules and the connection rail to encode the real account-to-calendar relationship, and spends visual emphasis on one customer decision at a time.

## Frozen customer copy

### Exact delegated permission boundary

```text
openid
offline_access
https://graph.microsoft.com/User.Read
https://graph.microsoft.com/Calendars.ReadBasic
```

No broader Calendar, shared Calendar, write, application, Mail, Contacts, Files, Teams, Directory, or administrative permission is part of this visual or product approval.

### Connection promise

> Bring the Outlook and Microsoft 365 calendars you choose into one calm schedule. Tab Two keeps your agenda and private calendar-load trends current, while every event remains read-only.

### Privacy disclosure

> Microsoft sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it never receives your event details. Calendar details and sync cursors stay on this device and are excluded from backup, encrypted sync, diagnostics, and logs.

### Chrome permission explanation

> Chrome will also ask to let Tab Two communicate with `graph.microsoft.com`. Chrome uses broad website-permission wording, but the Microsoft grant itself is limited to the basic read-only calendar access described here.

### Read-only reassurance

> Tab Two requests basic read access for the calendars you choose. It cannot change events or send invitations.

### Organization approval

> Your organization needs to approve Tab Two before this account can connect. Ask your Microsoft 365 administrator to approve access, or connect another Microsoft account.

### Retained-data recovery

> Your saved schedule is still available. Tab Two will update it when Microsoft reconnects.

### Disconnect consequence

> This removes this Microsoft account and its saved calendar data from Tab Two. It does not sign you out of Microsoft, change or delete Microsoft events, or affect your other accounts and free calendars.

## Original-resolution capture set

| Capture | Viewport | Contract |
|---|---:|---|
| `01-premium-locked.png` | 1600x900 | A free customer sees the multi-account paid outcome, read-only promise, and one `See premium plans` action. No disabled Connect control appears. |
| `02-read-only-consent.png` | 1600x900 | An entitled customer sees the benefit, exact privacy path, short read-only reassurance, Chrome Graph-origin explanation, and one `Continue with Microsoft` action. |
| `03-connecting.png` | 1600x900 | Reserved geometry and operational progress show that Microsoft's account window is opening. Cancel remains available. |
| `04-calendar-selection.png` | 1600x900 | One personal account, default calendar selected, preserved calendar colors, count summary, text labels, and one clear save action. |
| `05-personal-and-work.png` | 1600x900 | Personal and work accounts remain independently identified with selected calendars, health, account kind, and one `Add another account` action. |
| `06-organization-approval.png` | 1600x900 | Organization policy is distinguished from credential or network failure and offers `Try another account` without presenting a limitations list. |
| `07-reconnect-retained.png` | 1600x900 | One account stays current, one needs reconnect, and the previous work schedule is truthfully retained with one exact `Reconnect Microsoft` action. |
| `08-disconnect-and-history.png` | 1600x900 | Exact Microsoft account named, truthful provider consequence, Metrics-history choice off by default, and distinct Cancel/Disconnect hierarchy. |
| `09-composed-calendar.png` | 1408x600 | Microsoft, Google, and free ICS entries remain in one Calendar surface with provider/account text plus preserved colors. No Microsoft-only widget appears. |
| `10-touch-calendar-selection.png` | 390x844 | One-column calendar selection, stable action footer, 44 px controls, readable privacy copy, no horizontal overflow, and no trapped interaction. |

## Interaction and accessibility contract

- `Continue with Microsoft` begins only from a click or keyboard activation.
- The optional Graph origin request is the first asynchronous boundary reached from that customer gesture. Declining creates no connection.
- Pending labels are explicit: `Opening Microsoft...`, `Loading calendars...`, `Saving...`, and `Disconnecting...`.
- Pending operations disable only controls that could duplicate the same mutation. Cancel remains available while the external account window opens.
- Success is announced once through a polite live region and focus returns to the account summary or originating action.
- Failure retains the last complete selection and places retry or reconnect beside the exact affected account.
- Microsoft calendar colors always appear with calendar name, account email, and provider context. Color is never the only meaning.
- The account-kind label is `Personal` or `Work or school`; it is informative rather than decorative.
- All interactive elements show visible keyboard focus. Escape closes only the current non-destructive layer and restores focus.
- Coarse-pointer controls and calendar check rows are at least 44 CSS px high.
- Reduced motion stops rotation and transitions without hiding pending state.
- Organization approval is not styled as destructive. Disconnect remains the only destructive Microsoft action.
- Disconnect defaults to keeping aggregate Metrics history. Opting into deletion affects only numeric buckets owned by that connection UUID.
- No customer-facing control claims to revoke a Microsoft account grant, sign the customer out of Microsoft, or delete provider events.

## Approval boundary

Approval covers the ten captures, exact four delegated scopes, provider-specific broker, customer copy, optional `https://graph.microsoft.com/*` request, personal/work identity hierarchy, organization-policy recovery, truthful disconnect behavior, interaction/motion contract, and independent Microsoft rollback.

Approval authorizes local TDD implementation of PM-P7 only. It does not authorize Microsoft Entra registration or mutation, a client secret, hosted key, database migration, Edge deployment, production feature flag, owner-installation permission request, real Microsoft account/calendar access, verified publisher work, Supabase Pro, live Stripe, package, release, merge, or Chrome Web Store action.
