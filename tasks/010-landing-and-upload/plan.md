# 010 — Landing And Upload

## Summary
Build the landing page and the upload dropzone that starts the whole flow, including client-side file validation with inline errors.

## Dependencies
- 002-design-system-and-shell
- 009-document-state-and-routing

## Scope
- **Landing (`app/page.tsx`):** cream background, `SiteHeader`, no rail and no floating shell — this is the marketing surface, distinct from the app surface. Hero: `Turn documents into structured data` plus the spec's subtitle. A short three-step `#how-it-works` section that the header nav anchors to.
- **A claim worth making prominent:** `Runs entirely in your browser — nothing is uploaded.` It is true and it is the most interesting property of the product.
- **`UploadDropzone`:** large central white card on cream. Drag-and-drop plus a `Choose File` button, both driving one hidden `<input type="file">`; the whole zone is clickable. Dashed warm border that picks up the orange accent on drag-over. Helper text `PDF, PNG or JPG · Max 10MB`.
- **Validation:** accept `application/pdf`, `image/png`, `image/jpeg`; reject over 10MB. Rejections render as an inline message below the zone — never a dialog — and must not navigate.
- **Wiring:** a valid file calls `startExtraction(file)` from `useDocument()`.
- **`Try Demo Invoice` button** rendered here but wired in 015, when the demo asset exists.
- No unit tests — reason: presentational plus thin wiring; validation thresholds are enforced and tested in the provider (008). Covered manually per the acceptance criteria.

## Architecture notes
View layer. Calls `startExtraction` and nothing else; no extraction imports, no rules, no direct provider access. Client-side validation here is a UX affordance — 008 re-validates as the real gate.

## Out of scope
- The processing state that replaces this card (011).
- Demo invoice asset and its wiring (015).
- Review and success screens.

## Acceptance criteria
- [ ] Landing renders header, hero, dropzone and how-it-works, matching the reference's cream marketing surface
- [ ] `How it works` in the header scrolls to the section
- [ ] Drag-and-drop and `Choose File` both accept a file; the drag-over state is visible
- [ ] A `.txt` file and an oversize file are both rejected with an inline message and no navigation
- [ ] A valid file calls `startExtraction` and the page moves to the processing state
- [ ] No unit tests — Notes exception recorded (presentational; validation covered in 008)

## Key files
- `app/page.tsx`
- `components/upload/UploadDropzone.tsx`
