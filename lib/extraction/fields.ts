/**
 * Domain → display mapping: an `Extraction` flattened into the ordered
 * `ExtractedField[]` the review UI edits.
 *
 * Pure and total. Every scalar key appears exactly once, in a fixed order,
 * whether or not it was found — a not-found field is a designed state (empty
 * value, 0 confidence, a `Not found` reason) and the UI renders it as a prompt
 * for the human, so dropping it here would hide the one thing the reviewer most
 * needs to act on.
 *
 * No React, no I/O, no confidence math: the numbers arrive already composed.
 */

import type {
  Extraction,
  ExtractedField,
  ExtractedValue,
  LineItem,
  ScalarFieldKey,
} from "./types";

/**
 * Display order of the scalar fields, which is also the order they are read on
 * an invoice. Fixed here rather than derived from object key order so the UI's
 * layout cannot drift with an unrelated refactor of the rule registry.
 */
export const SCALAR_FIELD_ORDER: readonly ScalarFieldKey[] = [
  "invoice_id",
  "date",
  "vendor_name",
  "total_amount",
] as const;

/** Human-readable labels. The ids stay in export-key form. */
export const SCALAR_FIELD_LABELS: Record<ScalarFieldKey, string> = {
  invoice_id: "Invoice ID",
  date: "Date",
  vendor_name: "Vendor Name",
  total_amount: "Total Amount",
};

/** Namespace for line-item ids, e.g. `line_items.0`. */
export const LINE_ITEM_ID_PREFIX = "line_items";

/**
 * The stable id of the `index`-th line item.
 *
 * Positional by design: the row's identity is where it sits in the table, so a
 * re-run over the same document produces the same ids and the UI's active-field
 * selection survives a re-extraction.
 */
export function lineItemFieldId(index: number): string {
  return `${LINE_ITEM_ID_PREFIX}.${index}`;
}

/**
 * A line item's label: its description, which is what a reviewer scans for.
 *
 * `extractLineItems` never emits an empty description, so the positional
 * fallback only guards a hand-built or future `Extraction` — an unlabelled card
 * would be unreviewable, and a blank label must not be the reason.
 */
export function lineItemLabel(item: LineItem, index: number): string {
  const description = item.description.trim();
  return description.length > 0 ? description : `Line item ${index + 1}`;
}

/**
 * Add identity and review state to an extracted value.
 *
 * `originalValue` is seeded from `value` and never written again, so the UI can
 * always show what the engine actually read next to what the human made of it.
 * Spread first so the value's own keys (and, for a `LineItem`, its
 * `description` / `amount`) are carried through untouched.
 */
function toField(
  value: ExtractedValue,
  id: string,
  label: string
): ExtractedField {
  return {
    ...value,
    id,
    label,
    originalValue: value.value,
    approved: false,
    edited: false,
  };
}

/**
 * Flatten an `Extraction` into the review model.
 *
 * Order: `Invoice ID`, `Date`, `Vendor Name`, `Total Amount`, then one entry per
 * line item in table order with ids `line_items.0`, `line_items.1`, … Each
 * entry keeps its `bbox` and `page` so 013 can highlight the region it came
 * from, and starts un-approved and un-edited.
 */
export function toFields(extraction: Extraction): ExtractedField[] {
  const scalars = SCALAR_FIELD_ORDER.map((key) =>
    toField(extraction.fields[key], key, SCALAR_FIELD_LABELS[key])
  );

  const lineItems = extraction.lineItems.map((item, index) =>
    toField(item, lineItemFieldId(index), lineItemLabel(item, index))
  );

  return [...scalars, ...lineItems];
}
