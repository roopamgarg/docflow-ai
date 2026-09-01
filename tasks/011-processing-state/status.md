# Status: 011-processing-state

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Four-step checklist bound to real phases
- [x] True progress bar from the OCR ratio
- [x] Error state with retry and reset
- [x] `no_text_found` specific copy
- [x] Navigation on completion
- [x] No unit tests for the React components — Notes exception (presentational); `processing-steps.ts` pure logic covered by unit tests
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Explicit design constraint: **no fabricated progress.** The local engine has a genuine signal, so there is no excuse for a timer-driven bar or a step that completes before its work does.
- No unit tests: purely a projection of context state. If this component ends up needing tests, it has probably absorbed logic that belongs in 008.
- Phase → step mapping (three phases, four steps), documented in `components/upload/processing-steps.ts`: `Upload document` has no phase because the card only renders once a `File`, an object URL and a `document/selected` are already in state, so it is `done` from the first frame; `reading` → `Detect document structure` (decoding plus the text-layer-vs-scan route decision *is* structure detection); `ocr` → `Extract fields`; `matching` → `Prepare for review`. The digital-PDF route never enters `ocr`, so `Extract fields` flips `pending` → `done` at the hand-off to `matching` — accurate, because the words came from the text layer instead of a recognition pass.
- The phase/ratio/error-copy projection was pulled out of the component into `components/upload/processing-steps.ts` (pure, React-free: `processingStepStates`, `processingPercent`, `processingErrorMessage`), following the `validate-upload.ts` precedent. This revises the plan's "no unit tests" note: the component itself stays untested markup, but that module is testable and a separate pass owns its specs.
- `components/upload/UploadPanel.tsx` was added so `app/page.tsx` could stay a server component; it is the switch between the dropzone and the processing card. It requires `doc !== null`, not merely a non-idle status, because `unsupported_media` fails with nothing loaded and a processing card with no filename would be worse than the dropzone's own inline rejection.
- `router.replace("/review")`, not `push`: the landing page redirects a `ready` document straight back to `/review`, so a history entry pointing at the landing page would be a loop the back button could not escape.
- Verified in a real browser (localhost:3471). Cold OCR run on `scanned-invoice.png`: 10% → 18% → 30% → 44% → 56% → 100%, steps advancing `reading` → `ocr` → `matching` in order, then `/review`. Warm run measured frame-by-frame: 10 → 18 → 44 → 100. `sample-invoice.pdf` (text layer) goes 0% → 100% in one frame and lands on `/review`. A blank PNG produces `no_text_found` with its own copy; `Try again` genuinely re-ran (back to 10% → 18% → the same failure) and `Choose a different file` restored the dropzone.
- No timers, intervals or interpolation anywhere in the card. The only animation is a 150 ms `transition-colors` on the step markers and an `animate-pulse` dot on the active step — neither claims progress.

## Acceptance criteria
- [x] The four steps advance in order and reflect the actual phase; none is marked done early
- [x] The progress bar shows a real percentage during OCR that increases monotonically
- [x] The filename is displayed throughout
- [x] An extraction failure shows the message, `Try again` (which genuinely re-runs) and `Choose a different file`
- [x] `no_text_found` renders its specific copy rather than a generic error
- [x] Reaching `ready` navigates to `/review`
- [x] No unit tests for the React components — Notes exception recorded (presentational); `processing-steps.ts` pure logic covered by unit tests

## Handoff

- Added `components/upload/processing-steps.spec.ts` — colocated unit tests (style matches `components/upload/validate-upload.spec.ts`) for the three pure exports of `components/upload/processing-steps.ts`:
  - `processingStepStates`: all six `DocumentStatus` shapes (`working` × `reading`/`ocr`/`matching`, `ready`, `error`, `idle`).
  - `processingPercent`: ratio scaling and rounding (0.18 → 18, 0.905 → 91), `ready` → 100, `idle`/`error` → 0, and clamping for `NaN` and out-of-range ratios (below 0 and above 1).
  - `processingErrorMessage`: exact `no_text_found` copy regardless of thrown message (including a blank one), other codes pass their thrown message through unchanged, and a blank/empty message falls back to `new ExtractionError(code).message`.
  - `ProcessingState.tsx` and `UploadPanel.tsx` remain untested per the plan's Notes exception (presentational, browser-verified) — only the pure logic module was in scope for this pass.
- No production code changed. No bugs found in `processing-steps.ts`; every implementer-verified behaviour asserted cleanly.
- Test command: `npx vitest run components/upload/processing-steps.spec.ts --no-coverage` → 1 file, 17 passed.
- Full suite: `npm run test -- --no-coverage` → 17 files, 284 passed (267 pre-existing + 17 new).
- `npm run typecheck` → passes clean (`next typegen && tsc --noEmit`).
- Files touched: `components/upload/processing-steps.spec.ts` (new), `tasks/011-processing-state/plan.md`, `tasks/011-processing-state/status.md`.
- Follow-ups: none.
