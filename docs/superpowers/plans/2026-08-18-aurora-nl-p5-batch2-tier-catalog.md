# NL-P5 Batch 2 Tier Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the second owner-reviewable tier-catalog batch: Docked-tier dense lines for the nine connector identities and the remaining small widgets, plus the batch-2 visual catalog — then stop for the owner's widget-by-widget review.

**Architecture:** A tiny shared `DockLine` component renders the middle-dot fact row with the Work Pulse tone colors; each connector widget gains an early docked branch that feeds `DockLine` from the SAME summary values it already computes for `WorkPulseSummary` (one derivation, styled apart — the established idiom from the Weather unit-letter). Widgets whose compact form already IS a dense line (worldClocks, countdown, sun, moon) declare the Docked tier with no code change and let the catalog prove it. The catalog script grows a `--batch=2` mode with connector snapshot seeds lifted from the canonical harness.

**Tech Stack:** TypeScript, React, Vitest, Playwright. No new dependencies, no storage changes.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` §2.3 (Docked: "one dense line... GitHub `7 commits · 2 PRs`"), §2.4 (click parity). Batch 1 precedent: `docs/superpowers/plans/2026-08-18-aurora-nl-p5-batch1-tier-catalog.md` (owner-approved 2026-08-18).

## Global Constraints

- **Docked = one dense text-first line, middle dots separating facts** (spec 2.3). The no-whitespace law applies to every tier.
- **Click parity** (spec 2.4): a docked widget opens what its free form offers. The batch-2 connector free forms offer NO panel or expansion, so their dock lines are non-interactive readouts — this is parity, not a gap; state it in the catalog for the owner.
- **Connector truthfulness (A2-D057 family, frozen):** dock lines render only from the widget's existing snapshot/summary state; no new fetches, no second data consumer (docked XOR free mounting, as in batch 1), no connector contract changes.
- **Batch 2 widgets (16):** github, gitlab, jira, vercel, status, rss, crypto, homeassistant, ics, habits, worldClocks, countdown, sun, moon — docked declared; monthCal, links — NO docked (no honest one-line form; owner can overrule at review).
- **Owner gate:** this packet ends at the batch-2 catalog handoff.
- No storage/schema changes, no `layout`/`layouts` writes, frozen boundaries untouched, strict TDD, bounded commits, one review + at most one fix/rereview, ledger checkpoint. Working directory `D:\DEV\Chrome plugin-aurora-2`.

---

### Task 1: Batch-2 docked contracts

**Files:**
- Modify: `src/newtab/widgetSizeContracts.ts`
- Test: `src/newtab/widgetSizeContracts.test.ts`

**Interfaces:** extends the existing `docked?: string` member; `supportsDocked` derives automatically (batch 1).

- [ ] **Step 1: Failing test** — replace the batch-1 docked-set test's expectation:

```ts
it('declares the batch-1 and batch-2 Docked contracts and no others', () => {
  const docked = Object.entries(WIDGET_SIZE_CONTRACTS)
    .filter(([, contract]) => contract.docked !== undefined)
    .map(([id]) => id)
    .sort()
  expect(docked).toEqual([
    'bookmarks', 'clock', 'countdown', 'crypto', 'focus', 'github', 'gitlab',
    'habits', 'homeassistant', 'ics', 'jira', 'moon', 'notes', 'rss',
    'status', 'sun', 'tasks', 'timer', 'vercel', 'weather', 'worldClocks',
  ])
  expect(WIDGET_SIZE_CONTRACTS.github.docked).toBe('Selected activity counts')
  expect(WIDGET_SIZE_CONTRACTS.rss.docked).toBe('Top headline')
  expect(WIDGET_SIZE_CONTRACTS.monthCal.docked).toBeUndefined()
  expect(WIDGET_SIZE_CONTRACTS.links.docked).toBeUndefined()
})
```

- [ ] **Step 2:** RED (the old test also fails — update its title/expectation in place; ONE test owns the docked set).
- [ ] **Step 3:** Implement — add the trailing `docked` argument to these contracts with these exact strings: github `'Selected activity counts'`, gitlab `'Selected activity counts'`, jira `'Selected issue counts'`, vercel `'Deployment health'`, status `'Service health'`, rss `'Top headline'`, crypto `'Primary coin price'`, homeassistant `'Selected entity state'`, ics `'Next event'`, habits `'Habits done today'`, worldClocks `'Primary world clock'`, countdown `'Next countdown'`, sun `'Next sun event'`, moon `'Current phase'`.
- [ ] **Step 4:** GREEN + `npx tsc --noEmit` + `git diff --check`.
- [ ] **Step 5:** Commit `feat(tiers): declare batch-2 Docked content contracts`.

---

### Task 2: Shared DockLine and the connector dock lines

**Files:**
- Create: `src/newtab/widgets/shared/DockLine.tsx`
- Test: `src/newtab/widgets/shared/DockLine.test.tsx`
- Modify: `src/newtab/widgetRenderers.tsx` (thread `docked` to the batch-2 widgets)
- Modify: each of `src/newtab/widgets/{github/GithubWidget,gitlab/GitlabWidget,jira/JiraWidget,vercel/VercelWidget,status/StatusWidget,rss/RssWidget,crypto/CryptoWidget,homeassistant/HomeAssistantWidget,calendar/CalendarWidget,habits/HabitsWidget}.tsx`
- Test: one focused docked case appended to each widget's existing test file

**Interfaces:**

```tsx
// DockLine.tsx
import type { WorkPulseTone } from './WorkPulseSummary'
export default function DockLine({
  label,
  facts,
  tone = 'quiet',
}: {
  /** Accessible name prefix, e.g. "GitHub". */
  label: string
  /** Ordered dense facts; falsy entries are dropped. Middle dots separate. */
  facts: readonly (string | null | undefined | false)[]
  tone?: WorkPulseTone
}): JSX.Element | null
```

Renders `null` when no truthy fact survives (the no-whitespace law: an empty
line is not a tier). Otherwise one `<span data-dock-line className="dock-line">`
with `aria-label` = `` `${label}: ${survivingFacts.join(', ')}` ``, fact spans
separated by `aria-hidden` `·` spans, and the value tinted by the same
`TONE_CLASS` map WorkPulseSummary uses (export that map from
WorkPulseSummary.tsx rather than duplicating it).

- [ ] **Step 1: Failing DockLine test**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DockLine from './DockLine'

describe('DockLine', () => {
  it('renders surviving facts with middle-dot separators and one accessible name', () => {
    render(<DockLine label="GitHub" facts={['7 commits', null, '2 PRs']} tone="attention" />)
    const line = screen.getByLabelText('GitHub: 7 commits, 2 PRs')
    expect(line.textContent).toBe('7 commits·2 PRs')
    expect(line.querySelectorAll('[aria-hidden]')).toHaveLength(1)
  })

  it('renders nothing when no fact survives (no-whitespace law)', () => {
    const { container } = render(<DockLine label="GitHub" facts={[null, undefined, false, '']} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2:** RED. **Step 3:** implement DockLine per the interface (filter facts with `Boolean`, map with interleaved `<span aria-hidden className="dock-line__dot">·</span>`). Export `TONE_CLASS` from WorkPulseSummary.
- [ ] **Step 4: Per-widget docked branches.** For each of the ten widgets, in this order and with one focused RED test each appended to the widget's existing test file (render with `docked` and the file's existing snapshot fixture; assert the `data-dock-line` accessible name contains the expected facts; assert the free form untouched by running the file's existing cases):
  - **github/gitlab/jira/vercel/status:** at the point where the widget computes its `WorkPulseSummary` inputs (`label`, `value`, `tone`, `metadata`), add `if (docked) return <DockLine label={label} facts={[value, metadata]} tone={tone} />`. The spec's `7 commits · 2 PRs` shape falls out of value+metadata.
  - **rss:** `if (docked) return <DockLine label="Headlines" facts={[firstHeadline?.title]} />` using the widget's existing first-item derivation.
  - **crypto:** facts = the first configured coin's existing `SYMBOL price` cell string.
  - **homeassistant:** facts = the first selected entity's existing `name state` chip string; when only actions are selected, facts = [`${actions.length} actions`] (count of the widget's existing actions list).
  - **ics (CalendarWidget):** facts = the widget's existing next-event line (title + time string it already renders first).
  - **habits:** facts = [`${doneToday}/${habits.length} today`] from the widget's existing done-today derivation.
  - `widgetRenderers.tsx`: pass `docked={props.docked}` to these ten renderers (worldClocks/countdown/sun/moon deliberately NOT threaded — their compact composition is the declared dock line; the catalog shows it).
- [ ] **Step 5:** GREEN per widget as you go; after all ten: `npx vitest run src/newtab/widgets src/newtab/canvas src/newtab/App.test.tsx`, `npx tsc --noEmit`, `git diff --check`.
- [ ] **Step 6:** Commit `feat(tiers): connector and small-widget Docked lines`.

---

### Task 3: Batch-2 catalog

**Files:**
- Modify: `scripts/catalog-nl-p5.mjs` (batch parameter, batch-2 definition + seeds, per-batch out dir and VERDICTS)
- Create (generated, tracked): `docs/superpowers/catalog/batch-2/*.png` + `CATALOG.md`

- [ ] **Step 1:** Refactor the script: `--batch=1|2` (default 1) selects `{ BATCH, CONTRACTS, VERDICTS, outDir }`; batch-1 behavior byte-identical (regenerate batch 1 once and `git diff --stat` must show only PNG noise or nothing — if CATALOG.md changes, the refactor broke something).
- [ ] **Step 2:** Batch-2 seeds: enable the fourteen batch-2 widgets; seed `connectors` configs for all nine identities and `connectorSnapshots` fixtures COPIED from the canonical harness's seed block (`scripts/preview.mjs` — the nine-connector W4-P4 survival seeds; lift them verbatim so snapshot identity/versioning stays valid), plus worldClocks (two zones), a countdown, habits (3 with 2 done today), and an ICS cache with a next event. Batch-2 `VERDICTS` map starts empty (all `_pending_`).
- [ ] **Step 3:** `node scripts/catalog-nl-p5.mjs --batch=2` → PASS with the full matrix (14 docked + compact/standard/full per the contracts). Docked captures for the ten coded widgets additionally assert `[data-dock-line]` presence; the four declare-only widgets assert single-line geometry (height ≤ 40px).
- [ ] **Step 4:** Inspect EVERY capture individually (A2-D060). Genuine defects: focused RED/GREEN on the owning widget. Owner-decision items: note in CATALOG.md.
- [ ] **Step 5:** Commit `feat(tiers): batch-2 visual tier catalog`.

---

### Task 4: Gate, review, ledger, owner handoff

- [ ] **Step 1:** Focused gate: `npx vitest run src/newtab src/lib/layout` + `npx tsc --noEmit` + `git diff --check` + `npm run build` (record counts).
- [ ] **Step 2:** Bounded review (one + at most one fix/rereview): verify no new fetches or connector contract changes, docked XOR free mounting, DockLine's no-whitespace null, the non-interactive-readout parity statement, and batch-1 regeneration byte-stability.
- [ ] **Step 3:** Ledger: STATUS.md batch-2 evidence bullet; Current packet `NL-P5 tier catalog — awaiting owner review of batch 2`.
- [ ] **Step 4:** Checkpoint + push + repository proof.
- [ ] **Step 5: STOP for the owner gate** — hand over `docs/superpowers/catalog/batch-2/CATALOG.md`, restate the stale-build rule, and do not begin NL-P6 before the verdicts.

---

## Self-review notes

- Spec 2.3: the GitHub example shape (`7 commits · 2 PRs`) falls out of value+metadata; DockLine's null return enforces no-whitespace; declare-only widgets are honest because their compact composition already satisfies the one-dense-line contract — the catalog proves or disproves it to the owner.
- Spec 2.4 parity: connector free forms offer no panel; the readout IS parity. Stated in CATALOG.md batch notes for the owner.
- Type consistency: `DockLine({ label, facts, tone })` matches every Task 2 call; `TONE_CLASS` exported from WorkPulseSummary and consumed by DockLine only.
- Risk: canonical-harness snapshot seeds may have drifted from current snapshot identity rules — if a widget rejects a seeded snapshot in the catalog, lift the fixture from that widget's own unit tests instead (they must be current or the suite would be red).
