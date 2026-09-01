# Status: 012-document-viewer

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Viewer shell + inset surface + sheet
- [x] Toolbar: zoom, fit, page controls
- [x] `PdfCanvas` render with task cancellation
- [x] Image path
- [x] Review two-column layout + responsive stacking
- [x] `viewer-scale.ts` unit tests; Notes exception recorded for canvas/DOM components
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Cancel in-flight pdf.js render tasks before starting a new one; without this, fast zoom or page clicks corrupt the canvas.
- Architectural exception worth remembering: this is the one component allowed to import `pdfjs-dist`, and only for rendering. Any text extraction here is a layering violation.
- PDF zoom must go through the render viewport scale, not CSS transform, or zoomed text turns to mush.
- 2026-09-01 — pdf.js build: `PdfCanvas` imports the **modern** build (`pdfjs-dist`, i.e. `build/pdf.mjs`), not the legacy one the extraction layer uses. The legacy import exists only because `lib/extraction/**` also runs under Node/vitest; this component is browser-only (`dynamic(..., { ssr: false })`), and the vendored `/pdf.worker.min.mjs` is copied from the modern build, so API and worker match. Verified in dev and in a production `next start` build: the worker is fetched from `/pdf.worker.min.mjs` as a real Worker, with no "fake worker" fallback.
- 2026-09-01 — three defences against a torn canvas, not one: cancel the in-flight `RenderTask`, a generation counter re-checked after every `await` (a pass between awaits has no task to cancel yet), and pdf.js rendering into an **offscreen** canvas that is blitted across in one `drawImage` — so the visible canvas only ever holds a complete frame and never blanks mid-zoom.
- 2026-09-01 — `Fit` is a mode, not a press: the fitted scale is derived from a `ResizeObserver` measurement at render time rather than copied into state, so a window resize re-fits itself. `[-]`/`[+]` set an explicit scale and take the mode off.
- 2026-09-01 — zoom/page handlers take a *direction* and use functional state updates, so two presses in the same React batch are two steps rather than one.
- 2026-09-01 — the viewer is keyed by `doc.url` in `/review` so a new document resets page/count/fit by remounting; the ticket needed no reset effect (and `react-hooks/set-state-in-effect` forbids one).
- 2026-09-01 — browser-verified at 1280/1440/1680/1100/820 px wide (dev server, plus a production build smoke test): PDF and PNG both render as a white sheet on the inset well; zoom snaps 25%..400%; PDF bitmap scales with zoom (612x792 at 100% -> 2448x3168 at 400%, glyph edges still clean) so nothing is CSS-upscaled; `Fit` always lands the sheet on the well's content width; 3-page fixture reports `1 / 3` and prev/next re-render (page 3 of the fixture is deliberately blank); the PNG hides the indicator and disables both arrows; 44 rapid mixed zoom/page clicks (10-12 ms apart, including at 400%) produced zero non-opaque canvas samples; columns stack with the viewer first below `lg`.
- 2026-09-01 — for ticket 013 (bbox highlight overlay): the viewer will need an `overlay?: (frame: PageFrame) => ReactNode` render prop so the extraction panel can draw highlights positioned against the same page frame `PdfCanvas`/the image path already compute (scale, page size, offsets), rather than 013 re-deriving that geometry. `page` and `onPageChange` also need to be lifted out of `DocumentViewer`'s internal state up to the `/review` page (or a shared context) — cross-page highlighting requires the panel to drive/observe the current page, which today is private state inside the viewer.

## Acceptance criteria
- [x] An uploaded PNG and a PDF both render as a white sheet on the inset panel
- [x] Zoom in/out works for both kinds; PDF text stays sharp when zoomed rather than pixelated
- [x] `Fit` sizes the page to the container width at any window size
- [x] A multi-page PDF reports the correct page count and prev/next re-render the canvas
- [x] Single-page documents hide the page indicator and disable prev/next
- [x] Rapid zoom or page changes never leave a torn or blank canvas (in-flight renders are cancelled)
- [x] Columns stack below `lg` with the viewer first
- [x] `viewer-scale.ts` covered by unit tests; `DocumentViewer`, `PdfCanvas`, `ViewerToolbar` carry the Notes exception (canvas/DOM rendering)

## Handoff

- **Files touched:**
  - `components/viewer/DocumentViewer.tsx`
  - `components/viewer/PdfCanvas.tsx`
  - `components/viewer/ViewerToolbar.tsx`
  - `components/viewer/viewer-scale.ts`
  - `components/viewer/viewer-scale.spec.ts` (new)
  - `app/review/page.tsx`
  - `tasks/012-document-viewer/plan.md`, `tasks/012-document-viewer/status.md`
- **Unit tests:** `npx vitest run components/viewer/viewer-scale.spec.ts --no-coverage` → 1 file, 37 tests passed. Full suite `npx vitest run --no-coverage` → 18 files, 321 tests passed (284 pre-existing + 37 new). `npm run typecheck` → clean, no errors.
- **Test scope:** `viewer-scale.ts` (pure scale/page math: `clampScale`, `steppedScale`, `canZoom`, `fitScale`, `formatZoom`, `clampPage`) is fully unit-tested, including the clamp boundaries at `MIN_SCALE`/`MAX_SCALE` and degenerate/non-finite inputs. `DocumentViewer.tsx`, `PdfCanvas.tsx`, `ViewerToolbar.tsx` remain under the Notes exception — canvas rendering and DOM measurement, verified manually (see Notes above).
- **Follow-ups:** none for this ticket. See Notes for what ticket 013 needs from this viewer.
