/**
 * Field rules for the four scalar invoice fields.
 *
 * One matcher per field. Each takes plain data — `Page[]`, exactly as a source
 * normalises it — and returns either a `FieldCandidate` or `null`. Nothing here
 * throws, and nothing here invents a value: **not found is a result**, so
 * ticket 008 can emit an empty field at 0 confidence rather than a guess.
 *
 * Two rules the rest of the app depends on:
 *
 * 1. **Geometry only through `./lines`.** Rules read lines, the words to the
 *    right of a label, the line below, and columns. They never compare raw
 *    coordinates (the one exception is the vendor region test, which *is* a
 *    positional rule and says so). Ticket 007's table pass reuses the same
 *    primitives.
 * 2. **Match strength stays honest.** A positional guess scores
 *    `POSITIONAL_HEURISTIC` (0.60) even on a document where it happens to be
 *    right. Inflating it would make the confidence bar lie, which is the one
 *    failure this product cannot survive. `matchStrength` describes *how the
 *    value was found*, never how plausible it looks.
 *
 * Pure and deterministic: no pdf.js, no tesseract, no React, no I/O, no clock,
 * no locale lookups. Same words in, same candidates out.
 */

import { MatchStrength } from "../../confidence";
import type { Page, ScalarFieldKey, Word } from "../../types";
import {
  columnAt,
  documentLines,
  joinWords,
  lineBelow,
  pageLines,
  wordSpans,
  wordsInRange,
  wordsRightOf,
  type TextLine,
} from "./lines";

/**
 * One field's answer, with the evidence behind it.
 *
 * `words` is what ticket 008 feeds to `composeConfidence` and reduces to a
 * highlight box, so it must be exactly the words the value was read from —
 * never the label, never the whole line.
 */
export interface FieldCandidate {
  /** The value as it reads on the document, normalised per its field rule. */
  value: string;
  /** The words the value was read from, in reading order. Never empty. */
  words: Word[];
  /** How the value was found. See the honesty rule above. */
  matchStrength: MatchStrength;
  /**
   * User-facing justification, shown under the value in the review UI for
   * anything below the high-confidence tier — e.g. `Matched label "Invoice #"`,
   * `Largest amount near "Total Due"`, `Top-left text block`.
   */
  reason: string;
}

/** A matcher: plain pages in, one candidate or nothing out. Never throws. */
export type ScalarMatcher = (pages: readonly Page[]) => FieldCandidate | null;

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** `Invoice #`, `Invoice No.`, `INVOICE NUMBER`, `Invoice ID` — with optional
 * colon. `number` precedes `no` so `Invoice Number` reports the whole word, and
 * the `(?![a-z])` guard keeps `Invoice Notes` from reading as `Invoice No`. */
