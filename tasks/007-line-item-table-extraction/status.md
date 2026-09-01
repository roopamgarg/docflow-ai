# Status: 007-line-item-table-extraction

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Header line detection
- [ ] Column bounds from header geometry
- [ ] Row pairing
- [ ] Totals-row termination
- [ ] Per-item confidence
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Expect this to need tuning against real invoices more than any other rule module. Keep the heuristics small and the fixtures plentiful.
- Per-item confidence matters for the UI: each line item becomes its own approvable card in 014, so a clean row should read as clean even when a sibling row is poor.

## Acceptance criteria
- [ ] A two-item fixture table yields exactly two items with correct descriptions and amounts
- [ ] A totals row terminates iteration and never appears as a line item
- [ ] A right-aligned amount column still pairs to the correct description
- [ ] A document with no detectable header returns an empty array without throwing
- [ ] Each item carries its own composed confidence and a `reason`
- [ ] Unit tests cover all of the above against fixture word lists, and pass

## Handoff

(Leave empty until the ticket is done.)
