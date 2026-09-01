# 009 — Document State And Routing

## Summary
Create the client state that carries one in-flight document across the three routes — including edits, approvals and the active field that links the two review columns — plus the routes themselves and their guards.

## Dependencies
- 003-extraction-contracts-confidence

## Scope
- **`lib/document-context.tsx`** (`'use client'`) — `DocumentProvider` mounted in the root layout, `useDocument()` hook. State: `doc` (`{ kind: 'image' | 'pdf', file, url, name }`), `fields`, `status`, `docApproved`, `activeFieldId`. Derived: `approvedCount`.
- **Status model:** `{ phase: 'idle' | 'ready' }` | `{ phase: 'working', step: ExtractionProgress }` | `{ phase: 'error', code, message }`.
- **Actions:** `startExtraction(file)`, `retry()`, `updateField(id, value)`, `toggleApproval(id)`, `approveAll()`, `setActiveField(id)`, `reset()`.
- **Semantics to get right:** `updateField` sets `edited: true` and preserves `originalValue`; editing an approved field **keeps** its approval; `retry()` re-runs the same file; object URLs are revoked on `reset()` and on unmount.
- **`activeFieldId`** is the link between columns — the panel sets it, the viewer reads it. Nothing else.
- **Routes:** `app/page.tsx`, `app/review/page.tsx`, `app/success/page.tsx` as placeholders wired to the provider; review and success redirect to `/` when `doc` is null, rendering `null` during the redirect effect so there is no content flash.
- **Tests:** `document-context.spec.ts` — reducer/action logic tested directly (extract it from the component if needed to keep it pure): `updateField` marks edited and keeps `originalValue`; editing an approved field retains approval; `approveAll` marks every field and `approvedCount` matches; `reset` clears state. Stub the provider so no real extraction runs.

## Architecture notes
State layer. Holds no extraction logic — it calls `getExtractionProvider().extract(...)` and stores the result. Components read state through `useDocument()` and never import from `lib/extraction/providers`.

## Out of scope
- Page content — landing (010), viewer (012), panel (014), success (016).
- Persistence of any kind. Nothing survives a refresh; the guards handle that.

## Acceptance criteria
- [ ] `DocumentProvider` wraps the app; `useDocument()` exposes the documented state and actions
- [ ] `startExtraction` drives `status` through `working` phases to `ready`, or to `error` with the provider's code and message
- [ ] `updateField` sets `edited`, preserves `originalValue`, and leaves an existing approval intact
- [ ] `approveAll` approves every field and `approvedCount` agrees
- [ ] `reset()` clears state and revokes the object URL; no URL leaks on unmount
- [ ] Hard-refreshing `/review` or `/success` redirects to `/` with no content flash
- [ ] Unit tests cover the state transitions above and pass

## Key files
- `lib/document-context.tsx`
- `lib/document-context.spec.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `app/review/page.tsx`
- `app/success/page.tsx`
