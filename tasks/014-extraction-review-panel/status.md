# Status: 014-extraction-review-panel

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Panel shell + line-item group
- [ ] `ExtractionField` card + inline edit
- [ ] `ConfidenceBar` using shared tier logic
- [ ] `ApprovalButton`
- [ ] Not-found field state
- [ ] `ReviewProgress` + Approve Document
- [ ] Active-field wiring for highlighting
- [ ] No unit tests — Notes exception (presentational)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Two product rules that are easy to get wrong: editing must never open a dialog, and editing an approved field must not silently un-approve it.
- `ConfidenceBar` must import `tierFor` from `lib/extraction/confidence.ts`. Re-deriving thresholds here is how the bar and the card treatment end up disagreeing.
- Not-found fields are the clearest expression of the human-in-the-loop thesis — style them as an invitation, not an error.

## Acceptance criteria
- [ ] All extracted fields render with value, percentage and bar, one card per line item
- [ ] `Edit` swaps in an input in place with text selected; `Save` updates the value and shows `Updated`; `Cancel` leaves it untouched
- [ ] An approved field is still editable and stays approved after an edit
- [ ] Confidence tiers render distinctly at high / medium / low, with the low treatment clearly noticeable
- [ ] Fields below the high tier show the rule `reason`; OCR alternatives appear where present
- [ ] A not-found field shows the 0% `Not found — please enter` state with an empty input
- [ ] The counter tracks approvals accurately; `Approve Document` approves the remainder and navigates to `/success`
- [ ] Focusing or hovering a card sets the active field (highlight driven by 013)
- [ ] No unit tests — Notes exception recorded (presentational; logic tested in 003/008/009)

## Handoff

(Leave empty until the ticket is done.)
