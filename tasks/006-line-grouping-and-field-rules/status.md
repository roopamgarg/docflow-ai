# Status: 006-line-grouping-and-field-rules

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `lines.ts` grouping + column helpers
- [x] `invoice_id` and `date` matchers
- [x] `vendor_name` positional heuristic
- [x] `total_amount` matcher
- [x] Reason strings for display
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **Can be built in parallel with 004 and 005** — it depends only on the `Word` contract, and its tests use hand-built fixtures rather than real extraction.
- Implementation decisions (2026-09-01):
  - Grouping joins a word to the open line when its box overlaps the line's band by >= `LINE_OVERLAP_RATIO` (0.5) of the shorter height, so ragged baselines survive; a page boundary always ends a line.
  - `columnAt(lines, xRange)` returns per-line *slices* (fresh `TextLine`s holding only the words in the band) so ticket 007 can read table cells straight off it. `vendor_name` uses it to take the left band before testing the line, because a letterhead name and the invoice meta block often share a baseline.
  - Match strength grading: label + value on the same line = 1.00; label + value on the line below = 0.85 (the association is positional); unlabelled date pattern = 0.85; `vendor_name` and the unlabelled largest-amount fallback = 0.60. `invoice_id` has **no** unlabelled fallback — no label means no candidate.
  - `total_amount` masks dates out of a line before scanning for amounts and prefers currency-marked (then decimal-bearing) candidates, so `Total for 3 items on 2024-10-26 ₹1,234.00` picks the money. `Subtotal` cannot match the label; `Sub-total` is rejected explicitly.
  - `value` keeps the document's own formatting for amounts; only comparisons use `parseAmountValue`. Dates are the one normalised field (`YYYY-MM-DD`).
- Match strength must stay honest: a positional guess scores 0.60 even when it happens to be right. Inflating it would make the confidence bar lie, which defeats the product's purpose.
- Unit tests added 2026-09-01 (`lines.spec.ts`, `rules.spec.ts`), written against hand-built `Word[]`/`Page[]` fixtures — no PDF or OCR involved, per the ticket's own scope. All documented behaviours in both modules' docstrings were asserted directly (ragged-baseline grouping, the exact-half-overlap boundary, page-boundary splitting, blank-word dropping, `wordsRightOf`'s midpoint rule, `lineBelow`'s overlap/page-break rules, `columnAt` slicing, `wordSpans`/`wordsInRange`/`unionBox`/`xRangeOf`; all four matchers' label-right/label-below/pattern-only/fallback tiers, the `Due Date` demotion, the decoy-document `Total Due` case, `parseAmountValue`'s five documented formats, and the vendor-name skip rules). Every matcher's `null` behaviour on `[]` and on a page with no words is asserted for all four fields. No production code was modified; all tests passed on first run — no bugs found.
- Unit tests are practical here (pure functions, plain-data fixtures) — no Notes exception needed per `task-driven-workflow.md`.

## Acceptance criteria
- [x] `lines.ts` groups words into lines correctly when baselines are ragged, and exposes the three documented helpers
- [x] Each of the four fields is extracted from a fixture invoice with the expected value and match strength
- [x] Dates in `YYYY-MM-DD`, `DD/MM/YYYY` and `Oct 26, 2024` all normalise to `YYYY-MM-DD`
- [x] `total_amount` prefers the last `Total`-like line and is not fooled by a larger unrelated number elsewhere
- [x] Every matcher returns no candidate (rather than throwing or guessing) on a document lacking the field
- [x] Each candidate carries a `reason` string suitable for display
- [x] Unit tests cover grouping and all four matchers against fixture word lists, and pass

## Handoff

**Files touched:**
- `lib/extraction/providers/local/lines.ts` (implementation, pre-existing uncommitted)
- `lib/extraction/providers/local/rules.ts` (implementation, pre-existing uncommitted)
- `lib/extraction/providers/local/lines.spec.ts` (new — 24 tests)
- `lib/extraction/providers/local/rules.spec.ts` (new — 31 tests)

**Test command and result:**
- Ticket-scoped: `npx vitest run lib/extraction/providers/local/lines.spec.ts lib/extraction/providers/local/rules.spec.ts --no-coverage` → 2 files, 55 passed.
- Full suite: `npx vitest run --no-coverage` → 11 files, 165 passed (up from the pre-ticket baseline of 110; +55 new tests, 0 failures, 0 skipped).

**Follow-ups:** None. No production bugs found; `lines.ts`/`rules.ts` behave exactly as documented in their own docstrings.