export const INVOICE_LABEL_PATTERN =
  /invoice\s*(?:#|number|no\.?|id)(?![a-z])\s*:?/i;

/** `Date`, `Date of issue`, `Issued`, `Issued on` — with optional colon. */
export const DATE_LABEL_PATTERN =
  /\b(?:date(?:\s+of\s+issue)?|issued(?:\s+on)?)\b\s*:?/i;

/**
 * Words that turn a date label into a *different* field — a due date is not the
 * invoice date. Such labels are only consulted if nothing else carries a date.
 */
const DATE_LABEL_DEMOTED_PREFIX =
  /\b(?:due|payment|pay\s+by|delivery|ship(?:ping|ped)?|received|paid)\s*$/i;

/**
 * `Total`, `Grand Total`, `Total Due`, `Amount Due`, `Balance Due` and friends.
 * The longest sensible phrase is matched so the reason string reads the way the
 * document does (`Largest amount near "Total Due"`).
 *
 * `Subtotal` cannot match — there is no word boundary before its `total`. The
 * hyphenated `Sub-total` can, and is rejected by `TOTAL_LABEL_REJECT_PREFIX`.
 */
export const TOTAL_LABEL_PATTERN =
  /\b(?:(?:grand|invoice|net|order)\s+)?total(?:\s+(?:amount|due|payable|amount\s+due))?\b|\bamount\s*(?:due|payable)\b|\bbalance\s*due\b/i;

/** Rejects a `total` that is really the sub-total of a table. */
const TOTAL_LABEL_REJECT_PREFIX = /\b(?:sub|pre|part)\s*-?\s*$/i;

/**
 * A plausible invoice identifier: alphanumeric groups joined by dashes or
 * slashes, containing at least one digit — `INV-2024-0042`, `2024/0042`, `A17`.
 * Validation is what separates a real id from the next label on the line, so a
 * value that fails it is not returned at all.
 */
export const INVOICE_ID_PATTERN = /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/;

/** Currency markers seen on invoices. `₹` is the product's default; the rest
 * appear on documents users will still drop in. Alphabetic codes are boundary-
 * anchored so `hours 5` does not read as `Rs 5`. */
const CURRENCY_SOURCE = String.raw`(?:₹|\$|€|£|¥|\b(?:rs\.?|inr|usd|eur|gbp|jpy))`;

/**
 * A number with optional thousands separators and up to two decimals. Ordered
 * longest-form first so `1,23,456.78` matches whole rather than as `1`.
 */
const NUMBER_SOURCE = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?(?!\d)|\d+\.\d{1,2}(?!\d)|\d+(?!\d)`;

/** An amount: an optional sign, an optional currency marker on either side. */
export const AMOUNT_PATTERN = new RegExp(
  `(?:-\\s?)?(?:${CURRENCY_SOURCE}\\s*)?(?:${NUMBER_SOURCE})(?:\\s*${CURRENCY_SOURCE})?`,
  "gi"
);

/** Anything that makes a match a fragment of an identifier or a longer number
 * rather than an amount in its own right: `INV-2024-0042` yields no amounts. */
const AMOUNT_REJECT_PRECEDING = /[\d.,A-Za-z/\\-]/;

const MONTH_NAME_SOURCE = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;

const MONTH_NUMBERS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** `2024-10-26` — already the target shape, still validated. */
const ISO_DATE_PATTERN = /(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;

/** `26/10/2024`, `26.10.2024`, `26-10-2024` — one separator, used twice. */
const NUMERIC_DATE_PATTERN = /(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?!\d)/g;

/** `Oct 26, 2024`, `October 26 2024`, `Oct. 26th, 2024`. */
const MONTH_FIRST_DATE_PATTERN = new RegExp(
  String.raw`\b${MONTH_NAME_SOURCE}\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})(?!\d)`,
  "gi"
);

/** `26 Oct 2024`, `26th October, 2024`. */
const DAY_FIRST_DATE_PATTERN = new RegExp(
  String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_NAME_SOURCE}\s*,?\s*(\d{4})(?!\d)`,
  "gi"
);

/** Labels that mark a line as structure rather than the vendor's name. */
const FIELD_LABEL_PATTERN = new RegExp(
  [
    INVOICE_LABEL_PATTERN.source,
    DATE_LABEL_PATTERN.source,
    TOTAL_LABEL_PATTERN.source,
    String.raw`\b(?:bill(?:ed)?\s*to|ship\s*to|sold\s*to|pay\s*to|remit\s*to|invoice\s*to|customer|client|account|terms|due\s*date|po\s*(?:#|no\.?|number)|purchase\s*order|description|qty|quantity|unit\s*price|rate|amount|subtotal|sub\s*-\s*total|tax|gst|vat|cgst|sgst|hsn|discount|shipping|page|notes?)\b`,
  ].join("|"),
  "i"
);

/** A document title is not a vendor name, however top-left it sits. */
const DOCUMENT_TITLE_PATTERN =
  /^(?:tax|proforma|commercial|final|original|duplicate)?\s*(?:invoice|bill|receipt|statement|estimate|quotation|quote|credit\s+note|purchase\s+order)\s*$/i;

