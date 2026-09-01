# Status: 015-demo-invoice

**State:** pending  
**Started:** —  
**Completed:** —  
**Blocked by:** —

## Progress
- [ ] `DemoInvoice` component with real readable text
- [ ] Screenshot to `public/demo-invoice.png`
- [ ] `Try Demo Invoice` wired through `startExtraction`
- [ ] Verified extraction output and highlights
- [ ] No unit tests — Notes exception (static component + asset)
- [ ] All acceptance criteria verified

## Notes
- Created 2026-09-01 from plan breakdown (source: `~/.claude/plans/build-a-simple-polished-parallel-spark.md`).
- **First end-to-end demoable milestone** once 011, 012 and 014 are also done.
- The demo intentionally takes the OCR route rather than a text layer, so it demonstrates real confidence variation. That means the component's text size and contrast matter — if OCR reads it poorly, fix the component, not the rules.
- The date in the invoice reads `Oct 26, 2024`; the expected normalised output follows the year printed on the sheet. Keep the component and the acceptance criteria in step if that date is changed.

## Acceptance criteria
- [ ] `DemoInvoice` renders an invoice matching the reference image's structure with real text throughout
- [ ] `public/demo-invoice.png` exists and visibly matches the component
- [ ] `Try Demo Invoice` runs the standard pipeline via `startExtraction` — no separate code path
- [ ] Extraction of the demo yields `INV-2024-001`, `2024-10-26`, `TechSolutions Inc.`, `₹1,250.00` and `Consultation Services`
- [ ] The demo goes through the OCR route and produces real, varying confidences with working highlights
- [ ] `grep -rn "demo" lib/extraction` returns nothing — no special-casing leaked into the service
- [ ] No unit tests — Notes exception recorded (static component + asset)

## Handoff

(Leave empty until the ticket is done.)
