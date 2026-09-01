# Status: 003-extraction-contracts-confidence

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `types.ts` word/page/extraction model
- [ ] `provider.ts` interface + progress type
- [ ] `errors.ts` error vocabulary
- [ ] `registry.ts` provider lookup
- [ ] `confidence.ts` composition + tiers
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The `bbox` coordinate space is defined here as **top-left origin, page pixels**. Both sources must normalise into it — 004 does the PDF bottom-left conversion. Getting this wrong surfaces as misaligned highlights in 013.
- This is the seam that keeps the engine swappable. Adding a cloud provider later should be one new file plus one `registry.ts` line.

## Acceptance criteria
- [ ] `Word`, `Page`, `DocumentText`, `Extraction`, `ExtractedField`, `ExtractionProvider`, `ExtractionProgress` and `ExtractionError` are exported and used by nothing outside `lib/extraction`
- [ ] `getExtractionProvider()` resolves a registered id and throws `ExtractionError('internal')` for an unknown one
- [ ] `tierFor` returns the documented tier at every boundary value
- [ ] `composeConfidence` returns match strength unchanged when all word confidences are 1.0
- [ ] Unit tests cover confidence composition and every tier boundary, and pass
- [ ] No pdfjs, tesseract, or React import appears in this ticket's files

## Handoff

(Leave empty until the ticket is done.)