/** Contact details that sit near the vendor name but are not it. */
const CONTACT_PATTERN =
  /[\w.+-]+@[\w-]+\.[\w.]+|\bwww\.|https?:\/\/|\b(?:tel|phone|mobile|fax|gstin|pan)\b|\+\d[\d\s-]{7,}/i;

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * Iterate every match of `pattern` without touching the pattern's own
 * `lastIndex`. Exported patterns are module-level state; sharing their
 * `lastIndex` across calls would make results depend on call order, and this
 * module promises determinism.
 */
function* execAll(pattern: RegExp, text: string): Generator<RegExpExecArray> {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const scanner = new RegExp(pattern.source, flags);
  let found = scanner.exec(text);
  while (found !== null) {
    yield found;
    if (found[0].length === 0) scanner.lastIndex += 1;
    found = scanner.exec(text);
  }
}

/** First match of a non-global pattern, with its offsets. */
function firstMatch(pattern: RegExp, text: string): RegExpExecArray | null {
  const scanner = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  return scanner.exec(text);
}

/** A label found on a line, and the words it was read from. */
interface LabelMatch {
  /** The label as the document writes it, e.g. `Invoice #`, `TOTAL DUE`. */
  text: string;
  start: number;
  end: number;
  words: Word[];
  /** Rightmost label word — the anchor for `wordsRightOf`. */
  lastWord: Word;
}

/** Trim the punctuation a label collects, keeping the `#` and `.` that are
 * part of how it reads: `Invoice #:` → `Invoice #`, `Invoice No.` unchanged. */
function tidyLabel(raw: string): string {
  return raw.trim().replace(/[\s:;,-]+$/, "");
}

/** Locate a label on a line and resolve it back to words. */
function labelOnLine(
  line: TextLine,
  pattern: RegExp,
  offset = 0
): LabelMatch | null {
  const found = firstMatch(pattern, line.text.slice(offset));
  if (found === null) return null;
  const start = offset + found.index;
  const end = start + found[0].length;
  const words = wordsInRange(wordSpans(line.words), start, end);
  if (words.length === 0) return null;
  return {
    text: tidyLabel(found[0]),
    start,
    end,
    words,
    lastWord: words[words.length - 1],
  };
}

