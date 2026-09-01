/**
 * Domain → export JSON: the review model as the payload a downstream system
 * consumes, plus the one browser side effect that saves it to disk.
 *
 * Two rules hold this module together, and both are easy to break by accident:
 *
 * 1. **The export reads `value`, never `originalValue`.** `value` is what the
 *    human left behind after review; `originalValue` is what the engine first
 *    read and is kept only so the panel can show the difference. Exporting the
 *    original would silently discard the entire review step — the corrections
 *    are the product.
 * 2. **Amounts are numbers, and never `NaN`, `null` or `undefined`.** State
 *    holds display strings (`¥ 1,250.00`, `₹1,23,456.78`, or `""` for a field
 *    that was not found). `parseAmount` is the seam, and an unparseable or
 *    empty amount becomes `0` — a documented, JSON-safe placeholder — so a
 *    consumer never has to defend against a non-number where the schema
 *    promises one. `NaN` would serialise to `null` through `JSON.stringify`
 *    anyway, which is exactly the silent hole this avoids.
 *
 * Pure apart from `downloadJson`, which is the deliberate exception: the DOM
 * work is isolated in the last function of the file, and the filename it uses
 * is computed by an exported pure helper so it can be asserted without a DOM.
 */

import { LINE_ITEM_ID_PREFIX } from "./extraction/fields";
// The one shared piece of amount parsing in the app. It lives with the rule
// engine because "largest amount" depends on it, and it already handles every
// case an export has to survive — Indian grouping (`₹1,23,456.78`), European
// separators (`1.234,56`), parenthesised negatives, and `null` for a string
// with no digits in it. A second parser here would be a second set of locale
// bugs. Importing it is safe in a client bundle: `rules.ts` pulls in nothing
// but types, `confidence.ts` and `lines.ts` — no OCR engine, no pdf.js.
import { parseAmountValue } from "./extraction/providers/local/rules";
import type { ExtractedField, ScalarFieldKey } from "./extraction/types";

/** One exported table row. Amounts are numbers, descriptions are strings. */
export interface ExportLineItem {
  description: string;
  amount: number;
}

/**
 * The agreed export shape. Keys are the extraction layer's own
 * `ScalarFieldKey`s, so the JSON reads the same as the domain it came from.
 */
export interface ExportPayload {
  invoice_id: string;
  date: string;
  vendor_name: string;
  total_amount: number;
  line_items: ExportLineItem[];
}

/** What an amount the parser cannot read becomes. Documented, not incidental. */
export const UNPARSEABLE_AMOUNT = 0;

/** Used when the invoice id is empty, so a download always has a name. */
export const EXPORT_FILENAME_FALLBACK = "docflow-export.json";

/**
 * A written amount as a number, always finite.
 *
 * Delegates every locale decision to `parseAmountValue` and adds only the
 * export layer's total-ness: an empty string (a not-found field the human never
 * filled in), a malformed value, or anything else without digits in it becomes
 * `UNPARSEABLE_AMOUNT` rather than `null`.
 *
 * Currency symbols are stripped by that parser wholesale — everything outside
 * `[0-9.,]` goes — so this works on `₹1,250.00` and equally on the `¥ 1,250.00`
 * a real OCR run produces, since the vendored model has no `₹` glyph to emit.
 */
export function parseAmount(value: string): number {
  const parsed = parseAmountValue(value);
  // `Number.isFinite` and not just a null check: it also catches an `Infinity`
  // from an absurd string of digits, which would serialise to `null`.
  return parsed !== null && Number.isFinite(parsed)
    ? parsed
    : UNPARSEABLE_AMOUNT;
}

/** Whether a field is one of the line-item rows rather than a scalar. */
function isLineItem(field: ExtractedField): boolean {
  return field.id.startsWith(`${LINE_ITEM_ID_PREFIX}.`);
}

/**
 * The row number in a `line_items.N` id, used to order the exported table.
 *
 * The id is the row's identity — `lineItemFieldId` is positional by design — so
 * the export sorts by it rather than trusting the order the caller's array
 * happens to be in. `toFields` already emits them in step, so this changes
 * nothing today; it makes the ordering an actual guarantee of the function
 * rather than a property of its one caller.
 *
 * An id with a missing or non-numeric suffix cannot be placed, so it sorts last
 * (`Infinity`) instead of throwing or landing at position 0 and displacing a
 * real row. `sort` is stable, so several unplaceable rows keep their relative
 * order.
 */
