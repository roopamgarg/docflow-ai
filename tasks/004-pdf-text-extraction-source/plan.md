# 004 — PDF Text Extraction Source

## Summary
Read a digital PDF's embedded text layer into the shared `Word[]` model, converting pdf.js coordinates into the top-left pixel space the rest of the pipeline assumes.

## Dependencies
- 003-extraction-contracts-confidence

## Scope
- **`pdf-text.ts`:** load the document with `getDocument`, and for each page call `page.getTextContent()`. Items carry `str`, a 6-element `transform`, `width` and `height`.
- **Coordinate conversion:** PDF's origin is bottom-left; our `Word.bbox` is top-left page pixels. Convert using the page viewport so output shares one space with OCR. This is the single highest-risk detail on the board.
- **Confidence:** every word gets `1.0` — the characters are exact, so only the *interpretation* is uncertain, and that uncertainty is expressed by match strength in 006/007.
- **Page metadata:** report `width` / `height` per page from the viewport at scale 1, so consumers can scale boxes to any zoom.
- **Emptiness signal:** expose the per-page character count so 008 can decide a PDF is scanned and fall back to OCR.
- **Tests:** `pdf-text.spec.ts` — conversion math against known transform/viewport inputs (a word at a known PDF y lands at the expected top-left y); word ordering; the character-count signal for a text-bearing vs empty page. Use a small committed fixture PDF, or a hand-built fake text-content payload to keep the test pure.

## Architecture notes
Service layer, inside `lib/extraction/providers/local/`. Imports `pdfjs-dist` — permitted here, since this is extraction, not rendering. Exposes a pure function from document bytes to `Page[]`; no React, no DOM beyond what pdf.js requires.

## Out of scope
- OCR (005) and the decision of which source to use (008).
- Rendering PDFs for preview (012) — a separate concern that happens to use the same library.
- Field identification (006, 007).

## Acceptance criteria
- [ ] A digital PDF yields `Page[]` with non-empty `words`, each having text, `confidence === 1`, a `bbox` and a page index
- [ ] A word's `bbox` in top-left pixel space is verified against a hand-computed expectation from a known `transform` + viewport
- [ ] Page `width` / `height` come from the scale-1 viewport
- [ ] The per-page character count distinguishes a text-bearing page from an image-only page
- [ ] Unit tests cover the coordinate conversion and the emptiness signal, and pass
- [ ] Multi-page PDFs populate `page` correctly on every word

## Key files
- `lib/extraction/providers/local/pdf-text.ts`
- `lib/extraction/providers/local/pdf-text.spec.ts`
- `lib/extraction/providers/local/__fixtures__/`
