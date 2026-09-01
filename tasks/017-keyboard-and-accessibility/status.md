# Status: 017-keyboard-and-accessibility

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Focusable cards + focus ring + active-field on focus
- [ ] `e` / `a` shortcuts
- [ ] `Enter` / `Escape` while editing
- [ ] Shortcut suppression inside inputs
- [ ] Hint line + `aria-live` count + icon labels
- [ ] No unit tests — Notes exception (DOM focus/keyboard)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The easy bug here is shortcuts firing while an input is focused — typing `a` into a vendor name would toggle approval. Guard on the event target before dispatching.
- Focus driving the highlight is the detail that makes the screen feel like a real tool: tabbing the panel becomes a guided tour of the document.

## Acceptance criteria
- [ ] Tab reaches every field card in visual order with a visible focus ring
- [ ] Focusing a card highlights its region on the document
- [ ] `e` on a focused card enters edit mode with the text selected; `a` toggles approval
- [ ] `Enter` saves and `Escape` cancels while editing
- [ ] Typing `a` or `e` inside an input edits text and does not trigger a shortcut
- [ ] The whole flow — reach a field, edit it, save, approve, approve document — is completable with no mouse
- [ ] The progress count is announced politely on change; all icon-only controls have accessible names
- [ ] No unit tests — Notes exception recorded (DOM focus/keyboard behaviour)

## Handoff

(Leave empty until the ticket is done.)
