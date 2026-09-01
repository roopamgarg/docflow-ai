# Status: 008-local-provider-and-field-mapping

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `createLocalProvider` skeleton + registration
- [ ] File validation
- [ ] Route selection incl. scanned-PDF fallback
- [ ] Progress mapping
- [ ] Extraction assembly + confidence composition
- [ ] `toFields` display mapping
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **Convergence point of the board.** 013, 014 and 015 all need this done. Worth a manual pass over several real invoices here, before UI work depends on its output.
- Not-found fields are a designed state, not a failure: empty value, 0 confidence, `Not found in document`. 014 renders them as a prompt for the human.

## Acceptance criteria
- [ ] A PNG invoice produces populated `ExtractedField[]` with real confidences and bboxes end to end
- [ ] A digital PDF uses the text layer; an image-only PDF falls back to OCR
- [ ] Oversize and unsupported files raise the documented error codes before any parsing work
- [ ] `onProgress` advances through `reading` → `ocr` → `matching` and ends at ratio 1
- [ ] A field with no candidate appears as an empty value at 0 confidence with a `Not found` reason — never omitted, never fabricated
- [ ] `toFields` ordering and ids are stable, with one entry per line item
- [ ] Unit tests cover route selection, validation, not-found mapping and `toFields`, and pass

## Handoff

(Leave empty until the ticket is done.)
