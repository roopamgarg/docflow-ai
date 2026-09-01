# Status: 017-keyboard-and-accessibility

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Focusable cards + focus ring + active-field on focus
- [x] `e` / `a` shortcuts
- [x] `Enter` / `Escape` while editing
- [x] Shortcut suppression inside inputs
- [x] Hint line + `aria-live` count + icon labels
- [x] No unit tests for `ExtractionField`/`ExtractionPanel`/`ReviewProgress` — Notes exception (DOM focus/keyboard); `field-shortcuts.ts` unit-tested
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- The easy bug here is shortcuts firing while an input is focused — typing `a` into a vendor name would toggle approval. Guard on the event target before dispatching.
- Focus driving the highlight is the detail that makes the screen feel like a real tool: tabbing the panel becomes a guided tour of the document.
- **Card focus pattern.** The card stays a `<li>` with `tabIndex={0}` and no
  interactive role, named by `aria-label` (`"Vendor Name: TechSolutions Inc."`).
  Giving it `role="button"` would be the nested-interactive violation (a
  focusable interactive element wrapping `Edit` / `Approve`), and `role="group"`
  would strip `listitem` and break the `<ul>`'s list semantics. As a focusable
  `listitem` the tab order is card → Edit → Approve per field, in reading order,
  and axe reports no `nested-interactive`, `list` or `aria-*` violation.
- **Suppression is target-based**, in the pure `components/review/field-shortcuts.ts`:
  `isTextEntryTarget` (INPUT / TEXTAREA / SELECT / contenteditable) plus a
  ctrl/meta/alt guard. Not the `editing` flag — an empty field has its input
  mounted with no edit started, so a flag would let `a` fire mid-word there.
- `e` **must** `preventDefault()`: it focuses the input synchronously, so the
  browser would otherwise deliver that same keystroke into the input the handler
  just focused and the value would start with a stray `e`. Verified on an
  emptied field (input already mounted): value stayed `""`.
- Save and cancel hand focus back to the card. Without it, saving a filled field
  unmounts the input and focus falls to `<body>`, sending the next Tab to the top
  of the page.
- Icon-only-control audit: no changes needed. Rail items already carry `sr-only`
  names, zoom/page buttons `aria-label`, the approval toggle `aria-label` +
  `aria-pressed`, and every decorative lucide icon sits in an `aria-hidden`
  wrapper.
- Pre-existing a11y findings on `/review`, **not** in this ticket's scope and not
  the two known ticket-002 contrast items: (a) axe
  `scrollable-region-focusable` on the viewer's document well
  (`components/viewer/DocumentViewer.tsx`, the `overflow-auto` div) — a keyboard
  user cannot scroll the document itself; (b) axe `region` on `AppShell`'s top bar
  (`.min-h-16`), content outside a landmark. Worth a follow-up ticket. Note the
  panel's own scroll container no longer trips `scrollable-region-focusable`,
  because the focusable cards inside it now give it keyboard access.

## Acceptance criteria
- [x] Tab reaches every field card in visual order with a visible focus ring
- [x] Focusing a card highlights its region on the document
- [x] `e` on a focused card enters edit mode with the text selected; `a` toggles approval
- [x] `Enter` saves and `Escape` cancels while editing
- [x] Typing `a` or `e` inside an input edits text and does not trigger a shortcut
- [x] The whole flow — reach a field, edit it, save, approve, approve document — is completable with no mouse
- [x] The progress count is announced politely on change; all icon-only controls have accessible names
- [x] No unit tests for `ExtractionField`/`ExtractionPanel`/`ReviewProgress` — Notes exception recorded (DOM focus/keyboard behaviour); `field-shortcuts.ts` is unit-tested

## Handoff

**Files touched:**
- `components/review/ExtractionField.tsx` — focusable card, `e`/`a` shortcuts, `Enter`/`Escape` while editing, focus handoff back to the card on save/cancel.
- `components/review/ExtractionPanel.tsx` — hint line, focus → `activeFieldId` wiring.
- `components/review/ReviewProgress.tsx` — `aria-live="polite"` on the reviewed count.
- `components/review/field-shortcuts.ts` (new) — pure keystroke-decision logic extracted out of `ExtractionField`: `isTextEntryTarget`, `fieldShortcutFor`, `editorActionFor`.
- `components/review/field-shortcuts.spec.ts` (new) — unit tests for the above.
- `tasks/017-keyboard-and-accessibility/plan.md`, `status.md` — reworded the blanket "no unit tests" exception to scope it to the DOM/keyboard components now that `field-shortcuts.ts` carries coverage.

**Tests:**
- Ticket-scoped: `npx vitest run components/review/field-shortcuts.spec.ts --no-coverage` → 1 file, 22 tests, all passing.
- Full suite: `npm run test -- --no-coverage` → 23 files, 423 tests, all passing (401 before this ticket + 22 new).
- `npm run typecheck` → clean (`next typegen && tsc --noEmit`, no errors).
- `ExtractionField`/`ExtractionPanel`/`ReviewProgress` remain covered only by the manual keyboard-only pass (Notes exception) — no DOM/component tests were added for them, per the plan.

**Follow-ups (not in this ticket):**
- New ticket needed for two axe findings surfaced during the manual pass: `scrollable-region-focusable` on the document viewer well (`components/viewer/DocumentViewer.tsx`) and `region` on `AppShell`'s top bar content sitting outside a landmark. See Notes below for detail — do not lose these.
