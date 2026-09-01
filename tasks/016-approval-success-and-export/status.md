# Status: 016-approval-success-and-export

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `toExportJson` mapping
- [ ] `parseAmount` incl. edge cases
- [ ] `downloadJson` + filename
- [ ] `SuccessState` + guarded route
- [ ] Payload preview on screen
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The export shape holds amounts as **numbers** while state holds display strings like `₹1,250.00`. `parseAmount` is the seam, and empty / malformed values must not leak `NaN` into the JSON.
- Export must read from current field values so human corrections are what ship — exporting `originalValue` would silently discard the entire review step.

## Acceptance criteria
- [ ] Approving the document navigates to `/success` showing the confirmation copy
- [ ] `Export JSON` downloads a file matching the agreed shape, with `total_amount` and item amounts as numbers
- [ ] Values edited during review appear in the export, not the originally extracted ones
- [ ] Multiple line items export in order
- [ ] A not-found or malformed amount never yields `NaN`, `null` or `undefined` in the payload
- [ ] `View Results` returns to `/review` with state intact; `Process another document` resets to `/`
- [ ] The payload is visible on screen without downloading
- [ ] Unit tests cover `parseAmount` and `toExportJson` including edited values and edge cases, and pass

## Handoff

(Leave empty until the ticket is done.)
