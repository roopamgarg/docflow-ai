# Status: 012-document-viewer

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Viewer shell + inset surface + sheet
- [ ] Toolbar: zoom, fit, page controls
- [ ] `PdfCanvas` render with task cancellation
- [ ] Image path
- [ ] Review two-column layout + responsive stacking
- [ ] No unit tests — Notes exception (canvas/DOM)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Cancel in-flight pdf.js render tasks before starting a new one; without this, fast zoom or page clicks corrupt the canvas.
- Architectural exception worth remembering: this is the one component allowed to import `pdfjs-dist`, and only for rendering. Any text extraction here is a layering violation.
- PDF zoom must go through the render viewport scale, not CSS transform, or zoomed text turns to mush.

## Acceptance criteria
- [ ] An uploaded PNG and a PDF both render as a white sheet on the inset panel
- [ ] Zoom in/out works for both kinds; PDF text stays sharp when zoomed rather than pixelated
- [ ] `Fit` sizes the page to the container width at any window size
- [ ] A multi-page PDF reports the correct page count and prev/next re-render the canvas
- [ ] Single-page documents hide the page indicator and disable prev/next
- [ ] Rapid zoom or page changes never leave a torn or blank canvas (in-flight renders are cancelled)
- [ ] Columns stack below `lg` with the viewer first
- [ ] No unit tests — Notes exception recorded (canvas/DOM rendering)

## Handoff

(Leave empty until the ticket is done.)
