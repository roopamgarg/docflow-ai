# 016 — Approval Success And Export

## Summary
Close the loop: a success screen confirming the document was reviewed, and a JSON export of the edited and approved values in the agreed shape.

## Dependencies
- 009-document-state-and-routing
- 014-extraction-review-panel

## Scope
- **`SuccessState`:** centred card with an orange check, `Document approved`, `All extracted fields have been reviewed.`, then `View Results` (back to `/review`) and `Export JSON`. Below that, the export payload in a small preformatted block so the result is visible without downloading, and a `Process another document` link calling `reset()`.
- **`app/success/page.tsx`:** wrapped in `AppShell`, guarded like `/review`.
- **`lib/export.ts` — `toExportJson(fields)`** producing the agreed shape: `invoice_id`, `date`, `vendor_name` as strings, `total_amount` as a **number**, and `line_items` as an array of `{ description, amount }` with numeric amounts.
- **`parseAmount(value)`:** strip the currency symbol, thousands separators and whitespace to a number. Must handle `₹1,250.00`, `1250`, `1,250.00`, an empty string (not-found field) and a malformed value without producing `NaN` in the output.
- **`downloadJson()`:** write a Blob via a temporary `<a download>` named `docflow-<invoice_id>.json`, falling back to a generic filename when the invoice id is empty.
- **Tests:** `export.spec.ts` — `parseAmount` across all the cases above; `toExportJson` emits exactly the agreed keys and types; edited values (not originals) appear in the output; multiple line items map in order; a not-found field does not emit `NaN` or `undefined`.

## Architecture notes
`export.ts` is a pure mapping module in the domain layer, unit-tested independently of React. `SuccessState` is View: it calls the mapper and triggers the download, and computes nothing itself.

## Out of scope
- CSV or XLSX export.
- Server-side persistence of results.
- Re-opening a completed document after `reset()`.

## Acceptance criteria
- [ ] Approving the document navigates to `/success` showing the confirmation copy
- [ ] `Export JSON` downloads a file matching the agreed shape, with `total_amount` and item amounts as numbers
- [ ] Values edited during review appear in the export, not the originally extracted ones
- [ ] Multiple line items export in order
- [ ] A not-found or malformed amount never yields `NaN`, `null` or `undefined` in the payload
- [ ] `View Results` returns to `/review` with state intact; `Process another document` resets to `/`
- [ ] The payload is visible on screen without downloading
- [ ] Unit tests cover `parseAmount` and `toExportJson` including edited values and edge cases, and pass

## Key files
- `lib/export.ts`
- `lib/export.spec.ts`
- `components/success/SuccessState.tsx`
- `app/success/page.tsx`
