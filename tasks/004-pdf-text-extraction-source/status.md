# Status: 004-pdf-text-extraction-source

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `getTextContent` → `Word[]`
- [ ] Bottom-left → top-left coordinate conversion
- [ ] Page metadata + per-page character count
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **Highest-risk detail on the board.** Before moving on, render the boxes over a page and eyeball alignment — a silent conversion bug here only becomes visible much later, as misplaced highlights in 013.
- Confidence is deliberately `1.0` for this source. Interpretation uncertainty is expressed as match strength in 006/007, not here.

## Acceptance criteria
- [ ] A digital PDF yields `Page[]` with non-empty `words`, each having text, `confidence === 1`, a `bbox` and a page index
- [ ] A word's `bbox` in top-left pixel space is verified against a hand-computed expectation from a known `transform` + viewport
- [ ] Page `width` / `height` come from the scale-1 viewport
- [ ] The per-page character count distinguishes a text-bearing page from an image-only page
- [ ] Unit tests cover the coordinate conversion and the emptiness signal, and pass
- [ ] Multi-page PDFs populate `page` correctly on every word

## Handoff

(Leave empty until the ticket is done.)
