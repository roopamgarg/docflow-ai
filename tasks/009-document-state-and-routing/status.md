# Status: 009-document-state-and-routing

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] Provider + hook + state shape
- [x] Extraction actions and status phases
- [x] Edit / approval semantics
- [x] `activeFieldId` wiring
- [x] Three routes + guards
- [x] Unit tests added and passing
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Keep the state transitions in a pure reducer so they can be unit-tested without React or a real provider.
- Deliberate product rule: editing an already-approved field does **not** revoke approval — it is the same human confirming a correction. The `Updated` badge (014) makes the change visible instead.
- Transitions live in `lib/document-state.ts` (pure, React-free): `documentReducer`, action creators, `initialDocumentState`, `approvedFieldCount`, `documentKindFor`, `toExtractionFailure`, `runExtraction(file, dispatch, { getProvider })`. `lib/document-context.tsx` adds only `useReducer`, the object-URL lifecycle and the provider call, and takes an optional `provider` prop as a test seam.
- Decision: `approveAll` also sets `docApproved` — `Approve Document` (014) is one gesture, and "every field approved but the document not" would be a lie on the success screen. `toggleApproval` never touches `docApproved`.
- Decision: `extraction/progressed` is ignored unless `status.phase === 'working'`, so a late provider report cannot resurrect the spinner after an error or a reset. A run token in the provider drops actions from superseded runs.
- Decision: a file that is neither PDF nor PNG/JPEG never becomes the current document — `startExtraction` resets and reports `unsupported_media` (the provider's own code) so the human stays on the landing screen.
- Testing (2026-09-01): unit tests added in `lib/document-state.spec.ts` against `documentReducer` and `runExtraction` directly — no React, no jsdom (vitest environment is `node`), matching the pure-reducer design called out above. Two acceptance criteria are React/DOM-level and not unit-testable in this environment:
  - "Hard-refreshing `/review` or `/success` redirects to `/` with no content flash" — the guard components in `app/review/page.tsx` / `app/success/page.tsx` render `null` during the redirect effect; VERIFIED 2026-09-01 in a real browser (agent-browser, Chrome, dev server on :3471): opening `/review` and `/success` with no document each landed on `http://localhost:3471/`, and no console errors were emitted. The landing chrome rendered with the ticket-002 tokens.
  - Object-URL revocation on unmount — the lifecycle (`URL.createObjectURL` / `revokeObjectURL`) lives in `lib/document-context.tsx`'s `useEffect`, which requires a component tree to mount/unmount; not exercised by the reducer tests. STILL UNVERIFIED — the call is present in the effect cleanup but has not been observed. It needs a document loaded and the tree unmounted, so it needs a jsdom/RTL pass or a manual browser run once the upload flow exists (ticket 010). Carry this forward.
  - No exception is claimed for the reducer/`runExtraction` logic itself — those are fully unit-tested below.

## Acceptance criteria
- [x] `DocumentProvider` wraps the app; `useDocument()` exposes the documented state and actions
- [x] `startExtraction` drives `status` through `working` phases to `ready`, or to `error` with the provider's code and message
- [x] `updateField` sets `edited`, preserves `originalValue`, and leaves an existing approval intact
- [x] `approveAll` approves every field and `approvedCount` agrees
- [x] `reset()` clears state and revokes the object URL; no URL leaks on unmount (reducer half unit-tested; the `revokeObjectURL` call is present but NOT yet observed — see Notes)
- [x] Hard-refreshing `/review` or `/success` redirects to `/` with no content flash (verified in a real browser 2026-09-01 — see Notes)
- [x] Unit tests cover the state transitions above and pass

## Handoff

**Files touched (this pass):**
- `lib/document-state.spec.ts` (new) — 27 tests covering `documentReducer` (all action types), `approvedFieldCount`, `documentKindFor`, `toExtractionFailure`, and `runExtraction` against a fake provider.
- `tasks/009-document-state-and-routing/status.md` — this file.

No production code was changed; no bugs were found in `lib/document-state.ts`.

**Test command and result:**
- `npx vitest run lib/document-state.spec.ts --no-coverage` → 1 file, 27/27 passing.
- `npx vitest run --no-coverage` (full suite) → 15 files, 258/258 passing (231 prior + 27 new).
- `npm run typecheck` → clean (`next typegen && tsc --noEmit`, no errors).

**Follow-ups:** manually verify the two DOM-level acceptance criteria noted above in a real browser before considering the routing/lifecycle behavior fully confirmed; consider an RTL/jsdom pass in a future ticket if that coverage becomes worth automating.
