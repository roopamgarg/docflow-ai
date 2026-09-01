---
description: All implementation work must go through the tasks/ ticket process
alwaysApply: true
---

# Task-Driven Workflow

All implementation work on this project MUST follow the ticket process in `tasks/`.

## Before writing code

1. Read `tasks/README.md` to find the next eligible ticket (dependencies `done`, state `pending`).
2. Open that ticket's `plan.md` and `status.md`.
3. Set `status.md` state to `in_progress` and note the start date.
4. Do not start a second ticket while one is `in_progress` unless the user explicitly overrides.

## During work

- Scope changes belong in the ticket's `plan.md` (or a new ticket), not ad-hoc coding.
- Check off acceptance criteria in `status.md` as they complete.
- Log blockers, decisions, and handoff notes in `status.md` → **Notes**.

## Unit tests

- For every ticket, write unit tests covering the ticket’s logic **whenever possible** (domain services, pure helpers, mappers, guards, job claim/settle math, Zod schemas).
- Prefer tests next to the code under test (e.g. `*.spec.ts` / `__tests__/`) and run them before marking the ticket `done`.
- When unit tests are not practical (pure scaffold, CSS-only, docs-only), note why under `status.md` → **Notes** and cover behavior with the lightest viable alternative (integration/smoke) if any.
- New or changed acceptance criteria that encode behavior should map to at least one automated test unless the Notes exception applies.

## After completing a ticket

1. Verify every acceptance criterion in `plan.md` is met.
2. Confirm unit tests for the ticket are added and passing (or an explicit Notes exception is recorded).
3. Set `status.md` state to `done` and record completion date.
4. Summarize what shipped in **Handoff** (files touched, env vars, tests, follow-ups).
5. Tell the user which ticket is next per `tasks/README.md`.

## When the user asks for work without naming a ticket

- Map the request to an existing ticket, or create a new numbered folder under `tasks/` with `plan.md` + `status.md`.
- Never implement features outside this process without user approval to skip it.

## Ticket file contract

Each `tasks/NNN-slug/` folder contains:

| File | Purpose |
|------|---------|
| `plan.md` | Scope, acceptance criteria, dependencies, out of scope |
| `status.md` | State, progress checklist, notes, handoff |

Master architecture reference: `.cursor/plans/mystery_interrogation_platform_2e42cb5f.plan.md`

Layering conventions (View / Controller / Service / Model / Jobs): `.claude/rules/architecture-layers.md` — follow when scaffolding modules or adding features.
