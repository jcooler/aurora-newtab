# Tab Two Branded Billing Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents.

**Goal:** Replace the raw Supabase billing return with a polished, static, accessible Tab Two return surface that can focus an existing production extension tab without gaining billing authority.

**Architecture:** Four static Cloudflare Pages routes share local CSS, JavaScript, and Tab Two assets. A production-only MV3 external-message bridge accepts one exact origin/path/result contract and can focus an existing Tab Two tab; Account & Sync performs its existing signed refresh on focus. Supabase remains the Checkout/Portal session creator and supplies exact server-owned return URLs through one non-secret environment value.

**Tech Stack:** Static HTML/CSS/JavaScript, Node test runner, TypeScript 5.9, Chrome MV3, Vitest, Supabase Edge Functions, Cloudflare Pages static assets.

**Spec:** `docs/superpowers/specs/2026-09-01-tab-two-billing-return-and-checkout-recovery-design.md`

## Global Constraints

- Host only static assets on the free Cloudflare project `tab-two-billing-return`; do not create a Function, Worker script, KV store, database, secret, analytics integration, or paid service.
- The public site contains no account data, Stripe or Supabase identifier, token, Checkout URL, query-derived copy, cookie, web storage, telemetry, or external asset request.
- Stripe webhooks, Postgres billing state, and signed account-bound leases remain the only billing and entitlement authorities.
- Add no Chrome permission, optional permission, host permission, or content script.
- Production accepts only the exact deployed return-site origin. Preview and account-local builds do not expose the external bridge.
- Keep all Stripe objects and evidence in sandbox/test mode.
- Preserve `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` exactly.
- Do not merge, release, package, publish, change the Chrome Web Store, or begin PM-P4.

---

### Task 1: Build the static branded return surface

**Files:**

- Create: `billing-return-site/index.html`
- Create: `billing-return-site/success/index.html`
- Create: `billing-return-site/cancel/index.html`
- Create: `billing-return-site/billing/index.html`
- Create: `billing-return-site/assets/return.css`
- Create: `billing-return-site/assets/return.js`
- Create: `billing-return-site/assets/tab-two-mark.svg`
- Create: `billing-return-site/favicon.svg`
- Create: `billing-return-site/_headers`
- Create: `billing-return-site/robots.txt`
- Create: `scripts/billing-return-site-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: the exact route copy, palette, responsive behavior, and bridge message contract from the spec.
- Produces: four self-contained static routes and `window.TabTwoBillingReturn` behavior used only by the hosted return site.

- [ ] **Step 1: Write the failing static-site contract**

Create a Node test that reads all four HTML routes and asserts exact title, eyebrow, heading, primary action, `data-result`, local-only asset references, `noindex,nofollow`, one `main`, and no account/Stripe/session placeholders. Parse `_headers` and require CSP, no-referrer, nosniff, frame denial, opener isolation, permissions denial, and no-cache HTML behavior. Scan JavaScript for the exact message type and absence of `fetch`, `XMLHttpRequest`, `sendBeacon`, cookies, local/session storage, service-worker registration, analytics, and external URLs.

```js
const routes = Object.freeze({
  neutral: ['index.html', 'Tab Two billing', 'Return to your second screen.'],
  success: ['success/index.html', 'Payment received', 'Your first year is ready.'],
  cancel: ['cancel/index.html', 'Checkout closed', 'Nothing changed.'],
  billing: ['billing/index.html', 'Billing updated', 'Back to your second screen.'],
})
```

- [ ] **Step 2: Run the contract and observe RED**

Run: `node --test scripts/billing-return-site-contract.test.mjs`

Expected: FAIL because `billing-return-site/` does not exist.

- [ ] **Step 3: Implement the four routes and shared assets**

Use semantic HTML with a shared structure: wordmark, status icon, eyebrow, `h1`, body copy, three-step handoff rail, one primary button, fallback instruction, and trust note. Set route identity only with a literal body attribute such as `data-result="success"`; do not read a query string. Copy the existing `public/icons/tab-two-mark.svg` bytes into the deployable static directory so the site has no cross-project runtime dependency.

The button script sends only:

```js
const message = Object.freeze({
  type: 'tab-two.billing-return.v1',
  result: document.body.dataset.result,
})
```

Use the production extension id `akjalbmacojpmebkgohhcaaiacicpgkh`. On `{ status: 'focused' }`, call `window.close()` and leave the page intact if Chrome does not close it. On missing API, runtime error, `not_found`, or `unavailable`, reveal exactly `Open a new tab, then open Settings > Account & Sync.` and restore the button label.

- [ ] **Step 4: Implement the visual system and accessibility floor**

Use only the spec palette, local system-font stacks, a 640 px centered shell, the two-pane cyan handoff rail, 44 px controls, `:focus-visible`, reduced-motion media query, 320 px responsive support, and status-specific color as a secondary accent. No generic pricing card, gradient headline text, looping animation, glass blur stack, or decorative control may compete with the handoff rail.

- [ ] **Step 5: Run the site contract GREEN**

Run: `node --test scripts/billing-return-site-contract.test.mjs`

Expected: all route, security, privacy, copy, and asset tests pass.

- [ ] **Step 6: Add the focused package script**

Add:

```json
"test:billing-return-site": "node --test scripts/billing-return-site-contract.test.mjs"
```

- [ ] **Step 7: Commit the static surface**

```powershell
git add billing-return-site scripts/billing-return-site-contract.test.mjs package.json
git commit -m "feat(billing): add branded return surface"
```

### Task 2: Add the exact production extension re-entry bridge

**Files:**

- Create: `src/account/billingReturnBridge.ts`
- Create: `src/account/billingReturnBridge.test.ts`
- Create: `src/background/index.ts`
- Create: `src/background/index.test.ts`
- Modify: `src/manifest.ts`
- Create: `scripts/billing-return-production-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `BillingReturnMessageV1` from the spec and exact hosted origin supplied after Cloudflare deployment.
- Produces: `validateBillingReturnMessage(message, sender): BillingReturnIntent | null` and `handleBillingReturnMessage(intent, browser): Promise<BillingReturnResponse>`.

