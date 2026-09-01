# 005 — OCR Extraction Source

## Summary
Run tesseract.js over images and rasterised PDF pages, producing the shared `Word[]` model with real per-word confidence, bounding boxes and alternate readings, plus a genuine progress signal.

## Dependencies
- 003-extraction-contracts-confidence

## Scope
- **`ocr.ts`:** create one worker via `createWorker('eng', 1, { workerPath, corePath, langPath, logger })` pointed at the assets vendored in 001, reuse it across pages, and terminate it when done.
- **Structured output:** call `worker.recognize(source, {}, { blocks: true })`. **tesseract.js v6 returns text only unless structured output is requested** — omitting this yields no words at all. `worker.initialize` and `worker.loadLanguage` no longer exist in v6.
- **Mapping:** walk `blocks → paragraphs → lines → words`, mapping `word.text`, `word.confidence / 100` → `confidence`, `word.bbox` → `bbox`, and `word.choices` → `alternatives`.
- **Rasterising:** accept either an image source or a canvas, so 008 can hand it pdf.js-rendered pages at ~2x scale for scanned PDFs.
- **Progress:** translate the `logger` callback's `{ status, progress }` into `ExtractionProgress` with `phase: 'ocr'`, weighted across pages so a multi-page document advances monotonically.
- **Failure:** raise `ExtractionError('no_text_found')` when a page yields no words above a minimal confidence floor — the most likely real-world failure, and one that deserves specific copy in 011.
- **Tests:** `ocr.spec.ts` — the block-tree walk and field mapping against a captured tesseract result fixture (no real OCR in unit tests, which would be slow and machine-dependent); confidence scaling from 0–100 to 0–1; multi-page progress weighting is monotonic and ends at 1.

## Architecture notes
Service layer, inside `lib/extraction/providers/local/`. The only module in the codebase permitted to import `tesseract.js`. Pure mapping logic is separated from worker lifecycle so the mapping can be unit-tested without running OCR.

## Out of scope
- Deciding when to use OCR versus the text layer (008).
- Field identification (006, 007).
- Rendering PDF pages for preview (012).

## Acceptance criteria
- [ ] An image yields `Word[]` with real `confidence` values in 0..1, a `bbox` per word, and `alternatives` where tesseract supplied choices
- [ ] `recognize` is called with `{ blocks: true }`; removing it demonstrably yields no words (guards against the v6 default)
- [ ] Worker assets load from `public/tesseract/` with no network request
- [ ] `onProgress` emits monotonically increasing ratios during OCR, reaching 1 on completion, across a multi-page document
- [ ] A blank or unreadable image raises `ExtractionError('no_text_found')`
- [ ] Unit tests cover the block-tree mapping, confidence scaling and progress weighting against a fixture, and pass

## Key files
- `lib/extraction/providers/local/ocr.ts`
- `lib/extraction/providers/local/ocr.spec.ts`
- `lib/extraction/providers/local/__fixtures__/`
