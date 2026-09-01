import { describe, it, expect } from "vitest";

import type { Word } from "../../types";
import {
  columnAt,
  groupWordsIntoLines,
  lineBelow,
  sortWords,
  unionBox,
  wordsInRange,
  wordsRightOf,
  wordsLeftOf,
  wordSpans,
  xRangeOf,
} from "./lines";

/** A `Word` with sensible defaults, so fixtures only spell out what matters. */
function word(
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { page?: number; confidence?: number } = {}
): Word {
  return {
    text,
    confidence: opts.confidence ?? 1,
    bbox: { x0, y0, x1, y1 },
    page: opts.page ?? 0,
  };
}

describe("groupWordsIntoLines", () => {
  it("merges a ragged baseline into one line with the union bbox", () => {
    // "ACME Supplies Ltd" — three words whose y0/y1 boxes are a few pixels
    // apart (10/22, 12/24, 11/23), which is what a ragged baseline looks like.
    const acme = word("ACME", 40, 10, 90, 22);
    const supplies = word("Supplies", 95, 12, 160, 24);
    const ltd = word("Ltd", 165, 11, 195, 23);

    const lines = groupWordsIntoLines([acme, supplies, ltd]);

    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("ACME Supplies Ltd");
    expect(lines[0].bbox).toEqual({ x0: 40, y0: 10, x1: 195, y1: 24 });
    expect(lines[0].words.map((w) => w.text)).toEqual([
      "ACME",
      "Supplies",
      "Ltd",
    ]);
  });

  it("starts a new line for a word whose box does not overlap the line's band by half its height", () => {
    const acme = word("ACME", 40, 10, 90, 22);
    const supplies = word("Supplies", 95, 12, 160, 24);
    const ltd = word("Ltd", 165, 11, 195, 23);
    // Band after the first line is {10,24}; this box (40..52) does not
    // overlap it at all.
    const next = word("Next", 40, 40, 100, 52);

    const lines = groupWordsIntoLines([acme, supplies, ltd, next]);

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("ACME Supplies Ltd");
    expect(lines[1].text).toBe("Next");
  });

  it("joins a word whose overlap is exactly half the shorter height (boundary is inclusive)", () => {
    // band height 12 (10..22); candidate height 12 (16..28); overlap is
    // 22-16=6, i.e. exactly 0.5 * min(12,12). The docs say ">=", so this
    // must join.
    const first = word("A", 0, 10, 20, 22);
    const second = word("B", 25, 16, 45, 28);

    const lines = groupWordsIntoLines([first, second]);

    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("A B");
  });

  it("drops blank-text words", () => {
    const a = word("A", 0, 10, 20, 22);
    const blank = word("   ", 25, 10, 45, 22);
    const b = word("B", 50, 10, 70, 22);

    const lines = groupWordsIntoLines([a, blank, b]);

    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("A B");
    expect(lines[0].words).toHaveLength(2);
  });

  it("always splits at a page boundary even when boxes would otherwise overlap", () => {
    const pageZero = word("A", 0, 10, 20, 22, { page: 0 });
    const pageOne = word("B", 0, 10, 20, 22, { page: 1 });

    const lines = groupWordsIntoLines([pageZero, pageOne]);

    expect(lines).toHaveLength(2);
    expect(lines[0].page).toBe(0);
    expect(lines[0].text).toBe("A");
    expect(lines[1].page).toBe(1);
    expect(lines[1].text).toBe("B");
  });

  it("returns nothing for an empty word list", () => {
    expect(groupWordsIntoLines([])).toEqual([]);
  });
});

describe("sortWords", () => {
  it("orders by page, then y0, then x0, then text", () => {
    const words = [
      word("page1-second", 50, 10, 60, 20, { page: 1 }),
      word("page0-b-later-x", 50, 10, 60, 20, { page: 0 }),
      word("page0-a-earlier-y", 0, 5, 10, 15, { page: 0 }),
      word("page1-first", 0, 0, 10, 10, { page: 1 }),
      word("page0-tie-1", 50, 10, 60, 20, { page: 0 }),
    ];

    const sorted = sortWords(words);

    expect(sorted.map((w) => w.text)).toEqual([
      "page0-a-earlier-y",
      "page0-b-later-x",
      "page0-tie-1",
      "page1-first",
      "page1-second",
    ]);
  });

  it("drops blank-text words and does not mutate the input array", () => {
    const input = [word("B", 10, 0, 20, 10), word("", 0, 0, 5, 10)];
    const original = [...input];

    const sorted = sortWords(input);

    expect(sorted.map((w) => w.text)).toEqual(["B"]);
    expect(input).toEqual(original);
  });
});

describe("wordsRightOf", () => {
  it("returns the words to the right, nearest first, on 'Invoice # : INV-1'", () => {
    const invoice = word("Invoice", 0, 0, 50, 12);
    const hash = word("#", 55, 0, 65, 12);
    const colon = word(":", 70, 0, 75, 12);
    const value = word("INV-1", 80, 0, 120, 12);
    const line = groupWordsIntoLines([invoice, hash, colon, value])[0];

    const right = wordsRightOf(hash, line);

    expect(right.map((w) => w.text)).toEqual([":", "INV-1"]);
  });

  it("uses the midpoint, not x0 >= x1, so a slightly overlapping box still counts as 'right'", () => {
    // hash spans 55..65 (mid 60). colon's x0 (60) is inside hash's box, so an
    // x0 >= x1 test would exclude it, but its midpoint (67.5) is still right
    // of hash's midpoint (60).
    const hash = word("#", 55, 0, 65, 12);
    const colon = word(":", 60, 0, 75, 12);
    const line = groupWordsIntoLines([hash, colon])[0];

    const right = wordsRightOf(hash, line);

    expect(right.map((w) => w.text)).toEqual([":"]);
  });

  it("never returns the word itself", () => {
    const only = word("Solo", 0, 0, 20, 12);
    const line = groupWordsIntoLines([only])[0];

    expect(wordsRightOf(only, line)).toEqual([]);
  });
});