/** The total label on a line, skipping a `Sub-total`-style occurrence. */
function totalLabelOnLine(line: TextLine): LabelMatch | null {
  for (const found of execAll(TOTAL_LABEL_PATTERN, line.text)) {
    if (TOTAL_LABEL_REJECT_PREFIX.test(line.text.slice(0, found.index))) {
      continue;
    }
    const label = labelOnLine(line, TOTAL_LABEL_PATTERN, found.index);
    if (label !== null) return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** A date found in a string, already normalised. */
export interface DateMatch {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  /** The text as it read on the document, e.g. `Oct 26, 2024`. */
  raw: string;
  start: number;
  end: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `2024`, `10`, `26` → `2024-10-26`; an impossible date → `null`. */
function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function monthFromName(name: string): number | null {
  return MONTH_NUMBERS[name.slice(0, 3).toLowerCase()] ?? null;
}

/**
 * Resolve a numeric date, defaulting to **day-first**.
 *
 * `26/10/2024` and `10/26/2024` are the same characters in two conventions, and
 * no amount of geometry disambiguates them. The product's documents are Indian
 * (`₹`, `DD/MM/YYYY`), so day-first is the default, with two escapes: a first
 * part above 12 can only be a day, and a second part above 12 can only be a
 * day, so `10/26/2024` still normalises to `2024-10-26`.
 */
function resolveNumericDate(
  first: number,
  second: number,
  year: number
): string | null {
  if (first > 12 && second <= 12) return toIsoDate(year, second, first);
  if (second > 12 && first <= 12) return toIsoDate(year, first, second);
  return toIsoDate(year, second, first);
}

/** A match is a date only if nothing runs into it from the left. */
function precededByDigit(text: string, start: number): boolean {
  return start > 0 && /\d/.test(text[start - 1]);
}

/**
 * The first valid date in `text`, in any supported form.
 *
 * All four patterns are scanned and the earliest match wins (longest on a tie),
 * so mixing forms in one document is not order-dependent. Invalid dates
 * (`2024-13-40`, `31/02/2024`) are skipped rather than repaired: a wrong date
 * silently accepted is worse than a field left for the user.
 *
 * Worked examples — `2024-10-26`, `26/10/2024` and `Oct 26, 2024` all return
 * `2024-10-26`.
 */
export function findDate(text: string): DateMatch | null {
  const candidates: DateMatch[] = [];

  const push = (found: RegExpExecArray, value: string | null) => {
    if (value === null) return;
    if (precededByDigit(text, found.index)) return;
    candidates.push({
      value,
      raw: found[0],
      start: found.index,
      end: found.index + found[0].length,
    });
  };

  for (const found of execAll(ISO_DATE_PATTERN, text)) {
    push(found, toIsoDate(Number(found[1]), Number(found[2]), Number(found[3])));
  }
  for (const found of execAll(NUMERIC_DATE_PATTERN, text)) {
    push(
      found,
      resolveNumericDate(Number(found[1]), Number(found[3]), Number(found[4]))
    );
  }
  for (const found of execAll(MONTH_FIRST_DATE_PATTERN, text)) {
    const month = monthFromName(found[1]);
    push(
      found,
      month === null
        ? null
        : toIsoDate(Number(found[3]), month, Number(found[2]))
    );
  }
  for (const found of execAll(DAY_FIRST_DATE_PATTERN, text)) {
    const month = monthFromName(found[2]);
    push(
      found,
      month === null
        ? null
        : toIsoDate(Number(found[3]), month, Number(found[1]))
    );
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    candidate.start < best.start ||
    (candidate.start === best.start && candidate.end > best.end)
      ? candidate
      : best
  );
}

/**
 * Normalise a date string to `YYYY-MM-DD`, or `null` if it holds no date.
 *
 * `2024-10-26`, `26/10/2024` and `Oct 26, 2024` → `2024-10-26`.
 */
export function normaliseDate(raw: string): string | null {
  return findDate(raw)?.value ?? null;
}

/** Blank out every date, preserving offsets, so amount scanning cannot read
 * `2024-10-26` as the amounts `2024` and `26`. */
function maskDates(text: string): string {
  let masked = text;
  // Bounded so a pathological input cannot spin; 32 dates on one line is
  // already far past anything a document does.
  for (let pass = 0; pass < 32; pass += 1) {
    const found = findDate(masked);
    if (found === null) break;
    masked =
      masked.slice(0, found.start) +
      " ".repeat(found.end - found.start) +
      masked.slice(found.end);
  }
  return masked;
}

/** The first date carried by `words`, with the words behind it. */
function dateInWords(
  words: readonly Word[]
): { value: string; words: Word[] } | null {
  if (words.length === 0) return null;
  const text = joinWords(words);
  const found = findDate(text);
  if (found === null) return null;
  const matched = wordsInRange(wordSpans(words), found.start, found.end);
  if (matched.length === 0) return null;
  return { value: found.value, words: matched };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** An amount found in a string: the text as written plus its numeric value. */
export interface AmountMatch {
  /** As it reads on the document, e.g. `₹1,234.00`. Exported values keep this
   * formatting; only the comparison below uses the parsed number. */
  raw: string;
  /** Parsed value, used for the "largest amount" comparisons. */
  value: number;
  /** True when a currency marker sits beside the number. */
  hasCurrency: boolean;
  /** True when the number carries 1-2 decimals. */
  hasDecimals: boolean;
  start: number;
  end: number;
}

/**
 * Parse a written amount into a number, or `null` when it holds no digits.
 *
 * Separator handling, in one place because "largest amount" is only meaningful
 * if this is right:
 * - Both `,` and `.` present: the **later** one is the decimal separator, which
 *   reads `1,234.56` and `1.234,56` correctly.
 * - A single `.` followed by 1-2 digits is a decimal point; followed by 3 it is
 *   a thousands separator (`1.234` → `1234`).
 * - Commas alone are thousands separators, including Indian grouping
 *   (`1,23,456` → `123456`). This is the documented locale default, so `1,50`
 *   parses as `150`.
 * - Spaces and currency markers are dropped; a leading `-` or a fully
 *   parenthesised amount is negative.
 *
 * The returned value is for comparison only — `FieldCandidate.value` always
 * keeps the document's own formatting.
 */
export function parseAmountValue(raw: string): number | null {
  const trimmed = raw.trim();
  const negative = /^-/.test(trimmed) || /^\(.*\)$/.test(trimmed);
  const digitsAndSeparators = trimmed.replace(/[^\d.,]/g, "");
  if (!/\d/.test(digitsAndSeparators)) return null;

  const lastComma = digitsAndSeparators.lastIndexOf(",");
  const lastDot = digitsAndSeparators.lastIndexOf(".");
  const separator = Math.max(lastComma, lastDot);

  let normalised: string;
  if (separator < 0) {
    normalised = digitsAndSeparators;
  } else {
    const fraction = digitsAndSeparators.slice(separator + 1);
    const isDecimal =
      fraction.length >= 1 &&
      fraction.length <= 2 &&
      (digitsAndSeparators[separator] === "." || lastDot >= 0);
    normalised = isDecimal
      ? `${digitsAndSeparators.slice(0, separator).replace(/[.,]/g, "")}.${fraction}`
      : digitsAndSeparators.replace(/[.,]/g, "");
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Every amount in `text`, dates already masked out by the caller. */
export function findAmounts(text: string): AmountMatch[] {
  const amounts: AmountMatch[] = [];

  for (const found of execAll(AMOUNT_PATTERN, text)) {
    const raw = found[0];
    if (
      found.index > 0 &&
      AMOUNT_REJECT_PRECEDING.test(text[found.index - 1])
    ) {
      continue;
    }
    const value = parseAmountValue(raw);
    if (value === null) continue;
    amounts.push({
      raw: raw.trim(),
      value,
      hasCurrency: /[₹$€£¥]|\b(?:rs|inr|usd|eur|gbp|jpy)/i.test(raw),
      hasDecimals: /\.\d{1,2}(?!\d)/.test(raw),
      start: found.index,
      end: found.index + raw.length,
    });
  }

  return amounts;
}

/**
 * Pick the amount a human would call "the total" from a set of candidates.
 *
 * Largest wins, but only after narrowing to the most amount-like pool:
 * currency-marked amounts if any, else amounts with decimals, else everything.
 * That ordering is what stops a bare quantity or a year from out-ranking the
 * money on the same line — `Total for 3 items ₹1,234.00` picks `₹1,234.00`,
 * not `3`. Ties keep the earlier match, so the choice is deterministic.
 */
function bestAmount(amounts: readonly AmountMatch[]): AmountMatch | null {
  if (amounts.length === 0) return null;
  const withCurrency = amounts.filter((amount) => amount.hasCurrency);
  const withDecimals = amounts.filter((amount) => amount.hasDecimals);
  const pool =
    withCurrency.length > 0
      ? withCurrency
      : withDecimals.length > 0
        ? withDecimals
        : amounts;
  return pool.reduce((best, amount) =>
    amount.value > best.value ? amount : best
  );
}

/** The best amount carried by `words`, with the words behind it. */
function amountInWords(
  words: readonly Word[]
): { amount: AmountMatch; words: Word[] } | null {
  if (words.length === 0) return null;
  const text = maskDates(joinWords(words));
  const best = bestAmount(findAmounts(text));
  if (best === null) return null;
  const matched = wordsInRange(wordSpans(words), best.start, best.end);
  if (matched.length === 0) return null;
  return { amount: best, words: matched };
}

// ---------------------------------------------------------------------------
// invoice_id
// ---------------------------------------------------------------------------

/** Strip the punctuation that travels with an id token: `#INV-001,` →
 * `INV-001`. */
function cleanIdToken(raw: string): string {
  return raw.trim().replace(/^[#:\s]+/, "").replace(/[.,;:)\]\s]+$/, "");
}

function isInvoiceId(token: string): boolean {
  return (
    token.length >= 2 &&
    token.length <= 32 &&
    /\d/.test(token) &&
    INVOICE_ID_PATTERN.test(token)
  );
}

/**
 * `invoice_id` — label first, always.
 *
 * The label (`Invoice #`, `Invoice No.`, `INVOICE NUMBER`, `Invoice ID`) is
 * located on a line, then the value is taken from the nearest validating token
 * to its right; failing that, from the line below, which is how the
 * label-above-value layout of most templates reads.
 *
 * There is no unlabelled fallback. An id has no shape distinctive enough to
 * find without its label, and a plausible-looking token pulled off the page
 * would be a fabrication.
 *
 * Match strength:
 * - `1.00` label matched, validating value on the same line.
 * - `0.85` label matched, validating value on the line below — the association
 *   is positional, so it is not graded as adjacent.
 * - no candidate when no label matches, or when nothing near the label passes
 *   `INVOICE_ID_PATTERN`.
 */
export function matchInvoiceId(pages: readonly Page[]): FieldCandidate | null {
  const lines = documentLines(pages);

  for (const line of lines) {
    const label = labelOnLine(line, INVOICE_LABEL_PATTERN);
    if (label === null) continue;

    for (const word of wordsRightOf(label.lastWord, line)) {
      const token = cleanIdToken(word.text);
      if (!isInvoiceId(token)) continue;
      return {
        value: token,
        words: [word],
        matchStrength: MatchStrength.LABEL_ADJACENT_PATTERN,
        reason: `Matched label "${label.text}"`,
      };
    }

    const below = lineBelow(line, lines);
    if (below === null) continue;
    for (const word of below.words) {
      const token = cleanIdToken(word.text);
      if (!isInvoiceId(token)) continue;
      return {
        value: token,
        words: [word],
        matchStrength: MatchStrength.LABEL_OR_PATTERN_ONLY,
        reason: `Matched label "${label.text}" (value on the line below)`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// date
// ---------------------------------------------------------------------------

/**
 * `date` — labelled if possible, pattern-only if not, always normalised.
 *
 * Labelled lines are tried first, and a label qualified by `Due`, `Payment` or
 * `Shipping` is demoted to a second pass: a due date is a different field, and
 * picking it up as the invoice date is a wrong answer, not a partial one. With
 * no usable label, the first date pattern in reading order is used.
 *
 * The returned `value` is always `YYYY-MM-DD` — the one field where the
 * document's own formatting is *not* preserved, because a date is only
 * comparable and exportable once normalised. `YYYY-MM-DD`, `DD/MM/YYYY` and
 * `Oct 26, 2024` all yield `2024-10-26`.
 *
 * Match strength:
 * - `1.00` label matched, date on the same line.
 * - `0.85` label matched with the date on the line below, or a date found with
 *   no label at all.
 * - no candidate when the document carries no parseable date.
 */
export function matchDate(pages: readonly Page[]): FieldCandidate | null {
  const lines = documentLines(pages);

  for (const demotedPass of [false, true]) {
    for (const line of lines) {
      const label = labelOnLine(line, DATE_LABEL_PATTERN);
      if (label === null) continue;

      const demoted = DATE_LABEL_DEMOTED_PREFIX.test(
        line.text.slice(0, label.start)
      );
      if (demoted !== demotedPass) continue;

      const onLine = dateInWords(wordsRightOf(label.lastWord, line));
      if (onLine !== null) {
        return {
          value: onLine.value,
          words: onLine.words,
          matchStrength: MatchStrength.LABEL_ADJACENT_PATTERN,
          reason: `Matched label "${label.text}"`,
        };
      }

      const below = lineBelow(line, lines);
      const onBelow = below === null ? null : dateInWords(below.words);
      if (onBelow !== null) {
        return {
          value: onBelow.value,
          words: onBelow.words,
          matchStrength: MatchStrength.LABEL_OR_PATTERN_ONLY,
          reason: `Matched label "${label.text}" (value on the line below)`,
        };
      }
    }
  }

  for (const line of lines) {
    const found = dateInWords(line.words);
    if (found !== null) {
      return {
        value: found.value,
        words: found.words,
        matchStrength: MatchStrength.LABEL_OR_PATTERN_ONLY,
        reason: "First date pattern on the page",
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// vendor_name
// ---------------------------------------------------------------------------

/**
 * The region the vendor's name is looked for in, as fractions of page 1's own
 * width and height. Letterheads put the name at the top left; this is the only
 * rule in the module that reads page geometry directly, because position is the
 * entire signal.
 */
export const VENDOR_REGION = {
  /** A line's top edge must sit within this fraction of the page height. */
  maxTopRatio: 0.35,
  /** A line's left edge must sit within this fraction of the page width. */
  maxLeftRatio: 0.55,
} as const;

/** Enough letters to be a name, and more letters than digits. */
function isSubstantialText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  const letters = (trimmed.match(/[A-Za-zÀ-ɏ]/g) ?? []).length;
  const digits = (trimmed.match(/\d/g) ?? []).length;
  return letters >= 3 && letters > digits;
}

/**
 * True when the line is document structure — a field label — rather than prose.
 *
 * Deliberately narrow: a label only disqualifies a line when it is punctuated
 * as one (`Bill To:`), is essentially the whole line, or is followed by a
 * value. A vendor called `Total Solutions Pvt Ltd` must survive.
 */
function isLabelLine(text: string): boolean {
  const trimmed = text.trim();
  if (/:\s*$/.test(trimmed)) return true;

  const label = firstMatch(FIELD_LABEL_PATTERN, trimmed);
  if (label === null) return false;

  const after = trimmed.slice(label.index + label[0].length);
  if (/^\s*[:#]/.test(after)) return true;
  if (tidyLabel(label[0]).length >= trimmed.length * 0.6) return true;
  return hasValuePattern(trimmed);
}

/** True when the line carries a value — a date, an amount, an id, a phone
 * number — and is therefore data rather than the vendor's name. */
function hasValuePattern(text: string): boolean {
  if (findDate(text) !== null) return true;
  if (CONTACT_PATTERN.test(text)) return true;
  if (findAmounts(maskDates(text)).some((amount) => amount.hasCurrency)) {
    return true;
  }
  return text
    .trim()
    .split(/\s+/)
    .some((token) => isInvoiceId(cleanIdToken(token)));
}

/**
 * `vendor_name` — a positional heuristic, scored as one.
 *
 * The topmost substantial line in the upper-left region of page 1, skipping
 * document titles (`TAX INVOICE`), field labels and value-bearing lines. That
 * is genuinely how a letterhead reads, and it is genuinely a guess: nothing
 * about the layout *says* this text is the vendor.
 *
 * So it always scores `POSITIONAL_HEURISTIC` (0.60) — on a document where it is
 * obviously right just as much as on one where it is wrong. A user who sees
 * 60% checks the field; a user who sees 95% does not. Raising this number is
 * the single change that would do the most damage to this product.
 */
export function matchVendorName(pages: readonly Page[]): FieldCandidate | null {
  const first = pages.find((page) => page.index === 0) ?? pages[0];
  if (first === undefined) return null;

  const maxTop =
    first.height > 0
      ? first.height * VENDOR_REGION.maxTopRatio
      : Number.POSITIVE_INFINITY;
  const maxLeft =
    first.width > 0
      ? first.width * VENDOR_REGION.maxLeftRatio
      : Number.POSITIVE_INFINITY;

  // The region is sliced as a column, not filtered line by line: a letterhead's
  // name and the invoice's meta block routinely share a baseline, so
  // `ACME Supplies Ltd` and `Invoice #: INV-1` are one `TextLine`. Taking the
  // left band first reads the name without the neighbour that would otherwise
  // disqualify the whole line as a label.
  const region = columnAt(pageLines(first), { x0: 0, x1: maxLeft });

  for (const line of region) {
    // Lines arrive top-down, so the first one past the band ends the search.
    if (line.bbox.y0 > maxTop) break;
    if (!isSubstantialText(line.text)) continue;
    if (DOCUMENT_TITLE_PATTERN.test(line.text.trim())) continue;
    if (isLabelLine(line.text)) continue;
    if (hasValuePattern(line.text)) continue;

    return {
      value: line.text.trim(),
      words: line.words,
      matchStrength: MatchStrength.POSITIONAL_HEURISTIC,
      reason: "Top-left text block",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// total_amount
// ---------------------------------------------------------------------------

/**
 * `total_amount` — the last total-like line wins.
 *
 * Total-labelled lines (`Total`, `Grand Total`, `Total Due`, `Amount Due`,
 * `Balance Due`) are collected in reading order and searched from the **bottom
 * up**, because invoices build to their answer: `Subtotal`, `Tax`, then
 * `Total`, and a second `Total` further down is the one that includes the rest.
 * Within a line the largest amount wins, after `bestAmount` narrows to the
 * currency-marked or decimal-bearing candidates.
 *
 * Two decoys this deliberately survives:
 * - **A larger unrelated number elsewhere** (a PO number, `9,999,999`): it is
 *   never even compared, because a labelled line always beats the page-wide
 *   scan.
 * - **A number inside the total line that is not money** (`Total for 3 items`,
 *   or a date): dates are masked before scanning and currency-marked amounts
 *   outrank bare integers.
 *
 * `value` keeps the document's formatting (`₹1,234.00`); a later ticket parses
 * it for export. Only the comparison runs on numbers.
 *
 * Match strength:
 * - `1.00` total label matched with an amount on the same line.
 * - `0.85` total label matched with the amount on the line below.
 * - `0.60` no label anywhere: the largest amount on the document. A guess, and
 *   graded as one.
 * - no candidate when the document carries no amount at all.
 */
export function matchTotalAmount(
  pages: readonly Page[]
): FieldCandidate | null {
  const lines = documentLines(pages);

  const labelled: { line: TextLine; label: LabelMatch }[] = [];
  for (const line of lines) {
    const label = totalLabelOnLine(line);
    if (label !== null) labelled.push({ line, label });
  }

  for (let index = labelled.length - 1; index >= 0; index -= 1) {
    const { line, label } = labelled[index];

    // Right of the label first, then the whole line — right-aligned templates
    // put the currency symbol or the figure on either side of the words.
    const onLine =
      amountInWords(wordsRightOf(label.lastWord, line)) ??
      amountInWords(line.words);
    if (onLine !== null) {
      return {
        value: onLine.amount.raw,
        words: onLine.words,
        matchStrength: MatchStrength.LABEL_ADJACENT_PATTERN,
        reason: `Largest amount near "${label.text}"`,
      };
    }

    const below = lineBelow(line, lines);
    const onBelow = below === null ? null : amountInWords(below.words);
    if (onBelow !== null) {
      return {
        value: onBelow.amount.raw,
        words: onBelow.words,
        matchStrength: MatchStrength.LABEL_OR_PATTERN_ONLY,
        reason: `Largest amount below "${label.text}"`,
      };
    }
  }

  const everyAmount: { amount: AmountMatch; words: Word[] }[] = [];
  for (const line of lines) {
    const text = maskDates(joinWords(line.words));
    const spans = wordSpans(line.words);
    for (const amount of findAmounts(text)) {
      const words = wordsInRange(spans, amount.start, amount.end);
      if (words.length > 0) everyAmount.push({ amount, words });
    }
  }

  const best = bestAmount(everyAmount.map((entry) => entry.amount));
  const winner =
    best === null
      ? undefined
      : everyAmount.find((entry) => entry.amount === best);
  if (winner === undefined) return null;

  return {
    value: winner.amount.raw,
    words: winner.words,
    matchStrength: MatchStrength.POSITIONAL_HEURISTIC,
    reason: "Largest amount on the page",
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Every scalar matcher by field key, for ticket 008 to iterate.
 *
 * Holding the map here rather than in the caller keeps "which fields exist" in
 * one place: adding a scalar field means adding a matcher and an entry, and
 * `ScalarFieldKey` makes the compiler insist on both.
 */
export const SCALAR_MATCHERS: Record<ScalarFieldKey, ScalarMatcher> = {
  invoice_id: matchInvoiceId,
  date: matchDate,
  vendor_name: matchVendorName,
  total_amount: matchTotalAmount,
};