- [ ] **Step 1: Write validation and behavior RED**

Require exact two-key messages, exact HTTPS origin, no credentials/port, path/result agreement, a sender tab id, and rejection of query-selected state, extra keys, prototype payloads, non-production origins, and unknown paths. Mock the browser adapter and require the most recently active Tab Two new-tab page to be focused without reading or writing storage.

```ts
export type BillingReturnResult = 'success' | 'cancel' | 'billing' | 'neutral'
export interface BillingReturnResponse { status: 'focused' | 'not_found' | 'unavailable' }
```

- [ ] **Step 2: Run focused RED**

Run: `npx vitest run src/account/billingReturnBridge.test.ts src/background/index.test.ts`

Expected: FAIL because the bridge modules do not exist.

- [ ] **Step 3: Implement pure validation and tab focusing**

Keep Chrome types behind a small adapter:

```ts
interface BillingReturnBrowser {
  findTabTwoTabs(): Promise<readonly { id: number; windowId: number; lastAccessed?: number }[]>
  focusWindow(windowId: number): Promise<void>
  activateTab(tabId: number): Promise<void>
}
```

Select the highest `lastAccessed`, focus its window, then activate its tab. Return `not_found` for no extension tab and `unavailable` for browser API failure. Do not close the sender tab from the extension; the return page attempts its own close after receiving the response.

- [ ] **Step 4: Register a production-only MV3 listener**

In production only, declare `background.service_worker = 'src/background/index.ts'`, `background.type = 'module'`, and:

```ts
externally_connectable: {
  matches: ['https://tab-two-billing-return.pages.dev/*'],
}
```

Use `onMessageExternal`, return `true` for the asynchronous response, and respond exactly once. Preview and account-local manifests omit both background and external connectivity.

- [ ] **Step 5: Add the production manifest/build contract**

Build production, preview, and account-local manifests. Require the exact production bridge, its absence from other modes, unchanged permission arrays, unchanged host permissions, and no `content_scripts` entry.

- [ ] **Step 6: Run GREEN and build contracts**

```powershell
npx vitest run src/account/billingReturnBridge.test.ts src/background/index.test.ts
node --test scripts/billing-return-production-contract.test.mjs
npm run build
npm run build:preview
npm run build:account-local
```

Expected: all focused tests and three manifest contracts pass.

- [ ] **Step 7: Commit the bridge**

```powershell
git add src/account/billingReturnBridge.ts src/account/billingReturnBridge.test.ts src/background src/manifest.ts scripts/billing-return-production-contract.test.mjs package.json
git commit -m "feat(billing): return customers to Tab Two"
```

### Task 3: Move server-owned Stripe return URLs to the branded origin

**Files:**

- Modify: `supabase/functions/_shared/billingHandlers.ts`
- Modify: `supabase/functions/_shared/billingRuntime.ts`
- Modify: `supabase/functions/tests/billing-functions.test.ts`
- Modify: `supabase/functions/billing-return/index.ts`

**Interfaces:**

- Consumes: required non-secret environment value `TAB_TWO_BILLING_RETURN_ORIGIN=https://tab-two-billing-return.pages.dev`.
- Produces: `fixedBillingReturnUrls(returnOrigin)` with exact `/success/`, `/cancel/`, and `/billing/` paths.

