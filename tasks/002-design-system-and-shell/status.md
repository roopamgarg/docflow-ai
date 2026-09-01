# Status: 002-design-system-and-shell

**State:** done  
**Started:** 2026-09-01  
**Completed:** 2026-09-01  
**Blocked by:** —

## Progress
- [x] `@theme` tokens + Inter typography
- [x] shadcn primitives themed from tokens
- [x] `AppShell` floating card + top bar slots
- [x] `IconRail` with active state and real links
- [x] `SiteHeader` for the landing surface
- [x] Responsive behaviour below `lg`
- [x] Notes exception recorded for presentational surfaces; `isActive` exported and covered by a unit test
- [x] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- No unit tests for this ticket: it is CSS tokens plus presentational chrome with no logic. Verified visually against the reference image instead.
- Colour discipline from the plan: orange is reserved for actions and confidence fills; the three confidence tiers come from intensity of one hue, not new colours. Do not introduce additional accent colours here.
- 2026-09-01 — Replaced the `shadcn init -b radix -p nova` neutral oklch theme in `app/globals.css` with the DocFlow language. Raw values live once in `:root`; the `@theme inline` block only maps them onto the variable names the installed primitives actually reference (`--primary`, `--card`, `--border`, `--secondary`, ...), so `bg-primary`/`bg-card` and the raw `var(--secondary)` reads inside `button.tsx` both resolve. Radii/shadows/type scale sit in a plain `@theme` block so `var(--radius-md)` (referenced by `button.tsx` size variants) is emitted to `:root`.
- Three primitives were patched at the source rather than overridden per usage, per the plan's "later tickets should not restyle primitives": `button.tsx` default hover `primary/80` → `bg-primary-hover` (the design language has an explicit accent-hover step), `card.tsx` `ring-foreground/10` → `ring-border` + `shadow-card`, `progress.tsx` `bg-muted` → `bg-track`.
- Dropped the `.dark` token block (DocFlow is single-theme) but kept `@custom-variant dark (&:is(.dark *))` so the `dark:` utilities baked into the shadcn primitives stay inert instead of reacting to the OS colour scheme.
- Geist → Inter via `next/font/google` (`--font-inter`). Tabular numerals ship as a `@utility tabular-figures` (`tabular-nums lining-nums` + `tnum`/`lnum`) for amounts and percentages.
- `app/page.tsx` was stripped of the create-next-app boilerplate and now renders only `SiteHeader`; that boilerplate was the only source of hardcoded hexes (`#383838`, `#ccc`) and blocked the "no hardcoded hexes" criterion. Landing content itself stays with 010.
- `IconRail` links to `/review`, which does not exist until 009. Next 16 typed routes do not reject it and `next build` passes.
- Verified in a browser at 1440x900 and 768x1000 against a throwaway page render (since reverted): rail collapses to the top edge with no horizontal overflow at 768px (`scrollWidth == innerWidth`), computed body font is Inter, and the a11y tree shows exactly three rail links named "DocFlow AI home", "Home", "Document".
- 2026-09-01 (unit-test stage) — The "no unit tests" note above is broader than it should be: `IconRail.tsx` actually contains one pure branching helper, `isActive(pathname, href)`. It was initially left untested because it was module-private; the implementer then exported it (behaviour unchanged) so it is now covered by a colocated unit test, `components/layout/IconRail.spec.ts`. See Handoff for the exact command and result.

## Acceptance criteria
- [x] Every colour, radius and shadow in the design language exists as a `@theme` custom property; no hardcoded hexes in components
- [x] `Button` default variant renders the orange primary and `Card` the warm fill + border without per-usage overrides
- [x] `AppShell` renders the floating cream-on-card layout matching the reference image, with working `title` / `action` slots
- [x] `IconRail` shows exactly logo + Home + Document; the current route's tile is orange; every item is a real navigable link with an accessible name
- [x] Rail collapses to a top edge below `lg` without overflow at 768px
- [x] Presentational surfaces carry the Notes unit-test exception; `IconRail`'s `isActive` helper is exported and covered by a unit test

## Handoff

Files touched: `components/layout/IconRail.spec.ts` (new), `tasks/002-design-system-and-shell/plan.md`, `tasks/002-design-system-and-shell/status.md`. No production files changed in this pass (the implementer separately exported `isActive` from `components/layout/IconRail.tsx`, behaviour unchanged).

Test command: `npx vitest run components/layout --no-coverage`.
Result: 1 test file, 5 tests, 5 passed / 0 failed.

Coverage: `isActive(pathname, href)` — exact match for `/` (matches and non-match cases), exact match and prefix match for `/review` (including a nested path), and a clearly unrelated pathname. No production bugs found.