describe("wordsLeftOf", () => {
  it("returns the words to the left, nearest first", () => {
    const total = word("Total", 100, 0, 140, 12);
    const amount = word("1,200.00", 0, 0, 60, 12);
    const currency = word("₹", 65, 0, 75, 12);
    const line = groupWordsIntoLines([total, amount, currency])[0];

    const left = wordsLeftOf(total, line);

    expect(left.map((w) => w.text)).toEqual(["₹", "1,200.00"]);
  });
});

describe("lineBelow", () => {
  it("returns the nearest non-overlapping lower line on the same page", () => {
    const top = groupWordsIntoLines([word("Top", 0, 10, 40, 22)])[0];
    const middle = groupWordsIntoLines([word("Middle", 0, 40, 60, 52)])[0];
    const bottom = groupWordsIntoLines([word("Bottom", 0, 70, 60, 82)])[0];

    const result = lineBelow(top, [top, middle, bottom]);

    expect(result?.text).toBe("Middle");
  });

  it("returns null when there is no line below on the same page", () => {
    const only = groupWordsIntoLines([word("Only", 0, 10, 40, 22)])[0];

    expect(lineBelow(only, [only])).toBeNull();
  });

  it("returns null across a page break even if a later page has a lower line", () => {
    const top = groupWordsIntoLines([word("Top", 0, 10, 40, 22, { page: 0 })])[0];
    const nextPage = groupWordsIntoLines([
      word("NextPage", 0, 5, 40, 17, { page: 1 }),
    ])[0];

    expect(lineBelow(top, [top, nextPage])).toBeNull();
  });

  it("does not return a line whose band overlaps the reference line's", () => {
    const reference = groupWordsIntoLines([word("Ref", 0, 10, 40, 30)])[0];
    // Starts before `reference` ends (y0=20 < reference.y1=30), so it
    // vertically overlaps and must not count as "below".
    const overlapping = groupWordsIntoLines([
      word("Overlap", 50, 20, 90, 40),
    ])[0];

    expect(lineBelow(reference, [reference, overlapping])).toBeNull();
  });
});

describe("columnAt", () => {
  it("slices a column out of the page, recomputing text and bbox for each line", () => {
    const description = word("Description", 0, 0, 90, 12);
    const amountHeader = word("Amount", 100, 0, 160, 12);
    const widget = word("Widget", 0, 20, 80, 32);
    const amountValue = word("1,200.00", 105, 20, 155, 32);

    const lines = groupWordsIntoLines([
      description,
      amountHeader,
      widget,
      amountValue,
    ]);
    const range = xRangeOf([amountHeader]);

    const column = columnAt(lines, range);

    expect(column.map((l) => l.text)).toEqual(["Amount", "1,200.00"]);
    expect(column[0].bbox).toEqual(amountHeader.bbox);
    expect(column[1].bbox).toEqual(amountValue.bbox);
  });

  it("drops lines with no word inside the range", () => {
    const inRange = word("Amount", 100, 0, 160, 12);
    const outOfRange = word("Notes", 0, 20, 60, 32);

    const lines = groupWordsIntoLines([inRange, outOfRange]);
    const column = columnAt(lines, xRangeOf([inRange]));

    expect(column).toHaveLength(1);
    expect(column[0].text).toBe("Amount");
  });
});

describe("unionBox", () => {
  it("returns the smallest box containing all boxes", () => {
    const box = unionBox([
      { x0: 10, y0: 5, x1: 20, y1: 15 },
      { x0: 0, y0: 8, x1: 12, y1: 25 },
    ]);
    expect(box).toEqual({ x0: 0, y0: 5, x1: 20, y1: 25 });
  });

  it("returns the single box unchanged when there is only one", () => {
    const box = { x0: 1, y0: 2, x1: 3, y1: 4 };
    expect(unionBox([box])).toEqual(box);
  });
});

describe("xRangeOf", () => {
  it("returns the horizontal extent of a set of words", () => {
    const a = word("A", 10, 0, 20, 10);
    const b = word("B", 30, 0, 60, 10);
    expect(xRangeOf([a, b])).toEqual({ x0: 10, x1: 60 });
  });
});

describe("wordSpans and wordsInRange", () => {
  it("computes half-open offsets for each word in the joined string", () => {
    const a = word("Invoice", 0, 0, 10, 10);
    const b = word("Number", 0, 0, 10, 10);
    const c = word("12345", 0, 0, 10, 10);

    const spans = wordSpans([a, b, c]);

    expect(spans).toEqual([
      { word: a, start: 0, end: 7 },
      { word: b, start: 8, end: 14 },
      { word: c, start: 15, end: 20 },
    ]);
  });

  it("returns the whole word behind a match that lands mid-word", () => {
    const a = word("Invoice", 0, 0, 10, 10);
    const b = word("Number", 0, 0, 10, 10);
    const spans = wordSpans([a, b]);

    // "Invoice Number" -- a range landing inside "Number" (offsets 10..12)
    // must still return the whole word.
    const result = wordsInRange(spans, 10, 12);

    expect(result).toEqual([b]);
  });

  it("returns no words for a range outside every span", () => {
    const a = word("Invoice", 0, 0, 10, 10);
    const spans = wordSpans([a]);
    expect(wordsInRange(spans, 100, 110)).toEqual([]);
  });
});
