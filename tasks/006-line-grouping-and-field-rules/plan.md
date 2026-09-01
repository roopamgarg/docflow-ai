# 006 — Line Grouping And Field Rules

## Summary
Turn a flat `Word[]` into lines and columns, then identify the four scalar invoice fields from them with a match strength that honestly reflects how each value was found.

## Dependencies
- 003-extraction-contracts-confidence

## Scope
- **`lines.ts` primitives:** sort words by page, then y, then x; group into lines by vertical overlap; expose `wordsRightOf(word, sameLine)`, `lineBelow(line)`, and `columnAt(xRange)`. Every rule is written against these, never raw coordinates.
- **`rules.ts` matchers**, each returning a candidate (`value`, matched `words`, `matchStrength`, human-readable `reason`) or nothing:
  - `invoice_id` — label regex (`invoice\s*(#|no\.?|number|id)`) → nearest value to the right, else the line below; validated against an alphanumeric-with-dashes pattern.
  - `date` — label regex (`date`, `issued`) → adjacent value; else the first standalone date pattern. Normalised to `YYYY-MM-DD` from `YYYY-MM-DD`, `DD/MM/YYYY` and `Oct 26, 2024` forms.
  - `vendor_name` — topmost substantial text line in the upper-left region, excluding lines that match a label or a value pattern. A positional heuristic, and scored as one (0.60).
  - `total_amount` — the amount on a line matching `total|amount\s*due|balance\s*due`, preferring the last such line and the largest value; else the largest amount on the page.
- **Reasons:** each candidate carries text the UI shows below the high tier — `Matched label "Invoice #"`, `Largest amount near "Total Due"`, `Top-left text block`.
- **Not found is a result, not an error:** return no candidate so 008 can emit an empty value at 0 confidence.
- **Tests:** `lines.spec.ts` and `rules.spec.ts` against hand-built fixture `Word[]` — no PDF or OCR involved. Cover: line grouping with ragged y values; label-to-right and label-to-below layouts; all three date formats normalising correctly; total picking the *last* `Total` line and ignoring a larger unrelated figure; vendor heuristic skipping a labelled line; and every field returning no candidate on an empty document.

## Architecture notes
Service layer, pure and deterministic — the most testable code in the project and the reason this ticket carries the heaviest test burden. Deliberately does **not** depend on 004 or 005: fixtures stand in for both sources, so this can be built in parallel with them.

## Out of scope
- Line items (007) — table geometry is a materially different problem.
- Composing final confidence and assembling `Extraction` (008).
- Any UI.

## Acceptance criteria
- [ ] `lines.ts` groups words into lines correctly when baselines are ragged, and exposes the three documented helpers
- [ ] Each of the four fields is extracted from a fixture invoice with the expected value and match strength
- [ ] Dates in `YYYY-MM-DD`, `DD/MM/YYYY` and `Oct 26, 2024` all normalise to `YYYY-MM-DD`
- [ ] `total_amount` prefers the last `Total`-like line and is not fooled by a larger unrelated number elsewhere
- [ ] Every matcher returns no candidate (rather than throwing or guessing) on a document lacking the field
- [ ] Each candidate carries a `reason` string suitable for display
- [ ] Unit tests cover grouping and all four matchers against fixture word lists, and pass

## Key files
- `lib/extraction/providers/local/lines.ts`
- `lib/extraction/providers/local/lines.spec.ts`
- `lib/extraction/providers/local/rules.ts`
- `lib/extraction/providers/local/rules.spec.ts`
