# Status: 008-local-provider-and-field-mapping

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `createLocalProvider` skeleton + registration
- [x] File validation
- [x] Route selection incl. scanned-PDF fallback
- [x] Progress mapping
- [x] Extraction assembly + confidence composition
- [x] `toFields` display mapping
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **Convergence point of the board.** 013, 014 and 015 all need this done. Worth a manual pass over several real invoices here, before UI work depends on its output.
- Not-found fields are a designed state, not a failure: empty value, 0 confidence, `Not found in document`. 014 renders them as a prompt for the human.
- **Progress budget:** `reading` 0 → `OCR_START_RATIO` (0.1), `ocr` 0.1 → `MATCHING_START_RATIO` (0.9), `matching` 0.9 → 1. The text-layer route has no `ocr` phase, so its `reading` ends at 0.9 instead. The reporter gate is non-decreasing, drops duplicate (phase, ratio) reports, and always ends at exactly 1.
- **Scanned-PDF threshold:** mean non-whitespace chars per page < `MIN_TEXT_LAYER_CHARS_PER_PAGE` (20), from `totalCharCount(document) / pages.length`, i.e. the text source's own per-page `charCount`. `sample-invoice.pdf` averages 21.67 (49/16/0 over three pages), so it clears the threshold by a hair — a fixture edit could flip its route.
- **New file:** `providers/local/rasterise.ts` holds the pdf.js page → canvas rasteriser (scale 2). It is the only browser-only code in the extraction layer (needs `document.createElement("canvas")`; pdf.js 6 types `RenderParameters.canvas` as `HTMLCanvasElement`), so it throws `internal` with a clear message under Node and is injected via `LocalProviderDeps.rasterisePdf` in tests.
- **Seams on `createLocalProvider(deps)`:** `readPdfText`, `runOcr`, `rasterisePdf`, `readImageSize`, plus `ocrOptions` / `pdfTextOptions` pass-through — mirroring `OcrOptions.createWorker`. Every default is the real source, so the registry factory needs no arguments.
- **Manual end-to-end pass (2026-09-01):** real `scanned-invoice.png` through real tesseract with the vendored assets produced `INV-2026-0142` (0.92), `2026-03-14` (0.94), `Northwind` (0.57), `$1,284.50` (0.96) with bboxes, progress `reading:0 → reading:0.1 → ocr:… → ocr:0.9 → matching:0.9 → matching:1`. Real `sample-invoice.pdf` took the text-layer route; `invoice_id` and `date` came back not-found because the fixture says bare `Invoice INV-1024` (no `#`/`No`/`ID`) and carries no date — a 006 rule boundary, not a mapping bug.
- **Stale test fixed:** `providers/registry.spec.ts` asserted the registry was empty "pre-008". Registering `local` invalidates that by design, so those two assertions now assert the successor behaviour (default id resolves to `local` / `local` is listed). Suite is back to 187 passing.
- `alternativesFor` is duplicated from the private helper in `line-items.ts` (scalar candidates carry words, not alternatives). If a third caller appears, promote it to `lines.ts`.
- `providers/local/index.ts` imports `./pdf-text` statically, so pdf.js is in the graph of anything importing the registry. Acceptable for now (013 renders PDFs with pdf.js anyway); a lazy `import()` is a perf follow-up, not a correctness one.
- **Unit tests added (2026-09-01).** `local/index.spec.ts` covers `resolveMediaType`/`validateFile` (including the `image/jpg` alias, the `a.PNG` extension fallback, and the exact-boundary `10485761`-byte `too_large` case), the 20-vs-19 mean-chars-per-page boundary on `isTextLayerUsable`, route selection (PNG/JPEG never call `readPdfText`; the sparse-text-layer PDF rasterises then OCRs; the empty-pages PDF throws `unreadable` before either), the exact progress sequences on both routes, `createLocalProgressReporter`'s monotonic/dedup/clamp/ends-at-1 behaviour, and `toExtractedValue`/`notFoundValue` (null candidate, zero-word candidate, and the composed-confidence/union-bbox/first-word-page/deduped-alternatives path). `fields.spec.ts` covers `toFields` ordering and ids, `bbox`/`page` pass-through, `approved`/`edited`/`originalValue`, the not-found field never being omitted, and `lineItemLabel`'s positional fallback. The AC "a PNG invoice produces populated `ExtractedField[]` with real confidences and bboxes end to end" was verified manually with real tesseract (see the 2026-09-01 manual pass note above); it is intentionally not reproduced as a unit test, since that would mean running real OCR in CI. The equivalent path — image route through injected fakes, source `"ocr"`, one OCR input whose `source` is the `File` — is covered instead.
- All 187 pre-ticket tests still pass; the suite is 231 passing after this ticket's 44 new tests (2 files → 14 files, all green).
- No production bugs found while writing these tests; no assertion was weakened or removed to reach green.

## Acceptance criteria
- [x] A PNG invoice produces populated `ExtractedField[]` with real confidences and bboxes end to end
- [x] A digital PDF uses the text layer; an image-only PDF falls back to OCR
- [x] Oversize and unsupported files raise the documented error codes before any parsing work
- [x] `onProgress` advances through `reading` → `ocr` → `matching` and ends at ratio 1
- [x] A field with no candidate appears as an empty value at 0 confidence with a `Not found` reason — never omitted, never fabricated
- [x] `toFields` ordering and ids are stable, with one entry per line item
- [x] Unit tests cover route selection, validation, not-found mapping and `toFields`, and pass

## Handoff

**Files touched:**
- `lib/extraction/providers/local/index.spec.ts` (new) — `createLocalProvider`, `resolveMediaType`, `validateFile`, `isTextLayerUsable`, `createLocalProgressReporter`, `toExtractedValue`/`notFoundValue`, and `rasterisePdfPages` under Node.
- `lib/extraction/fields.spec.ts` (new) — `toFields`, `lineItemFieldId`, `lineItemLabel`, `SCALAR_FIELD_ORDER`/`SCALAR_FIELD_LABELS`.
- `tasks/008-local-provider-and-field-mapping/status.md` — this file.
- No production code changed by this test pass (`local/index.ts`, `local/rasterise.ts`, `fields.ts`, `providers/registry.ts` were already in the working tree from the implementation pass; `providers/registry.spec.ts` was already updated by the implementer for the `local`-is-registered successor behaviour and left as is).

**Test command and result:**
- Ticket-scoped: `npx vitest run lib/extraction/fields.spec.ts lib/extraction/providers/local/index.spec.ts --no-coverage` → 2 files, 44 tests, all passing.
- Full suite: `npx vitest run --no-coverage` → 14 files, 231 tests, all passing (187 pre-ticket + 44 new).

**Env vars:** none added.

**Follow-ups:** none required by this ticket. The perf follow-up on lazy-loading `./pdf-text` (noted above) and the `alternativesFor` duplication (also noted above) remain open observations, not blockers.

Next ticket per `tasks/README.md`: the first `pending` ticket whose dependencies are all `done` (008 unblocks 012/013/014/015 per the plan's convergence note above).