- [ ] **Step 1: Write return-origin RED**

Require HTTPS, the exact production host in hosted mode, no credentials, port, path, query, or fragment. Prove Checkout and Portal receive only the three fixed URLs and the public Supabase fallback does not interpret query parameters or claim payment status.

- [ ] **Step 2: Run focused RED**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: return-origin cases fail against the current Supabase-derived URLs.

- [ ] **Step 3: Implement exact origin configuration**

Require `TAB_TWO_BILLING_RETURN_ORIGIN` in `createRuntimeBillingHandlers`. Allow loopback HTTPS/HTTP only in injected local tests; production accepts exactly `https://tab-two-billing-return.pages.dev`. Construct URLs with `new URL('/success/', origin)` and clear query and fragment.

- [ ] **Step 4: Keep the Supabase fallback neutral**

Retain `billing-return` as a no-data, no-mutation fallback endpoint for rollback and old sandbox sessions. Replace its raw success/cancel query implication with a neutral plain-text-safe response that links nowhere and tells the customer to open Account & Sync.

- [ ] **Step 5: Run focused GREEN**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: all billing function tests pass, including exact return URLs and neutral fallback.

- [ ] **Step 6: Commit server URL authority**

```powershell
git add supabase/functions/_shared/billingHandlers.ts supabase/functions/_shared/billingRuntime.ts supabase/functions/tests/billing-functions.test.ts supabase/functions/billing-return/index.ts
git commit -m "feat(billing): use branded return URLs"
```

### Task 4: Deploy and prove the branded return path

**Files:**

- Create: `scripts/qa-billing-return-site.mjs`
- Create: `scripts/qa-billing-return-site.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-BRANDED-BILLING-RETURN-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `README.md`
- Modify: `PRIVACY.md`

**Interfaces:**

- Consumes: verified static artifact, Cloudflare owner session, existing Supabase project, and existing Stripe sandbox.
- Produces: deployed static HTTPS routes, updated sandbox return configuration, installed-extension evidence, and an exact QA report.

- [ ] **Step 1: Create only the approved free static project**

Create Cloudflare Pages project `tab-two-billing-return` on the Free plan and deploy `billing-return-site/` as static assets. Do not enable Functions, analytics, Web Analytics, KV, paid plans, or a custom domain. If the exact project name is unavailable, stop before choosing a different public origin because the manifest and server allowlists must change together.

- [ ] **Step 2: Verify the hosted security and privacy contract**

Probe all four routes for 200, HTTPS, exact content, CSP, referrer policy, nosniff, frame denial, permissions denial, no cookies, and no cross-origin asset requests. Record only hosts, status, headers, counts, and redacted timing; do not retain identifiers or browser profile data.

- [ ] **Step 3: Deploy the server configuration**

Set the non-secret Supabase environment value `TAB_TWO_BILLING_RETURN_ORIGIN` to the exact HTTPS origin. Deploy only `billing-checkout-session`, `billing-portal-session`, and the neutral `billing-return` fallback. Do not alter the webhook secret, Stripe secret, catalog ids, signing keys, Google OAuth, or owner grant.

- [ ] **Step 4: Run exact browser QA**

At 1440x900, 390x844, 320x700, 200% zoom, keyboard-only, and reduced motion, capture success, cancel, billing, and neutral states at original resolution. Verify one scroll owner, no horizontal overflow, 44 px action, visible focus, no clipped copy, zero console/page errors, and zero requests after local static assets load.

- [ ] **Step 5: Prove installed-extension re-entry**

With the exact production build loaded, open each hosted route from Tab Two, invoke `Return to Tab Two`, and prove the existing Tab Two tab/window is focused. On success and billing return, prove Account & Sync refreshes through the signed server client; query/path state never mutates billing or a lease. Also prove the missing-extension fallback in an isolated profile.

- [ ] **Step 6: Reconcile documentation and run the stabilized gate**

```powershell
npm test
npx tsc --noEmit
npm run test:billing-return-site
node --test scripts/billing-return-production-contract.test.mjs scripts/qa-billing-return-site.test.mjs
npx vitest run supabase/functions/tests/billing-functions.test.ts
npm run build
npm run build:preview
npm run build:account-local
git diff --check
```

Scan tracked files and all three builds for Stripe secrets, webhook secrets, Checkout URLs, session ids, card data, service-role material, account fixtures, and external bridge leakage into preview/account-local.

- [ ] **Step 7: Checkpoint and push without crossing release gates**

Stage only intended files, commit the QA/doc reconciliation, push only `feat/aurora-2-observatory`, prove local HEAD equals upstream and remote, and verify the protected original and protected untracked paths. Do not merge, release, publish, or change the Chrome Web Store.

