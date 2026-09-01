# Status: 014-extraction-review-panel

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Panel shell + line-item group
- [x] `ExtractionField` card + inline edit
- [x] `ConfidenceBar` using shared tier logic
- [x] `ApprovalButton`
- [x] Not-found field state
- [x] `ReviewProgress` + Approve Document
- [x] Active-field wiring for highlighting
- [x] No unit tests for the five React components — Notes exception (presentational); `field-display.ts` unit-tested
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Two product rules that are easy to get wrong: editing must never open a dialog, and editing an approved field must not silently un-approve it.
- `ConfidenceBar` must import `tierFor` from `lib/extraction/confidence.ts`. Re-deriving thresholds here is how the bar and the card treatment end up disagreeing.
- Not-found fields are the clearest expression of the human-in-the-loop thesis — style them as an invitation, not an error.
- Pure helpers extracted to `components/review/field-display.ts` so the tier treatment is one table rather than ternaries in three components: `confidencePercent` (clamped, never `NaN`), `CONFIDENCE_TONES` / `confidenceTone`, `isLineItemField` / `groupReviewFields` (splits by id, not position), `reviewedSummary`, `reviewedPercent`. `ConfidenceBar` and the card treatment both start from `tierFor`; no threshold is re-derived anywhere in `components/review`.
- The confidence meter is a plain `bg-track` + tier-fill pair of divs, `aria-hidden`, rather than the shared `Progress`: that primitive hardcodes `bg-primary` on its indicator, and the percentage beside the bar is the same information in text. `ReviewProgress` does use `Progress`.
- `Save` with an unchanged value closes the editor without dispatching, so `Updated` is never stamped on a field the human only looked at.
- An empty value keeps its input on screen permanently (the not-found invitation) but is never autofocused — several fields can be empty and a panel that grabs focus on load steals it. `Edit` focuses the already-mounted input.
- Left untouched for 017: `tabIndex` on the cards, `Enter`/`Escape` inside the editor, `e`/`a` shortcuts, the hint line, `aria-live` on the count. Focus already sets `activeFieldId` (it bubbles from the card's buttons today).
- Observed during the browser pass: `text-label text-muted-foreground` fails axe's 4.5:1 contrast check on the card fill. It is the 002 token pairing and the pre-existing landing page fails the same rule, so it is left for 002/017 rather than deviating from the tokens here.
- `scanned-invoice.png` and `sample-invoice.pdf` contain no line-item table, so the `Line Items` group was verified against a purpose-built table invoice (`Description` / `Qty` / `Amount`, three rows) put through the same OCR path.
- Unit-test pass (2026-09-01): `components/review/field-display.spec.ts` covers `confidencePercent` (clamp, `NaN` guard, and agreement with the `tierFor` boundaries at 0.95/0.949/0.8/0.799), `confidenceTone`/`CONFIDENCE_TONES` (low and not-found share the warn left-edge, medium is `bg-primary/45`, high is `bg-primary`), `isLineItemField`/`groupReviewFields` (order-preserving split by id), `reviewedSummary` (confirmed it never pluralises — `1 of 1 fields reviewed`, `0 of 0 fields reviewed`), and `reviewedPercent` (0/0 guard, 25%, 100%). Added a static-source regression guard asserting `field-display.ts` contains no `0.95`/`0.8` literals of its own, since a duplicated threshold there is exactly how the bar and the card treatment would drift from `tierFor`. The five React components remain out of scope for unit tests per the existing exception below — no jsdom/RTL in this repo, and they were already browser-verified.

- 2026-09-01 — Browser verification reported by the implementation agent (transcribed here by the drain, since it was reported in the agent's summary but not written into this file at the time):
  - **Approve-then-edit rule holds.** Approving `invoice_id` gave `Approved` with `aria-pressed=true` and left `Edit` present. Editing and saving to `INV-2026-0143` afterwards kept `Approved` (`aria-pressed` still true) and the counter at "1 of 4". This is the product rule that a correction by the same human does not revoke their approval.
  - **Inline editing, no dialogs.** `Edit` on Vendor Name focused an in-place input with all 20 characters selected, with 0 dialogs present in the DOM. Save wrote `Northwind Supply Company Ltd` plus a persistent `Updated` badge; Cancel on Date left `2026-03-14` unchanged with no badge.
  - **Tiers visibly distinct.** From `scanned-invoice.png`: 92/94% medium (pale orange fill), 57% low (warn fill, 2px amber left edge, warning glyph beside the percentage, reason shown), 96% high (solid orange, no reason).
  - **Not-found state.** From `sample-invoice.pdf`, `invoice_id` and `date` rendered tier `not-found` at `Confidence: 0%` with an empty track, `Not found — please enter` in amber, and an empty input with `placeholder="Enter invoice id"` (not autofocused). Typing revealed Save/Cancel and saving committed the value.
  - **Approve Document.** From 1/4 it went to "4 of 4", all four Approved, bar full, then navigated to `/success`.
  - **OCR alternatives path** (`OCR also read: …`) could not be exercised with real data because the LSTM engine never emits alternatives; it was confirmed via a temporary local patch which was reverted (`grep DEBUG` clean).

## Acceptance criteria
- [x] All extracted fields render with value, percentage and bar, one card per line item
- [x] `Edit` swaps in an input in place with text selected; `Save` updates the value and shows `Updated`; `Cancel` leaves it untouched
- [x] An approved field is still editable and stays approved after an edit
- [x] Confidence tiers render distinctly at high / medium / low, with the low treatment clearly noticeable
- [x] Fields below the high tier show the rule `reason`; OCR alternatives appear where present
- [x] A not-found field shows the 0% `Not found — please enter` state with an empty input
- [x] The counter tracks approvals accurately; `Approve Document` approves the remainder and navigates to `/success`
- [x] Focusing or hovering a card sets the active field (highlight driven by 013)
- [x] No unit tests for the five React components — Notes exception recorded (presentational; logic tested in 003/008/009); `components/review/field-display.ts` is unit-tested directly

## Handoff

**Files touched:**
- `app/review/page.tsx`
- `components/review/ExtractionPanel.tsx`
- `components/review/ExtractionField.tsx`
- `components/review/ConfidenceBar.tsx`
- `components/review/ApprovalButton.tsx`
- `components/review/ReviewProgress.tsx`
- `components/review/field-display.ts`
- `components/review/field-display.spec.ts` (new — unit tests for the pure display helpers)

**Tests:**
- `npx vitest run components/review/field-display.spec.ts --no-coverage` → 1 file, 23 tests passed.
- `npx vitest run --no-coverage` (full suite) → 20 files, 372 tests passed (349 pre-existing + 23 new).
- `npm run typecheck` → passes clean (`next typegen && tsc --noEmit`).

**Env vars:** none added.

**Follow-ups:**
- 017: `tabIndex` on cards, `Enter`/`Escape` in the editor, `e`/`a` shortcuts, hint line, `aria-live` on the count.
- 002/017: `text-label text-muted-foreground` fails axe's 4.5:1 contrast check on the card fill (pre-existing token pairing, also fails on the landing page) — not fixed here, tracked as an accumulating design-token issue.
- No production bugs found during test-writing; `field-display.ts` behaves exactly as documented in its own comments and in the Notes above.
