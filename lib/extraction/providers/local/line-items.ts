/**
 * The line-item table pass.
 *
 * Finds the table on an invoice and reads one `description` / `amount` pair per
 * row. Where `rules.ts` answers "what is the total?", this module answers "what
 * was billed?", and it is the part of the rule engine most likely to need
 * tuning against real documents — so every heuristic here is small, named and
 * commented with the layout it exists for.
 *
 * The shape of the pass:
 *
 * 1. **Header line.** The first line carrying *both* a description-ish header
 *    (`Description`, `Item`, `Service`) and an amount-ish header (`Amount`,
 *    `Total`, `Value`, `Price`) is the table head. No header, no table.
 * 2. **Column geometry.** The header words' own x-ranges (`xRangeOf`) seed two
 *    columns, each then widened to the gutter between neighbouring headers —
 *    see `widenColumns` for why widening is not optional.
 * 3. **Rows.** Every following line is sliced by those columns (`columnAt`).
 *    A line with an amount in the amount column and text in the description
 *    column is an item; a line with neither is skipped.
 * 4. **Stop at the totals block.** The first `Total` / `Subtotal` /
 *    `Amount Due` / `Balance` line ends the table. This is the one rule that
 *    must not fail: a totals row emitted as a line item double-counts the
 *    invoice in the export.
 *
 * Contracts held deliberately:
 * - **Not found is a result.** A document with no recognisable table returns
 *   `[]`. Nothing here throws.
 * - **Per-row confidence.** Each item composes its confidence from *its own*
 *   words, so one badly-OCR'd row cannot drag a clean row down — each item
 *   becomes its own approvable card in the review UI.
 * - **Document formatting is preserved.** `amount` (and `value`) read exactly
 *   as the document wrote them, currency symbol included; ticket 016 parses the
 *   number for export.
 *
 * Out of scope by ticket: quantity and unit-price columns (a `Qty` header is
 * tolerated as a column boundary but never extracted), tables spanning a page
 * break, and merging several detected headers.
 *
 * Pure and deterministic: no pdf.js, no tesseract, no React, no I/O. Geometry
 * is touched only through `./lines`.
 */

import { MatchStrength, composeConfidence } from "../../confidence";
import type { LineItem, Page, Word } from "../../types";
import {
  columnAt,
  documentLines,
  joinWords,
  unionBox,
  wordSpans,
  wordsInRange,
  xRangeOf,
  type TextLine,
  type XRange,
} from "./lines";
import { findAmounts, parseAmountValue, type AmountMatch } from "./rules";

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * The description column's header: `Description`, `Item`, `Items`, `Service`,
 * `Item Description`, `Service Details`.
 *
 * The optional trailing noun is what makes a two-word header report *both* its
 * words, so the column's seed geometry covers the whole header rather than only
 * its first token.
 */
export const DESCRIPTION_HEADER_PATTERN =
  /\b(?:descriptions?|items?|services?|products?)\b(?:\s+(?:descriptions?|details?|names?)\b)?/i;

/**
 * The amount column's header: `Amount`, `Value`, `Price`, `Total`.
 *
 * Matched **rightmost-first** (see `findTableHeader`). A table with both
 * `Unit Price` and `Amount` has the money we want in the rightmost of the two,
 * and reading the left one would export unit prices as line totals.
 */
export const AMOUNT_HEADER_PATTERN =
  /\b(?:amounts?|values?|prices?|totals?|charges?)\b/i;

/**
 * Other column headers we recognise but never extract. They exist here purely
 * as **column boundaries**: `Qty` between `Description` and `Amount` is what
 * stops the description column from widening across the quantities.
 *
 * Tested against a single header word, so `Unit Price` contributes `Unit` (and
 * `Price`, via the amount pattern) independently — either is a fine boundary.
 */