function lineItemIndex(field: ExtractedField): number {
  const suffix = field.id.slice(`${LINE_ITEM_ID_PREFIX}.`.length);
  // A whole number only: `Number("1.5")` and `Number("")` must not pass for a
  // row index, and `Number("")` is 0, which would jump the queue.
  if (!/^\d+$/.test(suffix)) return Number.POSITIVE_INFINITY;
  return Number(suffix);
}

/**
 * A scalar's current value, or `""` when the field is not in the model.
 *
 * Keyed by `ScalarFieldKey` so a typo cannot silently export an empty string
 * for a field that does exist.
 */
function scalarValue(
  fields: readonly ExtractedField[],
  id: ScalarFieldKey,
): string {
  // `value`, not `originalValue` — see the rule at the top of the file.
  return fields.find((field) => field.id === id)?.value.trim() ?? "";
}

/**
 * Map the review model to the export payload.
 *
 * Total: every key is always present with a value of the promised type, whether
 * or not the field was found — a consumer reading `total_amount` gets a number
 * on a blank invoice too.
 *
 * Line items come out in table order, by the `N` in their `line_items.N` id
 * rather than by their position in `fields` — the id is where the row sat on the
 * page, and that is the order a consumer expects to read the table in. Their
 * `description` comes from the field's `label`, which
 * `lineItemLabel` seeds from the row's description; the editable `value` is the
 * row's amount, so that is what `parseAmount` is given.
 */
export function toExportJson(fields: readonly ExtractedField[]): ExportPayload {
  return {
    invoice_id: scalarValue(fields, "invoice_id"),
    date: scalarValue(fields, "date"),
    vendor_name: scalarValue(fields, "vendor_name"),
    total_amount: parseAmount(scalarValue(fields, "total_amount")),
    line_items: fields
      .filter(isLineItem)
      // Sorted on the filtered copy, so the caller's array is untouched and no
      // scalar field can be moved by this. Compared, not subtracted: two
      // unplaceable rows would subtract to `Infinity - Infinity`, i.e. `NaN`,
      // and a comparator returning `NaN` is undefined behaviour.
      .sort((a, b) => {
        const left = lineItemIndex(a);
        const right = lineItemIndex(b);
        return left < right ? -1 : left > right ? 1 : 0;
      })
      .map((field) => ({
        description: field.label.trim(),
        amount: parseAmount(field.value),
      })),
  };
}

/** The payload as the file's text: two-space indent, so a human can read it. */
export function serialiseExport(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * The download's filename: `docflow-<invoice_id>.json`, or
 * `EXPORT_FILENAME_FALLBACK` when there is no usable id.
 *
 * The id is a value read off a document, so it is slugged rather than trusted:
 * a `/` in it would be read as a path separator by the browser's save dialog,
 * and spaces make an awkward filename. Anything outside `A-Za-z0-9._-` becomes
 * a single `-`.
 */
export function exportFilename(invoiceId: string): string {
  const slug = invoiceId
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug.length > 0 ? `docflow-${slug}.json` : EXPORT_FILENAME_FALLBACK;
}

/**
 * Save the payload as a JSON file.
 *
 * The one impure function here, and the only place in the app that touches the
 * download machinery: a Blob URL handed to a detached `<a download>` that is
 * clicked and revoked immediately. Nothing is uploaded — this is the same
 * offline guarantee the rest of the pipeline makes.
 *
 * Returns the filename used, so a caller (or a test) can assert what was saved
 * without inspecting the DOM.
 */
export function downloadJson(payload: ExportPayload): string {
  const filename = exportFilename(payload.invoice_id);
  const blob = new Blob([serialiseExport(payload)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Never appended to the document: a detached anchor's click still triggers
  // the download in every browser we support, and nothing flashes on screen.
  anchor.click();

  // The download has already taken a reference to the blob by the time click()
  // returns, so the URL can go now rather than leaking for the life of the tab.
  URL.revokeObjectURL(url);

  return filename;
}
