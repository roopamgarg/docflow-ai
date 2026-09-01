# Status: 005-ocr-extraction-source

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Worker lifecycle against vendored assets
- [ ] `blocks: true` structured recognition
- [ ] Block-tree → `Word[]` mapping incl. alternatives
- [ ] Progress weighting across pages
- [ ] `no_text_found` failure path
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **v6 API traps, verified against current docs:** non-text output is disabled by default, so `{ blocks: true }` is mandatory; `worker.initialize` and `worker.loadLanguage` were removed.
- Keep the block-tree mapping in a pure exported function so tests never invoke real OCR — real recognition is slow and varies by machine.

## Acceptance criteria
- [ ] An image yields `Word[]` with real `confidence` values in 0..1, a `bbox` per word, and `alternatives` where tesseract supplied choices
- [ ] `recognize` is called with `{ blocks: true }`; removing it demonstrably yields no words (guards against the v6 default)
- [ ] Worker assets load from `public/tesseract/` with no network request
- [ ] `onProgress` emits monotonically increasing ratios during OCR, reaching 1 on completion, across a multi-page document
- [ ] A blank or unreadable image raises `ExtractionError('no_text_found')`
- [ ] Unit tests cover the block-tree mapping, confidence scaling and progress weighting against a fixture, and pass

## Handoff

(Leave empty until the ticket is done.)
