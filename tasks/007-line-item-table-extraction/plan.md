# 007 — Line Item Table Extraction

## Summary
Detect the line-item table on an invoice and extract one description/amount pair per row, so arbitrary real invoices produce a populated `line_items` array rather than a single hardcoded row.

## Dependencies
- 006-line-grouping-and-field-rules

## Scope
- **Header detection:** find a line containing both a description column (`description|item|service`) and an amount column (`amount|value|price|total`).
- **Column bounds:** take the header words' x-ranges as the column geometry, using `columnAt` from `lines.ts`.
- **Row pairing:** for each following line, pair text falling in the description column with the amount in the amount column. Skip lines with no amount.
- **Termination:** stop at the first totals-like line (`total|subtotal|amount due|balance`), so the totals block is never mistaken for a line item.
- **Per-item confidence:** each item composes its own confidence from its own words, so one badly-OCR'd row does not drag down a clean one.
- **Absent table:** return an empty array — an invoice with no recognisable table is a valid outcome, not an error.
- **Tests:** `line-items.spec.ts` against fixture `Word[]` — a two-item table extracts both with correct descriptions and amounts; a `Total` row terminates iteration and is not emitted as an item; a table whose amount column is right-aligned still pairs correctly; a document with no header line returns `[]`; per-item confidences differ when word confidences differ.

## Architecture notes
Service layer, pure. Kept separate from 006 because table geometry is a distinct problem with its own failure modes, and because it is the most likely part of the rule engine to need iteration against real invoices.

## Out of scope
- Quantity and unit-price columns — only description and amount are in the export shape.
- Multi-page tables spanning a page break.
- Merging tables across multiple detected headers.

## Acceptance criteria
- [ ] A two-item fixture table yields exactly two items with correct descriptions and amounts
- [ ] A totals row terminates iteration and never appears as a line item
- [ ] A right-aligned amount column still pairs to the correct description
- [ ] A document with no detectable header returns an empty array without throwing
- [ ] Each item carries its own composed confidence and a `reason`
- [ ] Unit tests cover all of the above against fixture word lists, and pass

## Key files
- `lib/extraction/providers/local/line-items.ts`
- `lib/extraction/providers/local/line-items.spec.ts`
