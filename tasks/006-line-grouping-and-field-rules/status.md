# Status: 006-line-grouping-and-field-rules

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `lines.ts` grouping + column helpers
- [ ] `invoice_id` and `date` matchers
- [ ] `vendor_name` positional heuristic
- [ ] `total_amount` matcher
- [ ] Reason strings for display
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **Can be built in parallel with 004 and 005** — it depends only on the `Word` contract, and its tests use hand-built fixtures rather than real extraction.
- Match strength must stay honest: a positional guess scores 0.60 even when it happens to be right. Inflating it would make the confidence bar lie, which defeats the product's purpose.

## Acceptance criteria
- [ ] `lines.ts` groups words into lines correctly when baselines are ragged, and exposes the three documented helpers
- [ ] Each of the four fields is extracted from a fixture invoice with the expected value and match strength
- [ ] Dates in `YYYY-MM-DD`, `DD/MM/YYYY` and `Oct 26, 2024` all normalise to `YYYY-MM-DD`
- [ ] `total_amount` prefers the last `Total`-like line and is not fooled by a larger unrelated number elsewhere
- [ ] Every matcher returns no candidate (rather than throwing or guessing) on a document lacking the field
- [ ] Each candidate carries a `reason` string suitable for display
- [ ] Unit tests cover grouping and all four matchers against fixture word lists, and pass

## Handoff

(Leave empty until the ticket is done.)
