# Status: 005-ocr-extraction-source

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Worker lifecycle against vendored assets
- [x] `blocks: true` structured recognition
- [x] Block-tree → `Word[]` mapping incl. alternatives
- [x] Progress weighting across pages
- [x] `no_text_found` failure path
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **v6 API traps, verified against current docs:** non-text output is disabled by default, so `{ blocks: true }` is mandatory; `worker.initialize` and `worker.loadLanguage` were removed.
- Keep the block-tree mapping in a pure exported function so tests never invoke real OCR — real recognition is slow and varies by machine.
- **v7 API re-verified against `node_modules/tesseract.js@7.0.0`** (the notes above were written from v6 docs; both still hold):
  - `createWorker(langs, oem, options, config)` is unchanged, and `initialize` / `loadLanguage` are still absent from the returned worker (internal only; `reinitialize` is the public replacement).
  - Non-text output is still opt-in and the key is still `blocks`: `recognize(image, opts, output = { text: true })`, and `dump.js` returns `blocks: null` unless `output.blocks`. Passing `{ blocks: true }` does not lose `text` — the worker merges it over its own defaults.
  - **New trap, not in the plan:** `corePath` must name the exact `.js` file, not the directory. Given a directory, tesseract 7 appends a filename chosen from SIMD support *and* engine mode — for `OEM.LSTM_ONLY` that is `tesseract-core-(relaxed)simd-lstm.wasm.js`, which ticket 001 did not vendor. `DEFAULT_OCR_CORE_PATH` therefore points at `/tesseract/tesseract-core-simd.wasm.js` (the full core runs LSTM fine).
  - `word.choices` needs no `lstm_choice_mode`, but the LSTM engine returns just the chosen reading, and the chosen reading is not always first. `wordAlternatives` filters the word's own text out and de-duplicates, so `alternatives` stays absent unless there is something else to offer.
  - URL strings and `HTMLImageElement` are excluded from `OcrImageSource`: tesseract resolves both by `fetch()`, which the offline guarantee forbids.
- `no_text_found` is raised **per page** (per the plan's wording), from `readableWordCount(words) === 0` against `MIN_WORD_CONFIDENCE = 0.3`. Words below the floor are still returned — the floor only answers "did this page yield anything".
- Progress: setup statuses share `OCR_SETUP_WEIGHT` (0.1), pages split the rest evenly. `createOcrProgressReporter` clamps to a strictly increasing sequence and reports `1` once. A real two-page run emitted `0.1 → 0.177 → 0.261 → 0.338 → 0.55 → 0.627 → 0.711 → 0.788 → 1`.
- Fixtures are real `recognize(..., { blocks: true })` payloads for the committed `scanned-invoice.png`, regenerable with `node lib/extraction/providers/local/__fixtures__/capture-tesseract-result.mjs`. Two engines, because the LSTM one (what we ship) never supplies multi-choice words: `tesseract-invoice-lstm.json` (OEM 1, 11 words, mean conf 94) and `tesseract-invoice-legacy-choices.json` (OEM 0, same words, real multi-choice readings). Only `word.symbols` is stripped.
- Verified end to end with a throwaway Node smoke test (not committed — `ocr.spec.ts` is the test agent's): two pages through one worker gave 11 words each at 0.92–0.96 confidence, page sizes 900x360 (explicit) and 366x274 (`wordsExtent` fallback), and a blank PNG raised `no_text_found`. Note tesseract's **Node** `loadImage` cannot read a `Blob`, which is why `OcrImageSource` also accepts `Uint8Array`.
- **Test agent (2026-09-01):** added `ocr.spec.ts` covering the pure mapping (`blocksToWords`, `scaleOcrConfidence`, `toBoundingBox`, `wordAlternatives`, `readableWordCount`, `wordsExtent`), progress weighting (`isRecognitionStatus`, `ocrProgressRatio`, `createOcrProgressReporter`) and the `ocrPages` worker lifecycle via the `createWorker` injection seam — no real OCR run. Verified against the two committed fixtures: LSTM (11 words, first word `Northwind` conf 0.95, no alternatives anywhere) and legacy multi-choice (word 4 `"#:"` conf 0.68 → `["l:","0:","J:","I:"]`; word 6 `"Date:"` → `["Data:"]`; word 7 → `["2026-03-14","2026—03—14","2026-03—14"]`). Confirmed `recognize` is called with the literal third argument `{ blocks: true }`, one worker factory call serves N pages, and `terminate()` fires exactly once on success, `no_text_found`, and a rejecting `recognize` — but not on a rejecting factory or an empty `inputs` array, where no worker is ever created. All behavior matched the implementation as documented; no bugs found, no assertions weakened. Ran `npx vitest run lib/extraction/providers/local/ocr.spec.ts --no-coverage` (37/37 passing) then the full suite `npx vitest run --no-coverage` (110/110 passing, up from the pre-ticket baseline of 73).

## Acceptance criteria
- [x] An image yields `Word[]` with real `confidence` values in 0..1, a `bbox` per word, and `alternatives` where tesseract supplied choices
- [x] `recognize` is called with `{ blocks: true }`; removing it demonstrably yields no words (guards against the v6 default)
- [x] Worker assets load from `public/tesseract/` with no network request
- [x] `onProgress` emits monotonically increasing ratios during OCR, reaching 1 on completion, across a multi-page document
- [x] A blank or unreadable image raises `ExtractionError('no_text_found')`
- [x] Unit tests cover the block-tree mapping, confidence scaling and progress weighting against a fixture, and pass

## Handoff

**Files touched:**
- `lib/extraction/providers/local/ocr.spec.ts` (new) — unit tests, no production code changed.

Implementation files (already in the working tree, untouched by this pass):
- `lib/extraction/providers/local/ocr.ts`
- `lib/extraction/providers/local/__fixtures__/tesseract-invoice-lstm.json`
- `lib/extraction/providers/local/__fixtures__/tesseract-invoice-legacy-choices.json`
- `lib/extraction/providers/local/__fixtures__/scanned-invoice.png`
- `lib/extraction/providers/local/__fixtures__/capture-tesseract-result.mjs`

**Test command and result:**
- `npx vitest run lib/extraction/providers/local/ocr.spec.ts --no-coverage` → 37/37 passing.
- `npx vitest run --no-coverage` (full suite) → 110/110 passing (73 pre-ticket + 37 new).

**Env vars:** none.

**Follow-ups:** none — all acceptance criteria met, no bugs found in the reviewed logic. The three tesseract v7 API traps noted above remain relevant for downstream tickets (008 rasterised-PDF OCR, 011 error copy) and should stay in mind when those are picked up.
