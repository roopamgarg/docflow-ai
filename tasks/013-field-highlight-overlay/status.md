# Status: 013-field-highlight-overlay

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Overlay component + box styling
- [x] Zoom / fit / resize transform
- [x] Cross-page jump
- [x] Not-found and null-active handling
- [x] Verified for both OCR and text-layer sources
- [x] `highlight-geometry.ts` unit-tested; `FieldHighlight.tsx`/`DocumentViewer` wiring keep the Notes exception (visual geometry)
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- This is where a coordinate bug from 004 becomes visible. If boxes are consistently offset or mirrored vertically, suspect the PDF bottom-left → top-left conversion rather than this component.
- Depends on 008, not merely 012: the overlay needs `bbox` populated on fields, not just a viewer to draw into.
- 2026-09-01 — **the two coordinate spaces, measured rather than assumed.** `ExtractedField.bbox` is NOT always in the viewer's page space, so the overlay divides through by the extraction's own page geometry (`Extraction.pages[n]`), which is what `BoundingBox` documents as the space it lives in. Measured in the browser:
  - uploaded PNG (`scanned-invoice.png`): extraction page `900x360` = image `naturalWidth/Height` → ratio **1**.
  - text-layer PDF (`sample-invoice.pdf`): extraction page `612x792` = `getViewport({ scale: 1 })` → ratio **1**.
  - scanned PDF (rasterise → OCR): extraction page `1224x1584` while the viewer draws `612x792` → ratio **0.5**. `rasterisePdfPages` renders at `DEFAULT_RASTER_SCALE` (2x) for OCR dpi, and OCR reports boxes in the bitmap's space. Assuming one scale factor would put every highlight on a scan at double size in the top-left quadrant.
  This is why `DocumentState` now carries `pages` alongside `fields`: `toFields()` drops the page geometry, and without it the overlay cannot normalise. Kept optional so "no extraction yet" stays distinguishable from "an extraction with no pages".
