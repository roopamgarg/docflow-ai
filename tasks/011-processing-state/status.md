# Status: 011-processing-state

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Four-step checklist bound to real phases
- [ ] True progress bar from the OCR ratio
- [ ] Error state with retry and reset
- [ ] `no_text_found` specific copy
- [ ] Navigation on completion
- [ ] No unit tests — Notes exception (presentational)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Explicit design constraint: **no fabricated progress.** The local engine has a genuine signal, so there is no excuse for a timer-driven bar or a step that completes before its work does.
- No unit tests: purely a projection of context state. If this component ends up needing tests, it has probably absorbed logic that belongs in 008.

## Acceptance criteria
- [ ] The four steps advance in order and reflect the actual phase; none is marked done early
- [ ] The progress bar shows a real percentage during OCR that increases monotonically
- [ ] The filename is displayed throughout
- [ ] An extraction failure shows the message, `Try again` (which genuinely re-runs) and `Choose a different file`
- [ ] `no_text_found` renders its specific copy rather than a generic error
- [ ] Reaching `ready` navigates to `/review`
- [ ] No unit tests — Notes exception recorded (presentational; phase logic covered in 005/008)

## Handoff

(Leave empty until the ticket is done.)
