import { describe, expect, it } from "vitest";

import type { Page, Word } from "../../types";
import { documentLines, unionBox } from "./lines";
import {
  AMOUNT_HEADER_PATTERN,
  DESCRIPTION_HEADER_PATTERN,
  TOTALS_LINE_PATTERN,
  extractLineItems,
  findTableHeader,
} from "./line-items";

/** A `Word` with sensible defaults, so fixtures only spell out what matters. */
function word(
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { page?: number; confidence?: number; alternatives?: string[] } = {}
): Word {
  return {
    text,
    confidence: opts.confidence ?? 1,
    bbox: { x0, y0, x1, y1 },
    page: opts.page ?? 0,
    ...(opts.alternatives !== undefined
      ? { alternatives: opts.alternatives }
      : {}),
  };
}

/** One page holding a set of already-laid-out lines' words, flattened. */
function pageOf(
  lines: Word[][],
  opts: { width?: number; height?: number; index?: number } = {}
): Page {
  return {
    index: opts.index ?? 0,
    width: opts.width ?? 600,
    height: opts.height ?? 800,
    words: lines.flat(),
  };
}

/**
 * Lay out a row of words left to right on one line, `gap` px apart.
 *
 * Used only where exact column geometry does not matter (the "no table"
 * fixtures below) — every table fixture places header/cell words explicitly,
 * since the column-widening math is exactly what is under test.
 */
function row(
  texts: string[],
  y0: number,
  y1: number,
  opts: { startX?: number; width?: number; gap?: number; page?: number } = {}
): Word[] {
  const width = opts.width ?? 40;
  const gap = opts.gap ?? 10;
  const page = opts.page ?? 0;
  let x = opts.startX ?? 0;
  return texts.map((text) => {
    const w = word(text, x, y0, x + width, y1, { page });
    x += width + gap;
    return w;
  });
}

/**
 * A minimal two-column header — `Description` at x50-160, `Amount` at
 * x450-510, y100-112 — reused across most fixtures below. Widened columns
 * come out to `descriptionColumn = [50, 305]`, `amountColumn = [305, 600]`
 * for a 600px-wide page, worked out once here:
 *
 * - description has no right neighbour but the amount header, so it widens
 *   to the gutter midpoint: `(160 + 450) / 2 = 305`.
 * - amount has no header to its left but description, so its left edge is
 *   the same midpoint; its right edge widens to the page edge (600), since
 *   nothing sits to its right.
 */
function baseHeader(page = 0): Word[] {
  return [
    word("Description", 50, 100, 160, 112, { page }),
    word("Amount", 450, 100, 510, 112, { page }),
  ];
}

