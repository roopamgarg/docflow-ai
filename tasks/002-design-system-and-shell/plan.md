# 002 — Design System And Shell

## Summary
Encode the reference image's visual language as CSS custom properties and build the two chrome surfaces — the landing header and the floating app shell with its icon rail — so every later screen composes from one source of truth.

## Dependencies
- 001-scaffold-and-tooling

## Scope
- **Tokens:** define the palette, radii, shadows and type scale in `app/globals.css` under `@theme` (Tailwind v4). Values from the reference image: cream canvas `#F6F0E7`, white surface, warm beige inset `#F3EDE3`, card `#FAF8F4`, border `#EAE4DA`, track `#E9E3D9`, fg `#262220`, muted `#7A736C`, accent `#F26A12`, accent-hover `#DC5C08`, warn `#B45309`. Radii: shell 24, cards 12, controls 10. Three shadow levels (card / shell / sheet).
- **Typography:** Inter via `next/font`; tabular numerals on amounts and percentages.
- **shadcn theming:** map tokens onto the shadcn theme variables so `Button`'s default variant is already the orange primary and `Card` already carries the warm fill and border — later tickets should not restyle primitives.
- **`AppShell`:** cream page, one large rounded white card with `--shadow-shell`, slim left icon rail, top bar with `title` and `action` slots. Below `lg`, the rail collapses to icons along the top edge.
- **`IconRail`:** logo mark, `Home` (→ `/`), `FileText` (→ `/review`). Active item is a solid orange rounded tile with a white icon; inactive icons use the muted token. Real links with accessible labels — **no inert decorative icons**.
- **`SiteHeader`:** landing-only header — logo `DocFlow AI`, `How it works` anchor, primary `Upload Document`.
- No unit tests — reason: CSS tokens and presentational chrome with no logic. Verified visually against the reference image.

## Architecture notes
Pure View layer. No state, no data fetching, no extraction imports. `AppShell` takes `title` and `action` as props rather than reading route state, so pages own their own chrome content.

## Out of scope
- Page content for landing, review or success (010, 012/014, 016).
- The document viewer and extraction panel that sit inside the shell.
- Any colour decisions made ad hoc in components — everything reads from `@theme`.

## Acceptance criteria
- [ ] Every colour, radius and shadow in the design language exists as a `@theme` custom property; no hardcoded hexes in components
- [ ] `Button` default variant renders the orange primary and `Card` the warm fill + border without per-usage overrides
- [ ] `AppShell` renders the floating cream-on-card layout matching the reference image, with working `title` / `action` slots
- [ ] `IconRail` shows exactly logo + Home + Document; the current route's tile is orange; every item is a real navigable link with an accessible name
- [ ] Rail collapses to a top edge below `lg` without overflow at 768px
- [ ] No unit tests — Notes exception recorded (presentational only)

## Key files
- `app/globals.css`
- `app/layout.tsx`
- `components/layout/AppShell.tsx`
- `components/layout/IconRail.tsx`
- `components/layout/SiteHeader.tsx`
