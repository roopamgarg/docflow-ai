# Status: 018-accessibility-remediation

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] Contrast tokens (primary text surface + muted)
- [ ] Keyboard-scrollable document well
- [ ] Landmark structure in AppShell
- [ ] 390px overflow in SiteHeader
- [ ] Lint warnings cleared
- [ ] axe re-verified on all three screens
- [ ] Unit tests added, or Notes exception recorded
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 during the 001–017 drain, from defects found while implementing other tickets. The user chose to defer these rather than reopen committed tickets mid-drain.
- Provenance of each finding:
  - Contrast — flagged independently by the agents on tickets 010, 014 and 017, all pointing at the same two token pairs from 002. Measured: white on `#F26A12` = 3.06:1; `#7A736C` on `#F6F0E7` = 4.12:1.
  - `scrollable-region-focusable` and `region` — found by the ticket-017 axe pass.
  - 390px nav overflow — found by the ticket-010 browser pass.
- The contrast fix is a judgement call, not a find-and-replace: the reference image's orange is the product's identity. WCAG holds *text* to 4.5:1 but UI components and large fills only to 3:1, so the accent can stay for bars, fills and the active rail tile while text-bearing surfaces get a darker variant. Resist the temptation to desaturate the whole palette to make a checker happy.

## Acceptance criteria
- [ ] axe reports no contrast violations on the landing, review and success screens
- [ ] Primary buttons and body text meet 4.5:1; large fills and UI components meet at least 3:1
- [ ] A keyboard-only user can scroll the document well, and axe reports no `scrollable-region-focusable`
- [ ] axe reports no `region` violation on any of the three screens
- [ ] No horizontal overflow at 390px on any screen
- [ ] `npm run lint` reports zero warnings as well as zero errors
- [ ] The design still reads as the reference image — orange remains the accent for fills, bars and the active rail tile
- [ ] Unit tests added for any pure helper extracted, or a Notes exception recorded (contrast/landmarks are verified with axe in a browser)

## Handoff

(Leave empty until the ticket is done.)