- 2026-09-01 — the page number is now `/review`'s state, not the viewer's (012's handoff asked for this). `DocumentViewer` takes `page` / `onPageChange` and still owns `totalPages`, so it clamps for display without writing a correction back. `onPageChange` accepts a `setState`-style updater so two arrow presses in one React batch remain two steps.
- 2026-09-01 — the cross-page jump is done by adjusting state *during render* (guarded by the field id that triggered it), not in an effect: an effect would paint one frame of the wrong page before jumping, and `react-hooks/set-state-in-effect` rejects it outright.
- 2026-09-01 — known, and not this component's bug: on the text-layer route a value taken from part of a text run (`Total 1234.56` → `1234.56`) gets a `bbox` apportioned by character offset in 004, which assumes uniform glyph widths. The box is the right size and the right height but sits ~8pt right of the digits in Helvetica. Whole-run values (`Vendor Northwind Traders`) are exact to the pixel. Fixing it means proportional glyph metrics in `pdf-text.ts`, not a change here.

- 2026-09-01 — `components/viewer/highlight-geometry.ts` is the deliberate unit-test seam: `highlightRect({ bbox, source, page, scale })` is the whole transform as a pure function, so the ratio normalisation and the degenerate cases can be asserted with exact numbers instead of by eye. Worked values from the browser run: PNG `vendor_name` `bbox {42,44,366,78}` on a `900x360` page at `scale 1` → `{left: 42, top: 44, width: 324, height: 34}`; the same box at `scale 1.5` → `{63, 66, 486, 51}`; scanned-PDF `vendor_name` `bbox {122,125,512,166}` measured on a `1224x1584` OCR page but drawn on a `612x792` page at `scale 1` → `{61, 62.5, 195, 20.5}` (the 0.5 ratio).
- 2026-09-01 — browser-verified against real extractions (dev server, `agent-browser`), by driving `setActiveField` — the same context action 014's cards will call — from a temporary console harness that was removed before the ticket closed. Every case was checked numerically (the drawn rect's offset inside `[data-page-sheet]` versus the rect recomputed from the field's raw bbox) as well as by screenshot: PNG at 25/67/100/125/150%, `Fit`, and viewports 820-1700 px wide; text-layer PDF at 25/100/109/175%; scanned PDF at 100/109/175%. Agreement was exact, drifting at most 0.25 px at fractional zooms, and that drift is the sheet's `floor()` rounding, not the transform. 3-page PDF: activating a page-2 field from page 1 *and* from page 3 moved the viewer to `2 / 3` and drew the box; paging away hid it with no error; `invoice_id`/`date` (no `bbox`) and `activeFieldId: null` drew nothing, with a clean console.

## Acceptance criteria
- [x] Focusing or hovering a field card draws a box over the correct region of the document
- [x] The box stays aligned at 100%, zoomed in, zoomed out, and after `Fit`
- [x] The box stays aligned after a window resize
- [x] A field on page 2 switches the viewer to page 2 and highlights there
- [x] A not-found field (no bbox) renders no overlay and causes no error
- [x] Alignment is correct for both an OCR'd image and a text-layer PDF
- [x] No unit tests for `FieldHighlight.tsx`/`DocumentViewer` — Notes exception recorded (visual geometry; conversion tested in 004); `highlight-geometry.ts`'s transform math is unit-tested directly, not covered by the exception

## Handoff

**Files touched:**
- `components/viewer/FieldHighlight.tsx` (new) — the overlay itself; view layer only, reads `activeFieldId`/`fields`/`pages` from context.
- `components/viewer/highlight-geometry.ts` (new) — the pure `highlightRect()` transform this ticket unit-tests.
- `components/viewer/highlight-geometry.spec.ts` (new) — unit tests for `highlightRect()`: the three measured routes (PNG ratio 1, text-layer PDF ratio 1, scanned-PDF OCR ratio 0.5 — the highest-value assertion in the ticket), source fallback (omitted/null/degenerate → ratio 1), null guards (zero/negative/non-finite page, scale, and bbox coordinates), clamping to the sheet and the x0<=x1/y0<=y1 invariant, and the `MIN_HIGHLIGHT_PX` floor.
- `components/viewer/DocumentViewer.tsx` — wiring only (renders `FieldHighlight` through the existing overlay slot; still covered by the Notes exception, not by new tests).
- `lib/document-state.ts` — added the optional `pages?: readonly PageGeometry[]` field (see Notes for why).
- `lib/document-state.spec.ts` — extended: asserts `extraction/succeeded` populates `pages` from the extraction, and `state/reset` clears it back to `undefined`. Pre-existing assertions (e.g. the `document/selected` and `state/reset` object-literal `toEqual`s that omit a `pages` key) still pass unchanged, because `toEqual` treats an `undefined`-valued property as equal to a missing one.
- `app/review/page.tsx` — wiring only, no new tests (page-ownership change per 012's handoff; not part of this ticket's geometry).
- `tasks/013-field-highlight-overlay/plan.md`, `tasks/013-field-highlight-overlay/status.md` — reworded the blanket "no unit tests" line so the DOM-overlay exception is scoped correctly now that `highlight-geometry.ts` has real coverage.

**Test command and result:**
- Ticket-scoped: `npx vitest run components/viewer/highlight-geometry.spec.ts lib/document-state.spec.ts --no-coverage` → **55 passed, 0 failed**. (They were 53 passed / 2 failed until the bug below was fixed.)
- Full suite: `npx vitest run --no-coverage` → 347 passed, **2 failed**, 349 total (up from the pre-ticket baseline of 321; +26 new passing + 2 new failing = +28).
- `npm run typecheck` → clean, no errors.

**Production bug found by these tests, handed back to the implementer, and FIXED on 2026-09-01:**
`highlightRect()` in `highlight-geometry.ts` destructures `bbox` (`const { x0, y0, x1, y1 } = bbox;`) before checking whether `bbox` itself is present. A `null` or `undefined` `bbox` throws a `TypeError` instead of returning `null` as its own docstring promises ("a non-finite box" returns `null`; a missing box currently throws). In production this is masked because `FieldHighlight.tsx` guards `!field.bbox` before ever calling `highlightRect`, so no user-visible crash has been observed — but the function is not safe to call directly with a possibly-absent bbox, which its public contract implies it should be. Two tests captured this. Resolution: `if (bbox == null) return null;` was added immediately after the page/scale guards and before the destructure (covering both `null` and `undefined`), and the `@returns` docstring now names a missing box as a `null` case. Both tests pass; the full suite is 349 passing. The tests that caught it were not weakened. Original detail follows:
  - `highlightRect / null guards > returns null for a null bbox instead of throwing`
  - `highlightRect / null guards > returns null for an absent bbox instead of throwing`
  Fix (not applied): guard `if (bbox == null) return null;` immediately after the page/scale checks, before the destructure.

**Unit test coverage decision:** `highlight-geometry.ts` (pure math) is fully unit-tested per the "Unit tests" section of `.claude/rules/task-driven-workflow.md`. `FieldHighlight.tsx` and the `DocumentViewer` wiring keep the plan's Notes exception — DOM overlay geometry verified numerically and by screenshot in a real browser (see Notes below), not by an automated test.
