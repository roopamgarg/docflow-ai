# 013 — Field Highlight Overlay

## Summary
Draw the active field's source region on the document, making the link between extracted data and the page literal rather than implied. This is the payoff of extracting locally with real geometry.

## Dependencies
- 008-local-provider-and-field-mapping
- 012-document-viewer

## Scope
- **`FieldHighlight`:** an absolutely-positioned overlay inside the page sheet, drawing the active field's `bbox` as a soft translucent orange rect with a solid border.
- **Transform:** scale the box by the viewer's current zoom and offset by the page origin, so it tracks zoom, `Fit`, and window resizes exactly.
- **Cross-page:** if the active field's `page` is not the visible page, the viewer switches to that page first, then highlights.
- **Source-agnostic:** because 003 defines one coordinate space and both sources normalise into it, a single implementation covers OCR and text-layer documents.
- **Wiring:** read `activeFieldId` from context (set by the panel in 014); render nothing when it is null or when the field has no `bbox` (a not-found field).
- No unit tests for `FieldHighlight.tsx` or the `DocumentViewer` wiring — reason: geometry expressed through DOM layout and measured against a rendered canvas; correctness is visual and verified manually. The coordinate conversion feeding it is unit-tested in 004. The transform itself is factored out into `components/viewer/highlight-geometry.ts`, a pure function, which IS unit-tested (bbox-to-CSS-rect math, the OCR 2x-rasterisation normalisation, and the null/min-size guards).

## Architecture notes
View layer. Reads `activeFieldId` and `fields` from context; owns no state of its own. It must not reach into `lib/extraction` — everything it needs is already on `ExtractedField`.

## Out of scope
- Clicking a box to focus its field (the reverse direction) — panel-to-document only for this MVP.
- Highlighting multiple fields at once.
- Word-level sub-highlights within a field.

## Acceptance criteria
- [ ] Focusing or hovering a field card draws a box over the correct region of the document
- [ ] The box stays aligned at 100%, zoomed in, zoomed out, and after `Fit`
- [ ] The box stays aligned after a window resize
- [ ] A field on page 2 switches the viewer to page 2 and highlights there
- [ ] A not-found field (no bbox) renders no overlay and causes no error
- [ ] Alignment is correct for both an OCR'd image and a text-layer PDF
- [ ] No unit tests for `FieldHighlight.tsx`/`DocumentViewer` — Notes exception recorded (visual geometry; conversion tested in 004); `highlight-geometry.ts`'s transform math is unit-tested directly

## Key files
- `components/viewer/FieldHighlight.tsx`
- `components/viewer/DocumentViewer.tsx`
- `components/viewer/highlight-geometry.ts` (pure transform, unit-tested)
