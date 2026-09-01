# Status: 003-extraction-contracts-confidence

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `types.ts` word/page/extraction model
- [x] `provider.ts` interface + progress type
- [x] `errors.ts` error vocabulary
- [x] `registry.ts` provider lookup
- [x] `confidence.ts` composition + tiers
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The `bbox` coordinate space is defined here as **top-left origin, page pixels**. Both sources must normalise into it — 004 does the PDF bottom-left conversion. Getting this wrong surfaces as misaligned highlights in 013.
- This is the seam that keeps the engine swappable. Adding a cloud provider later should be one new file plus one `registry.ts` line.
- Contracts implemented 2026-09-01: `lib/extraction/types.ts`, `provider.ts`, `errors.ts`, `confidence.ts`, `providers/registry.ts`. Pure TS, no side effects at module load, no pdfjs/tesseract/React imports (only prose mentions in doc comments).
- Registry path: the ticket's Key files and 008 both say `lib/extraction/providers/registry.ts`, while `.claude/rules/architecture-layers.md` sketches `lib/extraction/registry.ts`. Went with the tickets (and the master plan tree) — `lib/extraction/providers/registry.ts`.
- `PROVIDERS` is deliberately empty until 008 registers `local`, so every lookup currently takes the unknown-id path. `resolveExtractionProvider(registry, id)` is exported as a pure seam so the resolve-a-registered-id path is testable now with an injected registry; `getExtractionProvider(id)` binds it to the module registry.
- `Extraction` shape chosen: `{ source, pages: PageGeometry[], fields: Record<ScalarFieldKey, ExtractedValue>, lineItems: LineItem[] }`. `ExtractedField extends ExtractedValue` with `id`, `label`, `originalValue`, `approved`, `edited` (matches the master plan's field model). `pages` carries scale-1 page geometry so 013 can scale bboxes.
- Tier boundaries are inclusive lower bounds (`>= 0.95` high, `>= 0.80` medium, `> 0` low, `<= 0`/non-finite not-found) and documented as a table on `tierFor`. `composeConfidence` returns `0` for an empty word list rather than `NaN`.
- `npm run typecheck`, `npm run lint`, `npm run build` and `npx vitest run` all pass; unit tests for this ticket are still outstanding.
- Unit tests added 2026-09-01: `confidence.spec.ts` (tierFor at every boundary — 1, 0.95, 0.949, 0.8, 0.799, 0.0001, 0, negative, NaN; composeConfidence arithmetic and the pdf-text all-1.0-words case for every `MatchStrength` value; empty-words → 0 not NaN), `errors.spec.ts` (instanceof Error, name, per-code default message, custom message, cause, `isExtractionError` narrowing), `providers/registry.spec.ts` (`getExtractionProvider()` and an unknown id both throw `ExtractionError` code `internal` since `PROVIDERS` is empty pre-008; `resolveExtractionProvider` with an injected `{ test: factory }` resolves and calls the factory; default id is `local`), and `dependency-free.spec.ts` (static regression guard: scans actual import/require specifiers in `types.ts`, `provider.ts`, `errors.ts`, `confidence.ts`, `providers/registry.ts` for pdfjs/tesseract/react, ignoring doc-comment prose). No production code changed; no bugs found. Command: `npx vitest run --no-coverage lib/extraction` → 4 files, 45 tests, all passing. Full suite `npx vitest run --no-coverage` → 7 files, 55 tests, all passing.

## Acceptance criteria
- [x] `Word`, `Page`, `DocumentText`, `Extraction`, `ExtractedField`, `ExtractionProvider`, `ExtractionProgress` and `ExtractionError` are exported and used by nothing outside `lib/extraction`
- [x] `getExtractionProvider()` resolves a registered id and throws `ExtractionError('internal')` for an unknown one
- [x] `tierFor` returns the documented tier at every boundary value
- [x] `composeConfidence` returns match strength unchanged when all word confidences are 1.0
- [x] Unit tests cover confidence composition and every tier boundary, and pass
- [x] No pdfjs, tesseract, or React import appears in this ticket's files

## Handoff

**Files touched:**
- `lib/extraction/confidence.spec.ts` (new)
- `lib/extraction/errors.spec.ts` (new)
- `lib/extraction/providers/registry.spec.ts` (new)
- `lib/extraction/dependency-free.spec.ts` (new)
- `tasks/003-extraction-contracts-confidence/status.md` (this file)

No production code under `lib/extraction/` was changed — the implementation (`types.ts`, `provider.ts`, `errors.ts`, `confidence.ts`, `providers/registry.ts`) was already correct against the spec above.

**Test command and result:**
- `npx vitest run --no-coverage lib/extraction` → 4 test files, 45 tests, all passing.
- `npx vitest run --no-coverage` (full suite) → 7 test files, 55 tests, all passing.

**Env vars:** none.

**Follow-ups:** none. `local` provider registration (ticket 008) will need its own registry test additions once `PROVIDERS` is no longer empty.
