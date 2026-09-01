# 017 — Keyboard And Accessibility

## Summary
Make the review screen fast to operate without a mouse, which is what separates an internal tool from a demo — a reviewer should be able to walk a document, correct it and approve it entirely from the keyboard.

## Dependencies
- 014-extraction-review-panel

## Scope
- **Focusable cards:** each field card takes `tabIndex={0}` with a visible orange focus ring. Focus also sets `activeFieldId`, so tabbing down the panel walks the document via the 013 highlight.
- **Shortcuts on a focused card:** `e` enters edit mode, `a` toggles approval.
- **While editing:** `Enter` saves, `Escape` cancels. Shortcut keys must not fire while an input has focus, or typing `a` into a value would toggle approval.
- **Discoverability:** one muted hint line at the top of the panel — `E` edit · `A` approve.
- **Announcements:** `aria-live="polite"` on the review-progress count so approvals are announced to screen readers.
- **Labels:** every icon-only control (rail items, zoom, page navigation, approve) has an accessible name.
- No unit tests — reason: keyboard and focus behaviour in the DOM; not meaningfully unit-testable without a browser harness that is out of scope. Verified by the manual keyboard-only pass in the acceptance criteria.

## Architecture notes
View layer only — key handling lives on the field card and dispatches existing `useDocument()` actions. No new state and no new business logic.

## Out of scope
- A global command palette.
- Arrow-key navigation between cards (Tab is sufficient).
- Configurable key bindings.

## Acceptance criteria
- [ ] Tab reaches every field card in visual order with a visible focus ring
- [ ] Focusing a card highlights its region on the document
- [ ] `e` on a focused card enters edit mode with the text selected; `a` toggles approval
- [ ] `Enter` saves and `Escape` cancels while editing
- [ ] Typing `a` or `e` inside an input edits text and does not trigger a shortcut
- [ ] The whole flow — reach a field, edit it, save, approve, approve document — is completable with no mouse
- [ ] The progress count is announced politely on change; all icon-only controls have accessible names
- [ ] No unit tests — Notes exception recorded (DOM focus/keyboard behaviour)

## Key files
- `components/review/ExtractionField.tsx`
- `components/review/ExtractionPanel.tsx`
- `components/review/ReviewProgress.tsx`
