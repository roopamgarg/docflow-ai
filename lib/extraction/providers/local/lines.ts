/**
 * Line and column primitives for the rule engine.
 *
 * A source (pdf.js text layer or tesseract) hands us a flat `Word[]`. Every
 * field rule wants to reason in terms a human reads with: "the text on this
 * line", "the value to the right of this label", "the line under it", "the
 * amounts in this column". This module is the only place that touches raw
 * geometry; `rules.ts` (scalars, ticket 006) and the table pass (ticket 007)
 * are written entirely against the helpers below.
 *
 * Pure and deterministic: plain data in, plain data out. No pdf.js, no
 * tesseract, no React, no I/O. Inputs are never mutated — every returned array
 * is fresh, so a caller may sort or splice it freely.
 *
 * Coordinate space is the one documented on `BoundingBox`: origin top-left,
 * `x` grows right, `y` grows **down**, units are page pixels at scale 1.
 */

import type { BoundingBox, Page, Word } from "../../types";

/**
 * How much of a word's height must overlap a line's band for the word to join
 * that line, as a fraction of the shorter of the two.
 *
 * Real documents have ragged baselines: OCR reports boxes a few pixels apart
 * for words a human reads as one line, and a smaller font on the same line has
 * a shorter box entirely inside the taller one. Grouping on exact `y` equality
 * therefore shatters lines, which is why the test for "same line" is overlap,
 * not equality.
 *
 * At `0.5` a word whose box overlaps the band by at least half its own height
 * joins the line, and a word sitting on the next line (typical leading leaves
 * a gap, or at worst a slight touch) does not.
 */
export const LINE_OVERLAP_RATIO = 0.5;

/**
 * How much of a word must fall inside an x-range for `columnAt` to treat it as
 * belonging to that column, as a fraction of the word's own width — or, for a
 * word wider than the column, as a fraction of the column's width.
 */
export const COLUMN_OVERLAP_RATIO = 0.5;

/**
 * A run of words a human reads as one line, in reading order.
 *
 * `text` is the words' `text` joined by single spaces, which is what the label
 * regexes in `rules.ts` are matched against. That join is deliberate and
 * stable: it makes character offsets inside `text` mappable back to words (see
 * `wordSpans`), so a rule can match a phrase and still report exactly which
 * words it matched.
 */
export interface TextLine {
  /** Zero-based page index, copied from the words. */
  page: number;
  /** The line's words, sorted left to right. Never empty. */
  words: Word[];
  /** `words.map(w => w.text).join(" ")`. */
  text: string;
  /** Union of the words' boxes. */
  bbox: BoundingBox;
}

/** A horizontal band of the page — the geometry half of a table column. */
export interface XRange {
  /** Left edge in page pixels. */
  x0: number;
  /** Right edge in page pixels. `x1 >= x0`. */
  x1: number;
}

/** Half-open `[start, end)` offsets of one word inside a joined string. */
export interface WordSpan {
  word: Word;
  start: number;
  end: number;
}

/** A word with no visible glyphs carries no information for any rule. */
function hasText(word: Word): boolean {
  return word.text.trim().length > 0;
}

/**
 * Reading-order comparison: page, then vertical position, then horizontal.
 *
 * `text` breaks the final tie so the order is total — two words with identical
 * geometry must not reorder between runs, or the "first date on the page" and
 * "last Total line" rules would flip on re-extraction.
 */
export function compareWords(a: Word, b: Word): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.bbox.y0 !== b.bbox.y0) return a.bbox.y0 - b.bbox.y0;
  if (a.bbox.x0 !== b.bbox.x0) return a.bbox.x0 - b.bbox.x0;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

/**
 * Sort words into reading order: page, then `y`, then `x`.
 *
 * Blank words are dropped — a source that emits an empty token (tesseract does,
 * for a rejected glyph) must not open a hole in a line's `text`.
 *
 * @returns A new array; the input is left alone.
 */
export function sortWords(words: readonly Word[]): Word[] {
  return words.filter(hasText).sort(compareWords);
}

