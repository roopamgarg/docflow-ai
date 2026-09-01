# 015 — Demo Invoice

## Summary
Let the app be demonstrated without a real document — by shipping a generated invoice image and running it through the identical extraction pipeline, not by canning a result.

## Dependencies
- 008-local-provider-and-field-mapping
- 010-landing-and-upload

## Scope
- **`DemoInvoice` component:** an invoice sheet mirroring the reference image — `DocFlow AI` lockup and `Invoice # INV-2024-001` in the header, a `Bill To / Acme Corp` block, a right-hand meta block with `Date · Oct 26, 2024` on a light row and `Total Due · ₹1,250.00` on a solid orange row in white, a line-item table with an orange header row (`Description | Qty | Value`), a totals block, and a signature line.
- **Real, readable text — not placeholders.** Unlike the reference's grey filler bars, every value must be actual text at a size OCR reads reliably, and the `Invoice #` / `Total Due` labels and table headers must genuinely be present, because the rule engine keys off them.
- **Asset generation:** use the `agent-browser` skill to screenshot the rendered component to `public/demo-invoice.png`. Record the exact command in the Handoff so the asset can be regenerated when the component changes.
- **Wiring:** `Try Demo Invoice` fetches that PNG, wraps it in a `File`, and calls `startExtraction` — the same path as a user upload. It therefore exercises the **OCR** route, showing genuine confidence variation and real bounding boxes.
- **No special-casing:** there must be no `kind: 'demo'` branch anywhere in state or the viewer; the demo is an ordinary image document.
- No unit tests — reason: a static presentational component plus an asset; its correctness is that the real pipeline extracts the expected values, which is the acceptance criteria below.

## Architecture notes
View layer plus a build-time asset. The demo deliberately adds no code path to the extraction service — a canned response would have been less code but would make the demo prove nothing.

## Out of scope
- A demo PDF as well as the image.
- Multiple demo documents.
- Committing a checked-in expected-output fixture for the demo.

## Acceptance criteria
- [ ] `DemoInvoice` renders an invoice matching the reference image's structure with real text throughout
- [ ] `public/demo-invoice.png` exists and visibly matches the component
- [ ] `Try Demo Invoice` runs the standard pipeline via `startExtraction` — no separate code path
- [ ] Extraction of the demo yields `INV-2024-001`, `2024-10-26`, `TechSolutions Inc.`, `₹1,250.00` and `Consultation Services`
- [ ] The demo goes through the OCR route and produces real, varying confidences with working highlights
- [ ] `grep -rn "demo" lib/extraction` returns nothing — no special-casing leaked into the service
- [ ] No unit tests — Notes exception recorded (static component + asset)

## Key files
- `components/viewer/DemoInvoice.tsx`
- `public/demo-invoice.png`
- `app/page.tsx`
