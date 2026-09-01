# 008 — Local Provider And Field Mapping

## Summary
Assemble the pipeline into a working `ExtractionProvider`: pick the right source for the file, run the rules, compose confidences, and map the result into the display model the UI consumes. This is the first ticket where a real file produces real fields.

## Dependencies
- 004-pdf-text-extraction-source
- 005-ocr-extraction-source
- 006-line-grouping-and-field-rules
- 007-line-item-table-extraction

## Scope
- **`local/index.ts` — `createLocalProvider()`** implementing `ExtractionProvider` with `id: 'local'`, `label: 'On-device OCR'`.
- **Route selection:** PNG/JPG → OCR directly. PDF → try the text layer first; if it yields fewer than ~20 characters per page, treat it as scanned, render each page to a canvas with pdf.js at ~2x scale, and OCR that. Scanned PDFs are common enough that skipping this makes the app feel broken on real documents.
- **Validation:** reject anything outside `application/pdf` / `image/png` / `image/jpeg` with `unsupported_media`, and anything over 10MB with `too_large`.
- **Progress mapping:** `reading` while parsing, `ocr` weighted across pages, `matching` for the rule pass — feeding the real percentage 011 displays.
- **Assembly:** run the four scalar matchers plus the line-item extractor, compose each field's confidence via `confidence.ts`, and emit an `Extraction`. Fields with no candidate become empty values at 0 confidence with `reason: 'Not found in document'`.
- **`fields.ts`:** `toFields(extraction)` flattens to `ExtractedField[]` ordered `Invoice ID`, `Date`, `Vendor Name`, `Total Amount`, then one entry per line item with ids like `line_items.0`, carrying `bbox` and `page` for highlighting and `approved: false`, `edited: false`.
- **Registration:** add `local` to `registry.ts`.
- **Tests:** `local/index.spec.ts` and `fields.spec.ts` — route selection chooses OCR for images and the text layer for a text-bearing PDF; the sparse-text PDF falls back to OCR; validation rejects oversize and wrong-type files; a not-found field maps to an empty 0-confidence entry; `toFields` produces stable ids and ordering including multiple line items. Stub the two sources so these stay fast and deterministic.

## Architecture notes
Service layer — the orchestrator. It is the only module that knows both sources exist, and the only one that decides between them. Everything above it sees just `extract(file, onProgress)`.

## Out of scope
- Any UI or state (009+).
- Export JSON shaping (016).
- A second provider.

## Acceptance criteria
- [ ] A PNG invoice produces populated `ExtractedField[]` with real confidences and bboxes end to end
- [ ] A digital PDF uses the text layer; an image-only PDF falls back to OCR
- [ ] Oversize and unsupported files raise the documented error codes before any parsing work
- [ ] `onProgress` advances through `reading` → `ocr` → `matching` and ends at ratio 1
- [ ] A field with no candidate appears as an empty value at 0 confidence with a `Not found` reason — never omitted, never fabricated
- [ ] `toFields` ordering and ids are stable, with one entry per line item
- [ ] Unit tests cover route selection, validation, not-found mapping and `toFields`, and pass

## Key files
- `lib/extraction/providers/local/index.ts`
- `lib/extraction/providers/local/index.spec.ts`
- `lib/extraction/fields.ts`
- `lib/extraction/fields.spec.ts`
- `lib/extraction/providers/registry.ts`
