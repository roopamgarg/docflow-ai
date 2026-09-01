# Status: 009-document-state-and-routing

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Provider + hook + state shape
- [ ] Extraction actions and status phases
- [ ] Edit / approval semantics
- [ ] `activeFieldId` wiring
- [ ] Three routes + guards
- [ ] Unit tests added and passing
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- Keep the state transitions in a pure reducer so they can be unit-tested without React or a real provider.
- Deliberate product rule: editing an already-approved field does **not** revoke approval — it is the same human confirming a correction. The `Updated` badge (014) makes the change visible instead.

## Acceptance criteria
- [ ] `DocumentProvider` wraps the app; `useDocument()` exposes the documented state and actions
- [ ] `startExtraction` drives `status` through `working` phases to `ready`, or to `error` with the provider's code and message
- [ ] `updateField` sets `edited`, preserves `originalValue`, and leaves an existing approval intact
- [ ] `approveAll` approves every field and `approvedCount` agrees
- [ ] `reset()` clears state and revokes the object URL; no URL leaks on unmount
- [ ] Hard-refreshing `/review` or `/success` redirects to `/` with no content flash
- [ ] Unit tests cover the state transitions above and pass

## Handoff

(Leave empty until the ticket is done.)
