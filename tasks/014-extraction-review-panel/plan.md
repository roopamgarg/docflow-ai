# 014 — Extraction Review Panel

## Summary
Build the right column — the heart of the product. Each extracted field is a card showing its value and measured confidence, editable inline and approvable in one click, with a footer tracking overall review progress.

## Dependencies
- 002-design-system-and-shell
- 008-local-provider-and-field-mapping
- 009-document-state-and-routing

## Scope
- **`ExtractionPanel`:** `Extracted Data` heading, the scalar fields, a `Line Items` group with one card per item, and the `ReviewProgress` footer pinned to the bottom.
- **`ExtractionField`:** layout per the reference — label over value on the left, `Confidence: 98%` over the bar on the right, with `Edit` and the approval control. Sets `activeFieldId` on focus and hover to drive the document highlight.
- **Inline editing — never a modal:** `Edit` swaps the value for an `<input>` in place, autofocused with its text selected, plus `Save` / `Cancel`. Saving writes through `updateField` and shows a persistent `Updated` badge. A field remains editable after approval, and editing an approved field keeps the approval.
- **Below the high tier**, the card also shows the rule's `reason` and, where OCR supplied them, `OCR also read: ...` from `alternatives`.
- **Not-found fields** render the 0% state with an empty input ready and `Not found — please enter`; they must look deliberate, not broken.
- **`ConfidenceBar`:** rounded percentage plus a 4px full-radius bar on the track, styled by `tierFor` from 003 — this component must not re-derive tiers.
- **`ApprovalButton`:** `Approve` toggling to `Approved`.
- **`ReviewProgress`:** `{approvedCount} of {fields.length} fields reviewed`, a bar, and `Approve Document` as the panel's primary action throughout. With fields still unapproved it approves the rest via `approveAll`, then sets `docApproved` and navigates to `/success`.
- No unit tests — reason: presentational components over context state; tier logic (003), field mapping (008) and state semantics (009) are unit-tested at their source. Covered manually per the acceptance criteria.

## Architecture notes
View layer. All mutations go through `useDocument()` actions; the panel derives nothing and stores nothing. Confidence tiers come from `lib/extraction/confidence.ts` so the bar and the card treatment cannot diverge.

## Out of scope
- Keyboard shortcuts and focus management (017).
- Export and the success screen (016).
- Rejecting a field or leaving comments.

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

## Key files
- `components/review/ExtractionPanel.tsx`
- `components/review/ExtractionField.tsx`
- `components/review/ConfidenceBar.tsx`
- `components/review/ApprovalButton.tsx`
- `components/review/ReviewProgress.tsx`
