/**
 * Domain contracts for extraction. Pure types only — no React, no pdf.js, no
 * tesseract, no I/O. Every extraction source normalises into these shapes so a
 * single rule engine and a single UI serve every provider.
 */

/**
 * An axis-aligned box on a page.
 *
 * COORDINATE SPACE (normative — do not re-interpret downstream):
 * - Origin is the **top-left corner of the page**; `x` grows right, `y` grows
 *   **down**. This matches tesseract.js, CSS and canvas, and is deliberately
 *   NOT the PDF convention.
 * - Units are **page pixels** at scale 1, i.e. the same space as the enclosing
 *   `Page.width` / `Page.height`. Consumers scale by their own zoom factor.
 * - Invariants: `x0 <= x1` and `y0 <= y1`. `(x0, y0)` is the top-left corner,
 *   `(x1, y1)` the bottom-right.
 *
 * pdf.js reports text positions in PDF user space, whose origin is the
 * **bottom-left** corner. That path (ticket 004) must convert through the page
 * viewport before producing a `Word`. A source that skips the conversion still
 * typechecks and still extracts correct text — the only symptom is highlight
 * boxes mirrored vertically on the page (ticket 013), so verify the conversion
 * with an explicit expected value rather than by eye.
 */
export interface BoundingBox {
  /** Left edge, page pixels from the left of the page. */
  x0: number;
  /** Top edge, page pixels **down** from the top of the page. */
  y0: number;
  /** Right edge, page pixels from the left of the page. */
  x1: number;
  /** Bottom edge, page pixels **down** from the top of the page. */
  y1: number;
}

/** A single recognised token with its geometry. The atom of the rule engine. */
export interface Word {
  text: string;
  /**
   * How sure the source is of the *characters*, in `0..1`.
   * OCR maps its own 0..100 score into this range; a PDF text layer reports
   * `1` because the characters are exact. Interpretation confidence is a
   * separate concern — see `MatchStrength` in `./confidence`.
   */
  confidence: number;
  /** Geometry in the top-left page-pixel space documented on `BoundingBox`. */
  bbox: BoundingBox;
  /** Zero-based index of the page this word was found on. */
  page: number;
  /** Ranked alternate readings, where the source supplies them (OCR only). */
  alternatives?: string[];
}

/** One page of a document, with the geometry needed to scale its boxes. */
export interface Page {
  /** Zero-based page index. */
  index: number;
  /** Page width in pixels at scale 1 — the space `Word.bbox` lives in. */
  width: number;
  /** Page height in pixels at scale 1 — the space `Word.bbox` lives in. */
  height: number;
  words: Word[];
}

/** Which path produced a word list. Drives nothing but reporting and tests. */
export type TextSource = "pdf-text" | "ocr";

/** The full normalised text of a document, from either source. */
export interface DocumentText {
  pages: Page[];
  source: TextSource;
}

/** A page's geometry without its words — enough to place a highlight. */
export type PageGeometry = Omit<Page, "words">;

/** The scalar fields the rule engine identifies, in export-key form. */
export type ScalarFieldKey =
  | "invoice_id"
  | "date"
  | "vendor_name"
  | "total_amount";

/**
 * One value the rule engine settled on, with the evidence behind it.
 *
 * A field that was not found is still a value: empty `value`, `confidence` 0,
 * a `reason` saying so, and a null `bbox`. Providers must never omit a field
 * and never invent one.
 */
export interface ExtractedValue {
  /** The value as it reads on the document, normalised per its field rule. */
  value: string;
  /** Composed confidence in `0..1` — see `composeConfidence`. */
  confidence: number;
  /** Human-readable justification, e.g. `Matched label "Invoice #"`. */
  reason: string;
  /** Alternate readings from the source, if any. Empty when none. */
  alternatives: string[];
  /** Region the value was read from, or `null` when not found. */
  bbox: BoundingBox | null;
  /** Zero-based page the value was read from. */
  page: number;
}

/** One row of the line-item table. Carries its own composed confidence. */
export interface LineItem extends ExtractedValue {
  description: string;
  /** The amount as it reads on the document; `export.ts` parses the number. */
  amount: string;
}

/** A provider's complete result for one document. */
export interface Extraction {
  /** Which path produced the words behind these fields. */
  source: TextSource;
  /** Per-page geometry, so consumers can scale `bbox` values to any zoom. */
  pages: PageGeometry[];
  /** Every scalar key is always present, found or not. */
  fields: Record<ScalarFieldKey, ExtractedValue>;
  /** One entry per detected table row; empty when no table was found. */
  lineItems: LineItem[];
}

/**
 * The review model the UI edits: an `ExtractedValue` plus identity and review
 * state. Produced by `fields.ts` (ticket 008); the UI reads nothing else.
 */
export interface ExtractedField extends ExtractedValue {
  /** Stable id, e.g. `invoice_id` or `line_items.0`. */
  id: string;
  /** Display label, e.g. `Invoice ID`. */
  label: string;
  /** The extracted value before any human edit. Never overwritten. */
  originalValue: string;
  approved: boolean;
  edited: boolean;
}