const OTHER_HEADER_WORD_PATTERN =
  /^(?:qty|qnty|quantity|units?|rate|hrs?|hours?|days?|sku|hsn|sac|tax|gst|vat|no\.?|nos\.?|#|sr\.?|s\.?\s*no\.?|sl\.?)$/i;

/**
 * A totals-block line — the table's terminator.
 *
 * `total` alone is deliberately enough: `Total`, `Sub-total`, `Grand Total`,
 * `Amount Due`, `Balance Due` all end the table. The cost of the loose match is
 * that a description reading "Total quality management" would cut the table
 * short; the cost of a tight match is a totals row exported as a line item,
 * which is the far worse failure. A bare `Due` is *not* enough — "Due diligence
 * review" is a plausible description, and the date block often reads `Due`.
 */
export const TOTALS_LINE_PATTERN =
  /\b(?:sub\s*-?\s*totals?|totals?|amount\s+due|balances?)\b/i;

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

/** One matched header cell: the words behind it and their extent. */
export interface HeaderCell {
  /** The header text as matched, e.g. `Description` or `Item Description`. */
  text: string;
  /** The words the header was read from, left to right. Never empty. */
  words: Word[];
  /** The words' own extent, before any widening. */
  xRange: XRange;
}

/** The detected table head: the line, its two columns, and their geometry. */
export interface TableHeader {
  /** The line the headers were found on. */
  line: TextLine;
  description: HeaderCell;
  amount: HeaderCell;
  /** Description column bounds, widened to the gutter. */
  descriptionColumn: XRange;
  /** Amount column bounds, widened to the gutter. */
  amountColumn: XRange;
}

/** Every match of `pattern` in `text`, mirroring the scanner in `rules.ts`. */
function* execAll(pattern: RegExp, text: string): Generator<RegExpExecArray> {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const scanner = new RegExp(pattern.source, flags);
  let found = scanner.exec(text);
  while (found !== null) {
    if (found[0].length === 0) scanner.lastIndex += 1;
    else yield found;
    found = scanner.exec(text);
  }
}

/** Every occurrence of `pattern` on `line`, resolved back to words. */
function headerCellsOn(line: TextLine, pattern: RegExp): HeaderCell[] {
  const spans = wordSpans(line.words);
  const cells: HeaderCell[] = [];

  for (const found of execAll(pattern, line.text)) {
    const words = wordsInRange(spans, found.index, found.index + found[0].length);
    if (words.length === 0) continue;
    cells.push({
      text: found[0].trim(),
      words,
      xRange: xRangeOf(words),
    });
  }

  return cells;
}

/** Header words that are neither cell, kept only as column boundaries. */
function boundaryWords(
  line: TextLine,
  cells: readonly HeaderCell[]
): Word[] {
  const claimed = new Set(cells.flatMap((cell) => cell.words));
  return line.words.filter(
    (word) => !claimed.has(word) && OTHER_HEADER_WORD_PATTERN.test(word.text)
  );
}

/**
 * Widen the two seed ranges into real column bounds.
 *
 * A header word is a poor description of the column beneath it, in two
 * different ways, and both must be fixed or rows silently lose their cells:
 *
 * - **Descriptions run wider than their header.** `Description` is ~80px of
 *   header over 300px of prose. The column therefore widens *rightwards* to the
 *   midpoint of the gutter separating it from the next header (`Qty`, or the
 *   amount header itself), which is as far as it can go without stealing the
 *   neighbouring column's cells.
 * - **Amount columns are right-aligned.** `₹12,450.00` under a left-aligned
 *   `Amount` header starts left of the header's own `x0` and ends right of its
 *   `x1`, so a column bounded by the header word can miss the values entirely.
 *   The amount column therefore widens in *both* directions: leftwards to the
 *   gutter midpoint, rightwards to the page's right edge (or the gutter with a
 *   further header, if the table has one).
 *
 * The description column deliberately does **not** widen leftwards: an unlabelled
 * row-number column ("1.", "2.") sits there on many templates, and it has no
 * header word to form a gutter against, so widening left would prepend the row
 * number to every description.
 *
 * @param rightEdge Right bound for the rightmost column — the page width.
 */
function widenColumns(
  description: HeaderCell,
  amount: HeaderCell,
  boundaries: readonly Word[],
  rightEdge: number
): { descriptionColumn: XRange; amountColumn: XRange } {
  /** Nearest cell/boundary edge to the right of `range`, if any. */
  const nextLeftEdge = (range: XRange, exclude: XRange): number | null => {
    const edges = [
      ...boundaries.map((word) => word.bbox.x0),
      ...(exclude.x0 > range.x1 ? [exclude.x0] : []),
    ].filter((x) => x > range.x1);
    return edges.length === 0 ? null : Math.min(...edges);
  };

  /** Nearest cell/boundary edge to the left of `range`, if any. */
  const previousRightEdge = (range: XRange, exclude: XRange): number | null => {
    const edges = [
      ...boundaries.map((word) => word.bbox.x1),
      ...(exclude.x1 < range.x0 ? [exclude.x1] : []),
    ].filter((x) => x < range.x0);
    return edges.length === 0 ? null : Math.max(...edges);
  };

  const midpoint = (a: number, b: number) => (a + b) / 2;

  const descRight = nextLeftEdge(description.xRange, amount.xRange);
  const amountRight = nextLeftEdge(amount.xRange, description.xRange);
  const amountLeft = previousRightEdge(amount.xRange, description.xRange);

  return {
    descriptionColumn: {
      // No gutter to the right means the amount header is not right of this
      // header's own extent — a layout this module does not understand, so the
      // column stays exactly as wide as its header rather than widening across
      // the whole page and swallowing the amounts.
      x0: description.xRange.x0,
      x1:
        descRight === null
          ? description.xRange.x1
          : Math.max(
              description.xRange.x0,
              midpoint(description.xRange.x1, descRight)
            ),
    },
    amountColumn: {
      x0:
        amountLeft === null
          ? amount.xRange.x0
          : Math.min(amount.xRange.x1, midpoint(amountLeft, amount.xRange.x0)),
      x1:
        amountRight === null
          ? Math.max(amount.xRange.x1, rightEdge)
          : Math.max(
              amount.xRange.x1,
              midpoint(amount.xRange.x1, amountRight)
            ),
    },
  };
}

/**
 * The first line that heads a line-item table, or `null` when there is none.
 *
 * Both a description header and an amount header must appear on the same line,
 * on distinct words, with the amount column to the right of the description —
 * that combination is what separates a table head from a `Total Amount` label
 * in the summary block. Of several amount-ish headers the **rightmost** wins.
 *
 * @param lines Document lines, as returned by `documentLines`.
 * @param rightEdgeFor Right bound of a page, by zero-based page index — used
 *   when the amount column is the rightmost and must widen to the page edge.
 */
export function findTableHeader(
  lines: readonly TextLine[],
  rightEdgeFor: (page: number) => number
): TableHeader | null {
  for (const line of lines) {
    const descriptionCells = headerCellsOn(line, DESCRIPTION_HEADER_PATTERN);
    const amountCells = headerCellsOn(line, AMOUNT_HEADER_PATTERN);
    if (descriptionCells.length === 0 || amountCells.length === 0) continue;

    const description = descriptionCells[0];
    const claimed = new Set(description.words);
    const amount = [...amountCells]
      .reverse()
      .find(
        (cell) =>
          cell.words.every((word) => !claimed.has(word)) &&
          cell.xRange.x0 > description.xRange.x0
      );
    if (amount === undefined) continue;

    const boundaries = boundaryWords(line, [description, amount]);
    const { descriptionColumn, amountColumn } = widenColumns(
      description,
      amount,
      boundaries,
      rightEdgeFor(line.page)
    );

    return { line, description, amount, descriptionColumn, amountColumn };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** The words of `line` inside `column`, or `[]` when the cell is empty. */
function cellWords(line: TextLine, column: XRange): Word[] {
  const sliced = columnAt([line], column);
  return sliced.length === 0 ? [] : sliced[0].words;
}

/**
 * The amount a row's amount cell carries, or `null` when it carries none.
 *
 * Selection mirrors `rules.ts`: narrow to the most money-like pool (currency-
 * marked amounts if any, else amounts with decimals, else everything) and take
 * the largest, earlier match winning a tie. A widened amount column can catch a
 * right-aligned quantity from the column to its left, and that ordering is what
 * keeps `2 ₹1,200.00` reading as `₹1,200.00`.
 */
function pickAmount(
  words: readonly Word[]
): { raw: string; words: Word[] } | null {
  if (words.length === 0) return null;

  const text = joinWords(words);
  const amounts = findAmounts(text);
  if (amounts.length === 0) return null;

  const withCurrency = amounts.filter((amount) => amount.hasCurrency);
  const withDecimals = amounts.filter((amount) => amount.hasDecimals);
  const pool =
    withCurrency.length > 0
      ? withCurrency
      : withDecimals.length > 0
        ? withDecimals
        : amounts;

  const valueOf = (amount: AmountMatch) => parseAmountValue(amount.raw) ?? 0;
  const best = pool.reduce((winner, amount) =>
    valueOf(amount) > valueOf(winner) ? amount : winner
  );

  const matched = wordsInRange(wordSpans(words), best.start, best.end);
  if (matched.length === 0) return null;
  return { raw: best.raw, words: matched };
}

/** Alternate readings the source offered for the row's amount, deduplicated. */
function alternativesFor(words: readonly Word[], value: string): string[] {
  const seen = new Set<string>([value]);
  const alternatives: string[] = [];
  for (const word of words) {
    for (const alternative of word.alternatives ?? []) {
      const trimmed = alternative.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) continue;
      seen.add(trimmed);
      alternatives.push(trimmed);
    }
  }
  return alternatives;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the line-item table's rows.
 *
 * Expected input is exactly what a source normalises to: `Page[]` whose `Word`
 * boxes are in the top-left page-pixel space documented on `BoundingBox`.
 *
 * Each returned `LineItem` is a complete `ExtractedValue`, so the review UI can
 * treat a row like any other field:
 * - `description` — the description cell's text, words joined by single spaces.
 * - `amount` and `value` — the amount **as written**, currency symbol and
 *   separators intact. They are the same string on purpose: `value` is what the
 *   review card edits and what ticket 016 parses to a number, and `description`
 *   labels the card.
 * - `confidence` — `composeConfidence` over this row's own description and
 *   amount words at `LABEL_ADJACENT_PATTERN` strength. The strength is uniform
 *   across rows (a matched header, an in-column cell and a value matching the
 *   amount pattern satisfy all three of its conditions), which makes the row's
 *   own OCR quality the only thing that moves its confidence.
 * - `bbox` — union of those same words; `page` — the row's page.
 * - `alternatives` — alternate readings of the amount words, if the source
 *   offered any. Empty otherwise.
 *
 * @returns One item per detected row, in reading order. `[]` when no table
 *   header is found, when the table has no rows, or when `pages` is empty.
 *   Never throws.
 */
export function extractLineItems(pages: readonly Page[]): LineItem[] {
  const lines = documentLines(pages);
  if (lines.length === 0) return [];

  // The right bound a rightmost column widens to. `Page.width` is authoritative,
  // but a fixture or a source that under-reports it must not shrink the column
  // below the words actually on the page.
  const rightEdgeFor = (index: number): number => {
    const page = pages.find((candidate) => candidate.index === index);
    const words = lines
      .filter((line) => line.page === index)
      .map((line) => line.bbox.x1);
    return Math.max(page?.width ?? 0, ...words, 0);
  };

  const header = findTableHeader(lines, rightEdgeFor);
  if (header === null) return [];

  const items: LineItem[] = [];
  const reason = `Table row under "${header.description.text}" / "${header.amount.text}"`;

  for (const line of lines.slice(lines.indexOf(header.line) + 1)) {
    // A page break ends the table: multi-page tables are out of scope, and
    // continuing would read the next page's header block as rows.
    if (line.page !== header.line.page) break;
    // The totals block is never a line item.
    if (TOTALS_LINE_PATTERN.test(line.text)) break;

    const amountCell = cellWords(line, header.amountColumn);
    const amount = pickAmount(amountCell);
    if (amount === null) continue;

    const amountWords = new Set(amount.words);
    const descriptionWords = cellWords(line, header.descriptionColumn).filter(
      (word) => !amountWords.has(word)
    );
    const description = joinWords(descriptionWords).trim();
    if (description.length === 0) continue;

    const rowWords = [...descriptionWords, ...amount.words];

    items.push({
      description,
      amount: amount.raw,
      value: amount.raw,
      confidence: composeConfidence(
        rowWords,
        MatchStrength.LABEL_ADJACENT_PATTERN
      ),
      reason,
      alternatives: alternativesFor(amount.words, amount.raw),
      bbox: unionBox(rowWords.map((word) => word.bbox)),
      page: line.page,
    });
  }

  return items;
}
