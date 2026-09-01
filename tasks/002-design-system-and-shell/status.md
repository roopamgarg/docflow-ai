# Status: 002-design-system-and-shell

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `@theme` tokens + Inter typography
- [ ] shadcn primitives themed from tokens
- [ ] `AppShell` floating card + top bar slots
- [ ] `IconRail` with active state and real links
- [ ] `SiteHeader` for the landing surface
- [ ] Responsive behaviour below `lg`
- [ ] No unit tests — Notes exception (presentational only)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- No unit tests for this ticket: it is CSS tokens plus presentational chrome with no logic. Verified visually against the reference image instead.
- Colour discipline from the plan: orange is reserved for actions and confidence fills; the three confidence tiers come from intensity of one hue, not new colours. Do not introduce additional accent colours here.

## Acceptance criteria
- [ ] Every colour, radius and shadow in the design language exists as a `@theme` custom property; no hardcoded hexes in components
- [ ] `Button` default variant renders the orange primary and `Card` the warm fill + border without per-usage overrides
- [ ] `AppShell` renders the floating cream-on-card layout matching the reference image, with working `title` / `action` slots
- [ ] `IconRail` shows exactly logo + Home + Document; the current route's tile is orange; every item is a real navigable link with an accessible name
- [ ] Rail collapses to a top edge below `lg` without overflow at 768px
- [ ] No unit tests — Notes exception recorded (presentational only)

## Handoff

(Leave empty until the ticket is done.)
