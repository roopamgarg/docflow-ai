# 019 — Home Navigation Bounce

## Summary
Clicking `Home` (or the logo) in the icon rail does not reach the landing page once a document has been
extracted: `/` mounts `ProcessingState`, whose completion effect immediately `router.replace`s back to
`/review`. Make the ready → `/review` hop a one-time completion, not a standing guard.

## Dependencies
None — every ticket it touches (010, 011) is already `done`.

## Scope
- **The defect.** `components/upload/ProcessingState.tsx` navigates whenever `status.phase === 'ready'`,
  for the life of the mount. `UploadPanel` renders that card for any non-`idle` phase with a document,
  so arriving at `/` with a finished document mounts a card that instantly bounces to `/review`. From the
  user's seat, `Home` and the logo are dead links on both `/review` and `/success`.
- **The intent it broke.** Ticket 011 specified *"when `status.phase === 'ready'`, navigate to `/review`"*
  as the completion of a run the human just watched. Ticket 009 specified guards only in one direction:
  `/review` and `/success` send a *null* document to `/`. Nothing was ever meant to pin a ready document
  to `/review`.
- **The fix.** `UploadPanel` decides which card it renders from whether a run happened during *this* mount:
  - `working` / `error` → the processing card, as today.
  - `ready` **and** a run was observed here → the processing card, so its effect still performs the
    completion hop to `/review`.
  - `ready` on arrival (a re-entry from the rail) → the dropzone. `ProcessingState` never mounts, so
    there is no navigation to bounce with.
  - no document / `idle` → the dropzone, as today.
- **Where the decision lives.** A pure `components/upload/upload-panel-view.ts`, mirroring
  `processing-steps.ts` and `validate-upload.ts`: phase + document + "ran here" in, `'dropzone' | 'processing'`
  out. `ProcessingState` is not modified — the bug is in what mounts it, not in what it does.
- **Non-destructive.** `Home` does not drop the document. Nothing is persisted, so a reset would throw away
  the human's edits and approvals to reach a marketing page; browser Back returns to `/review` instead.
- **Tests:** `upload-panel-view.spec.ts` over the decision table, including the re-entry case that is this bug
  and the completion case that must keep working.

## Architecture notes
View layer only. No state, contract or extraction change; the routing decision stays in the component that
already owned it, expressed as a pure function so it can be asserted.

## Out of scope
- A `Continue reviewing <name>` affordance on the landing page for the re-entry case. Reasonable, but it is new
  product surface rather than a defect fix — note it as a follow-up.
- Making `Home` reset the document.
- Adding the icon rail to the landing page. It is deliberately absent (see `app/page.tsx`).
- The accessibility findings in 018.

## Acceptance criteria
- [ ] From `/review` with a ready document, `Home` in the icon rail lands on `/` and stays there
- [ ] The rail's logo link behaves the same way
- [ ] From `/success`, `Home` lands on `/` and stays there
- [ ] `/` shows the upload dropzone on that re-entry, not a completed processing card
- [ ] Finishing an extraction still navigates to `/review` automatically (ticket 011's criterion holds)
- [ ] A failed run still shows the error card with `Try again` on `/`
- [ ] Uploading a new file from the re-entered landing page starts a normal run and reaches `/review`
- [ ] The document, its edits and its approvals survive a trip to `/` and back
- [ ] Unit tests cover the decision table and pass

## Key files
- `components/upload/UploadPanel.tsx`
- `components/upload/upload-panel-view.ts` (new)
