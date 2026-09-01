---
name: drain-pending-tasks
description: >-
  Drains the tasks/ board by completing eligible pending tickets one at a time,
  committing after each ticket before starting the next. Use when the user asks
  to run all pending tasks, drain the task board, auto-complete tickets, work
  through tasks sequentially, or "continue until done" on this project's tickets.
---

# Drain Pending Tasks

Complete every **eligible** ticket under `tasks/` sequentially: implement → test → verify → commit → next. Never start ticket N+1 until N is `done` and committed.

Follow `.claude/rules/task-driven-workflow.md` (incl. **Unit tests**) and `.claude/rules/architecture-layers.md` — both already in context; do not re-read them.

## Model split (per ticket)

| Stage | Agent | Model |
|-------|-------|-------|
| Implement (production code) | `general-purpose` | **`model: opus`** — always, regardless of the parent session's model |
| Write + run unit tests | `general-purpose` | **`model: sonnet`** |
| Commit | `general-purpose` | **`model: haiku`** |

Implementation is pinned to Opus even if this session is running on Sonnet or Haiku — production code quality does not follow the parent model down. Test authoring runs on Sonnet; commits run on Haiku. Only deviate if the user asks for a different model this run.

## Token discipline (applies to parent and every subagent)

- Never read `tasks/README.md` during a drain; `next-eligible.mjs` is the source of order.
- Parent never reads `plan.md`/`status.md` — subagents own them, `ticket-check.mjs` verifies them.
- Never run bare `git diff`/`git show`. Use `git status --porcelain` and `git diff --stat`. Inspect a full diff only when a hard stop needs diagnosis, and then scope it to one file.
- The test agent locates its targets with `git status --porcelain` and reads **only** the files it is testing — never the whole package.
- Run only the ticket's tests (path/pattern filters, `--no-coverage`), never the whole suite.
- Read `git log -5 --oneline` once per drain, not per ticket.
- Keep progress output to the one-liners below. No recaps, no re-listing the queue.

## Preconditions

1. Tree clean (`git status --porcelain`). If dirty: stop, ask commit/stash/abort.
2. At most one ticket `in_progress`. If one exists and isn't the one you're finishing, stop and ask.
3. Never push unless the user asks.

## Scripts (run from repo root)

```bash
node .claude/skills/drain-pending-tasks/scripts/next-eligible.mjs          # next ticket id, or NONE
node .claude/skills/drain-pending-tasks/scripts/next-eligible.mjs --list   # whole eligible queue
node .claude/skills/drain-pending-tasks/scripts/ticket-check.mjs NNN-slug  # OK, or FAIL + reasons
```

Eligible = `status.md` is `pending` **and** every `plan.md` dependency is `done`. If a script is missing, resolve eligibility from `tasks/README.md` + each `status.md` manually (costlier — prefer the scripts).

## Main loop

Todo list for the drain (one entry per ticket, not per step):

```
- [ ] NNN-slug: implement → test → commit
```

For each eligible ticket:

1. **Announce** — `Starting NNN-slug`.
2. **Implement** — Agent subagent, `subagent_type: general-purpose`, `model: opus`, `run_in_background: false`. Implementation prompt below. Writes production code only; no test files.
3. **Test** — Agent subagent, `subagent_type: general-purpose`, `model: sonnet`, `run_in_background: false`. Test prompt below. Writes the ticket's unit tests, runs them, and finishes `status.md`. If it reports failing tests it cannot fix without changing behaviour, hand the failure back to a fresh implementation agent (`model: opus`) rather than weakening the test.
4. **Verify** — Run `ticket-check.mjs NNN-slug`. `OK` → proceed. `FAIL` → fix the named gaps (or hard-stop); do not commit a partial lie. Also re-run the exact test command from the Handoff yourself and confirm the counts.
5. **Commit** — Agent subagent, `subagent_type: general-purpose`, `model: haiku`, `run_in_background: false`. Commit prompt below. One commit per ticket. The parent never writes the commit itself unless Agent is unavailable.
6. **Report** — `Done NNN-slug → <sha> — next: <MMM-slug|none>`, then start the next ticket immediately without waiting for the user.

If Agent is unavailable, do all three stages inline in this session with the same rules.

When `next-eligible.mjs` prints `NONE`, stop: list commits + any blocked tickets in a few lines.

## Hard stops

