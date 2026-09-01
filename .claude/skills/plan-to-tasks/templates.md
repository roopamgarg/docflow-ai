# Ticket templates

Match existing tickets under `tasks/` (see `001-scaffold-monorepo`, `021-configurable-reminders`).

## plan.md

```markdown
# NNN — Title In Title Case

## Summary
One or two sentences: outcome and why it matters.

## Dependencies
- NNN-existing-slug
- MMM-other-slug

(Or: `None (first ticket).` / `None — can start once board prerequisites exist.` when truly independent of new work; still list real existing blockers.)

## Scope
- Bullet concrete deliverables
- Group by layer when useful: **Contracts**, **Model**, **API**, **Worker**, **Web**, **Docs**, **Tests**
- Name modules/files when known
- Unit tests for this ticket’s logic (or “No unit tests — reason: …”)

## Architecture notes
- How this respects View / Controller / Service / Model / Jobs
- What stays thin (controllers, handlers) vs where logic lives

## Out of scope
- Explicit non-goals (prevents drive-by expansion)

## Acceptance criteria
- [ ] Testable criterion 1
- [ ] Testable criterion 2
- [ ] Unit tests cover the ticket’s logic and pass (or Notes exception recorded if not practical)
- [ ] …

## Key files
- `path/to/likely/file.ts`
- `path/to/other/`
```

### plan.md rules

- Title line: `# NNN — Short Title` (em dash).
- Dependencies: folder names, one per bullet (or a clear "None").
- Acceptance criteria: unchecked `- [ ]` at creation; verifiable without re-reading the master plan.
- Include a unit-test acceptance criterion whenever the ticket adds logic; if not practical, document the exception in Scope/Out of scope (aligns with `.claude/rules/task-driven-workflow.md`).
- Keep the same section headings and order as above unless a ticket truly needs an extra section (rare).

## status.md

```markdown
# Status: NNN-slug

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Theme or workstream 1 (maps to scope)
- [ ] Theme or workstream 2
- [ ] Unit tests added and passing (or Notes exception)
- [ ] All acceptance criteria verified

## Notes
- Created YYYY-MM-DD from plan breakdown (source: <plan path or title>).

## Acceptance criteria
- [ ] (copy each criterion from plan.md, unchecked)

## Handoff

(Leave empty until the ticket is done.)
```

### status.md rules

- **State** is `pending` for newly created tickets.
- Progress checklist can be coarser than AC; still actionable.
- Duplicate AC under **Acceptance criteria** so implementers check them off in `status.md`.
- Do not fill **Handoff** at creation time.

## Minimal examples

### Small fix ticket (plan excerpt)

```markdown
# 023 — Fix Forms Poller Timestamp Filter

## Summary
Batch poller filter used quoted RFC3339 timestamps; Google Forms rejects them.

## Dependencies
- 012-ingestion-poller-watch-renewal

## Scope
- Emit unquoted `timestamp > {iso}` in Forms client helper
- Coerce dates before filter
- Update unit tests

## Architecture notes
- Logic stays in worker Google client / batch-poller service; handlers stay thin.

## Out of scope
- Pub/Sub setup; poll interval changes

## Acceptance criteria
- [ ] Filter string has no quotes around the timestamp
- [ ] Unit test covers unquoted format
- [ ] Live poller can list/ingest Forms responses

## Key files
- `apps/worker/src/google/forms-response.client.ts`
```

### Feature ticket (plan excerpt)

```markdown
# 021 — Configurable Reminders

## Summary
Organizers choose reminder offsets from presets per event instead of a hard-coded schedule.

## Dependencies
- 011-ingestion-state-machine
- 016-whatsapp-integration

## Scope
- **Contracts:** presets + `reminderOffsets` on create/update schemas
- **Model:** `Event.reminderOffsets Int[]` migration
- **API / Worker / Web:** persist, enqueue per offset, picker UI

## Out of scope
- Free-form custom times; per-channel schedules

## Acceptance criteria
- [ ] Organizer can select offsets from presets
- [ ] One reminder job per configured offset (past skipped)
- [ ] Default matches old 24h/1h/10m behavior
```

## README row format

In `tasks/README.md` table:

```markdown
| NNN | [NNN-slug](./NNN-slug/) | Short summary | deps or — |
```

ASCII diagram: add nodes/edges only when they help; keep it readable.
