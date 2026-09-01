# 018 — Accessibility Remediation

## Summary
Fix the accessibility defects found during the 001–017 drain: two WCAG contrast failures inherited from the design tokens, a document well a keyboard user cannot scroll, a landmark gap, and a narrow-viewport overflow.

## Dependencies
None — every ticket it touches (002, 010, 012) is already `done`.

## Scope
- **Contrast (from 002's tokens, flagged independently by three agents):**
  - White text on `--primary` `#F26A12` measures **3.06:1**; WCAG AA needs 4.5:1 for normal text. Affects every primary button (`Upload Document`, `Approve Document`, `Export JSON`).
  - `--color-fg-muted` `#7A736C` on `--color-canvas` `#F6F0E7` measures **4.12:1**; also fails on the card fill, where it is used for field labels and the rule `reason` line.
  - Fix by darkening only where text sits on colour — e.g. a separate darker accent for text-bearing surfaces (`#C2540A`-ish) and a darker muted (`#6B635C`-ish). **Keep the reference image's orange for large fills, bars and the active rail tile**, which are UI components held to 3:1, not 4.5:1. Do not flatten the design language to pass a checker.
- **`scrollable-region-focusable` (012):** the viewer's `overflow-auto` document well in `components/viewer/DocumentViewer.tsx` is scrollable but not focusable, so a keyboard-only user cannot scroll the document. In a document-review tool this is the most functionally serious of these findings — fix it properly (focusable region with an accessible name, or scroll the well from the existing controls) rather than suppressing the rule.
- **`region` (002):** `AppShell`'s top bar content sits outside any landmark. Wrap the chrome in appropriate landmarks so the page structure is navigable.
- **Responsive (010):** `SiteHeader`'s nav overflows by 12px at 390px width.
- **Housekeeping:** two `@typescript-eslint/no-unused-vars` warnings for `_inputs` in `lib/extraction/providers/local/index.spec.ts` (from the ticket-008 typecheck fix) — resolve or configure the underscore convention.
- **Tests:** re-verify with axe in a browser. Add a unit test only if a pure helper falls out; contrast ratios and landmark structure are not meaningfully unit-testable, so record the exception for those.

## Architecture notes
Almost entirely the View layer plus `app/globals.css` tokens. No extraction, state or contract changes. Token edits must stay in `@theme` so components keep reading from one source — do not introduce per-component colour overrides to work around a failing pair.

## Out of scope
- Redesigning the visual language or abandoning the reference image's palette.
- A full WCAG AAA pass.
- The text-layer bbox drift noted in 013 (values taken from part of a text run get a bbox apportioned by character offset, assuming uniform glyph widths, so the box can sit ~8pt off in Helvetica). That is an extraction-accuracy issue in `pdf-text.ts`, not an accessibility one — track separately.

## Acceptance criteria
- [ ] axe reports no contrast violations on the landing, review and success screens
- [ ] Primary buttons and body text meet 4.5:1; large fills and UI components meet at least 3:1
- [ ] A keyboard-only user can scroll the document well, and axe reports no `scrollable-region-focusable`
- [ ] axe reports no `region` violation on any of the three screens
- [ ] No horizontal overflow at 390px on any screen
- [ ] `npm run lint` reports zero warnings as well as zero errors
- [ ] The design still reads as the reference image — orange remains the accent for fills, bars and the active rail tile
- [ ] Unit tests added for any pure helper extracted, or a Notes exception recorded (contrast/landmarks are verified with axe in a browser)

## Key files
- `app/globals.css`
- `components/layout/AppShell.tsx`
- `components/layout/SiteHeader.tsx`
- `components/viewer/DocumentViewer.tsx`
- `lib/extraction/providers/local/index.spec.ts`
