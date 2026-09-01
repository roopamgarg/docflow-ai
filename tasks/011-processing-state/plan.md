# 011 — Processing State

## Summary
Show honest progress while extraction runs — four real steps driven by real phases, a true percentage from the OCR logger, and a recoverable error state.

## Dependencies
- 009-document-state-and-routing
- 010-landing-and-upload

## Scope
- **`ProcessingState`** replaces the upload card in place on the landing page; it does not own a route. Headline `Analyzing your document...` plus the filename.
- **Four steps** from the spec — `Upload document`, `Detect document structure`, `Extract fields`, `Prepare for review` — each rendered as done / active / pending (check, filled dot, hollow dot).
- **Real progress, not theatre:** steps advance from the `ExtractionProgress` phases in context (`reading` → `ocr` → `matching`), and the bar shows the true ratio reported by the tesseract logger. No timers, no fake percentage, no step marked done before its work is.
- **Error state:** on `status.phase === 'error'`, show the message plus `Try again` (calls `retry()`) and `Choose a different file` (calls `reset()`). Give `no_text_found` its own copy — `We couldn't find any readable text. Try a clearer scan.` — because it is the most likely real failure and a generic message would be useless.
- **Completion:** when `status.phase === 'ready'`, navigate to `/review`.
- No unit tests — reason: presentational, driven entirely by context state; the phase/ratio logic it renders is tested in 005 and 008. Covered manually per the acceptance criteria.

## Architecture notes
View layer. Reads `status` from `useDocument()` and renders it. Contains no timing logic and no knowledge of OCR or pdf.js — if this component needs a `setTimeout` to look right, something upstream is wrong.

## Out of scope
- The extraction work itself (008).
- The review screen.

## Acceptance criteria
- [ ] The four steps advance in order and reflect the actual phase; none is marked done early
- [ ] The progress bar shows a real percentage during OCR that increases monotonically
- [ ] The filename is displayed throughout
- [ ] An extraction failure shows the message, `Try again` (which genuinely re-runs) and `Choose a different file`
- [ ] `no_text_found` renders its specific copy rather than a generic error
- [ ] Reaching `ready` navigates to `/review`
- [ ] No unit tests — Notes exception recorded (presentational; phase logic covered in 005/008)

## Key files
- `components/upload/ProcessingState.tsx`
- `app/page.tsx`
