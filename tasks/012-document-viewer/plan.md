# 012 — Document Viewer

## Summary
Build the left column of the review screen: the document as the visual centre of the product, with working zoom, fit-to-screen and page navigation for both images and PDFs.

## Dependencies
- 002-design-system-and-shell
- 009-document-state-and-routing

## Scope
- **`DocumentViewer`:** one toolbar serving both source kinds — `[-] 100% [+]`, `Fit`, and `< n / total >`. Prev/next disabled and the page indicator hidden for single-page documents.
- **Surface:** the warm `--color-inset` panel with the page as a white sheet carrying `--shadow-sheet`.
- **Zoom:** CSS transform scale for images; for PDFs the scale is passed to pdf.js as the render viewport scale so text stays sharp rather than being upscaled as pixels.
- **Fit:** measure the container and compute the page-width scale.
- **`PdfCanvas`:** `'use client'`, loaded via `dynamic(..., { ssr: false })`. Load the document once with `getDocument`, report `numPages` up to the viewer, and re-render the current page to a canvas whenever page or scale changes — **cancelling any in-flight render task first**, or concurrent renders will corrupt the canvas. Worker at `/pdf.worker.min.mjs`. If DOM/SSR errors surface, switch to `pdfjs-dist/legacy/build/pdf.mjs`.
- **Review layout:** two columns inside `AppShell` (viewer left, panel slot right); below `lg` they stack with the viewer first.
- No unit tests — reason: canvas rendering and DOM measurement; not meaningfully unit-testable without a browser harness that is out of scope for this MVP. Covered manually per the acceptance criteria.

## Architecture notes
View layer, with a documented exception: `PdfCanvas` imports `pdfjs-dist` for **rendering only**. Extraction must never happen here — that lives in 004. The viewer reads `doc` from context and knows nothing about fields.

## Out of scope
- The bbox highlight overlay (013).
- The extraction panel (014).
- Text selection or a text layer over the canvas.

## Acceptance criteria
- [ ] An uploaded PNG and a PDF both render as a white sheet on the inset panel
- [ ] Zoom in/out works for both kinds; PDF text stays sharp when zoomed rather than pixelated
- [ ] `Fit` sizes the page to the container width at any window size
- [ ] A multi-page PDF reports the correct page count and prev/next re-render the canvas
- [ ] Single-page documents hide the page indicator and disable prev/next
- [ ] Rapid zoom or page changes never leave a torn or blank canvas (in-flight renders are cancelled)
- [ ] Columns stack below `lg` with the viewer first
- [ ] No unit tests — Notes exception recorded (canvas/DOM rendering)

## Key files
- `components/viewer/DocumentViewer.tsx`
- `components/viewer/PdfCanvas.tsx`
- `app/review/page.tsx`