/** Height of the vertical overlap of two boxes; `0` when they do not overlap. */
export function verticalOverlap(a: BoundingBox, b: BoundingBox): number {
  return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

/** Width of the horizontal overlap of a box and a range; `0` when disjoint. */
export function horizontalOverlap(box: BoundingBox, range: XRange): number {
  return Math.max(0, Math.min(box.x1, range.x1) - Math.max(box.x0, range.x0));
}

/** The smallest box containing all of `boxes`. `boxes` must not be empty. */
export function unionBox(boxes: readonly BoundingBox[]): BoundingBox {
  return boxes.reduce((acc, box) => ({
    x0: Math.min(acc.x0, box.x0),
    y0: Math.min(acc.y0, box.y0),
    x1: Math.max(acc.x1, box.x1),
    y1: Math.max(acc.y1, box.y1),
  }));
}

/** The horizontal extent of a set of words, e.g. a column header. */
export function xRangeOf(words: readonly Word[]): XRange {
  const box = unionBox(words.map((word) => word.bbox));
  return { x0: box.x0, x1: box.x1 };
}

/** Horizontal midpoint of a box. */
function midX(box: BoundingBox): number {
  return (box.x0 + box.x1) / 2;
}

/**
 * Build a `TextLine` from words already known to share a line.
 *
 * Sorting here (rather than trusting the caller) is what lets grouping consume
 * words in `y`-major order and still hand back lines in reading order.
 */
function toLine(words: readonly Word[]): TextLine {
  const ordered = [...words].sort((a, b) =>
    a.bbox.x0 !== b.bbox.x0
      ? a.bbox.x0 - b.bbox.x0
      : compareWords(a, b)
  );
  return {
    page: ordered[0].page,
    words: ordered,
    text: ordered.map((word) => word.text).join(" "),
    bbox: unionBox(ordered.map((word) => word.bbox)),
  };
}

/**
 * Group a flat word list into lines by **vertical overlap**, not by equal `y`.
 *
 * The words are first put in reading order, then swept top to bottom: each word
 * joins the open line when it overlaps that line's current vertical band by at
 * least `LINE_OVERLAP_RATIO` of the shorter height, and otherwise starts a new
 * line. Comparing against the band (the union of the line's words so far)
 * rather than against the previous word alone is what carries a line across a
 * word that drifts a pixel or two.
 *
 * Worked example — a ragged baseline. Boxes `y0..y1` of `10..22`, `12..24` and
 * `11..23` all overlap by ≥ 10px of a 12px height, so "ACME", "Supplies" and
 * "Ltd" come back as one line whose `text` is `ACME Supplies Ltd`, even though
 * no two share a `y0`. A following box at `40..52` overlaps by `0` and opens
 * the next line.
 *
 * @param words Any word list — one page's, or a whole document's. Words are
 *   grouped within a page; a page boundary always ends a line.
 * @returns Lines in reading order (page, then top, then left). Empty in, empty
 *   out; a word whose `text` is blank is ignored.
 */
export function groupWordsIntoLines(words: readonly Word[]): TextLine[] {
  const ordered = sortWords(words);
  const lines: TextLine[] = [];

  let current: Word[] = [];
  let band: BoundingBox | null = null;

  const flush = () => {
    if (current.length > 0) lines.push(toLine(current));
    current = [];
    band = null;
  };

  for (const word of ordered) {
    const joins =
      band !== null &&
      current[0].page === word.page &&
      verticalOverlap(band, word.bbox) >=
        LINE_OVERLAP_RATIO *
          Math.min(band.y1 - band.y0, word.bbox.y1 - word.bbox.y0);

    if (!joins) flush();

    current.push(word);
    band = band === null ? word.bbox : unionBox([band, word.bbox]);
  }
  flush();

  return lines;
}

/** Lines of one page. Convenience wrapper over `groupWordsIntoLines`. */
export function pageLines(page: Page): TextLine[] {
  return groupWordsIntoLines(page.words);
}

/**
 * Lines of a whole document, in reading order across pages.
 *
 * This is the entry point every rule uses: `Page[]` in, `TextLine[]` out.
 */
export function documentLines(pages: readonly Page[]): TextLine[] {
  return pages.flatMap((page) => pageLines(page));
}

/**
 * The words of `sameLine` that sit to the right of `word`, nearest first.
 *
 * "To the right" is decided on midpoints rather than edges, because glyph boxes
 * from OCR routinely overlap by a pixel — an `x0 >= word.x1` test drops the very
 * word a label rule is looking for. `word` itself is never returned.
 *
 * Worked example — on `Invoice # : INV-2024-0042`, `wordsRightOf(hashWord,
 * line)` yields `[":", "INV-2024-0042"]`, so a rule can skip punctuation and
 * take the first token that validates.
 *
 * @param word A word to measure from. It need not belong to `sameLine`.
 * @param sameLine The line to read across.
 */
export function wordsRightOf(word: Word, sameLine: TextLine): Word[] {
  const from = midX(word.bbox);
  return sameLine.words
    .filter((candidate) => candidate !== word && midX(candidate.bbox) > from)
    .sort((a, b) => midX(a.bbox) - midX(b.bbox));
}

/**
 * The words of `sameLine` that sit to the left of `word`, nearest first.
 *
 * The mirror of `wordsRightOf`, for right-aligned layouts where the label
 * follows its value (an amount column with `Total` to its left is the common
 * case, but a currency symbol split into its own word is another).
 */
export function wordsLeftOf(word: Word, sameLine: TextLine): Word[] {
  const from = midX(word.bbox);
  return sameLine.words
    .filter((candidate) => candidate !== word && midX(candidate.bbox) < from)
    .sort((a, b) => midX(b.bbox) - midX(a.bbox));
}

/**
 * The next line below `line` on the same page, or `null` at the page foot.
 *
 * "Below" means strictly below: a line whose band does not overlap `line`'s.
 * That is what makes the label-above-value layout (`Invoice No.` on one line,
 * `INV-2024-0042` under it) readable without knowing the leading, and what
 * stops a superscript or a tall neighbour on the *same* visual line from being
 * mistaken for the next one.
 *
 * @param line The line to step down from.
 * @param lines The lines to search — typically the whole document's, as
 *   returned by `documentLines`. Order does not matter.
 */
export function lineBelow(
  line: TextLine,
  lines: readonly TextLine[]
): TextLine | null {
  let best: TextLine | null = null;

  for (const candidate of lines) {
    if (candidate === line) continue;
    if (candidate.page !== line.page) continue;
    if (candidate.bbox.y0 <= line.bbox.y0) continue;
    if (verticalOverlap(candidate.bbox, line.bbox) > 0) continue;

    if (
      best === null ||
      candidate.bbox.y0 < best.bbox.y0 ||
      (candidate.bbox.y0 === best.bbox.y0 && candidate.bbox.x0 < best.bbox.x0)
    ) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Slice a vertical band out of the page: the part of each line that falls in
 * `xRange`, in reading order.
 *
 * This is the column primitive. Ticket 007 derives an `xRange` from a table
 * header word (`xRangeOf`) and reads the cells of that column straight off the
 * result; the scalar rules use it to look down an amount column. Each returned
 * line is a fresh `TextLine` holding only the words inside the band, with
 * `text` and `bbox` recomputed for that slice — so a caller can regex a cell's
 * text and still highlight exactly the words behind it.
 *
 * Membership is generous on purpose: a word counts when at least
 * `COLUMN_OVERLAP_RATIO` of its own width lies in the band, or when it is wider
 * than the band and covers at least that fraction of it. A header narrower than
 * its cells (`Qty` over `1,000.00`) therefore still collects them.
 *
 * @param lines Lines to slice, e.g. from `documentLines`.
 * @param xRange The band, in page pixels. `x1 < x0` yields no lines.
 * @returns One entry per line with at least one word in the band; lines with
 *   none are dropped rather than returned empty.
 */
export function columnAt(
  lines: readonly TextLine[],
  xRange: XRange
): TextLine[] {
  const rangeWidth = xRange.x1 - xRange.x0;
  const sliced: TextLine[] = [];

  for (const line of lines) {
    const words = line.words.filter((word) => {
      const overlap = horizontalOverlap(word.bbox, xRange);
      if (overlap <= 0) return false;
      const wordWidth = word.bbox.x1 - word.bbox.x0;
      // A zero-width box (an OCR artefact) counts on any overlap at all.
      if (wordWidth <= 0 || rangeWidth <= 0) return true;
      return (
        overlap / wordWidth >= COLUMN_OVERLAP_RATIO ||
        overlap / rangeWidth >= COLUMN_OVERLAP_RATIO
      );
    });
    if (words.length > 0) sliced.push(toLine(words));
  }

  return sliced;
}

/**
 * Offsets of each word inside a string built by joining `words` with single
 * spaces — the same join `TextLine.text` uses.
 *
 * Rules match multi-word phrases ("Amount Due", "Oct 26, 2024") against joined
 * text and then need the words behind the match, for the highlight box and for
 * `composeConfidence`. This is the bridge; `wordsInRange` is the lookup.
 */
export function wordSpans(words: readonly Word[]): WordSpan[] {
  const spans: WordSpan[] = [];
  let cursor = 0;
  for (const word of words) {
    const start = cursor;
    const end = start + word.text.length;
    spans.push({ word, start, end });
    cursor = end + 1; // the joining space
  }
  return spans;
}

/** `words.map(w => w.text).join(" ")` — the string `wordSpans` indexes into. */
export function joinWords(words: readonly Word[]): string {
  return words.map((word) => word.text).join(" ");
}

/**
 * The words whose spans intersect the half-open range `[start, end)`.
 *
 * A match that lands mid-word still returns that whole word: the atom of a
 * highlight is a word, and a partial box would point at nothing a user can see.
 */
export function wordsInRange(
  spans: readonly WordSpan[],
  start: number,
  end: number
): Word[] {
  return spans
    .filter((span) => span.start < end && span.end > start)
    .map((span) => span.word);
}