describe("extractLineItems", () => {
  it("extracts a two-item table: descriptions, amounts, value===amount, page, bbox (Qty excluded), reason, and empty alternatives", () => {
    const description = word("Description", 50, 100, 160, 112);
    const qty = word("Qty", 300, 100, 330, 112);
    const amountHeader = word("Amount", 450, 100, 510, 112);

    const website = word("Website", 50, 120, 120, 132);
    const redesign = word("redesign", 125, 120, 195, 132);
    const qtyValue1 = word("2", 300, 120, 330, 132);
    const amount1 = word("₹1,200.00", 460, 120, 520, 132);

    const hosting = word("Hosting", 50, 140, 140, 152);
    const amount2 = word("₹800.00", 460, 140, 510, 152);

    const pages = [
      pageOf([
        [description, qty, amountHeader],
        [website, redesign, qtyValue1, amount1],
        [hosting, amount2],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);

    expect(items[0].description).toBe("Website redesign");
    expect(items[0].amount).toBe("₹1,200.00");
    expect(items[0].value).toBe(items[0].amount);
    expect(items[0].page).toBe(0);
    expect(items[0].bbox).toEqual(
      unionBox([website.bbox, redesign.bbox, amount1.bbox])
    );
    expect(items[0].reason).toBe('Table row under "Description" / "Amount"');
    expect(items[0].alternatives).toEqual([]);

    expect(items[1].description).toBe("Hosting");
    expect(items[1].amount).toBe("₹800.00");
    expect(items[1].value).toBe(items[1].amount);
    expect(items[1].page).toBe(0);
    expect(items[1].bbox).toEqual(unionBox([hosting.bbox, amount2.bbox]));
    expect(items[1].reason).toBe('Table row under "Description" / "Amount"');
  });

  it("terminates the table at a 'Total' line: never emits the total, and drops a valid-looking row placed after it", () => {
    const website = word("Website", 50, 120, 120, 132);
    const redesign = word("redesign", 125, 120, 195, 132);
    const amount1 = word("₹1,200.00", 460, 120, 520, 132);

    const hosting = word("Hosting", 50, 140, 140, 152);
    const amount2 = word("₹800.00", 460, 140, 510, 152);

    const totalLabel = word("Total", 50, 160, 100, 172);
    const totalAmount = word("₹2,000.00", 460, 160, 520, 172);

    const extraDesc = word("Extra Service", 50, 180, 200, 192);
    const extraAmount = word("₹999.00", 460, 180, 520, 192);

    const pages = [
      pageOf([
        baseHeader(),
        [website, redesign, amount1],
        [hosting, amount2],
        [totalLabel, totalAmount],
        [extraDesc, extraAmount],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.amount)).toEqual([
      "₹1,200.00",
      "₹800.00",
    ]);
    expect(items.some((item) => item.amount === "₹2,000.00")).toBe(false);
    // The row after Total is dropped too — proof this is termination, not a
    // filter that merely rejects lines that look like totals.
    expect(items.some((item) => item.amount === "₹999.00")).toBe(false);
  });

  it("terminates the table at a 'Subtotal' line the same way", () => {
    const website = word("Website", 50, 120, 120, 132);
    const redesign = word("redesign", 125, 120, 195, 132);
    const amount1 = word("₹1,200.00", 460, 120, 520, 132);

    const hosting = word("Hosting", 50, 140, 140, 152);
    const amount2 = word("₹800.00", 460, 140, 510, 152);

    const subtotalLabel = word("Subtotal", 50, 160, 130, 172);
    const subtotalAmount = word("₹2,000.00", 460, 160, 520, 172);

    const extraDesc = word("Extra Service", 50, 180, 200, 192);
    const extraAmount = word("₹999.00", 460, 180, 520, 192);

    const pages = [
      pageOf([
        baseHeader(),
        [website, redesign, amount1],
        [hosting, amount2],
        [subtotalLabel, subtotalAmount],
        [extraDesc, extraAmount],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);
    expect(items.some((item) => item.amount === "₹2,000.00")).toBe(false);
    expect(items.some((item) => item.amount === "₹999.00")).toBe(false);
  });

  it("pairs a right-aligned amount with zero overlap with its header word, once the column widens", () => {
    // The value sits at x520-600, entirely clear of the header's own x450-510
    // — the realistic invoice case, where the amount column is right-aligned
    // under a left-set header word.
    const consulting = word("Consulting", 50, 120, 150, 132);
    const amount = word("₹12,450.00", 520, 120, 600, 132);

    const pages = [pageOf([baseHeader(), [consulting, amount]])];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Consulting");
    expect(items[0].amount).toBe("₹12,450.00");
  });

  it("returns [] when no line carries both a description and an amount header", () => {
    const pages = [
      pageOf([
        row(["Invoice", "Summary"], 0, 12),
        row(["Some", "unrelated", "text"], 40, 52),
      ]),
    ];

    expect(() => extractLineItems(pages)).not.toThrow();
    expect(extractLineItems(pages)).toEqual([]);
  });

  it("returns [] for an empty document", () => {
    expect(extractLineItems([])).toEqual([]);
  });

  it("returns [] for a summary block ('Total Amount' + 'Invoice #') with no table, and never throws", () => {
    const pages = [
      pageOf([
        row(["Total", "Amount", "₹500.00"], 0, 12),
        row(["Invoice", "#", "INV-1"], 40, 52),
      ]),
    ];

    expect(() => extractLineItems(pages)).not.toThrow();
    expect(extractLineItems(pages)).toEqual([]);
  });

  it("skips a row with no amount in the amount column, without ending the table", () => {
    const website = word("Website", 50, 120, 120, 132);
    const redesign = word("redesign", 125, 120, 195, 132);
    const amount1 = word("₹1,200.00", 460, 120, 520, 132);

    // Nothing at all in the amount column on this line.
    const misc = word("Miscellaneous", 50, 140, 160, 152);

    const hosting = word("Hosting", 50, 160, 140, 172);
    const amount2 = word("₹800.00", 460, 160, 510, 172);

    const pages = [
      pageOf([
        baseHeader(),
        [website, redesign, amount1],
        [misc],
        [hosting, amount2],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.description)).toEqual([
      "Website redesign",
      "Hosting",
    ]);
    expect(items.some((item) => item.description.includes("Miscellaneous"))).toBe(
      false
    );
  });

  it("skips a row with no description, without ending the table", () => {
    const website = word("Website", 50, 120, 120, 132);
    const redesign = word("redesign", 125, 120, 195, 132);
    const amount1 = word("₹1,200.00", 460, 120, 520, 132);

    // Nothing at all in the description column on this line.
    const strayAmount = word("₹50.00", 460, 140, 520, 152);

    const hosting = word("Hosting", 50, 160, 140, 172);
    const amount2 = word("₹800.00", 460, 160, 510, 172);

    const pages = [
      pageOf([
        baseHeader(),
        [website, redesign, amount1],
        [strayAmount],
        [hosting, amount2],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.amount)).toEqual([
      "₹1,200.00",
      "₹800.00",
    ]);
    expect(items.some((item) => item.amount === "₹50.00")).toBe(false);
  });

  it("picks the rightmost amount-ish header ('Amount', not 'Unit Price')", () => {
    const item = word("Item", 50, 0, 100, 12);
    const qty = word("Qty", 150, 0, 180, 12);
    const unit = word("Unit", 220, 0, 260, 12);
    const price = word("Price", 265, 0, 305, 12);
    const amountHeader = word("Amount", 450, 0, 510, 12);

    const widget = word("Widget", 50, 20, 115, 32);
    const qtyValue = word("1", 150, 20, 180, 32);
    const unitPrice = word("₹100.00", 220, 20, 305, 32);
    const lineTotal = word("₹300.00", 460, 20, 520, 32);

    const pages = [
      pageOf([
        [item, qty, unit, price, amountHeader],
        [widget, qtyValue, unitPrice, lineTotal],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe("₹300.00");
    expect(items[0].description).toBe("Widget");
  });

  it("composes confidence 1 when every word in the row has confidence 1", () => {
    const website = word("Website", 50, 120, 120, 132, { confidence: 1 });
    const redesign = word("redesign", 125, 120, 195, 132, { confidence: 1 });
    const amount = word("₹1,200.00", 460, 120, 520, 132, { confidence: 1 });

    const pages = [pageOf([baseHeader(), [website, redesign, amount]])];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].confidence).toBe(1);
  });

  it("composes confidence 0.6 when every word in the row has confidence 0.6", () => {
    const website = word("Website", 50, 120, 120, 132, { confidence: 0.6 });
    const redesign = word("redesign", 125, 120, 195, 132, {
      confidence: 0.6,
    });
    const amount = word("₹1,200.00", 460, 120, 520, 132, { confidence: 0.6 });

    const pages = [pageOf([baseHeader(), [website, redesign, amount]])];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].confidence).toBeCloseTo(0.6);
  });

  it("gives two rows with different word confidences different per-item confidences (one bad row does not drag a clean one down)", () => {
    const website = word("Website", 50, 120, 120, 132, { confidence: 1 });
    const redesign = word("redesign", 125, 120, 195, 132, { confidence: 1 });
    const amount1 = word("₹1,200.00", 460, 120, 520, 132, { confidence: 1 });

    const hosting = word("Hosting", 50, 140, 140, 152, { confidence: 0.6 });
    const amount2 = word("₹800.00", 460, 140, 510, 152, { confidence: 0.6 });

    const pages = [
      pageOf([
        baseHeader(),
        [website, redesign, amount1],
        [hosting, amount2],
      ]),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(2);
    expect(items[0].confidence).toBe(1);
    expect(items[1].confidence).toBeCloseTo(0.6);
    expect(items[0].confidence).not.toBe(items[1].confidence);
  });

  it("reports deduplicated alternatives from the amount word's alternate readings", () => {
    const consulting = word("Consulting", 50, 120, 150, 132);
    const amount = word("₹500.00", 460, 120, 520, 132, {
      alternatives: ["₹5OO.OO", "₹500.00", "₹5OO.OO"],
    });

    const pages = [pageOf([baseHeader(), [consulting, amount]])];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].alternatives).toEqual(["₹5OO.OO"]);
  });

  it("does not emit a row that sits on a different page than the header", () => {
    const website = word("Website", 50, 120, 120, 132, { page: 0 });
    const redesign = word("redesign", 125, 120, 195, 132, { page: 0 });
    const amount1 = word("₹1,200.00", 460, 120, 520, 132, { page: 0 });

    const consulting = word("Consulting", 50, 140, 150, 152, { page: 1 });
    const amount2 = word("₹999.00", 460, 140, 520, 152, { page: 1 });

    const pages = [
      pageOf([baseHeader(0), [website, redesign, amount1]], { index: 0 }),
      pageOf([[consulting, amount2]], { index: 1 }),
    ];

    const items = extractLineItems(pages);

    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Website redesign");
    expect(items[0].page).toBe(0);
    expect(items.some((item) => item.amount === "₹999.00")).toBe(false);
  });
});

describe("findTableHeader", () => {
  it("returns null when no line carries both headers", () => {
    const lines = documentLines([
      pageOf([row(["Random", "Text"], 0, 12)]),
    ]);

    expect(findTableHeader(lines, () => 600)).toBeNull();
  });

  it("returns null for an empty line list", () => {
    expect(findTableHeader([], () => 600)).toBeNull();
  });

  it("widens the description column rightwards and the amount column in both directions", () => {
    const lines = documentLines([pageOf([baseHeader()])]);

    const header = findTableHeader(lines, () => 600);

    expect(header?.description.text).toBe("Description");
    expect(header?.amount.text).toBe("Amount");
    expect(header?.descriptionColumn).toEqual({ x0: 50, x1: 305 });
    expect(header?.amountColumn).toEqual({ x0: 305, x1: 600 });
  });

  it("picks the rightmost amount-ish header cell ('Amount', not 'Price')", () => {
    const item = word("Item", 50, 0, 100, 12);
    const qty = word("Qty", 150, 0, 180, 12);
    const unit = word("Unit", 220, 0, 260, 12);
    const price = word("Price", 265, 0, 305, 12);
    const amountHeader = word("Amount", 450, 0, 510, 12);

    const lines = documentLines([
      pageOf([[item, qty, unit, price, amountHeader]]),
    ]);

    const header = findTableHeader(lines, () => 600);

    expect(header?.amount.text).toBe("Amount");
  });
});

describe("table patterns", () => {
  it("DESCRIPTION_HEADER_PATTERN matches description-ish headers, not amount ones", () => {
    expect(DESCRIPTION_HEADER_PATTERN.test("Description")).toBe(true);
    expect(DESCRIPTION_HEADER_PATTERN.test("Item")).toBe(true);
    expect(DESCRIPTION_HEADER_PATTERN.test("Service Details")).toBe(true);
    expect(DESCRIPTION_HEADER_PATTERN.test("Total")).toBe(false);
  });

  it("AMOUNT_HEADER_PATTERN matches amount-ish headers, not description ones", () => {
    expect(AMOUNT_HEADER_PATTERN.test("Amount")).toBe(true);
    expect(AMOUNT_HEADER_PATTERN.test("Price")).toBe(true);
    expect(AMOUNT_HEADER_PATTERN.test("Total")).toBe(true);
    expect(AMOUNT_HEADER_PATTERN.test("Description")).toBe(false);
  });

  it("TOTALS_LINE_PATTERN matches totals-block lines but not a bare 'Due'", () => {
    expect(TOTALS_LINE_PATTERN.test("Total")).toBe(true);
    expect(TOTALS_LINE_PATTERN.test("Subtotal")).toBe(true);
    expect(TOTALS_LINE_PATTERN.test("Amount Due")).toBe(true);
    expect(TOTALS_LINE_PATTERN.test("Balance Due")).toBe(true);
    expect(TOTALS_LINE_PATTERN.test("Due diligence review")).toBe(false);
    expect(TOTALS_LINE_PATTERN.test("Due")).toBe(false);
  });
});
