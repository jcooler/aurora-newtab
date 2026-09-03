# Tab Two Google Calendar Visual Approval Spec

**Status:** Owner approved on 2026-09-03. Production Google Calendar React and CSS remain unchanged at this checkpoint.

**Packet:** PM-P6 Multi-account framework & Google Calendar

## Design intent

Google Calendar should feel like a trustworthy paid connection, not a settings form with a logo attached. The experience uses progressive disclosure:

1. explain the useful outcome and make read-only access feel like customer control before Google opens;
2. let Google own account selection and consent;
3. return to a focused calendar picker with sensible defaults;
4. show every connected account, its health, and its selected calendars in one calm summary;
5. isolate reconnect and disconnect actions to the exact account they affect.

The approved Tab Two cyan remains the active/accent color. Google calendar colors identify sources, while text labels carry the same meaning for customers who cannot distinguish color. Space Grotesk provides the display hierarchy and Inter carries operational copy. Surfaces use quiet separators and one primary action instead of a dashboard of nested cards.

## Frozen customer copy

### Connection promise

> See the calendars you choose from one or more Google accounts. Tab Two reads calendar names, colors, and selected events so your agenda and private calendar-load metrics stay current. Your calendar stays yours: Tab Two only displays what you select and never changes events or sends invitations.

### Privacy disclosure

> Google sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it does not receive your event details. No Gmail, Drive, or Contacts access is requested. Event details and sync cursors stay on this device and are never included in Tab Two backup, encrypted sync, diagnostics, or logs.

### Chrome permission explanation

> Chrome will also ask to let Tab Two communicate with `googleapis.com`. Chrome uses broad website-permission wording, but the Google grant itself is limited to the read-only calendar access described here.

### Disconnect consequence

> This removes access for this Google account from Tab Two. It does not change or delete anything in Google Calendar, and it does not affect your other accounts or ICS calendars.

## Original-resolution capture set

| Capture | Viewport | Contract |
|---|---:|---|
| `01-premium-locked.png` | 1600x900 | A free customer sees the paid outcome, read-only promise, and one `See premium plans` action. No disabled fake connection control. |
| `02-read-only-consent.png` | 1600x900 | An entitled customer sees `What you’ll get`, a calm `Your calendar stays yours` read-only assurance, the direct-browser data path, and one `Continue with Google` action before OAuth. Detailed non-calendar exclusions stay in the quieter privacy line rather than a red limitations column. |
| `03-connecting.png` | 1600x900 | Reserved geometry and a quiet spinner explain that Google's account window is opening. Cancel remains available. |
| `04-calendar-selection.png` | 1600x900 | One connected account, readable calendar list, preserved source colors, primary-calendar default, count summary, and clear save action. |
| `05-two-accounts-connected.png` | 1600x900 | Two independently owned account rows, selected calendar names, per-account health, `Add another account`, and restrained account management. |
| `06-one-account-needs-attention.png` | 1600x900 | One account remains current while another needs reconnect. Failure is not presented as a whole-connector outage. |
| `07-disconnect-and-history.png` | 1600x900 | Exact account named, non-destructive Google consequence, independent Metrics-history checkbox, and distinct Cancel/Disconnect hierarchy. |
| `08-composed-calendar.png` | 1408x600 | The existing Calendar remains one composed surface with Google and free ICS sources identified by name and preserved colors. No second Google-only widget. |
| `09-touch-calendar-selection.png` | 390x844 | The calendar picker reflows to one column with 44 px actions and controls, readable privacy copy, no horizontal overflow, and no trapped scroll region. |

## Interaction & motion contract

- `Continue with Google` begins only from a real click or keyboard activation.
- Before OAuth opens, Tab Two explains and requests the optional Google API origin. Declining saves no Google connection.
- While the provider window opens, the action reads `Opening Google...`, includes an inline spinner, and disables only itself. `Cancel` remains available.
- The spinner rotates for motion-enabled users. Under `prefers-reduced-motion: reduce`, it becomes a stationary incomplete ring and the text remains sufficient.
- Calendar check rows are at least 44 px on coarse pointers. The color dot is decorative; calendar name and account context are text.
- Saving selection uses `Saving...` with the same stable inline spinner. Layout does not jump between idle and pending copy.
- Success is announced once and returns focus to the account summary. Errors keep the last complete selection and place `Try again` beside the exact failed account.
- `Reconnect` launches a new Google flow for only that account. Other accounts and free ICS remain available.
- Disconnect is two-step. Default is to keep existing aggregate Metrics history. Choosing history deletion changes only that connection UUID's numeric buckets.
- Every close/cancel action restores focus to its opener. Escape closes only the current non-destructive dialog.
- Focus uses the approved cyan outline or underline with sufficient contrast. There is no permanent ring around toggles or decorative controls.

## Accessibility & responsive contract

- All interactive controls have visible text or an accessible name, semantic button/input roles, and visible keyboard focus.
- Provider, account, status, selected-count, calendar name, and destructive consequence are never color-only.
- Settings body and helper copy remain at least 11 CSS px; compact utility labels in the composed Calendar and touch view remain at least 10 CSS px; primary labels remain at least 13 CSS px.
- Desktop content has one vertical page scroll owner. Modal dialogs have one bounded internal scroll only if the viewport cannot contain their content.
- Touch layout keeps 16 px horizontal page padding, 44 px minimum actions and checkbox rows, no hover-only information, and no root horizontal overflow.
- Pending and error messages use `role="status"` or `role="alert"` without repeatedly interrupting assistive technology.

## Privacy & trust contract

- The UI sells read-only access as customer control instead of leading with a limitations list.
- The UI does not imply that Tab Two's backend receives events.
- The UI does not call this end-to-end encryption or zero-knowledge.
- The UI never displays scopes, tokens, provider subjects, calendar IDs, sync tokens, or backend error bodies.
- Account email is shown because the customer must distinguish connected accounts. It is not used as Tab Two's database identity.
- Disconnect copy never implies that Google events are deleted.
- Free ICS is named as an independent local calendar source where relevant.

## Approval boundary

Approval of these images authorizes later production UI implementation against this exact hierarchy and copy, plus local/test-only domain work. It does not authorize Google Cloud console changes, OAuth audience publication, adding test users, creating or storing secrets, Supabase migration/function deployment, requesting the optional Google API host origin in the owner's installation, Google verification submission, merge, packaging, release, or Chrome Web Store mutation.
