# Status: 007-line-item-table-extraction

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Header line detection
- [x] Column bounds from header geometry
- [x] Row pairing
- [x] Totals-row termination
- [x] Per-item confidence
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Expect this to need tuning against real invoices more than any other rule module. Keep the heuristics small and the fixtures plentiful.
- Per-item confidence matters for the UI: each line item becomes its own approvable card in 014, so a clean row should read as clean even when a sibling row is poor.
- Implemented in `lib/extraction/providers/local/line-items.ts` — `extractLineItems(pages)` returns `LineItem[]`, plus `findTableHeader` and the three patterns for tests. Geometry only through `./lines` (`documentLines`, `xRangeOf`, `columnAt`, `wordSpans`/`wordsInRange`, `unionBox`); amounts through `rules.ts` (`findAmounts`, `parseAmountValue`).
- Decision — **columns must be widened past their header words.** Description widens rightwards to the gutter midpoint with the next header (a `Qty` header, or the amount header) because prose runs wider than the word `Description`; the amount column widens both leftwards to its gutter and rightwards to the page edge because amount columns are right-aligned, so values sit outside the header word's own x-range. Description deliberately does not widen leftwards — an unlabelled row-number column would otherwise prefix every description.
- Decision — of several amount-ish headers on the header line the **rightmost** wins, so `Unit Price ... Amount` reads the line total rather than the unit price.
- Decision — `value` mirrors `amount` (document formatting, currency symbol intact) so a row is a drop-in `ExtractedValue` for the 014 card, with `description` as its label; 016 parses the number.
- Decision — match strength is a uniform `LABEL_ADJACENT_PATTERN` for a paired row (matched header + in-column cell + amount-pattern value), so a row's own word confidences are the only thing that moves its confidence.
- Termination is on the whole line's text, and a bare `Due` is excluded from `TOTALS_LINE_PATTERN` (a `Due` date line or a "Due diligence" description would truncate the table); `total|subtotal|amount due|balance` remain loose on purpose.
- Unit tests are owned by a separate agent (`line-items.spec.ts`); this box stays unchecked until they land.
- Unit tests landed 2026-09-01: 22 tests in `lib/extraction/providers/local/line-items.spec.ts`, covering `extractLineItems`, `findTableHeader`, and the three exported patterns directly. All passed on the first run against the existing implementation — no production bugs found, no assertions weakened.

## Acceptance criteria
- [x] A two-item fixture table yields exactly two items with correct descriptions and amounts
- [x] A totals row terminates iteration and never appears as a line item
- [x] A right-aligned amount column still pairs to the correct description
- [x] A document with no detectable header returns an empty array without throwing
- [x] Each item carries its own composed confidence and a `reason`
- [x] Unit tests cover all of the above against fixture word lists, and pass

## Handoff

**Files touched:**
- `lib/extraction/providers/local/line-items.spec.ts` (new) — 22 tests against `extractLineItems`, `findTableHeader`, `DESCRIPTION_HEADER_PATTERN`, `AMOUNT_HEADER_PATTERN`, `TOTALS_LINE_PATTERN`. Fixtures build `Word[]` by hand (no PDF/OCR), following the `word()`/`pageOf()`/`row()` style established in `rules.spec.ts`.
- `tasks/007-line-item-table-extraction/status.md` (this file)
- No production code changed.

**Test command and result:**
- Ticket only: `npx vitest run lib/extraction/providers/local/line-items.spec.ts --no-coverage` → 22 passed, 0 failed.
- Full suite: `npx vitest run --no-coverage` → 187 passed, 0 failed (165 pre-existing + 22 new; no regressions).

**Coverage highlights:**
- Two-item table: descriptions, amounts, `value === amount`, `page`, `bbox` (union of description + amount words only, Qty excluded), `reason` string.
- Totals termination for both `Total` and `Subtotal`: the totals row is never emitted, and — critically — a valid-looking row placed *after* the totals line is also dropped, proving termination (`break`) rather than mere filtering.
- Right-aligned amount column with zero overlap between the header word and the value's own bbox, once widened.
- Rightmost-amount-header selection (`Item | Qty | Unit Price | Amount` picks `Amount`, not `Unit Price`).
- A line with no amount, and a line with no description, are each skipped without ending the table.
- Per-item confidence: uniform-1 row → confidence 1; uniform-0.6 row → confidence 0.6; two rows with different word confidences produce different per-item confidences in the same table.
- Deduplicated `alternatives` from the amount word's alternate readings, and `[]` when none are offered.
- A row on a different page than the header is not emitted.
- `findTableHeader` and the three patterns tested directly, not only through `extractLineItems`.

**Follow-ups:** none. No bugs found in the implementation; ticket is complete.
