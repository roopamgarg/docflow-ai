import { describe, it, expect } from "vitest";

import { MatchStrength } from "../../confidence";
import type { Page, ScalarFieldKey, Word } from "../../types";
import {
  SCALAR_MATCHERS,
  matchDate,
  matchInvoiceId,
  matchTotalAmount,
  matchVendorName,
  normaliseDate,
  parseAmountValue,
} from "./rules";

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

/** Lay out a row of words left to right on one line, `gap` px apart. */
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

const EMPTY_PAGE = pageOf([]);

describe("matchInvoiceId", () => {
  it("label-right: 'Invoice #: INV-2024-0042' matches at full strength", () => {
    const pages = [
      pageOf([row(["Invoice", "#:", "INV-2024-0042"], 0, 12)]),
    ];

    const result = matchInvoiceId(pages);

    expect(result?.value).toBe("INV-2024-0042");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
    expect(result?.reason).toBe('Matched label "Invoice #"');
    expect(result?.words.map((w) => w.text)).toEqual(["INV-2024-0042"]);
  });

  it("label-below: 'Invoice No.' with 'INV-7' on the next line matches at 0.85", () => {
    const pages = [
      pageOf([
        row(["Invoice", "No."], 0, 12),
        row(["INV-7"], 40, 52),
      ]),
    ];

    const result = matchInvoiceId(pages);

    expect(result?.value).toBe("INV-7");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    expect(result?.reason).toMatch(/line below/);
    expect(result?.reason).toContain('Invoice No.');
  });

  it("reports the label as 'Invoice Number' when that is what matched", () => {
    const pages = [
      pageOf([row(["Invoice", "Number", "12345"], 0, 12)]),
    ];

    const result = matchInvoiceId(pages);

    expect(result?.reason).toBe('Matched label "Invoice Number"');
    expect(result?.value).toBe("12345");
  });

  it("returns null for an unlabelled id, with no positional fallback", () => {
    const pages = [pageOf([row(["INV-2024-0042"], 0, 12)])];

    expect(matchInvoiceId(pages)).toBeNull();
  });

  it("skips non-validating neighbours rather than returning them", () => {
    // "Ref" carries no digit and fails the id pattern; the matcher should
    // skip it and take the next validating token, not return null or "Ref".
    const pages = [
      pageOf([row(["Invoice", "#:", "Ref", "INV-99"], 0, 12)]),
    ];

    const result = matchInvoiceId(pages);

    expect(result?.value).toBe("INV-99");
    expect(result?.words.map((w) => w.text)).toEqual(["INV-99"]);
  });

  it("returns null on an empty document and on a page with no words", () => {
    expect(matchInvoiceId([])).toBeNull();
    expect(matchInvoiceId([EMPTY_PAGE])).toBeNull();
  });
});

describe("matchDate", () => {
  it("matches 'Date: 2024-10-26' at full strength", () => {
    const pages = [pageOf([row(["Date:", "2024-10-26"], 0, 12)])];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
  });

  it("matches 'Date: 26/10/2024' at full strength", () => {
    const pages = [pageOf([row(["Date:", "26/10/2024"], 0, 12)])];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
  });

  it("matches 'Date: Oct 26, 2024' at full strength", () => {
    const pages = [
      pageOf([row(["Date:", "Oct", "26,", "2024"], 0, 12)]),
    ];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
    expect(result?.reason).toBe('Matched label "Date"');
  });

  it("matches a bare date with no label at 0.85, reason 'First date pattern on the page'", () => {
    const pages = [pageOf([row(["26/10/2024"], 0, 12)])];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    expect(result?.reason).toBe("First date pattern on the page");
  });

  it("matches a labelled date on the line below at 0.85", () => {
    const pages = [
      pageOf([row(["Date"], 0, 12), row(["26/10/2024"], 40, 52)]),
    ];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    expect(result?.reason).toMatch(/line below/);
  });

  it("demotes 'Due Date' so 'Date: 26/10/2024' wins over 'Due Date: 25/11/2024'", () => {
    const pages = [
      pageOf([
        row(["Date:", "26/10/2024"], 0, 12),
        row(["Due", "Date:", "25/11/2024"], 40, 52),
      ]),
    ];
    const result = matchDate(pages);
    expect(result?.value).toBe("2024-10-26");
  });

  it("returns null on an empty document and on a page with no words", () => {
    expect(matchDate([])).toBeNull();
    expect(matchDate([EMPTY_PAGE])).toBeNull();
  });
});

describe("normaliseDate", () => {
  it("normalises 10/26/2024 to 2024-10-26", () => {
    expect(normaliseDate("10/26/2024")).toBe("2024-10-26");
  });

  it("returns null for an impossible date (31/02/2024)", () => {
    expect(normaliseDate("31/02/2024")).toBeNull();
  });

  it("returns null for non-date text", () => {
    expect(normaliseDate("nope")).toBeNull();
  });
});