| Condition | Action |
|-----------|--------|
| Needs secrets / external approval (GCP, Meta, DNS) not in env | Note blocker in `status.md`, leave `pending`, stop drain |
| Acceptance criteria unmet, or `ticket-check.mjs` keeps failing | Don't mark `done`, don't commit, stop |
| Tests fail and the fix is unclear after one implementation round-trip | Stop; do not delete or weaken the test to go green |
| New logic with no tests and no Notes exception | Add tests or record the exception; stop if blocked |
| Commit fails / hooks reject | Fix or stop |
| Subagent failed or left the tree in unclear state | Inspect (scoped `git status --porcelain`), finish inline or stop |
| User says stop/pause | Finish the in-flight commit if mid-commit, else stop immediately |

Never mark a ticket `done` just to unblock dependents.

## Implementation prompt (`model: opus`)

```
Implement ticket <NNN-slug> in <REPO_ROOT>.

Read tasks/<NNN-slug>/plan.md and status.md. Do NOT read tasks/README.md.
Project rules (task-driven-workflow, architecture-layers) are already in your
context via CLAUDE.md — follow them without re-reading.

1. Set status.md to in_progress with today's date before coding.
2. Implement only this ticket's scope — no drive-by refactors.
3. Satisfy every acceptance criterion in plan.md.
4. Do NOT write test files. A separate test agent owns all *.spec.ts /
   __tests__/ work for this ticket. Leave the "Unit tests" Progress box and the
   Handoff Tests section untouched, and leave status.md at in_progress.
5. Make the code typecheck/lint clean before you finish.
6. Do NOT git commit, push, tag, or amend.

Return at most 10 lines, no prose padding, no code blocks of implementation:
files touched (paths only), the units that need test coverage (function/module
names + the behaviour that matters), blockers or NONE.
```

## Test prompt (`model: sonnet`)

```
Write and run the unit tests for ticket <NNN-slug> in <REPO_ROOT>.

The implementation is already in the working tree, uncommitted. Find it with
`git status --porcelain` and read ONLY the files you are testing — do not read
the whole package, and do not read tasks/README.md.

Units the implementer flagged as needing coverage:
<paste the implementation agent's coverage list verbatim>

1. Read tasks/<NNN-slug>/plan.md for the acceptance criteria that encode
   behaviour; every such criterion needs at least one test.
2. Write colocated tests (*.spec.ts / __tests__/) next to the code under test,
   matching the existing test style in that package.
3. Do NOT change production code. If a test reveals a real bug, leave the test
   failing and report it — the implementer fixes it, not you.
4. Run only this ticket's tests with path/pattern filters and --no-coverage.
   Report exact pass/fail counts.
5. If unit tests are genuinely impractical (scaffold/CSS/docs-only), write no
   tests and record an explicit exception under status.md Notes instead.
6. Finish status.md: State done, today's completion date, all boxes checked in
   Progress and Acceptance criteria, and Handoff listing files touched + the
   exact test command and result.
7. Do NOT git commit, push, tag, or amend.

Return at most 10 lines: test files added (paths only), test command,
pass/fail counts, production bugs found or NONE.
```

## Commit prompt (`model: haiku`)

```
Commit ticket <NNN-slug> in <REPO_ROOT>. The work is done and verified; you are
only creating the commit.

1. Inspect scope with `git status --porcelain` and `git diff --stat` only —
   never a bare `git diff`.
2. Stage this ticket's files, including tasks/<NNN-slug>/status.md and the new
   test files. Never stage .env, credentials, keys, or secrets — if you see any,
   stop and report instead of committing.
3. Match the repo's commit style from `git log -5 --oneline`. Subject line ends
   with `(ticket NNN)`. Body: one or two lines on what shipped and why.
4. Commit with a HEREDOC:

git commit -m "$(cat <<'EOF'
<summary of ticket outcome> (ticket NNN)

<one or two lines of why>.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"

5. If git rejects the commit for missing author identity, do NOT edit git config.
   Re-run the same commit with the previous author inlined:
   `git -c user.name="<name>" -c user.email="<email>" commit -m ...`
   taking name/email from `git log -1 --format='%an <%ae>'`.
6. Never use --no-verify. Never push, tag, or amend. If a hook rejects the
   commit, report the hook output instead of working around it.

Return exactly two lines: the commit sha + subject, and `clean` or the output of
`git status --porcelain` if the tree is not clean.
```

## Anti-patterns

- Parallel tickets, or multiple `in_progress`
- The implementation agent writing tests, or the test agent editing production code
- Weakening or deleting a test to make a ticket go green
- Batching tickets into one commit; pushing to remote
- Reordering the queue unless the user names a ticket
- Out-of-scope work "while we're here"
- `done` with new logic but no tests and no Notes exception; skipping the test run
- Dumping full diffs, whole files, `tasks/README.md`, or the rules files into context
