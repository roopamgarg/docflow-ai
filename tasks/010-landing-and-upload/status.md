# Status: 010-landing-and-upload

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Hero + how-it-works section
- [ ] `UploadDropzone` with drag-drop and file picker
- [ ] Validation + inline errors
- [ ] Wiring to `startExtraction`
- [ ] No unit tests — Notes exception (presentational)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- No unit tests: this is presentational plus a one-call wiring. The real validation gate lives in 008 and is unit-tested there; duplicating it here would test the affordance, not the rule.
- The `Try Demo Invoice` button belongs here visually but stays inert until 015 provides the asset.

## Acceptance criteria
- [ ] Landing renders header, hero, dropzone and how-it-works, matching the reference's cream marketing surface
- [ ] `How it works` in the header scrolls to the section
- [ ] Drag-and-drop and `Choose File` both accept a file; the drag-over state is visible
- [ ] A `.txt` file and an oversize file are both rejected with an inline message and no navigation
- [ ] A valid file calls `startExtraction` and the page moves to the processing state
- [ ] No unit tests — Notes exception recorded (presentational; validation covered in 008)

## Handoff

(Leave empty until the ticket is done.)