describe("matchTotalAmount", () => {
  it("the decoy document: picks the largest amount near the last 'Total Due' line", () => {
    const pages = [
      pageOf([
        row(["PO", "Number:", "9999999"], 0, 12),
        row(["Subtotal", "₹1,000.00"], 40, 52),
        row(["Total", "₹1,180.00"], 80, 92),
        row(["Total", "Due", "₹1,230.00"], 120, 132),
      ]),
    ];

    const result = matchTotalAmount(pages);

    expect(result?.value).toBe("₹1,230.00");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_ADJACENT_PATTERN);
    expect(result?.reason).toBe('Largest amount near "Total Due"');
  });

  it("picks the money over a bare quantity or masked date on the total line", () => {
    const pages = [
      pageOf([
        row(
          ["Total", "for", "3", "items", "on", "2024-10-26", "₹1,234.00"],
          0,
          12
        ),
      ]),
    ];

    const result = matchTotalAmount(pages);

    expect(result?.value).toBe("₹1,234.00");
  });

  it("matches an amount on the line below a 'Total' label at 0.85", () => {
    const pages = [
      pageOf([row(["Total"], 0, 12), row(["₹500.00"], 40, 52)]),
    ];

    const result = matchTotalAmount(pages);

    expect(result?.value).toBe("₹500.00");
    expect(result?.matchStrength).toBe(MatchStrength.LABEL_OR_PATTERN_ONLY);
    expect(result?.reason).toMatch(/^Largest amount below "Total"$/);
  });

  it("falls back to the largest amount on the page when only Subtotal/Sub-total labels are present", () => {
    const pages = [
      pageOf([
        row(["Subtotal", "₹500.00"], 0, 12),
        row(["Sub-total", "₹300.00"], 40, 52),
      ]),
    ];

    const result = matchTotalAmount(pages);

    expect(result?.value).toBe("₹500.00");
    expect(result?.matchStrength).toBe(MatchStrength.POSITIONAL_HEURISTIC);
    expect(result?.reason).toBe("Largest amount on the page");
  });

  it("returns null on an empty document and on a page with no words", () => {
    expect(matchTotalAmount([])).toBeNull();
    expect(matchTotalAmount([EMPTY_PAGE])).toBeNull();
  });
});

describe("parseAmountValue", () => {
  it("parses Indian grouping with a currency marker: ₹1,23,456.78 -> 123456.78", () => {
    expect(parseAmountValue("₹1,23,456.78")).toBe(123456.78);
  });

  it("parses European decimal comma: 1.234,56 -> 1234.56", () => {
    expect(parseAmountValue("1.234,56")).toBe(1234.56);
  });

  it("parses a lone thousands-dot: 1.234 -> 1234", () => {
    expect(parseAmountValue("1.234")).toBe(1234);
  });

  it("parses a parenthesised amount as negative: (1,200.00) -> -1200", () => {
    expect(parseAmountValue("(1,200.00)")).toBe(-1200);
  });

  it("returns null for text with no digits", () => {
    expect(parseAmountValue("abc")).toBeNull();
  });
});

describe("matchVendorName", () => {
  it("resolves the top-left text block and always scores POSITIONAL_HEURISTIC (0.6)", () => {
    const pages = [
      pageOf([row(["ACME", "Supplies", "Ltd"], 10, 30, { startX: 20 })]),
    ];

    const result = matchVendorName(pages);

    expect(result?.value).toBe("ACME Supplies Ltd");
    expect(result?.matchStrength).toBe(MatchStrength.POSITIONAL_HEURISTIC);
    expect(result?.reason).toBe("Top-left text block");
  });

  it("resolves the vendor name even sharing a baseline with a right-hand 'Invoice #: INV-1' block", () => {
    const vendor = row(["ACME", "Supplies", "Ltd"], 10, 30, { startX: 20 });
    const invoiceMeta = row(["Invoice", "#:", "INV-1"], 10, 30, {
      startX: 400,
    });
    const pages = [pageOf([[...vendor, ...invoiceMeta]])];

    const result = matchVendorName(pages);

    expect(result?.value).toBe("ACME Supplies Ltd");
  });

  it("skips a document title, a 'Bill To:' label line, and a value-bearing line", () => {
    const pages = [
      pageOf([
        row(["TAX", "INVOICE"], 0, 12, { startX: 20 }),
        row(["info@acme.com"], 20, 32, { startX: 20, width: 100 }),
        row(["Bill", "To:"], 40, 52, { startX: 20 }),
        row(["ACME", "Supplies", "Ltd"], 60, 82, { startX: 20 }),
      ]),
    ];

    const result = matchVendorName(pages);

    expect(result?.value).toBe("ACME Supplies Ltd");
  });

  it("returns null on a blank document", () => {
    expect(matchVendorName([])).toBeNull();
    expect(matchVendorName([EMPTY_PAGE])).toBeNull();
  });
});

describe("SCALAR_MATCHERS", () => {
  it("maps every ScalarFieldKey to its matcher", () => {
    expect(SCALAR_MATCHERS.invoice_id).toBe(matchInvoiceId);
    expect(SCALAR_MATCHERS.date).toBe(matchDate);
    expect(SCALAR_MATCHERS.vendor_name).toBe(matchVendorName);
    expect(SCALAR_MATCHERS.total_amount).toBe(matchTotalAmount);

    const expectedKeys: ScalarFieldKey[] = [
      "invoice_id",
      "date",
      "vendor_name",
      "total_amount",
    ];
    expect(Object.keys(SCALAR_MATCHERS).sort()).toEqual(
      [...expectedKeys].sort()
    );
  });
});
