# Status: 019-home-navigation-bounce

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `upload-panel-view.ts` pure decision helper
- [x] `UploadPanel` renders from it
- [x] Unit tests for the decision table
- [x] Verified in a browser on `/review` and `/success`
- [x] All acceptance criteria verified

## Notes
- Reported by the user: "clicking on home is not taking me to the home page".
- Root cause is a standing guard where a transition was specified. `ProcessingState` navigates on
  `status.phase === 'ready'` for the life of its mount, and `UploadPanel` mounted it for any non-`idle`
  phase — so `/` with a finished document mounted a card that immediately `replace`d back to `/review`.
  Ticket 011 asked for *"reaching `ready` navigates"*; ticket 009 put guards only in the other direction.
- `ProcessingState` is unmodified. The defect was in what mounts it, so the fix is in the panel that
  decides, and the decision is now a pure function with the `ready` ambiguity written down.
- `ProcessingState`'s own comment already described the loop ("the landing page would send a `ready`
  document straight back to `/review`") and chose `replace` over `push` to keep Back working. That comment
  is now stale in its framing — it treated the bounce as given rather than as the bug — but its reasoning
  for `replace` still holds for the completion hop, so it was left in place.
- Distinguishing a completion from a re-entry needs mount history, which `status` alone does not carry:
  `ranHere` is set during render on the `working` phase, using the same adjust-state-during-render pattern
  as `app/review/page.tsx`. An effect would render one frame of dropzone over a live run.
- `Home` is deliberately non-destructive — it does not `reset()`. Nothing is persisted, so dropping the
  document to reach a marketing page would throw away the human's edits and approvals. Browser Back
  returns to `/review`, which was verified with the approval intact.
- Browser verification (dev server, real OCR run on the demo invoice): completion still hops to `/review`;
  `Home` and the rail logo from `/review` land on `/` and stay; `Home` from `/success` lands on `/` and
  stays; `/` shows the dropzone rather than a 100%-complete card; Back from `/` returns to `/review` with
  `Approved Invoice ID` still approved; `Try Demo Invoice` from the re-entered landing page shows
  `Analyzing your document...` and reaches `/review` again.
- The error-card criterion is covered by unit tests rather than the browser: forcing a provider failure
  needs a corrupt asset, and `error` maps to the processing card regardless of `ranHere`, so the re-entry
  change cannot affect it.
- 018 remains `pending` and untouched; this ticket was taken out of order because it is a reported
  functional defect on a shipped screen.

## Acceptance criteria
- [x] From `/review` with a ready document, `Home` in the icon rail lands on `/` and stays there
- [x] The rail's logo link behaves the same way
- [x] From `/success`, `Home` lands on `/` and stays there
- [x] `/` shows the upload dropzone on that re-entry, not a completed processing card
- [x] Finishing an extraction still navigates to `/review` automatically
- [x] A failed run still shows the error card with `Try again` on `/` (unit-tested; see Notes)
- [x] Uploading a new file from the re-entered landing page starts a normal run and reaches `/review`
- [x] The document, its edits and its approvals survive a trip to `/` and back
- [x] Unit tests cover the decision table and pass

## Handoff
**Files touched**
- `components/upload/upload-panel-view.ts` (new) — pure `uploadPanelView({ hasDocument, phase, ranHere })`
  returning `'dropzone' | 'processing'`.
- `components/upload/upload-panel-view.spec.ts` (new) — 9 tests over the decision table, including the
  re-entry case that is this bug and the completion case that must keep working.
- `components/upload/UploadPanel.tsx` — renders from the helper, tracks `ranHere`.
- `tasks/019-home-navigation-bounce/`, `tasks/README.md`.

**Env vars:** none.

**Tests:** `npm test` → 432 passing across 24 files (was 423 across 23). `npx tsc --noEmit` clean.
`npm run lint` → 0 errors, the same 2 pre-existing `_inputs` warnings that ticket 018 owns.

**Follow-ups**
- A `Continue reviewing <name>` affordance on the landing page for the re-entry case: the document is
  still in state, but the only way back is the Back button, since the icon rail is deliberately absent
  from `/`. Left out as new product surface rather than a defect fix.
- `ProcessingState`'s completion effect is now the only navigation the landing page performs. If a
  future ticket gives the landing page more routes out, move that hop up into `UploadPanel` beside the
  `ranHere` it already depends on.
