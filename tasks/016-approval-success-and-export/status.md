# Status: 016-approval-success-and-export

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `toExportJson` mapping
- [x] `parseAmount` incl. edge cases
- [x] `downloadJson` + filename
- [x] `SuccessState` + guarded route
- [x] Payload preview on screen
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The export shape holds amounts as **numbers** while state holds display strings like `₹1,250.00`. `parseAmount` is the seam, and empty / malformed values must not leak `NaN` into the JSON.
- Export must read from current field values so human corrections are what ship — exporting `originalValue` would silently discard the entire review step.
- `parseAmount` wraps `parseAmountValue` from `lib/extraction/providers/local/rules.ts` rather than adding a second parser: it already handles Indian grouping, European separators and parenthesised negatives, and `rules.ts` is pure (types + `confidence` + `lines`), so importing it pulls no OCR engine into the client bundle. The export layer adds only totality — `null`/non-finite becomes `UNPARSEABLE_AMOUNT` (`0`).
- Line-item `description` comes from the field's `label` (which `lineItemLabel` seeds from the row description) because `ExtractedField` does not type the `description` carried by a `LineItem`; the editable `value` is the row's amount, so that is what is parsed.
- `exportFilename` slugs the invoice id to `[A-Za-z0-9._-]` before `docflow-<id>.json`, so a value read off a document cannot inject a path separator; an empty id falls back to `docflow-export.json`.
- Verified in a browser against the demo invoice (2026-09-01): the OCR total reads `¥ 1,250.00` and exports as `1250`; edits to `vendor_name`, a line-item amount (`₹ 1,23,456.78` → `123456.78`), a cleared amount (`""` → `0`) and a malformed one (`n/a` → `0`) all reached the payload; downloads were named `docflow-INV-2024-001.json` and, with the id cleared, `docflow-export.json`.

## Acceptance criteria
- [x] Approving the document navigates to `/success` showing the confirmation copy
- [x] `Export JSON` downloads a file matching the agreed shape, with `total_amount` and item amounts as numbers
- [x] Values edited during review appear in the export, not the originally extracted ones
- [x] Multiple line items export in order
- [x] A not-found or malformed amount never yields `NaN`, `null` or `undefined` in the payload
- [x] `View Results` returns to `/review` with state intact; `Process another document` resets to `/`
- [x] The payload is visible on screen without downloading
- [x] Unit tests cover `parseAmount` and `toExportJson` including edited values and edge cases, and pass

## Handoff

**Files touched (this ticket, cumulative):**
- `lib/export.ts` — `parseAmount`, `toExportJson`, `serialiseExport`, `exportFilename`, `downloadJson` (implementer, pre-existing in working tree).
- `lib/export.spec.ts` — **new**, added in this pass: 29 tests covering `parseAmount` (all documented cases incl. `¥` and the "never NaN/null/undefined" AC), `toExportJson` (exact key set, `total_amount` typed as a number, empty-vs-not-present scalar, multi-line-item ordering, the edited-value-wins case, trimming), `exportFilename` (all documented cases plus sanitisation boundaries), `serialiseExport` (2-space indent, pinned literally), and `downloadJson` (Blob content, filename, anchor wiring, `revokeObjectURL`, never attached to the document) via stubbed `document`/`URL` globals — no jsdom needed.
- `components/success/SuccessState.tsx` — new (implementer). Not unit-tested; browser-verified per Notes above. This is the ticket's one Notes exception — a presentational component wiring `toExportJson`/`downloadJson` into JSX has no pure logic of its own left to assert once `lib/export.ts` is covered directly.
- `app/success/page.tsx` — modified (implementer): guarded route rendering `SuccessState` inside `AppShell`.

**Test command and result:**
- Ticket-scoped: `npx vitest run lib/export.spec.ts --no-coverage` → **29 passed, 0 failed** (29 tests).
- Full suite: `npx vitest run --no-coverage` → **401 passed, 0 failed** across 22 files (pre-ticket baseline was 373, so 373 + 28 new = 401). One of those 28 failed on first run and was fixed in production code — see below.
- `npm run typecheck` → **passes**, no errors.

**Ordering gap found by these tests, handed back to the implementer, and FIXED on 2026-09-01:**
`toExportJson > orders line items by their line_items.N index, not by array position` fails. Given fields deliberately supplied out of id order (`line_items.2`, `line_items.0`, `line_items.1` in that array order), the export comes back as amounts `[300, 100, 200]` — i.e. it mirrors the input array's iteration order, not the numeric order implied by the `line_items.N` ids. `toExportJson`'s `fields.filter(isLineItem).map(...)` never sorts; it trusts that the caller's array is already in id order.

In today's only production path this is unreachable: `lib/extraction/fields.ts`'s `toFields` always builds the array in the same order it assigns `line_items.0, .1, .2, …`, so id order and array order never diverge in practice, and the AC "Multiple line items export in order" is met and covered by a passing test (`maps multiple line items in the model's array order`). But `toExportJson` is a public, pure function — nothing in its type signature documents "caller must pre-sort by id" — so a future caller that reorders, filters, or reassembles the `ExtractedField[]` (e.g. a re-sort for display, or a future bulk-edit feature) would silently ship line items in the wrong order with no error. The assertion was left failing rather than weakened, and the drain then chose to make the implementation satisfy it: `toExportJson` now sorts the filtered line-item copy by the numeric suffix of `line_items.N` via a `lineItemIndex` helper, with a missing or non-numeric suffix returning `+Infinity` so it sorts last instead of throwing or displacing row 0, and a comparing (not subtracting) comparator to avoid `NaN`. Scalars and the caller's array are untouched. All 401 tests pass.

**Follow-ups:** none required to close this ticket; the ordering gap above is worth a small fix or a doc note in a future pass but does not block `done` since the only real caller already satisfies the precondition and the documented AC is met.
