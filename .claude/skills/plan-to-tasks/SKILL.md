---
name: plan-to-tasks
description: >-
  Breaks an implementation plan into atomic tickets under tasks/, each with
  plan.md and status.md in this repo's ticket format, then updates
  tasks/README.md. Use when the user asks to break a plan into tasks, create
  tickets from a plan, split a plan into the task board, or plan-to-tasks.
---

# Plan → Tasks

Turn a plan into **atomic** tickets under `tasks/NNN-slug/` matching this repo's format. **Do not write ticket folders or edit `tasks/README.md` until the user approves the proposed list.**

Companion: `drain-pending-tasks` implements eligible tickets after they exist.

## Triggers

User phrases like: "break this plan into tasks", "create tickets from the plan", "split into atomic tasks", "add to the task board", "plan-to-tasks".

## Preconditions

1. Read `tasks/README.md` and note the **highest existing ticket number**.
2. Read `.claude/rules/task-driven-workflow.md` and `.claude/rules/architecture-layers.md` when present. Honor the **Unit tests** section: every ticket should expect unit tests whenever possible.
3. Locate the source plan (user paste, path, or `.cursor/plans/*.plan.md`). If missing/ambiguous, ask.
4. Skim existing tickets that overlap the plan so you do not duplicate work.

## Workflow checklist

```
Plan→tasks progress:
- [ ] Ingest plan + existing board
- [ ] Clarify unknowns (ask; do not invent)
- [ ] Draft atomic ticket list (numbers, slugs, deps, one-liners)
- [ ] Show proposal → WAIT for user OK
- [ ] Write tasks/NNN-slug/{plan.md,status.md}
- [ ] Update tasks/README.md (table + dependency diagram)
- [ ] Summarize what was created
```

## Step 1 — Clarify when confused

**Ask the user whenever you are unsure.** Do not invent product decisions, scope boundaries, or dependency edges.

Ask before proposing (batch related questions) when:

| Confusion | Ask about |
|-----------|-----------|
| Scope | In/out of MVP; must-ship vs nice-to-have |
| Atomicity | Whether to merge thin tickets or split a fat one |
| Ordering | Real blockers vs preferred sequence |
| Overlap | Whether to extend an existing ticket vs create a new one |
| Numbering | Append after max NNN vs fill gaps / insert before a ticket |
| Layers | Which app owns the work (web / api / worker / shared) |
| External deps | Secrets, vendor approval, infra the board cannot unblock |
| Acceptance | How "done" is verified (tests, manual gate, docs) |

Stop and wait for answers before the proposal if any blocker would change ticket boundaries. Minor wording questions can wait until after OK, when writing `plan.md`.

## Step 2 — Atomicity rules

One ticket = one shippable outcome an agent can finish without re-scoping mid-flight.

| Do | Don't |
|----|--------|
| Single vertical slice or single layer concern with clear AC | "Implement auth + dashboard + deploy" |
| Name concrete artifacts (files/modules/APIs) | Vague "improve UX" |
| Express real blockers only | Fake deps for tidy numbering |
| Keep AC testable and few (≈3–8), including a unit-test AC when logic exists | Essay-length AC lists; shipping logic with zero test AC |
| Put stretch work in Out of scope or a follow-up ticket | Hidden scope in Notes |

Prefer splitting when a ticket would mix unrelated layers **and** could ship separately (e.g. shared schema vs UI). Prefer merging when two folders would be "open PR / change one constant."

Respect architecture: plans should assign work so controllers stay thin, services own business logic, web stays HTTP-only, workers stay thin handlers.

## Unit tests (ticket authoring)

Align with `.claude/rules/task-driven-workflow.md` **Unit tests**:

- When writing each `plan.md`, include in **Scope** and/or **Acceptance criteria** the unit tests to add for that ticket’s logic (domain services, helpers, mappers, guards, job math, Zod schemas, etc.).
- Prefer colocated tests (`*.spec.ts` / `__tests__/`) named in **Key files** when known.
- If unit tests are not practical (pure scaffold, CSS-only, docs-only), state that under **Out of scope** or a Scope bullet (“No unit tests — reason: …”) so drain agents record a Notes exception instead of skipping silently.
- Behavioral acceptance criteria should map to at least one automated test unless that exception applies.

## Step 3 — Propose (no writes yet)

Show a proposal the user can approve, edit, or reject. Use this shape:

```markdown
## Proposed tickets (awaiting OK)

Next number: NNN (after existing max MMM)

| # | Folder | Summary | Depends on |
|---|--------|---------|------------|
| NNN | NNN-slug | One-line outcome | — / NNN / … |

### Dependency notes
- Bullet why non-obvious edges exist

### Clarifications applied
- Q→A that shaped the split

### Not turned into tickets
- Deferred / out of scope items

Reply **OK** to create folders + update `tasks/README.md`, or list edits.
```

**Hard rule:** No `tasks/NNN-*/` creation, no `plan.md`/`status.md` writes, no `tasks/README.md` edits until the user clearly approves (e.g. "OK", "looks good", "create them", or an edited list they then confirm).

If they request changes, revise the proposal and wait again.

## Step 4 — Write tickets (after OK only)

For each approved ticket:

1. Create `tasks/NNN-slug/`
2. Write `plan.md` from [templates.md](templates.md), including unit-test AC or an explicit no-tests exception
3. Write `status.md` with `**State:** pending`, empty progress mirroring plan themes (include a Progress line for tests when applicable), blank Handoff

Numbering:

- Default: append — `max(existing NNN) + 1`, `+ 2`, …
- Zero-pad to three digits (`024`, not `24`)
- Slug: lowercase kebab-case, short, outcome-based (`configurable-reminders`)
- Dependency lines in `plan.md` use folder names (`011-ingestion-state-machine`)

## Step 5 — Update `tasks/README.md`

After files exist:

1. Add rows to the ticket table (link + summary + depends on).
2. Extend the ASCII dependency diagram when the graph changes meaningfully.
3. Keep Status Legend / Starting Work sections intact.
4. Do not reorder historical tickets; append new ones.

## Step 6 — Done summary

Report:

- Tickets created (paths)
- README updated (yes/no)
- First eligible ticket to implement (deps met + `pending`), if any
- Open questions still deferred

Do **not** set tickets `in_progress` or start implementation unless the user asks (hand off to normal workflow / `drain-pending-tasks`).

## Anti-patterns

- Writing folders before explicit OK
- Duplicate tickets for work already `done`/`pending` on the board
- Dependencies that are preferences, not blockers
- Skipping questions when the plan is ambiguous
- Marking new tickets `done` or `in_progress`
- Committing unless the user asks to commit

## Templates

Exact `plan.md` / `status.md` skeletons and examples: [templates.md](templates.md)
