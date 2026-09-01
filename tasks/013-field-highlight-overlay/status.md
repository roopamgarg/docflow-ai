# Status: 013-field-highlight-overlay

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Overlay component + box styling
- [ ] Zoom / fit / resize transform
- [ ] Cross-page jump
- [ ] Not-found and null-active handling
- [ ] Verified for both OCR and text-layer sources
- [ ] No unit tests — Notes exception (visual geometry)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- This is where a coordinate bug from 004 becomes visible. If boxes are consistently offset or mirrored vertically, suspect the PDF bottom-left → top-left conversion rather than this component.
- Depends on 008, not merely 012: the overlay needs `bbox` populated on fields, not just a viewer to draw into.

## Acceptance criteria
- [ ] Focusing or hovering a field card draws a box over the correct region of the document
- [ ] The box stays aligned at 100%, zoomed in, zoomed out, and after `Fit`
- [ ] The box stays aligned after a window resize
- [ ] A field on page 2 switches the viewer to page 2 and highlights there
- [ ] A not-found field (no bbox) renders no overlay and causes no error
- [ ] Alignment is correct for both an OCR'd image and a text-layer PDF
- [ ] No unit tests — Notes exception recorded (visual geometry; conversion tested in 004)

## Handoff

(Leave empty until the ticket is done.)
